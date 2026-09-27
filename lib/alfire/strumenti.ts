import 'server-only'

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import { fissaCall } from '@/app/(app)/calls/new/actions'
import { creaCliente } from '@/app/(app)/clients/actions'
import { aggiungiCosto } from '@/app/(app)/expenses/actions'
import { aggiungiTask } from '@/app/(app)/progetti/[id]/actions'
import { creaProgetto } from '@/app/(app)/progetti/actions'
import { segnaIncassata } from '@/app/(app)/sales/[id]/actions'
import { salvaReportGiornaliero } from '@/app/(app)/today/actions'
import { ARGOMENTI_GUIDA, GUIDA, type ArgomentoGuida } from '@/lib/alfire/guida'
import { strumentiConsentiti, type NomeStrumento } from '@/lib/alfire/permessi'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { aggiungiGiorni, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import type { createClient } from '@/lib/supabase/server'
import { CATEGORIE_COSTO } from '@/lib/validation/anagrafiche'
import { FONTI, TIPI_CALL } from '@/lib/validation/call'
import { METODI } from '@/lib/validation/incasso'
import { CAMPI_NUMERICI_REPORT as CAMPI_REPORT } from '@/lib/validation/report'

type Supabase = Awaited<ReturnType<typeof createClient>>

const data = z.string().describe('Data ISO, AAAA-MM-GG')
const periodo = z.object({
  da: data.optional().describe('Inizio, incluso. Default: primo giorno del mese corrente'),
  a: data.optional().describe('Fine, inclusa. Default: oggi'),
})

function leggiPeriodo({ da, a }: { da?: string; a?: string }) {
  const oggi = oggiRoma()
  const inizio = da && isDataISO(da) ? da : primoDelMeseISO(oggi)
  const fine = a && isDataISO(a) ? a : oggi
  return inizio <= fine ? { da: inizio, a: fine } : { da: fine, a: inizio }
}

/** Tool results stay small: the free tier counts every token. */
function errore(messaggio: string) {
  return { errore: messaggio }
}

/** Finds one row by name among a few: exact first, then "contains". */
function trova<T extends { nome: string | null }>(righe: T[], nome: string): T | null | 'ambiguo' {
  const cerca = nome.trim().toLowerCase()
  const esatti = righe.filter((r) => r.nome?.toLowerCase() === cerca)
  if (esatti.length === 1) return esatti[0]
  const simili = righe.filter((r) => r.nome?.toLowerCase().includes(cerca))
  if (simili.length === 1) return simili[0]
  return simili.length > 1 ? 'ambiguo' : null
}

export function strumentiAlfire(supabase: Supabase, profilo: Profilo, livelloPm: LivelloPm): ToolSet {
  const tutti = {
    guida: tool({
      description: 'Come funziona una parte della dashboard (pagine, regole, permessi).',
      inputSchema: z.object({ argomento: z.enum(ARGOMENTI_GUIDA as [ArgomentoGuida, ...ArgomentoGuida[]]) }),
      execute: async ({ argomento }) => ({ testo: GUIDA[argomento] }),
    }),

    numeri_periodo: tool({
      description:
        'KPI del periodo con confronto col periodo precedente (cash, revenue, nuovi clienti, rinnovi, margine operativo...) e funnel DM → chiuse.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const [kpi, funnel] = await Promise.all([
          supabase.rpc('kpi_periodo', { p_da: p.da, p_a: p.a }),
          supabase.rpc('funnel_periodo', { p_da: p.da, p_a: p.a }),
        ])
        if (kpi.error || funnel.error) return errore('Numeri non disponibili.')
        return { periodo: p, kpi: kpi.data, funnel: funnel.data }
      },
    }),

    cash_per_mese: tool({
      description: 'Cash incassato per mese, diviso in nuovo, rinnovo, upsell.',
      inputSchema: z.object({ mesi: z.number().int().min(1).max(24).default(6) }),
      execute: async ({ mesi }) => {
        const { data, error } = await supabase.rpc('cash_mensile', { p_mesi: mesi })
        return error ? errore('Cash non disponibile.') : { mesi: data }
      },
    }),

    da_incassare: tool({
      description:
        'Rate ancora da incassare: totali per fascia (in ritardo, prossimi 30 giorni, oltre) ed elenco delle rate in ritardo con cliente e payment_id.',
      inputSchema: z.object({}),
      execute: async () => {
        const [fasce, ritardi] = await Promise.all([
          supabase.rpc('da_incassare'),
          supabase
            .from('v_rate')
            .select('payment_id, cliente, numero_rata, scadenza, importo_previsto, giorni_ritardo')
            .eq('in_ritardo', true)
            .order('scadenza')
            .limit(25),
        ])
        if (fasce.error || ritardi.error) return errore('Rate non disponibili.')
        return { fasce: fasce.data, in_ritardo: ritardi.data }
      },
    }),

    cerca_clienti: tool({
      description:
        'Cerca clienti per nome o cognome, o per stato. Dà stato, valore firmato, incassato, da incassare e rate in ritardo.',
      inputSchema: z.object({
        testo: z.string().max(60).optional(),
        stato: z.enum(['attivo', 'in_scadenza', 'scaduto', 'ex_cliente', 'mai_attivato']).optional(),
      }),
      execute: async ({ testo, stato }) => {
        let q = supabase
          .from('v_clienti')
          .select('client_id, nome, cognome, stato, fonte, valore_firmato, incassato, da_incassare, in_ritardo, data_fine_ultima')
          .order('nome')
          .limit(20)
        if (stato) q = q.eq('stato', stato)
        if (testo?.trim()) {
          const t = testo.trim().replace(/[%,()]/g, ' ')
          q = q.or(`nome.ilike.%${t}%,cognome.ilike.%${t}%`)
        }
        const { data, error } = await q
        return error ? errore('Clienti non disponibili.') : { clienti: data }
      },
    }),

    vendite_periodo: tool({
      description: 'Vendite firmate nel periodo, con tipo, valore, incassato e da incassare.',
      inputSchema: periodo.extend({ tipo: z.enum(['nuovo', 'rinnovo', 'upsell']).optional() }),
      execute: async (input) => {
        const p = leggiPeriodo(input)
        let q = supabase
          .from('sales')
          .select('id, tipo, data_vendita, valore_contratto, numero_rate, prodotto_personalizzato, cliente:clients(nome, cognome), prodotto:products(nome)')
          .gte('data_vendita', p.da)
          .lte('data_vendita', p.a)
          .order('data_vendita', { ascending: false })
          .limit(40)
        if (input.tipo) q = q.eq('tipo', input.tipo)
        const { data, error } = await q
        if (error) return errore('Vendite non disponibili.')
        return {
          periodo: p,
          vendite: data.map((v) => ({
            sale_id: v.id,
            data: v.data_vendita,
            tipo: v.tipo,
            cliente: [v.cliente?.nome, v.cliente?.cognome].filter(Boolean).join(' '),
            prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
            valore: v.valore_contratto,
            rate: v.numero_rate,
          })),
        }
      },
    }),

    metriche_setting: tool({
      description: 'Metriche di setting e call del periodo per ogni setter (DM, conversazioni, call, show rate, close rate).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase.rpc('metriche_setting', { p_da: p.da, p_a: p.a })
        return error ? errore('Metriche non disponibili.') : { periodo: p, setter: data }
      },
    }),

    provvigioni: tool({
      description: 'Provvigioni per persona e mese: maturato, pagato, saldo.',
      inputSchema: z.object({ mesi: z.number().int().min(1).max(12).default(3) }),
      execute: async ({ mesi }) => {
        const { data, error } = await supabase.rpc('provvigioni_riepilogo', { p_mesi: mesi })
        return error ? errore('Provvigioni non disponibili.') : { provvigioni: data }
      },
    }),

    costi_periodo: tool({
      description: 'Costi del periodo per categoria.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase.rpc('riepilogo_costi_periodo', { p_da: p.da, p_a: p.a })
        return error ? errore('Costi non disponibili.') : { periodo: p, costi: data }
      },
    }),

    miei_numeri: tool({
      description: 'I numeri del setter che chatta nel periodo, con provvigioni maturate e pagate (solo totali).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase.rpc('miei_numeri_periodo', { p_da: p.da, p_a: p.a })
        return error ? errore('Numeri non disponibili.') : { periodo: p, numeri: data?.[0] ?? null }
      },
    }),

    call_periodo: tool({
      description: 'Call programmate nel periodo visibili a chi chatta, con lead, tipo, stato ed esito.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase
          .from('calls')
          .select('id, tipo, programmata_il, stato, esito, qualificata, lead:leads(nome), closer:profiles!calls_closer_id_fkey(nome)')
          // a day of margin on both sides, then the Rome calendar day decides
          .gte('programmata_il', `${aggiungiGiorni(p.da, -1)}T00:00:00Z`)
          .lt('programmata_il', `${aggiungiGiorni(p.a, 2)}T00:00:00Z`)
          .order('programmata_il')
          .limit(60)
        if (error) return errore('Call non disponibili.')
        const nelPeriodo = data.filter((c) => {
          const giorno = oggiRoma(new Date(c.programmata_il))
          return giorno >= p.da && giorno <= p.a
        })
        return {
          periodo: p,
          call: nelPeriodo.map((c) => ({
            lead: c.lead?.nome,
            tipo: c.tipo,
            quando: c.programmata_il,
            stato: c.stato,
            esito: c.esito,
            closer: c.closer?.nome,
          })),
        }
      },
    }),

    progetti: tool({
      description: 'Progetti visibili a chi chatta, con stato, avanzamento, task in ritardo e date.',
      inputSchema: z.object({ testo: z.string().max(60).optional() }),
      execute: async ({ testo }) => {
        let q = supabase
          .from('v_pm_progetti')
          .select('id, nome, stato, avanzamento, task_totali, task_completati, task_in_ritardo, data_inizio, data_fine')
          .order('nome')
          .limit(25)
        if (testo?.trim()) q = q.ilike('nome', `%${testo.trim()}%`)
        const { data, error } = await q
        return error ? errore('Progetti non disponibili.') : { progetti: data }
      },
    }),

    miei_task: tool({
      description: 'I task aperti assegnati a chi chatta, con progetto, scadenza e ritardo.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('v_pm_task')
          .select('titolo, stato, scadenza, in_ritardo, priorita, progetto_id')
          .eq('assegnatario_id', profilo.id)
          .neq('stato', 'completato')
          .order('scadenza', { nullsFirst: false })
          .limit(30)
        return error ? errore('Task non disponibili.') : { task: data }
      },
    }),

    // --- writes: the user confirms each one in the chat before it runs ---

    crea_cliente: tool({
      description: 'Crea un cliente (senza vendita: risulterà "mai attivato").',
      inputSchema: z.object({
        nome: z.string().min(1).max(80),
        cognome: z.string().max(80).optional(),
        email: z.string().max(160).optional(),
        telefono: z.string().max(30).optional(),
        instagram_handle: z.string().max(40).optional(),
        fonte: z.enum(FONTI).optional(),
        note: z.string().max(1000).optional(),
      }),
      execute: async (v) => {
        const esito = await creaCliente({ ...v, setter_id: null, closer_id: null })
        return esito.ok ? { fatto: true, link: `/clients/${esito.id}` } : errore(esito.errore)
      },
    }),

    segna_incassata: tool({
      description: 'Segna incassata una rata (payment_id da da_incassare). Senza data: oggi; senza importo: quello previsto.',
      inputSchema: z.object({
        payment_id: z.string().uuid(),
        cliente: z.string().describe('Nome del cliente, per la conferma'),
        incassato_il: data.optional(),
        importo: z.number().positive().optional(),
        metodo: z.enum(METODI).optional(),
      }),
      execute: async (v) => {
        const esito = await segnaIncassata({
          payment_id: v.payment_id,
          incassato_il: v.incassato_il,
          importo: v.importo,
          metodo: v.metodo,
        })
        return esito.ok ? { fatto: true, importo: esito.importo } : errore(esito.errore)
      },
    }),

    registra_costo: tool({
      description: 'Registra un costo. Data di default: oggi.',
      inputSchema: z.object({
        data: data.optional(),
        categoria: z.enum(CATEGORIE_COSTO),
        descrizione: z.string().min(2).max(160),
        importo: z.number().positive(),
        ricorrente: z.boolean().default(false),
      }),
      execute: async (v) => {
        const esito = await aggiungiCosto({ ...v, data: v.data ?? oggiRoma() })
        return esito.ok ? { fatto: true, link: '/expenses' } : errore(esito.errore)
      },
    }),

    aggiorna_report: tool({
      description:
        'Aggiorna il report giornaliero del setter. modalita "aggiungi" somma ai numeri già salvati, "imposta" li sostituisce. Data di default: oggi.',
      inputSchema: z.object({
        data: data.optional(),
        modalita: z.enum(['aggiungi', 'imposta']),
        ...Object.fromEntries(CAMPI_REPORT.map((c) => [c, z.number().int().min(0).max(5000).optional()])),
        contenuto_pubblicato: z.boolean().optional(),
      }),
      execute: async (v: Record<string, unknown>) => {
        const giorno = typeof v.data === 'string' && isDataISO(v.data) ? v.data : oggiRoma()
        const { data: attuale } = await supabase
          .from('setter_daily_reports')
          .select('*')
          .eq('setter_id', profilo.id)
          .eq('data', giorno)
          .maybeSingle()
        const valori: Record<string, unknown> = { data: giorno, note: attuale?.note ?? null }
        for (const campo of CAMPI_REPORT) {
          const prima = Number(attuale?.[campo] ?? 0)
          const nuovo = v[campo]
          valori[campo] = typeof nuovo === 'number' ? (v.modalita === 'aggiungi' ? prima + nuovo : nuovo) : prima
        }
        valori.contenuto_pubblicato =
          typeof v.contenuto_pubblicato === 'boolean' ? v.contenuto_pubblicato : (attuale?.contenuto_pubblicato ?? false)
        const esito = await salvaReportGiornaliero(valori)
        return esito.ok ? { fatto: true, report: valori, link: '/today' } : errore(esito.errore)
      },
    }),

    fissa_call: tool({
      description: 'Fissa una call e crea il lead. Closer di default: l’admin.',
      inputSchema: z.object({
        nome: z.string().min(2).max(120),
        instagram_handle: z.string().max(40).optional(),
        fonte: z.enum(FONTI),
        tipo: z.enum(TIPI_CALL),
        data,
        ora: z.string().describe('HH:MM'),
        closer: z.string().optional().describe('Nome del closer'),
      }),
      execute: async ({ closer, ...v }) => {
        const { data: persone } = await supabase
          .from('profiles')
          .select('id, nome, ruolo')
          .in('ruolo', ['admin', 'closer'])
          .eq('attivo', true)
        const elenco = persone ?? []
        const scelto = closer ? trova(elenco, closer) : (elenco.find((p) => p.ruolo === 'admin') ?? null)
        if (!scelto || scelto === 'ambiguo') {
          return errore(`Closer non trovato. Possibili: ${elenco.map((p) => p.nome).join(', ')}`)
        }
        const esito = await fissaCall({ ...v, closer_id: scelto.id })
        return esito.ok ? { fatto: true, closer: scelto.nome, link: '/calls' } : errore(esito.errore)
      },
    }),

    crea_progetto: tool({
      description: 'Crea un progetto in un reparto, facoltativamente da un modello (liste e task già datati).',
      inputSchema: z.object({
        nome: z.string().min(2).max(120),
        reparto: z.string().describe('Nome del reparto'),
        modello: z.string().optional().describe('Nome del modello'),
        descrizione: z.string().max(2000).optional(),
        data_inizio: data.optional(),
        data_fine: data.optional(),
      }),
      execute: async ({ reparto, modello, ...v }) => {
        const [reparti, modelli] = await Promise.all([
          supabase.from('pm_reparti').select('id, nome').eq('attivo', true),
          supabase.from('pm_modelli').select('id, nome').eq('attivo', true),
        ])
        const r = trova(reparti.data ?? [], reparto)
        if (!r || r === 'ambiguo') {
          return errore(`Reparto non trovato. Reparti: ${(reparti.data ?? []).map((x) => x.nome).join(', ')}`)
        }
        const m = modello ? trova(modelli.data ?? [], modello) : null
        if (modello && (!m || m === 'ambiguo')) {
          return errore(`Modello non trovato. Modelli: ${(modelli.data ?? []).map((x) => x.nome).join(', ')}`)
        }
        const esito = await creaProgetto({
          ...v,
          reparto_id: r.id,
          modello_id: m && m !== 'ambiguo' ? m.id : null,
          client_id: null,
          membri: [],
        })
        return esito.ok ? { fatto: true, link: `/progetti/${esito.id}` } : errore(esito.errore)
      },
    }),

    aggiungi_task: tool({
      description: 'Aggiunge un task a un progetto (in fondo, senza lista).',
      inputSchema: z.object({
        progetto: z.string().describe('Nome del progetto'),
        titolo: z.string().min(1).max(200),
      }),
      execute: async ({ progetto, titolo }) => {
        const { data: progetti } = await supabase.from('v_pm_progetti').select('id, nome').limit(200)
        const p = trova((progetti ?? []) as { id: string; nome: string | null }[], progetto)
        if (!p || p === 'ambiguo') return errore('Progetto non trovato o non univoco: scrivi il nome completo.')
        const esito = await aggiungiTask({ progetto_id: p.id, titolo, tasklist_id: null, parent_id: null })
        return esito.ok ? { fatto: true, link: `/progetti/${p.id}` } : errore(esito.errore)
      },
    }),
  } satisfies Record<NomeStrumento, unknown>

  const consentiti = new Set<string>(strumentiConsentiti(profilo.ruolo, livelloPm))
  return Object.fromEntries(Object.entries(tutti).filter(([nome]) => consentiti.has(nome))) as ToolSet
}
