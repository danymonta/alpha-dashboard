import 'server-only'

import type { ToolSet } from 'ai'
import { z } from 'zod'

import { ARGOMENTI_GUIDA, GUIDA, type ArgomentoGuida } from '@/lib/alfire/guida'
import { isScrittura, strumentiConsentiti, type NomeStrumento } from '@/lib/alfire/permessi'
import type { Anteprima } from '@/lib/alfire/riassunto'
import { errore, etichettaRegola, isErrore, risolutori, type Supabase } from '@/lib/alfire/risolvi'
import { definizione, type Contesto, type Definizione } from '@/lib/alfire/scritture/comune'
import { scrittureEconomics } from '@/lib/alfire/scritture/economics'
import { strumentiProgetti } from '@/lib/alfire/scritture/progetti'
import { scrittureSetting } from '@/lib/alfire/scritture/setting'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { aggiungiGiorni, aggiungiMesi, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'

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

/** What Alfire reads: the same views and RPCs as the pages, with the user's session. */
function letture({ supabase, profilo, r }: Contesto) {
  return {
    guida: definizione({
      description: 'Come funziona una parte della dashboard (pagine, regole, permessi).',
      inputSchema: z.object({ argomento: z.enum(ARGOMENTI_GUIDA as [ArgomentoGuida, ...ArgomentoGuida[]]) }),
      execute: async ({ argomento }) => ({ testo: GUIDA[argomento] }),
    }),

    numeri_periodo: definizione({
      description:
        'KPI del periodo con confronto col precedente (cash, revenue, nuovi clienti, rinnovi, margine operativo), ' +
        'cash in 4 parti, provvigioni e costi, indicatori sui soli nuovi clienti e funnel DM → chiuse. Tassi in decimali.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const [kpi, metriche, funnel] = await Promise.all([
          supabase.rpc('kpi_periodo', { p_da: p.da, p_a: p.a }),
          supabase.rpc('metriche_periodo', { p_da: p.da, p_a: p.a }).single(),
          supabase.rpc('funnel_periodo', { p_da: p.da, p_a: p.a }),
        ])
        if (kpi.error || metriche.error || funnel.error) return errore('Numeri non disponibili.')
        const m = metriche.data
        // picked and named for the model, never added up here: the SQL did it
        return {
          periodo: p,
          kpi: kpi.data,
          // the four parts always add up to cash_incassato
          cash_in_4_parti: {
            nuovi_clienti_del_periodo: m.cash_nuovi_clienti,
            rate_di_clienti_gia_entrati: m.cash_rate_precedenti,
            rinnovi: m.cash_rinnovo,
            upsell: m.cash_upsell,
          },
          provvigioni_maturate: m.provvigioni_maturate,
          costi: m.costi,
          // acquisition: the new clients of the period only; null = no denominator
          solo_nuovi_clienti: {
            revenue: m.revenue_nuovi,
            valore_medio: m.valore_medio_nuovo,
            cash_per_dm: m.cash_per_dm,
            revenue_per_dm: m.revenue_per_dm,
            cash_per_call_svolta: m.cash_per_call_svolta,
          },
          show_rate: m.show_rate,
          close_rate: m.close_rate,
          tasso_rinnovo: m.tasso_rinnovo,
          funnel: funnel.data,
        }
      },
    }),

    cash_per_mese: definizione({
      description:
        'Cash incassato per mese in 4 parti: nuovi_clienti (vendite nuove firmate quel mese), rate_precedenti ' +
        '(rate di clienti entrati nei mesi prima), rinnovo, upsell; più il totale.',
      inputSchema: z.object({ mesi: z.number().int().min(1).max(24).default(6) }),
      execute: async ({ mesi }) => {
        const { data, error } = await supabase.rpc('cash_mensile', { p_mesi: mesi })
        return error ? errore('Cash non disponibile.') : { mesi: data }
      },
    }),

    da_incassare: definizione({
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

    cerca_clienti: definizione({
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

    rate_cliente: definizione({
      description: 'Le vendite e le rate di un cliente (con payment_id), incassate e da incassare.',
      inputSchema: z.object({ cliente: z.string().describe('Nome e cognome') }),
      execute: async ({ cliente }) => {
        const c = await r.trovaCliente(cliente)
        if (!c) return errore('Cliente non trovato.')
        if (isErrore(c)) return c
        const { data, error } = await supabase
          .from('v_rate')
          .select('payment_id, sale_id, tipo, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo, in_ritardo')
          .eq('client_id', c.id)
          .order('scadenza')
          .limit(60)
        return error ? errore('Rate non disponibili.') : { cliente: c.nome, rate: data }
      },
    }),

    vendite_periodo: definizione({
      description: 'Vendite firmate nel periodo, con tipo, valore, incassato, da incassare e rate in ritardo.',
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
        // the money of each sale from v_vendite, merged by id: nothing is added up here
        const importi =
          data.length > 0
            ? await supabase
                .from('v_vendite')
                .select('sale_id, incassato, da_incassare, rate_in_ritardo')
                .in(
                  'sale_id',
                  data.map((v) => v.id),
                )
            : { data: [], error: null }
        if (importi.error) return errore('Incassi delle vendite non disponibili.')
        const perVendita = new Map((importi.data ?? []).map((i) => [i.sale_id, i]))
        return {
          periodo: p,
          vendite: data.map((v) => {
            const i = perVendita.get(v.id)
            return {
              sale_id: v.id,
              data: v.data_vendita,
              tipo: v.tipo,
              cliente: [v.cliente?.nome, v.cliente?.cognome].filter(Boolean).join(' '),
              prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
              valore: v.valore_contratto,
              rate: v.numero_rate,
              incassato: i?.incassato ?? null,
              da_incassare: i?.da_incassare ?? null,
              rate_in_ritardo: i?.rate_in_ritardo ?? null,
            }
          }),
        }
      },
    }),

    metriche_setting: definizione({
      description: 'Metriche di setting e call del periodo per ogni setter (DM, conversazioni, call, show rate, close rate).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase.rpc('metriche_setting', { p_da: p.da, p_a: p.a })
        return error ? errore('Metriche non disponibili.') : { periodo: p, setter: data }
      },
    }),

    provvigioni: definizione({
      description:
        'Provvigioni per persona e mese (maturato, pagato, saldo), le regole di ognuno e i pagamenti registrati (con id).',
      inputSchema: z.object({ mesi: z.number().int().min(1).max(12).default(3) }),
      execute: async ({ mesi }) => {
        const dal = aggiungiMesi(primoDelMeseISO(oggiRoma()), 1 - mesi)
        const [riepilogo, regole, pagamenti] = await Promise.all([
          supabase.rpc('provvigioni_riepilogo', { p_mesi: mesi }),
          supabase
            .from('commission_rules')
            .select('percentuale, applica_a, valida_dal, valida_al, persona:profiles!commission_rules_profile_id_fkey(nome)')
            .order('valida_dal', { ascending: false })
            .limit(30),
          supabase
            .from('commission_payouts')
            .select('id, periodo, importo, pagato_il, metodo, persona:profiles!commission_payouts_profile_id_fkey(nome)')
            .gte('periodo', dal)
            .order('pagato_il', { ascending: false })
            .limit(30),
        ])
        if (riepilogo.error || regole.error || pagamenti.error) return errore('Provvigioni non disponibili.')
        return {
          provvigioni: riepilogo.data,
          regole: (regole.data ?? []).map(({ persona, ...x }) => ({ persona: persona?.nome, ...x, percentuale: etichettaRegola(x) })),
          pagamenti: (pagamenti.data ?? []).map(({ persona, ...x }) => ({ persona: persona?.nome, ...x })),
        }
      },
    }),

    costi_periodo: definizione({
      description: 'Costi del periodo: totali per categoria ed elenco delle voci (con id per costo).',
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

    miei_numeri: definizione({
      description: 'I numeri del setter che chatta nel periodo, con provvigioni maturate e pagate (solo totali).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase.rpc('miei_numeri_periodo', { p_da: p.da, p_a: p.a })
        return error ? errore('Numeri non disponibili.') : { periodo: p, numeri: data?.[0] ?? null }
      },
    }),

    call_periodo: definizione({
      description: 'Call programmate nel periodo visibili a chi chatta, con lead (e il suo stato), tipo, stato ed esito.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        const { data, error } = await supabase
          .from('calls')
          .select('id, tipo, programmata_il, stato, esito, qualificata, lead:leads(nome, stato), closer:profiles!calls_closer_id_fkey(nome)')
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
            stato_lead: c.lead?.stato,
            tipo: c.tipo,
            quando: c.programmata_il,
            stato: c.stato,
            esito: c.esito,
            closer: c.closer?.nome,
          })),
        }
      },
    }),

    progetti: definizione({
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

    miei_task: definizione({
      description: 'I task aperti assegnati a chi chatta (anche quelli condivisi con altri), con progetto, scadenza e ritardo.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('v_pm_task')
          .select('id, titolo, stato, scadenza, in_ritardo, priorita, progetto_id')
          // a task can have several people: mine when I am one of them
          .contains('assegnatari', [profilo.id])
          .neq('stato', 'completato')
          .order('scadenza', { nullsFirst: false })
          .limit(30)
        return error ? errore('Task non disponibili.') : { task: data }
      },
    }),
  }
}

/**
 * Every tool, as definitions: reads, and writes with their preview. The
 * writes live by area in lib/alfire/scritture.
 */
function definizioniAlfire(supabase: Supabase, profilo: Profilo, livelloPm: LivelloPm): Record<NomeStrumento, Definizione> {
  const ctx: Contesto = { supabase, profilo, livelloPm, r: risolutori(supabase, profilo) }
  return {
    ...letture(ctx),
    ...scrittureEconomics(ctx),
    ...scrittureSetting(ctx),
    ...strumentiProgetti(ctx),
  } satisfies Record<NomeStrumento, Definizione>
}

export function strumentiAlfire(supabase: Supabase, profilo: Profilo, livelloPm: LivelloPm): ToolSet {
  const tutti = definizioniAlfire(supabase, profilo, livelloPm)
  return Object.fromEntries(
    strumentiConsentiti(profilo.ruolo, livelloPm).map((nome) => [nome, tutti[nome].strumento]),
  ) as ToolSet
}

/**
 * What the confirmation card shows before the tap, read with the user's
 * session: the real row the tool will write (its name from the database, not
 * the model's), before → after for an edit, what a deletion takes with it.
 * An { errore } means the target is not found or not unique: the card hands
 * it to the model, which asks the user.
 */
export async function anteprimaScrittura(
  supabase: Supabase,
  profilo: Profilo,
  livelloPm: LivelloPm,
  nome: string,
  input: unknown,
): Promise<Anteprima> {
  if (!isScrittura(nome) || !strumentiConsentiti(profilo.ruolo, livelloPm).includes(nome)) {
    return errore('Operazione non disponibile per il tuo ruolo.')
  }
  const d = definizioniAlfire(supabase, profilo, livelloPm)[nome]
  const parsed = d.schema.safeParse(input)
  if (!parsed.success) return errore('Dati non validi per questa operazione.')
  if (!d.anteprima) return { righe: [] }
  return d.anteprima(parsed.data)
}
