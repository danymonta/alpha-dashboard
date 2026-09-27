import 'server-only'

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import { modificaCall } from '@/app/(app)/calls/actions'
import { fissaCall } from '@/app/(app)/calls/new/actions'
import { aggiornaCliente, creaCliente } from '@/app/(app)/clients/actions'
import { aggiungiCosto, modificaCosto } from '@/app/(app)/expenses/actions'
import { aggiungiTask, completaTask } from '@/app/(app)/progetti/[id]/actions'
import { creaProgetto } from '@/app/(app)/progetti/actions'
import { modificaRata, modificaVendita, segnaIncassata } from '@/app/(app)/sales/[id]/actions'
import { registraVendita } from '@/app/(app)/sales/new/actions'
import { salvaReportGiornaliero } from '@/app/(app)/today/actions'
import { ARGOMENTI_GUIDA, GUIDA, type ArgomentoGuida } from '@/lib/alfire/guida'
import { strumentiConsentiti, type NomeStrumento } from '@/lib/alfire/permessi'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { aggiungiGiorni, fineDopoMesi, formatOra, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import type { createClient } from '@/lib/supabase/server'
import { CATEGORIE_COSTO } from '@/lib/validation/anagrafiche'
import { FONTI, TIPI_CALL } from '@/lib/validation/call'
import { METODI } from '@/lib/validation/incasso'
import { PERSONALIZZATO } from '@/lib/validation/vendita'
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
  /** A client by full name. Among clients the user can see; a new name is fine only for a first sale. */
  async function trovaCliente(
    nome: string,
    { anchePerNuovo = false }: { anchePerNuovo?: boolean } = {},
  ): Promise<{ id: string; nome: string } | null | string> {
    const parole = nome.trim().split(/\s+/).filter(Boolean)
    if (parole.length === 0) return 'Scrivi il nome del cliente.'
    const { data } = await supabase
      .from('clients')
      .select('id, nome, cognome')
      .ilike('nome', `%${parole[0].replace(/[%,()]/g, '')}%`)
      .limit(50)
    const righe = (data ?? []).map((c) => ({ id: c.id, nome: [c.nome, c.cognome].filter(Boolean).join(' ') }))
    const trovato = trova(righe, nome)
    if (trovato === 'ambiguo') {
      return `Più clienti possibili: ${righe
        .filter((r) => r.nome.toLowerCase().includes(nome.trim().toLowerCase()))
        .slice(0, 5)
        .map((r) => r.nome)
        .join(', ')}. Scrivi nome e cognome completi.`
    }
    if (trovato) return trovato
    return anchePerNuovo ? null : `Nessun cliente "${nome}". Controlla il nome o crealo prima.`
  }

  /**
   * A person's id from a name: "io" is whoever chats, "nessuno" empties the
   * field, nothing keeps the current value. An error object when not found.
   */
  async function idPersona(
    nome: string | undefined,
    attuale: string | null,
    ruoli: string[],
  ): Promise<string | null | { errore: string }> {
    if (!nome?.trim()) return attuale
    const n = nome.trim().toLowerCase()
    if (['io', 'me', 'a me', 'me stesso'].includes(n)) return profilo.id
    if (['nessuno', 'nessuna', '-'].includes(n)) return null
    const { data } = await supabase.from('profiles').select('id, nome, ruolo').in('ruolo', ruoli as never)
    const trovato = trova(data ?? [], nome)
    if (!trovato || trovato === 'ambiguo') {
      return { errore: `Persona "${nome}" non trovata. Possibili: ${(data ?? []).map((p) => p.nome).join(', ')}` }
    }
    return trovato.id
  }

  /** Setter and closer of a sale just created, when the chat names them. */
  async function cambiaPersoneVendita(saleId: string, setter?: string, closer?: string): Promise<string | null> {
    const { data: vendita } = await supabase
      .from('sales')
      .select('id, tipo, product_id, prodotto_personalizzato, valore_contratto, data_vendita, data_inizio, data_fine, setter_id, closer_id, note')
      .eq('id', saleId)
      .single()
    if (!vendita) return 'Vendita registrata, ma non ho potuto impostare setter e closer.'
    const s = await idPersona(setter, vendita.setter_id, ['admin', 'setter', 'closer'])
    const c = await idPersona(closer, vendita.closer_id, ['admin', 'closer'])
    if (typeof s === 'object' && s) return s.errore
    if (typeof c === 'object' && c) return c.errore
    const esito = await modificaVendita({
      ...vendita,
      product_id: vendita.product_id ?? PERSONALIZZATO,
      setter_id: s as string | null,
      closer_id: c as string | null,
    })
    return esito.ok ? null : `Setter e closer non impostati: ${esito.errore}`
  }

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

    rate_cliente: tool({
      description: 'Le vendite e le rate di un cliente (con payment_id), incassate e da incassare.',
      inputSchema: z.object({ cliente: z.string().describe('Nome e cognome') }),
      execute: async ({ cliente }) => {
        const c = await trovaCliente(cliente)
        if (!c || typeof c === 'string') return errore(c ?? 'Cliente non trovato.')
        const { data, error } = await supabase
          .from('v_rate')
          .select('payment_id, sale_id, tipo, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo, in_ritardo')
          .eq('client_id', c.id)
          .order('scadenza')
          .limit(60)
        return error ? errore('Rate non disponibili.') : { cliente: c.nome, rate: data }
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
      description: 'Costi del periodo: totali per categoria ed elenco delle voci (con id per modifica_costo).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const [totali, voci] = await Promise.all([
          supabase.rpc('riepilogo_costi_periodo', { p_da: p.da, p_a: p.a }),
          supabase
            .from('expenses')
            .select('id, data, categoria, descrizione, importo, ricorrente')
            .gte('data', p.da)
            .lte('data', p.a)
            .order('data', { ascending: false })
            .limit(40),
        ])
        if (totali.error || voci.error) return errore('Costi non disponibili.')
        return { periodo: p, per_categoria: totali.data, voci: voci.data }
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
            call_id: c.id,
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
          .select('id, titolo, stato, scadenza, in_ritardo, priorita, progetto_id')
          .eq('assegnatario_id', profilo.id)
          .neq('stato', 'completato')
          .order('scadenza', { nullsFirst: false })
          .limit(30)
        return error ? errore('Task non disponibili.') : { task: data }
      },
    }),

    // --- writes: the user confirms each one in the chat before it runs ---

    crea_cliente: tool({
      description:
        'Crea un cliente SENZA vendita (risulterà "mai attivato"). Se ha comprato o pagato qualcosa usa invece registra_vendita, che crea anche il cliente.',
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

    modifica_cliente: tool({
      description:
        'Corregge i dati di un cliente. Solo i campi da cambiare. setter e closer: nome della persona, "io" per chi chatta, "nessuno" per toglierlo.',
      inputSchema: z.object({
        cliente: z.string().describe('Nome e cognome attuali'),
        nome: z.string().min(1).max(80).optional(),
        cognome: z.string().max(80).optional(),
        email: z.string().max(160).optional(),
        telefono: z.string().max(30).optional(),
        instagram_handle: z.string().max(40).optional(),
        fonte: z.enum(FONTI).optional(),
        setter: z.string().optional(),
        closer: z.string().optional(),
        note: z.string().max(1000).optional().describe('Sostituisce le note'),
        aggiungi_nota: z.string().max(500).optional().describe('Si aggiunge in fondo alle note'),
      }),
      execute: async (v) => {
        const c = await trovaCliente(v.cliente)
        if (!c || typeof c === 'string') return errore(c ?? 'Cliente non trovato.')
        const { data: attuale, error } = await supabase
          .from('clients')
          .select('id, nome, cognome, email, telefono, instagram_handle, fonte, setter_id, closer_id, note')
          .eq('id', c.id)
          .single()
        if (error) return errore('Cliente non trovato.')
        const setter = await idPersona(v.setter, attuale.setter_id, ['admin', 'setter', 'closer'])
        const closer = await idPersona(v.closer, attuale.closer_id, ['admin', 'closer'])
        if (typeof setter === 'object' && setter) return setter
        if (typeof closer === 'object' && closer) return closer
        const note = v.aggiungi_nota
          ? [v.note ?? attuale.note, v.aggiungi_nota].filter(Boolean).join('\n')
          : (v.note ?? attuale.note)
        const esito = await aggiornaCliente({
          ...attuale,
          nome: v.nome ?? attuale.nome,
          cognome: v.cognome ?? attuale.cognome,
          email: v.email ?? attuale.email,
          telefono: v.telefono ?? attuale.telefono,
          instagram_handle: v.instagram_handle ?? attuale.instagram_handle,
          fonte: v.fonte ?? attuale.fonte,
          setter_id: setter as string | null,
          closer_id: closer as string | null,
          note,
        })
        return esito.ok ? { fatto: true, link: `/clients/${c.id}` } : errore(esito.errore)
      },
    }),

    registra_vendita: tool({
      description:
        'Registra una vendita: cliente esistente (o nuovo, se il tipo è "nuovo"), prodotto del catalogo o percorso su misura, valore, date. ' +
        'Piano: numero_rate uguali mensili, oppure rate una per una. Le rate già pagate si mettono in rate con incassata_il e metodo ' +
        '(es. pagato tutto subito in contanti: una rata con scadenza e incassata_il = data_vendita). setter e closer: nome o "io".',
      inputSchema: z.object({
        cliente: z.string().describe('Nome e cognome'),
        tipo: z.enum(['nuovo', 'rinnovo', 'upsell']),
        prodotto: z.string().describe('Nome del prodotto del catalogo, o del percorso su misura (es. Annuale)'),
        valore: z.number().positive().describe('Valore del contratto in euro'),
        data_vendita: data,
        data_inizio: data,
        durata_mesi: z.number().int().min(1).max(36).optional(),
        data_fine: data.optional(),
        numero_rate: z.number().int().min(1).max(24).optional(),
        rate: z
          .array(
            z.object({
              scadenza: data,
              importo: z.number().positive(),
              incassata_il: data.optional(),
              metodo: z.enum(METODI).optional(),
            }),
          )
          .max(24)
          .optional(),
        setter: z.string().optional(),
        closer: z.string().optional(),
        note: z.string().max(1000).optional(),
        // only for a client created by this sale
        email: z.string().max(160).optional(),
        telefono: z.string().max(30).optional(),
        instagram_handle: z.string().max(40).optional(),
        fonte: z.enum(FONTI).optional(),
      }),
      execute: async (v) => {
        const c = await trovaCliente(v.cliente, { anchePerNuovo: v.tipo === 'nuovo' })
        if (typeof c === 'string') return errore(c)

        const { data: prodotti } = await supabase.from('products').select('id, nome, durata_mesi')
        const catalogo = trova(prodotti ?? [], v.prodotto)
        const prodotto = catalogo && catalogo !== 'ambiguo' ? catalogo : null
        const dataFine = v.data_fine ?? (v.durata_mesi ? fineDopoMesi(v.data_inizio, v.durata_mesi) : null)
        if (!prodotto && !dataFine) return errore('Per un percorso fuori catalogo servono la durata in mesi o la data di fine.')

        const [nome, ...cognome] = v.cliente.trim().split(/\s+/)
        const esito = await registraVendita({
          call_id: null,
          client_id: c?.id ?? null,
          nome: c ? null : nome,
          cognome: c ? null : cognome.join(' ') || null,
          email: c ? null : (v.email ?? null),
          telefono: c ? null : (v.telefono ?? null),
          instagram_handle: c ? null : (v.instagram_handle ?? null),
          tipo: v.tipo,
          product_id: prodotto?.id ?? PERSONALIZZATO,
          prodotto_personalizzato: prodotto ? null : v.prodotto,
          data_fine: dataFine,
          piano: v.rate?.length ? 'personalizzato' : 'uguale',
          rate: (v.rate ?? []).map((r) => ({ scadenza: r.scadenza, importo: r.importo })),
          valore_contratto: v.valore,
          numero_rate: v.rate?.length || v.numero_rate || 1,
          data_vendita: v.data_vendita,
          data_inizio: v.data_inizio,
          note: v.note ?? null,
        })
        if (!esito.ok) return errore([esito.errore, ...Object.values(esito.campi ?? {})].join(' '))
        const saleId = esito.idVendita
        const avvisi: string[] = []

        // the source of a new client is not a sale field: set it on the client
        if (!c && v.fonte && profilo.ruolo === 'admin') {
          const { data: vendita } = await supabase.from('sales').select('client_id').eq('id', saleId).single()
          const { data: nuovo } = vendita
            ? await supabase
                .from('clients')
                .select('id, nome, cognome, email, telefono, instagram_handle, fonte, setter_id, closer_id, note')
                .eq('id', vendita.client_id)
                .single()
            : { data: null }
          if (nuovo) {
            const fonte = await aggiornaCliente({ ...nuovo, fonte: v.fonte })
            if (!fonte.ok) avvisi.push(`Fonte non salvata: ${fonte.errore}`)
          }
        }

        // who brought and who closed it, when it is not the call's or the client's
        if ((v.setter || v.closer) && profilo.ruolo === 'admin') {
          const cambio = await cambiaPersoneVendita(saleId, v.setter, v.closer)
          if (cambio) avvisi.push(cambio)
        }

        // instalments already paid, matched by due date and amount
        const pagate = (v.rate ?? []).filter((r) => r.incassata_il)
        if (pagate.length > 0) {
          const { data: rate } = await supabase
            .from('payments')
            .select('id, scadenza, importo_previsto')
            .eq('sale_id', saleId)
            .order('numero_rata')
          const libere = [...(rate ?? [])]
          for (const r of pagate) {
            const i = libere.findIndex((x) => x.scadenza === r.scadenza && Number(x.importo_previsto) === r.importo)
            if (i < 0) {
              avvisi.push(`Rata del ${r.scadenza} non trovata: segnala incassata dalla vendita.`)
              continue
            }
            const [rata] = libere.splice(i, 1)
            const incasso = await segnaIncassata({
              payment_id: rata.id,
              incassato_il: r.incassata_il,
              importo: r.importo,
              metodo: r.metodo ?? null,
            })
            if (!incasso.ok) avvisi.push(`Incasso del ${r.incassata_il}: ${incasso.errore}`)
          }
        }
        return { fatto: true, link: `/sales/${saleId}`, cliente_nuovo: !c, avvisi }
      },
    }),

    modifica_vendita: tool({
      description:
        'Corregge una vendita di un cliente (la più recente, o quella della data_vendita indicata). Solo i campi da cambiare. ' +
        'Il piano rate non cambia: le rate si correggono con modifica_rata.',
      inputSchema: z.object({
        cliente: z.string().describe('Nome e cognome'),
        data_vendita: data.optional().describe('Per scegliere la vendita, se il cliente ne ha più di una'),
        tipo: z.enum(['nuovo', 'rinnovo', 'upsell']).optional(),
        prodotto: z.string().optional(),
        valore: z.number().positive().optional(),
        nuova_data_vendita: data.optional(),
        data_inizio: data.optional(),
        data_fine: data.optional(),
        setter: z.string().optional(),
        closer: z.string().optional(),
        note: z.string().max(1000).optional(),
      }),
      execute: async (v) => {
        const c = await trovaCliente(v.cliente)
        if (!c || typeof c === 'string') return errore(c ?? 'Cliente non trovato.')
        let q = supabase
          .from('sales')
          .select('id, tipo, product_id, prodotto_personalizzato, valore_contratto, data_vendita, data_inizio, data_fine, setter_id, closer_id, note')
          .eq('client_id', c.id)
          .order('data_vendita', { ascending: false })
        if (v.data_vendita) q = q.eq('data_vendita', v.data_vendita)
        const { data: vendite } = await q.limit(2)
        const vendita = vendite?.[0]
        if (!vendita) return errore(`${c.nome} non ha vendite${v.data_vendita ? ' in quella data' : ''}.`)

        let productId = vendita.product_id ?? PERSONALIZZATO
        let personalizzato = vendita.prodotto_personalizzato
        if (v.prodotto) {
          const { data: prodotti } = await supabase.from('products').select('id, nome')
          const trovato = trova(prodotti ?? [], v.prodotto)
          productId = trovato && trovato !== 'ambiguo' ? trovato.id : PERSONALIZZATO
          personalizzato = trovato && trovato !== 'ambiguo' ? null : v.prodotto
        }
        const setter = await idPersona(v.setter, vendita.setter_id, ['admin', 'setter', 'closer'])
        const closer = await idPersona(v.closer, vendita.closer_id, ['admin', 'closer'])
        if (typeof setter === 'object' && setter) return setter
        if (typeof closer === 'object' && closer) return closer

        const esito = await modificaVendita({
          id: vendita.id,
          tipo: v.tipo ?? vendita.tipo,
          product_id: productId,
          prodotto_personalizzato: personalizzato,
          valore_contratto: v.valore ?? vendita.valore_contratto,
          data_vendita: v.nuova_data_vendita ?? vendita.data_vendita,
          data_inizio: v.data_inizio ?? vendita.data_inizio,
          data_fine: v.data_fine ?? vendita.data_fine,
          setter_id: setter as string | null,
          closer_id: closer as string | null,
          note: v.note ?? vendita.note,
        })
        return esito.ok ? { fatto: true, link: `/sales/${vendita.id}` } : errore(esito.errore)
      },
    }),

    modifica_rata: tool({
      description: 'Corregge scadenza o importo previsto di una rata (payment_id da rate_cliente o da_incassare).',
      inputSchema: z.object({
        payment_id: z.string().uuid(),
        cliente: z.string().describe('Nome del cliente, per la conferma'),
        scadenza: data.optional(),
        importo: z.number().positive().optional(),
      }),
      execute: async (v) => {
        const { data: rata } = await supabase
          .from('payments')
          .select('scadenza, importo_previsto, sale_id')
          .eq('id', v.payment_id)
          .maybeSingle()
        if (!rata) return errore('Rata non trovata.')
        const esito = await modificaRata({
          payment_id: v.payment_id,
          scadenza: v.scadenza ?? rata.scadenza,
          importo_previsto: v.importo ?? rata.importo_previsto,
        })
        return esito.ok ? { fatto: true, link: `/sales/${rata.sale_id}` } : errore(esito.errore)
      },
    }),

    modifica_costo: tool({
      description: 'Corregge un costo (id da costi_periodo). Solo i campi da cambiare.',
      inputSchema: z.object({
        id: z.string().uuid(),
        costo: z.string().describe('Descrizione attuale, per la conferma'),
        data: data.optional(),
        categoria: z.enum(CATEGORIE_COSTO).optional(),
        descrizione: z.string().min(2).max(160).optional(),
        importo: z.number().positive().optional(),
        ricorrente: z.boolean().optional(),
      }),
      execute: async (v) => {
        const { data: attuale } = await supabase
          .from('expenses')
          .select('data, categoria, descrizione, importo, ricorrente')
          .eq('id', v.id)
          .maybeSingle()
        if (!attuale) return errore('Costo non trovato.')
        const esito = await modificaCosto({
          id: v.id,
          data: v.data ?? attuale.data,
          categoria: v.categoria ?? attuale.categoria,
          descrizione: v.descrizione ?? attuale.descrizione,
          importo: v.importo ?? attuale.importo,
          ricorrente: v.ricorrente ?? attuale.ricorrente,
        })
        return esito.ok ? { fatto: true, link: '/expenses' } : errore(esito.errore)
      },
    }),

    modifica_call: tool({
      description: 'Sposta o corregge una call (call_id da call_periodo): data, ora, tipo, closer, note.',
      inputSchema: z.object({
        call_id: z.string().uuid(),
        lead: z.string().describe('Nome del lead, per la conferma'),
        data: data.optional(),
        ora: z.string().optional().describe('HH:MM'),
        tipo: z.enum(TIPI_CALL).optional(),
        closer: z.string().optional(),
        note: z.string().max(1000).optional(),
      }),
      execute: async (v) => {
        const { data: call } = await supabase
          .from('calls')
          .select('tipo, programmata_il, closer_id, note')
          .eq('id', v.call_id)
          .maybeSingle()
        if (!call) return errore('Call non trovata.')
        const closer = await idPersona(v.closer, call.closer_id, ['admin', 'closer'])
        if (typeof closer === 'object' && closer) return closer
        if (!closer) return errore('La call ha bisogno di un closer.')
        const esito = await modificaCall({
          call_id: v.call_id,
          tipo: v.tipo ?? call.tipo,
          data: v.data ?? oggiRoma(new Date(call.programmata_il)),
          ora: v.ora ?? formatOra(call.programmata_il),
          closer_id: closer,
          note: v.note ?? call.note,
        })
        return esito.ok ? { fatto: true, link: '/calls' } : errore(esito.errore)
      },
    }),

    completa_task: tool({
      description: 'Segna un task come fatto (o lo riapre), cercandolo per titolo tra quelli visibili.',
      inputSchema: z.object({
        titolo: z.string().min(1),
        progetto: z.string().optional(),
        completato: z.boolean().default(true),
      }),
      execute: async (v) => {
        const { data: task } = await supabase
          .from('v_pm_task')
          .select('id, titolo, progetto_id')
          .ilike('titolo', `%${v.titolo.trim()}%`)
          .limit(20)
        let candidati = (task ?? []) as { id: string; titolo: string; progetto_id: string }[]
        if (v.progetto && candidati.length > 1) {
          const { data: progetti } = await supabase.from('v_pm_progetti').select('id, nome').ilike('nome', `%${v.progetto}%`)
          const ids = new Set((progetti ?? []).map((p) => p.id))
          candidati = candidati.filter((t) => ids.has(t.progetto_id))
        }
        const esatto = candidati.filter((t) => t.titolo.toLowerCase() === v.titolo.trim().toLowerCase())
        const scelto = esatto.length === 1 ? esatto[0] : candidati.length === 1 ? candidati[0] : null
        if (!scelto) {
          return errore(
            candidati.length === 0
              ? 'Task non trovato.'
              : `Più task possibili: ${candidati.slice(0, 5).map((t) => t.titolo).join(', ')}. Indica il progetto o il titolo esatto.`,
          )
        }
        const esito = await completaTask({ id: scelto.id, completato: v.completato })
        return esito.ok ? { fatto: true, link: `/progetti/${scelto.progetto_id}` } : errore(esito.errore)
      },
    }),
  } satisfies Record<NomeStrumento, unknown>

  const consentiti = new Set<string>(strumentiConsentiti(profilo.ruolo, livelloPm))
  return Object.fromEntries(Object.entries(tutti).filter(([nome]) => consentiti.has(nome))) as ToolSet
}
