import 'server-only'

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import { breve } from '@/lib/alfire/cambi'
import { argomentiGuida, testoGuida, type ArgomentoGuida } from '@/lib/alfire/guida'
import { isScrittura, strumentiConsentiti, type NomeStrumento } from '@/lib/alfire/permessi'
import type { Anteprima } from '@/lib/alfire/riassunto'
import { DESCRIZIONE_PROPOSTE, schemaProposte } from '@/lib/alfire/risposte'
import {
  candidati,
  errore,
  etichettaRegola,
  isErrore,
  nomeCompleto,
  risolutori,
  trova,
  type Errore,
  type Supabase,
} from '@/lib/alfire/risolvi'
import { dataISO, datiDi, definizione, erroreData, SOLO_DI_CHI_CHATTA, type Contesto, type Definizione } from '@/lib/alfire/scritture/comune'
import { scrittureEconomics } from '@/lib/alfire/scritture/economics'
import { strumentiProgetti } from '@/lib/alfire/scritture/progetti'
import { scrittureSetting } from '@/lib/alfire/scritture/setting'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { SPOSTA, tracciaSpostamento } from '@/lib/call/spostamento'
import { aggiungiGiorni, aggiungiMesi, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { LEGENDA_CLOSER, LEGENDA_SETTER, LEGENDA_SETTING } from '@/lib/metriche/legenda'
import { hrefPeriodo } from '@/lib/periodo'
import {
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
  NOTE_SETTER,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  etichettaLivello,
  type CampoScala,
} from '@/lib/setting/commento'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_ESITO } from '@/lib/validation/esito'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

const periodo = z.object({
  da: dataISO('Inizio, incluso. Default: primo giorno del mese corrente').optional(),
  a: dataISO('Fine, inclusa. Default: oggi').optional(),
})

/** The notes of a call in call_periodo: their first characters, on one line. */
const LUNGHEZZA_NOTE_CALL = 300

/** Rows read by call_periodo and vendite_periodo: a list cut short says so. */
const CALL_PERIODO = 60
const VENDITE_PERIODO = 40
/** Projects and my open tasks: the same, said in the result (03/10/2026). */
const PROGETTI_ALFIRE = 40
const MIEI_TASK = 40

/**
 * Which calls RLS gives the setter and the closer: only their own. Said in the
 * description and first in the result, so the model never takes them for all
 * the calls of someone else (the bug of 30/09/2026, with the time). The admin
 * reads every call, each with its setter and closer.
 */
const PERIMETRO_CALL: Partial<Record<Profilo['ruolo'], { descrizione: string; risultato: (nome: string) => string }>> = {
  setter: {
    descrizione: 'Solo le call fissate da chi chatta: di un’altra persona mai tutte le sue call.',
    risultato: (nome) =>
      `Solo le call fissate da ${nome}, cioè da chi sta chattando: non tutte le call del team. Di un’altra persona qui ci sono solo le call fissate da ${nome}, mai tutte le sue.`,
  },
  closer: {
    descrizione: 'Solo le call assegnate a chi chatta: di un’altra persona mai tutte le sue call.',
    risultato: (nome) =>
      `Solo le call assegnate a ${nome}, cioè a chi sta chattando: non tutte le call del team. Di un’altra persona qui ci sono solo le call assegnate a ${nome}, mai tutte le sue.`,
  },
}

// ---------------------------------------------------------------------------
// The setter's and the closer's own money (Dany, 03/10/2026): exactly what the
// app already shows them (CLAUDE.md section 6), read with the same RPCs and
// RLS as their pages, always only theirs and said so first (datiDi). Every
// amount comes from SQL, per sale or per day: never added up here.
// ---------------------------------------------------------------------------

/** Sales of miei_clienti and mie_vendite: the most recent ones; a list cut short says so. */
const MIE_VENDITE = 25
/** Cash-ins of the setter's clients in a period (miei_clienti with da/a): the most recent ones, said when cut. */
const INCASSI_SETTER = 60
/** Days of mie_giornate: the most recent ones; the total counts them all. */
const MIE_GIORNATE = 31

type RigaClienteSetter = Database['public']['Functions']['mie_vendite_setter']['Returns'][number]

/** «A te» of a sale when nothing matured yet, as I miei numeri › I tuoi clienti says it. */
const NON_PREVISTA: Record<RigaClienteSetter['tipo'], string> = {
  nuovo: 'non prevista (nessuna regola)',
  rinnovo: 'non prevista (rinnovo)',
  upsell: 'non prevista (upsell)',
}

/** The setter's commission on a sale: what matured, nothing yet, or none due (as the page says it). */
function aTeVendita(v: RigaClienteSetter): number | string {
  // null until something matures: the generated type does not say so
  const maturata = v.provvigione_vendita as number | null
  if (maturata !== null) return maturata
  return v.provvigione_prevista ? 'matura quando paga' : NON_PREVISTA[v.tipo]
}

/** The same, for one instalment. */
function aTeRata(r: RigaClienteSetter): number | string {
  const maturata = r.provvigione as number | null
  if (maturata !== null) return maturata
  return r.provvigione_prevista && (r.stato === 'prevista' || r.stato === 'fallita') ? 'matura quando paga' : 'non prevista'
}

/** How an instalment of his client stands, in the page's words. */
function statoRataCliente(r: RigaClienteSetter): string {
  if (r.stato === 'incassata') return 'pagata'
  if (r.stato === 'rimborsata') return 'rimborsata'
  if (r.stato === 'fallita') return 'pagamento non andato a buon fine'
  return r.in_ritardo ? 'in ritardo' : 'da pagare'
}

/**
 * How an instalment of the closer's sale stands: the words of the sale page.
 * Late is not stored: planned and past due (StatoRata).
 */
function statoRataVendita(r: { stato: string; scadenza: string }, oggi: string): string {
  if (r.stato === 'prevista' && r.scadenza < oggi) return 'in ritardo'
  if (r.stato === 'incassata') return 'incassata'
  if (r.stato === 'fallita') return 'fallita'
  if (r.stato === 'rimborsata') return 'rimborso'
  return 'da incassare'
}

const S = LEGENDA_SETTING
const C = LEGENDA_CLOSER
const M = LEGENDA_SETTER

/**
 * Cash and revenue of a day say what they count (03/10/2026): only the new
 * clients, their first instalment and their contract on the day of the sale.
 * A bare «Cash» read as everything his clients paid in the period.
 */
const CASH_GIORNATA = 'Cash (prima rata dei clienti nuovi)'
const REVENUE_GIORNATA = 'Revenue (contratti dei clienti nuovi)'

type RigaGiornataSetter = Database['public']['Functions']['giornate_setter']['Returns'][number]
type RigaGiornataCloser = Database['public']['Functions']['giornate_closer']['Returns'][number]

/**
 * The setter's day, as I miei numeri › Giorno per giorno: his report, then the
 * calls he booked as the closer recorded them, then cash and revenue of the new
 * clients he brought. The legend's names: «(closer)» where a name is the report's too.
 */
const GIORNATA_SETTER: readonly (readonly [keyof RigaGiornataSetter, string])[] = [
  ['dm_outbound', S.dm_outbound.etichetta],
  ['dm_inbound', S.dm_inbound.etichetta],
  ['follow_up', S.follow_up.etichetta],
  ['dm_totali', S.dm_totali.etichetta],
  ['conversazioni', S.conversazioni.etichetta],
  ['call_proposte', S.call_proposte.etichetta],
  ['discovery_prenotate', S.discovery_prenotate.etichetta],
  ['strategy_prenotate', S.strategy_storico.etichetta],
  ['prenotate_inbound', S.prenotate_inbound.etichetta],
  ['prenotate_outbound', S.prenotate_outbound.etichetta],
  ['closer_call', C.call.etichetta],
  ['closer_qualificate', M.closer_qualificate.etichetta],
  ['closer_no_show', C.no_show.etichetta],
  ['closer_follow_up', M.closer_follow_up.etichetta],
  ['closer_cancellate', C.cancellate.etichetta],
  ['closer_chiuse', C.chiuse.etichetta],
  ['cash', CASH_GIORNATA],
  ['revenue', REVENUE_GIORNATA],
]

/** The closer's day, as his I miei numeri: the CLOSER half of the Excel. */
const GIORNATA_CLOSER: readonly (readonly [keyof RigaGiornataCloser, string])[] = [
  ['call', C.call.etichetta],
  ['qualificate', C.qualificate.etichetta],
  ['no_show', C.no_show.etichetta],
  ['follow_up', C.follow_up.etichetta],
  ['cancellate', C.cancellate.etichetta],
  ['chiuse', C.chiuse.etichetta],
  ['cash', CASH_GIORNATA],
  ['revenue', REVENUE_GIORNATA],
]

/** A day's numbers by their names; a day leaves out its zeros (as the page's closed lines), the total keeps them. */
function numeriDelGiorno<R extends Record<string, unknown>>(
  riga: R,
  colonne: readonly (readonly [keyof R, string])[],
  senzaZeri: boolean,
): Record<string, unknown> {
  return Object.fromEntries(
    colonne.flatMap(([campo, nome]) => (senzaZeri && Number(riga[campo] ?? 0) === 0 ? [] : [[nome, riga[campo]]])),
  )
}

const DESCRIZIONE_GIORNATE: Partial<Record<Profilo['ruolo'], string>> = {
  // Dany is admin and closer (CLAUDE.md section 6): his own day as the closer, as Setting › Closer with himself chosen
  admin:
    'La giornata da closer dell’admin che chatta, giorno per giorno come Setting › Closer con lui scelto: le call assegnate a lui (svolte, qualificate, no show, follow up, cancellate, chiuse), ' +
    'cash e revenue dei soli clienti nuovi delle vendite chiuse da lui (prima rata incassata e contratto, nel giorno della vendita). Più il totale del periodo con show rate e close rate (decimali), dal SQL. ' +
    'Mai di un altro closer né del team: per quelli call_periodo e vendite_periodo. ',
  setter:
    'La giornata del setter che chatta, giorno per giorno come in I miei numeri: il suo report, gli esiti del closer sulle call che ha fissato, ' +
    'cash e revenue dei soli clienti nuovi che ha portato (prima rata pagata e contratto, nel giorno della vendita). Più il totale del periodo, dal SQL. ' +
    'Il cash non è quanto hanno pagato i suoi clienti nel periodo (rate successive, rinnovi): quello è miei_clienti con da/a. ',
  closer:
    'La giornata del closer che chatta, giorno per giorno come in I miei numeri: call svolte, qualificate, no show, follow up, cancellate, chiuse, ' +
    'cash e revenue dei soli clienti nuovi (prima rata incassata e contratto, nel giorno della vendita). Più il totale del periodo con show rate e close rate (decimali), dal SQL. ' +
    'Il cash non è tutto l’incassato delle sue vendite (rate successive, rinnovi, upsell: mie_vendite). ',
}

/**
 * The period asked for, by default the month so far. A date in another format
 * ("28/09/2026", "lunedì") is an error, never the default: the model would
 * answer about a period nobody asked for (03/10/2026).
 */
function leggiPeriodo({ da, a }: { da?: string; a?: string }): { da: string; a: string } | Errore {
  if ((da?.trim() && !isDataISO(da)) || (a?.trim() && !isDataISO(a))) return erroreData()
  const oggi = oggiRoma()
  const inizio = da?.trim() ? da : primoDelMeseISO(oggi)
  const fine = a?.trim() ? a : oggi
  return inizio <= fine ? { da: inizio, a: fine } : { da: fine, a: inizio }
}

/** What Alfire reads: the same views and RPCs as the pages, with the user's session. */
function letture({ supabase, profilo, livelloPm, r }: Contesto) {
  /** Names of the team by id (the directory every role reads), for the rows that point to a person. */
  async function nomiPersone(ids: readonly (string | null)[]): Promise<Map<string, string> | ReturnType<typeof errore>> {
    const unici = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    if (unici.length === 0) return new Map()
    const { data, error } = await supabase.from('profiles').select('id, nome').in('id', unici)
    // a read that fails is never "no setter"
    if (error) return errore('Persone non disponibili.')
    return new Map(data.map((p) => [p.id, p.nome]))
  }

  return {
    // each role reads its own topics (03/10/2026): a coach never the overview, costs or settings
    guida: definizione({
      description: 'Come funziona una parte della dashboard (pagine, regole, permessi).',
      inputSchema: z.object({ argomento: z.enum(argomentiGuida(profilo.ruolo) as [ArgomentoGuida, ...ArgomentoGuida[]]) }),
      execute: async ({ argomento }) => ({ testo: testoGuida(argomento, profilo.ruolo) }),
    }),

    numeri_periodo: definizione({
      description:
        'KPI del periodo con confronto col precedente (cash, revenue, nuovi clienti, rinnovi, margine operativo), ' +
        'cash in 4 parti, provvigioni e costi, indicatori sui soli nuovi clienti e funnel DM → chiuse. Tassi in decimali.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
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
        'Cerca clienti per nome o cognome, o per stato. Dà stato, fonte, setter (chi l’ha portato) e closer, valore firmato, incassato, da incassare e rate in ritardo.',
      inputSchema: z.object({
        testo: z.string().max(60).optional(),
        stato: z.enum(['attivo', 'in_scadenza', 'scaduto', 'ex_cliente', 'mai_attivato']).optional(),
      }),
      execute: async ({ testo, stato }) => {
        let q = supabase
          .from('v_clienti')
          .select('client_id, nome, cognome, stato, fonte, setter_id, closer_id, valore_firmato, incassato, da_incassare, in_ritardo, data_fine_ultima')
          .order('nome')
          .limit(20)
        if (stato) q = q.eq('stato', stato)
        if (testo?.trim()) {
          const t = testo.trim().replace(/[%,()]/g, ' ')
          q = q.or(`nome.ilike.%${t}%,cognome.ilike.%${t}%`)
        }
        const { data, error } = await q
        if (error) return errore('Clienti non disponibili.')
        // who brought each client, by name: never the admin's clients counted as a setter's
        const nomi = await nomiPersone(data.flatMap((c) => [c.setter_id, c.closer_id]))
        if (isErrore(nomi)) return nomi
        return {
          clienti: data.map(({ setter_id, closer_id, ...c }) => ({
            ...c,
            setter: setter_id ? (nomi.get(setter_id) ?? null) : null,
            closer: closer_id ? (nomi.get(closer_id) ?? null) : null,
          })),
        }
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
      description:
        'Vendite firmate nel periodo, con tipo, setter (chi ha portato il cliente; vuoto: nessuno) e closer, valore, incassato, da incassare e rate in ritardo.',
      inputSchema: periodo.extend({ tipo: z.enum(['nuovo', 'rinnovo', 'upsell']).optional() }),
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        let q = supabase
          .from('sales')
          .select(
            'id, tipo, data_vendita, valore_contratto, numero_rate, prodotto_personalizzato, cliente:clients(nome, cognome), prodotto:products(nome), setter:profiles!sales_setter_id_fkey(nome), closer:profiles!sales_closer_id_fkey(nome)',
          )
          .gte('data_vendita', p.da)
          .lte('data_vendita', p.a)
          .order('data_vendita', { ascending: false })
          .limit(VENDITE_PERIODO)
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
              // who brought the client and who closed: "Loris's clients" are only the sales with his name
              setter: v.setter?.nome ?? null,
              closer: v.closer?.nome ?? null,
              prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
              valore: v.valore_contratto,
              rate: v.numero_rate,
              incassato: i?.incassato ?? null,
              da_incassare: i?.da_incassare ?? null,
              rate_in_ritardo: i?.rate_in_ritardo ?? null,
            }
          }),
          // a list cut short is never the whole period
          ...(data.length >= VENDITE_PERIODO
            ? { nota: `Solo le ${VENDITE_PERIODO} vendite più recenti del periodo: per contarle tutte, un periodo più corto o un tipo.` }
            : {}),
        }
      },
    }),

    metriche_setting: definizione({
      description: 'Metriche di setting e call del periodo per ogni setter (DM, conversazioni, call, show rate, close rate).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const { data, error } = await supabase.rpc('metriche_setting', { p_da: p.da, p_a: p.a })
        return error ? errore('Metriche non disponibili.') : { periodo: p, setter: data }
      },
    }),

    commenti_marketing: definizione({
      description:
        'Cosa dicono i lead, per il marketing, nel periodo. Dal setting (report giornaliero): giorni per livello di lead in target e ' +
        'qualità delle conversazioni, e i giorni con cosa frenava i lead dal fissare la call, domande e contenuti, altre note. ' +
        'Dalle call: il motivo di non chiusura e le note aggiuntive scritti dal closer sulle call svolte finite in follow-up o persa (qui stanno le obiezioni sul prezzo). ' +
        'Per riassumere cosa frena i lead o le obiezioni del mese. Con setter: i suoi report e le call che ha fissato.',
      inputSchema: periodo.extend({ setter: z.string().optional().describe('Nome; vuoto: tutti') }),
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        let setterId: string | undefined
        let setterNome: string | undefined
        if (input.setter?.trim()) {
          const chi = await r.persona(input.setter, ['admin', 'setter'])
          if (isErrore(chi)) return chi
          setterId = chi.id
          setterNome = chi.nome
        }
        // the most recent 60 days and 60 calls with something written: enough to summarize a month
        const limite = 60
        const filtro = { p_da: p.da, p_a: p.a, p_limite: limite, ...(setterId ? { p_setter: setterId } : {}) }
        const [commenti, motivi] = await Promise.all([
          supabase.rpc('commenti_setter_periodo', filtro),
          supabase.rpc('motivi_non_chiusura_periodo', filtro),
        ])
        // a read that fails is never "nothing written"
        if (commenti.error || motivi.error) return errore('Commenti per il marketing non disponibili.')
        // counted in SQL; here only the form's words for each level
        const scale = Object.fromEntries(
          SCALE_COMMENTO.map((scala) => {
            const righe = commenti.data.filter((x) => x.tipo === 'scala' && x.scala === scala.campo)
            return [
              scala.titolo,
              {
                giorni_con_risposta: righe[0]?.su_giorni ?? 0,
                livelli: righe.map((x) => ({
                  livello: etichettaLivello(scala.campo, x.livello),
                  giorni: x.giorni,
                  quota: x.quota,
                })),
              },
            ]
          }),
        )
        // only what was answered and written: a day never says which answer is missing (section 17)
        const giorni = commenti.data
          .filter((x) => x.tipo === 'giorno')
          .map((x) => ({
            data: x.data,
            setter: x.setter,
            ...Object.fromEntries(
              SCALE_COMMENTO.flatMap((scala) => {
                const livello = etichettaLivello(scala.campo as CampoScala, x[scala.campo])
                return livello ? [[scala.titolo, livello]] : []
              }),
            ),
            ...Object.fromEntries(TESTI_COMMENTO.flatMap((t) => (x[t.campo] ? [[t.titolo, x[t.campo]]] : []))),
          }))
        const call = motivi.data.map((c) => ({
          data: c.data,
          lead: c.lead,
          closer: c.closer,
          esito: ETICHETTA_ESITO[c.esito],
          ...(c.motivo ? { [MOTIVO_NON_CHIUSURA.titolo]: c.motivo } : {}),
          ...(c.note_closer ? { [NOTE_CLOSER.titolo]: c.note_closer } : {}),
        }))
        return {
          periodo: p,
          setter: setterNome ?? 'tutti',
          dal_setting: {
            scale,
            giorni_con_testo: giorni,
            ...(giorni.length >= limite ? { nota: `Solo i ${limite} giorni più recenti del periodo.` } : {}),
          },
          dalle_call: call,
          ...(call.length >= limite ? { nota_call: `Solo le ${limite} call più recenti del periodo.` } : {}),
        }
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
        if (isErrore(p)) return p
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
      description: `I numeri del setter che chatta nel periodo, con provvigioni maturate e pagate (solo totali). ${SOLO_DI_CHI_CHATTA}`,
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const { data, error } = await supabase.rpc('miei_numeri_periodo', { p_da: p.da, p_a: p.a })
        return error ? errore('Numeri non disponibili.') : { ...datiDi(profilo), periodo: p, numeri: data?.[0] ?? null }
      },
    }),

    // the clients the setter brought, as I miei numeri › I tuoi clienti (03/10/2026): the one
    // exception of section 6, through mie_vendite_setter (security definer, filtered on the caller)
    miei_clienti: definizione({
      description:
        'I clienti portati dal setter che chatta (le vendite col suo nome), come I miei numeri › I tuoi clienti: per vendita cliente, prodotto, tipo, data, revenue, ' +
        'pagato_in_tutto (dall’inizio della vendita, non per periodo), rate pagate e in ritardo, e a_te (la provvigione maturata su quella vendita). ' +
        'Con cliente anche le rate, ognuna con la provvigione del suo incasso. Con da e/o a, invece, gli incassi di quel periodo uno per uno, ognuno con la sua provvigione, ' +
        'e senza cliente totale_periodo: quanto hanno pagato i suoi clienti nel periodo (al netto dei rimborsi), quanti incassi e la provvigione maturata, già sommati dal SQL. ' +
        '«Quanto hanno pagato i miei clienti questo mese?»: da/a e rispondi con totale_periodo. Importi per vendita o per incasso, dal SQL: non sommarli mai, i totali sono già lì. ' +
        SOLO_DI_CHI_CHATTA,
      inputSchema: z.object({
        cliente: z.string().max(60).optional().describe('Nome o cognome: le sue vendite, con le rate'),
        da: dataISO('Facoltativo: solo gli incassi da questo giorno, incluso («questo mese»: il primo del mese)').optional(),
        a: dataISO('Facoltativo: solo gli incassi fino a questo giorno, incluso. Default con da: oggi').optional(),
      }),
      execute: async ({ cliente, da, a }) => {
        const p = da?.trim() || a?.trim() ? leggiPeriodo({ da, a }) : null
        if (p && isErrore(p)) return p
        const { data, error } = await supabase.rpc('mie_vendite_setter')
        // a read that fails is never "no clients"
        if (error) return errore('I tuoi clienti non sono disponibili in questo momento.')
        // what his clients paid in the period, summed in SQL (04/10/2026): all his clients
        // (never only the rows listed here), on the same base as mie_vendite_setter
        const totale = p && !cliente?.trim() ? await supabase.rpc('incassi_clienti_setter', { p_da: p.da, p_a: p.a }).single() : null
        if (totale?.error || (totale && !totale.data)) return errore('I tuoi clienti non sono disponibili in questo momento.')
        // one sale, its instalments: the SQL order (the newest sale first, its instalments in order)
        const perVendita = new Map<string, RigaClienteSetter[]>()
        for (const riga of data) perVendita.set(riga.sale_id, [...(perVendita.get(riga.sale_id) ?? []), riga])
        let vendite = [...perVendita.values()]
        let chi: string | undefined
        if (cliente?.trim()) {
          // only among his own clients: the RPC gives nobody else's
          const nomi = [...new Set(vendite.map((rate) => rate[0].cliente))].map((nome) => ({ nome }))
          const trovato = trova(nomi, cliente)
          if (trovato === 'ambiguo') {
            return errore(
              `Più clienti possibili tra i tuoi: ${candidati(nomi, cliente)
                .slice(0, 6)
                .map((c) => c.nome)
                .join(', ')}.`,
              'Chiedi quale, con nome e cognome.',
            )
          }
          if (!trovato) return { ...datiDi(profilo), vendite: [], nota: `Nessun cliente «${cliente.trim()}» tra quelli che ha portato ${profilo.nome}.` }
          chi = trovato.nome
          vendite = vendite.filter((rate) => rate[0].cliente === chi)
        }

        if (p) {
          // what his clients paid in the period (03/10/2026): each cash-in and refund with its own
          // commission, the most recent first; the total is never added up here
          const incassi = vendite
            .flat()
            .filter((x) => (x.stato === 'incassata' || x.stato === 'rimborsata') && x.incassato_il && x.incassato_il >= p.da && x.incassato_il <= p.a)
            .sort((x, y) => (x.incassato_il === y.incassato_il ? 0 : x.incassato_il < y.incassato_il ? 1 : -1))
          return {
            // whose clients these are, first: never another setter's
            ...datiDi(profilo),
            ...(chi ? { cliente: chi } : {}),
            periodo: p,
            ...(totale?.data
              ? {
                  totale_periodo: {
                    pagato_netto: totale.data.incassato,
                    incassi: totale.data.numero_incassi,
                    ...(totale.data.numero_rimborsi > 0 ? { rimborsi: totale.data.numero_rimborsi, rimborsato: totale.data.rimborsato } : {}),
                    clienti: totale.data.clienti,
                    provvigione_maturata: totale.data.provvigione,
                  },
                }
              : {}),
            incassi: incassi.slice(0, INCASSI_SETTER).map((x) => ({
              cliente: x.cliente,
              tipo: ETICHETTA_TIPO_VENDITA[x.tipo],
              rata: `${x.numero_rata} di ${x.numero_rate}`,
              stato: statoRataCliente(x),
              pagata_il: x.incassato_il,
              importo: x.importo_incassato,
              a_te: aTeRata(x),
            })),
            nota:
              incassi.length === 0
                ? 'Nessun incasso dei tuoi clienti nel periodo.'
                : `${
                    totale?.data
                      ? 'Un incasso per riga; il totale è totale_periodo, dal SQL: usa quello, non sommare le righe.'
                      : 'Un incasso per riga, dal SQL: non sommarli; il totale di tutti i tuoi clienti nel periodo: chiedi senza cliente.'
                  }${incassi.length > INCASSI_SETTER ? ` Qui i ${INCASSI_SETTER} più recenti su ${incassi.length}.` : ''}`,
          }
        }

        const mostrate = vendite.slice(0, MIE_VENDITE)
        return {
          // whose clients these are, first: never another setter's
          ...datiDi(profilo),
          ...(chi ? { cliente: chi } : {}),
          vendite: mostrate.map((rate) => {
            const v = rate[0]
            return {
              cliente: v.cliente,
              prodotto: v.prodotto,
              tipo: ETICHETTA_TIPO_VENDITA[v.tipo],
              venduta_il: v.data_vendita,
              revenue: v.valore_contratto,
              // since the sale began, never a period's (03/10/2026)
              pagato_in_tutto: v.incassato_vendita,
              rate_pagate: `${v.rate_incassate} di ${v.numero_rate}`,
              ...(v.rate_in_ritardo > 0 ? { rate_in_ritardo: v.rate_in_ritardo } : {}),
              a_te: aTeVendita(v),
              // the instalments of the client asked about: what each paid and what it gave him
              ...(chi
                ? {
                    rate: rate.map((r) => ({
                      rata: r.numero_rata,
                      stato: statoRataCliente(r),
                      scadenza: r.scadenza,
                      ...(r.incassato_il ? { pagata_il: r.incassato_il } : {}),
                      importo: r.importo_incassato ?? r.importo_previsto,
                      a_te: aTeRata(r),
                    })),
                  }
                : {}),
            }
          }),
          ...(vendite.length > MIE_VENDITE
            ? { nota: `Qui le ${MIE_VENDITE} vendite più recenti su ${vendite.length}: per un cliente, chiedi col suo nome; tutte in [I miei numeri](/my-numbers).` }
            : chi
              ? {}
              : { nota: 'Le rate e la provvigione di ogni incasso: chiedi per cliente. Quanto hanno pagato in un periodo: chiedi con le date.' }),
        }
      },
    }),

    // the closer's sales, as Le mie vendite and the sale page (03/10/2026): RLS gives him only
    // the sales he closed (and their instalments); never contacts, payment method or notes
    mie_vendite: definizione({
      description:
        'Le vendite dove chi chatta è il closer, come Le mie vendite e la scheda della vendita: per vendita cliente, tipo, prodotto, data, percorso, setter, contratto, incassato, ' +
        'da incassare (le rate previste; una rata fallita non conta), in ritardo e la prossima rata da oggi in poi (importi dal SQL: non sommarli tra vendite). ' +
        'da_incassare: solo quelle con rate da incassare, ognuna con le sue rate da incassare, e totale_da_incassare: quanto gli resta da incassare su tutte le sue vendite, ' +
        'di cui in ritardo, nei prossimi 30 giorni e oltre, già sommato dal SQL. «Quanto mi resta da incassare?»: da_incassare e rispondi con totale_da_incassare, mai sommando le vendite. ' +
        'Con cliente: le sue vendite con tutte le rate. Con da e/o a: le vendite chiuse in quel periodo. ' +
        'I totali di un periodo (call, chiuse, cash e revenue dei clienti nuovi) sono in mie_giornate. ' +
        SOLO_DI_CHI_CHATTA,
      inputSchema: z.object({
        cliente: z.string().max(60).optional().describe('Nome e cognome: le sue vendite, con tutte le rate'),
        da_incassare: z.boolean().optional().describe('Solo le vendite con rate ancora da incassare'),
        da: dataISO('Facoltativo: solo le vendite da questo giorno (data di vendita), incluso').optional(),
        a: dataISO('Facoltativo: solo le vendite fino a questo giorno, incluso. Default con da: oggi').optional(),
      }),
      execute: async ({ cliente, da_incassare, da, a }) => {
        const p = da?.trim() || a?.trim() ? leggiPeriodo({ da, a }) : null
        if (p && isErrore(p)) return p
        let chi: { id: string; nome: string } | undefined
        if (cliente?.trim()) {
          // among the clients he sees: a name not there is none of his, never "create it"
          const c = await r.trovaCliente(cliente, { anchePerNuovo: true })
          if (isErrore(c)) return c
          if (!c) return { ...datiDi(profilo), vendite: [], nota: `Nessun cliente «${cliente.trim()}» tra le tue vendite.` }
          chi = c
        }
        // the money of each sale from v_vendite (SQL); his own sales, as RLS already decides
        let q = supabase
          .from('v_vendite')
          .select('sale_id, data_vendita, incassato, da_incassare, in_ritardo, rate_in_ritardo')
          .eq('closer_id', profilo.id)
        if (chi) q = q.eq('client_id', chi.id)
        if (da_incassare) q = q.gt('da_incassare', 0)
        if (p) q = q.gte('data_vendita', p.da).lte('data_vendita', p.a)
        // what is still to collect on all his sales, summed in SQL (04/10/2026): asked with
        // da_incassare, never for one client or a period (the total is of every sale of his)
        const [importi, totale] = await Promise.all([
          q.order('data_vendita', { ascending: false }).limit(MIE_VENDITE + 1),
          da_incassare && !chi && !p ? supabase.rpc('da_incassare_closer').single() : null,
        ])
        if (importi.error) return errore('Le tue vendite non sono disponibili in questo momento.')
        // a read that fails is never "nothing to collect"
        if (totale?.error || (totale && !totale.data)) return errore('Le tue vendite non sono disponibili in questo momento.')
        const righe = importi.data.slice(0, MIE_VENDITE)
        const ids = righe.map((x) => x.sale_id).filter((id): id is string => Boolean(id))
        // the instalments through the sale, as the sale page reads them: the closer reads the
        // payments of his sales even when the client is not one he sees (v_rate joins clients)
        const vendite = ids.length
          ? await supabase
              .from('sales')
              .select(
                'id, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, prodotto_personalizzato, cliente:clients(nome, cognome), prodotto:products(nome), setter:profiles!sales_setter_id_fkey(nome), rate:payments(numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, created_at)',
              )
              .in('id', ids)
          : null
        if (vendite?.error) return errore('Le tue vendite non sono disponibili in questo momento.')
        const perId = new Map((vendite?.data ?? []).map((v) => [v.id, v]))
        const oggi = oggiRoma()
        let conFallite = false
        const elenco = righe.flatMap((i) => {
          const v = i.sale_id ? perId.get(i.sale_id) : undefined
          if (!v) return []
          // plan order, as the sale page: the instalment number, then when it was added (a refund after its instalment)
          const rate = [...(v.rate ?? [])].sort((x, y) => x.numero_rata - y.numero_rata || x.created_at.localeCompare(y.created_at))
          // still to collect = planned (CLAUDE.md section 9): a failed one is not counted in da_incassare
          const previste = rate.filter((x) => x.stato === 'prevista')
          const fallite = rate.filter((x) => x.stato === 'fallita')
          // the next one from today on: a late one is in in_ritardo
          const prossima = previste.filter((x) => x.scadenza >= oggi).sort((x, y) => x.scadenza.localeCompare(y.scadenza))[0]
          const vista = (x: (typeof rate)[number]) => ({
            rata: x.numero_rata,
            stato: statoRataVendita(x, oggi),
            scadenza: x.scadenza,
            ...(x.incassato_il ? { incassata_il: x.incassato_il } : {}),
            importo: x.importo_incassato ?? x.importo_previsto,
          })
          if (da_incassare && !chi && fallite.length > 0) conFallite = true
          return [
            {
              cliente: nomeCompleto(v.cliente ?? { nome: 'Cliente' }) || 'Cliente',
              tipo: ETICHETTA_TIPO_VENDITA[v.tipo],
              prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
              venduta_il: v.data_vendita,
              percorso: { inizio: v.data_inizio, fine: v.data_fine },
              setter: v.setter?.nome ?? null,
              contratto: v.valore_contratto,
              numero_rate: v.numero_rate,
              incassato: i.incassato,
              da_incassare: i.da_incassare,
              ...(Number(i.in_ritardo ?? 0) > 0 ? { in_ritardo: i.in_ritardo, rate_in_ritardo: i.rate_in_ritardo } : {}),
              ...(prossima ? { prossima_rata: { scadenza: prossima.scadenza, importo: prossima.importo_previsto } } : {}),
              ...(chi
                ? { rate: rate.map(vista) }
                : da_incassare
                  ? { rate_da_incassare: previste.map(vista), ...(fallite.length > 0 ? { rate_fallite: fallite.map(vista) } : {}) }
                  : {}),
            },
          ]
        })
        const note = [
          totale?.data ? 'totale_da_incassare è il totale di tutte le tue vendite, dal SQL: usa quello, non sommare le vendite.' : null,
          chi && elenco.length === 0 ? `Nessuna vendita di ${chi.nome} tra le tue${p ? ' nel periodo' : ''}.` : null,
          conFallite ? 'rate_fallite: pagamenti non andati a buon fine, non contati in da_incassare.' : null,
          importi.data.length > MIE_VENDITE
            ? `Qui le ${MIE_VENDITE} vendite più recenti: per un cliente, chiedi col suo nome; tutte in [Le mie vendite](/my-sales).`
            : null,
        ].filter(Boolean)
        return {
          // whose sales these are, first: never another closer's
          ...datiDi(profilo),
          ...(chi ? { cliente: chi.nome } : {}),
          ...(da_incassare ? { solo: 'le vendite con rate da incassare' } : {}),
          ...(p ? { periodo: p } : {}),
          ...(totale?.data
            ? {
                totale_da_incassare: {
                  totale: totale.data.totale,
                  rate: totale.data.numero_rate,
                  vendite: totale.data.vendite,
                  in_ritardo: { importo: totale.data.in_ritardo, rate: totale.data.numero_in_ritardo },
                  prossimi_30_giorni: { importo: totale.data.prossimi_30, rate: totale.data.numero_prossimi_30 },
                  oltre_30_giorni: { importo: totale.data.oltre, rate: totale.data.numero_oltre },
                },
              }
            : {}),
          vendite: elenco,
          ...(note.length > 0 ? { nota: note.join(' ') } : {}),
        }
      },
    }),

    // each one's own day (03/10/2026): the setter's as I miei numeri › Giorno per giorno
    // (giornate_setter), the closer's as his I miei numeri (giornate_closer)
    mie_giornate: definizione({
      description: (DESCRIZIONE_GIORNATE[profilo.ruolo] ?? '') + SOLO_DI_CHI_CHATTA,
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        // the caller's own days, said explicitly: the RPC keeps a setter or a closer to himself,
        // but without a person it would give the admin everyone's, under his name; the admin
        // reads his own as the closer he is (Dany, admin and closer: CLAUDE.md section 6)
        const setter = profilo.ruolo === 'setter'
        if (!setter && profilo.ruolo !== 'closer' && profilo.ruolo !== 'admin') {
          return errore('La giornata giorno per giorno è del setter e del closer.')
        }
        const { data, error } = setter
          ? await supabase.rpc('giornate_setter', { p_da: p.da, p_a: p.a, p_setter: profilo.id })
          : await supabase.rpc('giornate_closer', { p_da: p.da, p_a: p.a, p_closer: profilo.id })
        // a read that fails is never "nothing happened"
        if (error) return errore('La tua giornata non è disponibile in questo momento.')
        const righe = data as (RigaGiornataSetter | RigaGiornataCloser)[]
        // the total row has data null (grouping sets): the generated type does not say so
        const giorni = righe.filter((x) => x.data)
        // a period without days keeps a total row of nulls: no total then, as the page's empty state
        const totale = giorni.length > 0 ? righe.find((x) => !x.data) : undefined
        // strategy calls are history: a column only when the period has some, as on the page
        const colonne = (
          setter
            ? GIORNATA_SETTER.filter(([campo]) => campo !== 'strategy_prenotate' || Number((totale as RigaGiornataSetter | undefined)?.strategy_prenotate ?? 0) > 0)
            : GIORNATA_CLOSER
        ) as readonly (readonly [string, string])[]
        const numeri = (riga: Record<string, unknown>, senzaZeri: boolean) => numeriDelGiorno(riga, colonne, senzaZeri)
        const chiuso = totale as RigaGiornataCloser | undefined
        return {
          // whose day this is, first: never another person's
          ...datiDi(profilo),
          periodo: p,
          totale: totale
            ? {
                ...numeri(totale, false),
                ...(setter ? {} : { [C.show_rate.etichetta]: chiuso?.show_rate ?? null, [C.close_rate.etichetta]: chiuso?.close_rate ?? null }),
              }
            : null,
          // the most recent day first, as SQL ordered them
          giorni: giorni.slice(0, MIE_GIORNATE).map((g) => ({ data: g.data, ...numeri(g, true) })),
          ...(giorni.length > MIE_GIORNATE
            ? { nota: `Qui i ${MIE_GIORNATE} giorni più recenti su ${giorni.length}: il totale li conta tutti.` }
            : giorni.length === 0
              ? { nota: 'Nessun giorno con attività nel periodo.' }
              : {}),
          // the admin's page shows every closer unless one is chosen: himself
          link: setter
            ? hrefPeriodo('/my-numbers', p)
            : hrefPeriodo('/setting/closer', p, profilo.ruolo === 'admin' ? { closer: profilo.id } : {}),
        }
      },
    }),

    call_periodo: definizione({
      description:
        'Call programmate nel periodo, con lead (e il suo stato), setter (chi l’ha fissata), closer, tipo, stato, esito, da dove è stata spostata, motivo di non chiusura, note del setter e note aggiuntive del closer. ' +
        (PERIMETRO_CALL[profilo.ruolo]?.descrizione ?? 'Tutte le call del team.'),
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const { data, error } = await supabase
          .from('calls')
          .select(
            'id, tipo, programmata_il, stato, esito, qualificata, obiezione_principale, note, note_closer, spostata_dal, volte_spostata, lead:leads(nome, stato), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)',
          )
          // a day of margin on both sides, then the Rome calendar day decides
          .gte('programmata_il', `${aggiungiGiorni(p.da, -1)}T00:00:00Z`)
          .lt('programmata_il', `${aggiungiGiorni(p.a, 2)}T00:00:00Z`)
          .order('programmata_il')
          .limit(CALL_PERIODO)
        if (error) return errore('Call non disponibili.')
        const nelPeriodo = data.filter((c) => {
          const giorno = oggiRoma(new Date(c.programmata_il))
          return giorno >= p.da && giorno <= p.a
        })
        const perimetro = PERIMETRO_CALL[profilo.ruolo]
        return {
          // RLS gives the setter and the closer only their own calls: said first, never read as someone else's all
          ...(perimetro ? { persona: profilo.nome, di_chi: perimetro.risultato(profilo.nome) } : {}),
          periodo: p,
          call: nelPeriodo.map((c) => ({
            call_id: c.id,
            lead: c.lead?.nome,
            stato_lead: c.lead?.stato,
            tipo: c.tipo,
            quando: c.programmata_il,
            // riprogrammata is "In attesa di conferma" in the app (04/10/2026): the same words here
            stato: c.stato === 'riprogrammata' ? SPOSTA.attesa.etichetta : c.stato,
            esito: c.esito,
            setter: c.setter?.nome ?? null,
            closer: c.closer?.nome ?? null,
            // a moved call, as its card says: "Spostata dal 30/09 alle 19:00"
            ...(tracciaSpostamento(c) ? { spostata: tracciaSpostamento(c) } : {}),
            // what was written, each text with its author; the notes (up to 2000 characters) shortened:
            // up to 60 calls must fit in a free-plan answer
            ...(c.obiezione_principale?.trim() ? { [MOTIVO_NON_CHIUSURA.titolo]: c.obiezione_principale.trim() } : {}),
            ...(c.note?.trim() ? { [NOTE_SETTER.titolo]: breve(c.note, LUNGHEZZA_NOTE_CALL) } : {}),
            ...(c.note_closer?.trim() ? { [NOTE_CLOSER.diChi]: breve(c.note_closer, LUNGHEZZA_NOTE_CALL) } : {}),
          })),
          // the read stops at 60 calls (the margin days included): the later ones are missing, and the model is told
          ...(data.length >= CALL_PERIODO
            ? { nota: `Elenco parziale: più di ${CALL_PERIODO} call, qui le prime per data. Per contarle tutte, un periodo più corto.` }
            : {}),
        }
      },
    }),

    progetti: definizione({
      description: 'Progetti visibili a chi chatta, con stato, avanzamento, task in ritardo e date. Quello di un cliente porta il suo nome.',
      inputSchema: z.object({ testo: z.string().max(60).optional() }),
      execute: async ({ testo }) => {
        let q = supabase
          .from('v_pm_progetti')
          .select('id, nome, stato, avanzamento, task_totali, task_completati, task_in_ritardo, data_inizio, data_fine')
          .order('nome')
          // one more than shown: a list cut short says so (a project per paying client, 02/10/2026)
          .limit(PROGETTI_ALFIRE + 1)
        if (testo?.trim()) q = q.ilike('nome', `%${testo.trim()}%`)
        const { data: righe, error } = await q
        if (error) return errore('Progetti non disponibili.')
        const data = righe.slice(0, PROGETTI_ALFIRE)
        return {
          // below the projects' admin, RLS gives only the caller's projects: never "the projects Lorenzo works on"
          ...(livelloPm === 'admin'
            ? {}
            : {
                persona: profilo.nome,
                di_chi: `Solo i progetti di cui ${profilo.nome}, cioè chi sta chattando, è membro: non tutti quelli del team, né quelli di un’altra persona.`,
              }),
          progetti: data,
          ...(righe.length > PROGETTI_ALFIRE
            ? { nota: `Elenco parziale: qui i primi ${PROGETTI_ALFIRE} per nome. Per uno in particolare, cercalo per nome (testo); tutti in [Progetti](/progetti).` }
            : {}),
        }
      },
    }),

    miei_task: definizione({
      description: `I task aperti assegnati a chi chatta (anche quelli condivisi con altri), con progetto, scadenza e ritardo. ${SOLO_DI_CHI_CHATTA}`,
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('v_pm_task')
          .select('id, titolo, stato, scadenza, in_ritardo, priorita, progetto_id')
          // a task can have several people: mine when I am one of them
          .contains('assegnatari', [profilo.id])
          .neq('stato', 'completato')
          .order('scadenza', { nullsFirst: false })
          // one more than shown: a coach with a dozen clients has a hundred undated tasks, and the list says it is cut
          .limit(MIEI_TASK + 1)
        if (error) return errore('Task non disponibili.')
        const parziale = data.length > MIEI_TASK
        data.splice(MIEI_TASK)
        // the project by name, as on I miei task: the model never shows an id
        const ids = [...new Set(data.map((t) => t.progetto_id).filter((id): id is string => Boolean(id)))]
        const progetti = ids.length ? await supabase.from('v_pm_progetti').select('id, nome').in('id', ids) : { data: [], error: null }
        if (progetti.error) return errore('Task non disponibili.')
        const nomi = new Map((progetti.data ?? []).map((x) => [x.id, x.nome]))
        return {
          ...datiDi(profilo),
          task: data.map(({ progetto_id, ...t }) => ({ ...t, progetto: (progetto_id && nomi.get(progetto_id)) || null })),
          ...(parziale
            ? {
                nota: `Elenco parziale: qui i primi ${MIEI_TASK}, per scadenza (quelli senza scadenza per ultimi), non tutti. Per un progetto: progetto_dettaglio; tutti in [I miei task](/task).`,
              }
            : {}),
        }
      },
    }),
  }
}

/**
 * Buttons under Alfire's message, for every role. No execute: the call ends
 * the answer and the chat shows the options; a tap is the user's next message.
 */
const proposte: Definizione = {
  strumento: tool({ description: DESCRIZIONE_PROPOSTE, inputSchema: schemaProposte }),
  schema: schemaProposte,
}

/**
 * Every tool, as definitions: reads, answers at a tap, and writes with their
 * preview. The writes live by area in lib/alfire/scritture.
 */
function definizioniAlfire(supabase: Supabase, profilo: Profilo, livelloPm: LivelloPm): Record<NomeStrumento, Definizione> {
  const ctx: Contesto = { supabase, profilo, livelloPm, r: risolutori(supabase, profilo) }
  return {
    ...letture(ctx),
    proponi_risposte: proposte,
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
