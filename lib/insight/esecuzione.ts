import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { aggiungiGiorni } from '@/lib/date'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { chiaviStatoLead } from '@/lib/insight/agenda'
import { creaArchivio, type Archivio, type BloccoArchiviato, type CampiChat, type RigaEsecuzione, type SchedaArchiviata } from '@/lib/insight/archivio'
import { caratteriTrascrizione, pianificaBlocchi } from '@/lib/insight/blocchi'
import { candidatiRiattivazione } from '@/lib/insight/candidati'
import { clienteInsight } from '@/lib/insight/claude'
import { concorrenzaInsight, costoMaxInsight, EFFORT_INSIGHT, effortInsight, modelloInsight, type EffortInsight } from '@/lib/insight/config'
import { chatEffettive, contaPerPost, sottoI14, ultimaSchedaPerChat } from '@/lib/insight/contenuti'
import type {
  BloccoPianificato,
  CanaleInsight,
  CandidatoRiattivazione,
  ChatEscluse,
  ChatPerAnalisi,
  ChatSalvata,
  CodiceErroreBlocco,
  ContatoriPasso,
  ContestoApp,
  EsitoBlocco,
  EsitoLettura,
  EsitoPasso,
  FasciaEta,
  PassoInsight,
  PostInsight,
  ProgressoEsecuzione,
  SchedaSalvata,
  TipoBlocco,
  TipoScheda,
  UsageBlocco,
} from '@/lib/insight/contratti'
import { applicaCorrezioni, daCorreggere } from '@/lib/insight/controllo-finale'
import {
  chiusuraDellaScheda,
  eseguiBlocco,
  eseguiInPool,
  MINIMO_PER_INIZIARE_MS,
  schedaMancante,
  schedaMinore,
  schedeDelBlocco,
  schedeDellAgenda,
  somma,
  type RisultatoBloccoAgenda,
  type RisultatoBloccoCorrezione,
  type RisultatoBloccoSchede,
} from '@/lib/insight/esegui'
import { AVVISI_INSIGHT, CANALE_AVVISO, FRASI_INSIGHT, fraseDelMotivo, frasiAvvisi, motivoDelBlocco, motivoInItaliano } from '@/lib/insight/frasi'
import { improntaCall, improntaChat, improntaSegnaposto } from '@/lib/insight/impronta'
import { leggiConArchivio, letturaCompleta, progressoLettura, type OpLettura, type ProgressoLettura } from '@/lib/insight/lettura'
import { VERSIONE_PROMPT } from '@/lib/insight/prompt'
import {
  chatPerAnalisi,
  chiaveTesto,
  contestoGiornoDati,
  payloadAgenda,
  payloadChat,
  payloadCorrezione,
  payloadSintesi,
  type ContestoGiornoDati,
  type PayloadInsight,
  type ProfiloInsight,
} from '@/lib/insight/prompt/dati'
import type { RecapCanale } from '@/lib/insight/recap'
import { stimaCosto, type BloccoDaStimare } from '@/lib/insight/stima-costo'
import { uniscRecap } from '@/lib/insight/unione'
import type { Correzione } from '@/lib/insight/verifica'

/**
 * The state machine of a run of the Insight (1.35.0, CLAUDE.md section 29):
 * one step per invocation of /api/cron/insight, each ending in
 * insight_passo_finito (the next step, the same one when out of time, or the
 * run ready) or in insight_fallita with a sentence of FRASI_INSIGHT. Never
 * throws: any exception becomes a failed run with a sentence chosen by the
 * error's type (C18), and insight_fallita empties the messages the run read
 * (D25).
 *
 * - lettura: the reading (lettura.ts), resumable; then the plan: today's
 *   chats into blocks for Claude (never an under-14 chat: its card is code's;
 *   an unchanged non-lead reuses its card; a chat whose card of the same day
 *   has the same impronta is copied, no model call), the reactivation
 *   candidates (candidati.ts), one agenda block, one sintesi per document,
 *   and the cost cap (stima-costo.ts) before anything reaches Claude.
 * - analisi: the blocks through the pool (esegui.ts), every card stored as
 *   soon as it is validated; then one correzione block per channel for the
 *   messages the final check sends back; then the sintesi of each document.
 * - unione: the documents (unione.ts) upserted into insight_recap, the
 *   chats written back (non-leads and under-14 without messages, the latest
 *   target, the origin Claude found), the counts per post and day
 *   (instagram_contenuti_dm_salva; a failure there is only a warning).
 *
 * The instant of the run (its iniziata_il) is the «now» of every payload and
 * impronta, so a step resumed in a later invocation builds the same requests.
 */

/** The work of a step: within the route's 300 seconds, with room to close. */
export const TEMPO_PASSO_MS = 240_000
/** The history the run reads from insight_chat (candidates, themes): 14 days and one. */
const GIORNI_CHAT = 15
const GIORNO_MS = 86_400_000
/** A block given back this many times goes to its placeholders. */
const TENTATIVI_BLOCCO = 3

// ---------------------------------------------------------------------------
// The plan, in the run's progress
// ---------------------------------------------------------------------------

const schemaCandidato = z.object({
  conversazione_id: z.string(),
  giorni_silenzio: z.number().int(),
  passo: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

const schemaPiano = z.object({
  modello: z.string(),
  effort: z.enum(EFFORT_INSIGHT),
  concorrenza: z.number().int().min(1),
  candidati: z.object({ instagram: z.array(schemaCandidato), messenger: z.array(schemaCandidato) }),
  /** a Messenger document is built: the Page is connected, or Messenger chats are there */
  messenger: z.boolean(),
  /** chats sent to Claude by this run (the log, and the cap's sentence) */
  da_analizzare: z.number().int().nonnegative(),
})

export type PianoEsecuzione = z.infer<typeof schemaPiano>

export function pianoDi(progresso: ProgressoEsecuzione | null | undefined): PianoEsecuzione | null {
  const letto = schemaPiano.safeParse(progresso?.piano)
  return letto.success ? letto.data : null
}

// ---------------------------------------------------------------------------
// What a step receives
// ---------------------------------------------------------------------------

export type OpPasso = {
  /** the service-role client */
  db: AdminClient
  esecuzione: string
  passo: PassoInsight
  /** 'YYYY-MM-DD', the Rome day of the run */
  giorno: string
  motivo: string
  progresso: ProgressoEsecuzione
  /** epoch ms: the step's deadline */
  entro: number
}

/** What the tests replace: the database, the reading, Claude, the clock. */
export type DipendenzePasso = {
  archivio?: Archivio
  leggi?: (op: OpLettura & { archivio: Archivio }) => Promise<EsitoLettura>
  /** extra options of the reading (the tests' fake Meta) */
  graph?: OpLettura['graph']
  cliente?: () => Anthropic
  esegui?: typeof eseguiBlocco
  adesso?: () => Date
}

/** Runs one step of a run. Never throws. */
export async function eseguiPasso(op: OpPasso, dip: DipendenzePasso = {}): Promise<EsitoPasso> {
  let archivio: Archivio | null = dip.archivio ?? null
  try {
    archivio ??= creaArchivio(op.db)
    const riga = await archivio.esecuzione(op.esecuzione)
    if (!riga || riga.stato !== 'in_corso') return { ok: false, errore: FRASI_INSIGHT.imprevisto }
    if (op.passo === 'lettura') return await passoLettura(archivio, op, riga, dip)
    if (op.passo === 'analisi') return await passoAnalisi(archivio, op, riga, dip)
    return await passoUnione(archivio, op, riga)
  } catch (e) {
    const errore = motivoInItaliano(e)
    console.error('[insight] passo non riuscito:', op.esecuzione.slice(0, 8), op.passo)
    await fallisci(archivio, op.esecuzione, errore)
    return { ok: false, errore }
  }
}

async function fallisci(archivio: Archivio | null, esecuzione: string, errore: string, contatori?: ContatoriPasso): Promise<void> {
  if (!archivio) return
  try {
    await archivio.fallita(esecuzione, errore, contatori)
  } catch {
    // the watchdog of insight_tick ends it within 45 minutes, and empties its messages
    console.error('[insight] esecuzione non chiusa:', esecuzione.slice(0, 8))
  }
}

async function finisci(
  archivio: Archivio,
  op: OpPasso,
  prossimo: PassoInsight | null,
  progresso: ProgressoEsecuzione,
  avvisi: readonly string[],
  contatori: ContatoriPasso,
): Promise<EsitoPasso> {
  await archivio.passoFinito(op.esecuzione, prossimo, progresso, avvisi, contatori)
  return { ok: true, prossimo, progresso, avvisi: [...avvisi], contatori }
}

async function fallita(archivio: Archivio, op: OpPasso, errore: string, contatori?: ContatoriPasso): Promise<EsitoPasso> {
  await fallisci(archivio, op.esecuzione, errore, contatori)
  return { ok: false, errore }
}

// ---------------------------------------------------------------------------
// What every step reads
// ---------------------------------------------------------------------------

type Contesto = {
  riferimento: Date
  lettura: ProgressoLettura
  app: ContestoApp
  esclusi: ChatEscluse
  /** the run's chats (today's sets and 15 days of history), never an excluded one; Instagram names from the profiles */
  chat: ChatSalvata[]
  profili: Map<string, ProfiloInsight>
  post: PostInsight[]
  /** the cards of the earlier runs of the last 14 days for these chats, oldest first */
  precedenti: SchedaArchiviata[]
}

function esclusa(c: ChatSalvata, esclusi: ChatEscluse): boolean {
  if (c.canale === 'instagram') return c.username !== null && esclusi.instagram.has(c.username)
  return c.utente_id !== null && esclusi.messenger.has(c.utente_id)
}

async function carica(archivio: Archivio, op: OpPasso, riga: RigaEsecuzione, contesto?: ContestoApp | null): Promise<Contesto> {
  const riferimento = new Date(riga.iniziata_il ?? riga.creata_il)
  const lettura = progressoLettura(op.progresso)
  const esclusi = await archivio.esclusi()
  const tutte = await archivio.chatDellEsecuzione({
    ids: { instagram: lettura.instagram.oggi, messenger: lettura.messenger.oggi },
    dal: new Date(riferimento.getTime() - GIORNI_CHAT * GIORNO_MS).toISOString(),
  })
  // an exclusion added since the reading: the chat never reaches Claude nor the recap (D5)
  const chat = tutte.filter((c) => !esclusa(c, esclusi))
  const usernames = [...new Set(chat.flatMap((c) => (c.canale === 'instagram' && c.username ? [c.username] : [])))]
  const profili = new Map((await archivio.profili(usernames)).map((p) => [p.username, p as ProfiloInsight]))
  for (const c of chat) {
    if (c.canale === 'instagram' && !c.nome && c.username) c.nome = profili.get(c.username)?.nome ?? null
  }
  const [post, precedenti] = await Promise.all([
    archivio.post(new Date(riferimento.getTime() - 180 * GIORNO_MS).toISOString()),
    archivio.schedePrecedenti({
      esecuzione: op.esecuzione,
      dalGiorno: aggiungiGiorni(op.giorno, -14),
      chiavi: chat.map((c) => c.conversazione_id),
    }),
  ])
  return {
    riferimento,
    lettura,
    app: contesto ?? riga.contesto_app ?? { agenda: [], stato_lead: [] },
    esclusi,
    chat,
    profili,
    post,
    precedenti,
  }
}

function perAnalisi(ctx: Contesto, chat: ChatSalvata, candidato?: CandidatoRiattivazione): ChatPerAnalisi {
  return chatPerAnalisi({
    chat,
    profilo: chat.canale === 'instagram' && chat.username ? (ctx.profili.get(chat.username) ?? null) : null,
    statoLead: ctx.app.stato_lead,
    agenda: ctx.app.agenda,
    adesso: ctx.riferimento,
    candidato,
  })
}

function contestoDelCanale(ctx: Contesto, canale: CanaleInsight, giorno: string): ContestoGiornoDati {
  return contestoGiornoDati({ canale, giorno, adesso: ctx.riferimento, media: ctx.post, agenda: ctx.app.agenda })
}

function delCanale(ctx: Contesto, canale: CanaleInsight, ids: readonly string[]): ChatSalvata[] {
  const voluti = new Set(ids)
  return ctx.chat.filter((c) => c.canale === canale && voluti.has(c.conversazione_id))
}

/** The age band of each chat's latest card (for the agenda: a minor's nurture). */
function fasceEta(schede: readonly SchedaSalvata[]): Map<string, FasciaEta> {
  const out = new Map<string, FasciaEta>()
  for (const [chiave, s] of ultimaSchedaPerChat(schede)) {
    const f = (s.dati as { fascia_eta?: unknown } | null)?.fascia_eta
    if (f === 'sotto_14' || f === '14_17' || f === 'maggiorenne' || f === 'ignota') out.set(chiave, f)
  }
  return out
}

/** An earlier card says under 14 (D25): the model's band, its flag, or an age the code reads below 14. */
function giaSotto14(scheda: SchedaSalvata | undefined): boolean {
  const d = (scheda?.dati ?? null) as { minore_14?: unknown; fascia_eta?: unknown; age?: unknown } | null
  if (!d) return false
  return d.minore_14 === true || sottoI14(d.fascia_eta, typeof d.age === 'string' ? d.age : '')
}

/** Whether the run builds a Messenger document: the Page is connected, or Messenger chats are there. */
function conMessenger(lettura: ProgressoLettura): boolean {
  return lettura.messenger.stato === 'letto' || lettura.messenger.stato === 'errore' || lettura.messenger.oggi.length > 0
}

// ---------------------------------------------------------------------------
// lettura, and the plan
// ---------------------------------------------------------------------------

async function passoLettura(archivio: Archivio, op: OpPasso, riga: RigaEsecuzione, dip: DipendenzePasso): Promise<EsitoPasso> {
  const adesso = dip.adesso?.() ?? new Date()
  const leggi = dip.leggi ?? leggiConArchivio
  const r = await leggi({
    db: op.db,
    archivio,
    esecuzione: op.esecuzione,
    giorno: op.giorno,
    adesso,
    entro: op.entro,
    progresso: op.progresso,
    graph: dip.graph,
  })
  if (!r.ok) return fallita(archivio, op, r.errore)
  if (!r.completa || !r.contesto) return finisci(archivio, op, 'lettura', r.progresso, r.avvisi, r.contatori)

  await archivio.salvaContesto(op.esecuzione, r.contesto)
  const progresso = { ...op.progresso, ...r.progresso }
  const ctx = await carica(archivio, { ...op, progresso }, riga, r.contesto)
  return pianifica(archivio, { ...op, progresso }, ctx, r)
}

type Stima = BloccoDaStimare

async function pianifica(
  archivio: Archivio,
  op: OpPasso,
  ctx: Contesto,
  lettura: Extract<EsitoLettura, { ok: true }>,
): Promise<EsitoPasso> {
  const modello = modelloInsight()
  const effort = effortInsight()
  const ultime = ultimaSchedaPerChat(ctx.precedenti)
  const copie: Record<CanaleInsight, SchedaSalvata[]> = { instagram: [], messenger: [] }
  const blocchi: BloccoPianificato[] = []
  const stime: Stima[] = []
  const candidati: Record<CanaleInsight, CandidatoRiattivazione[]> = { instagram: [], messenger: [] }
  let daAnalizzare = 0

  /** The chats Claude must read: the others get a copy of their card of the same day. */
  async function daMandare(
    canale: CanaleInsight,
    voci: { chat: ChatSalvata; candidato?: CandidatoRiattivazione }[],
    passo: 'schede' | 'riattivazione',
  ): Promise<ChatSalvata[]> {
    const impronte = voci.map((v) => improntaChat({ modello, effort, canale, passo, chat: perAnalisi(ctx, v.chat, v.candidato) }))
    const uguali = await archivio.schedeUguali({
      esecuzione: op.esecuzione,
      giorno: op.giorno,
      canale,
      impronte,
      tipi: passo === 'schede' ? ['lead', 'non_lead'] : ['riattivazione'],
    })
    const restano: ChatSalvata[] = []
    voci.forEach((v, i) => {
      const uguale = uguali.get(impronte[i])
      if (uguale) copie[canale].push({ tipo: uguale.tipo, chiave: v.chat.conversazione_id, impronta: impronte[i], dati: uguale.dati })
      else restano.push(v.chat)
    })
    return restano
  }

  function pianificaCanale(canale: CanaleInsight, tipo: 'schede' | 'riattivazione', chats: ChatSalvata[]) {
    const perId = new Map(chats.map((c) => [c.conversazione_id, c]))
    for (const b of pianificaBlocchi({ canale, tipo, chats })) {
      blocchi.push(b)
      stime.push({
        tipo,
        elementi: b.chiavi.length,
        caratteri: b.chiavi.reduce((n, k) => n + caratteriTrascrizione(perId.get(k)?.messaggi ?? []), 0),
      })
    }
    daAnalizzare += chats.length
  }

  for (const canale of ['instagram', 'messenger'] as const) {
    const ids = ctx.lettura[canale].oggi
    const voci: { chat: ChatSalvata }[] = []
    for (const chat of delCanale(ctx, canale, ids)) {
      const ultima = ultime.get(chat.conversazione_id)
      if (chat.minore_14 || giaSotto14(ultima)) {
        // D25 step 4: never sent again (nor after a failed run that had already classified it);
        // the card is code's, with the last warm closure
        copie[canale].push(schedaMinore(chat.conversazione_id, chiusuraDellaScheda(ultima?.dati)))
      } else if (chat.non_lead) {
        // unchanged non-lead: its last card, no model call (C14)
        const ultima = [...ctx.precedenti].reverse().find((s) => s.chiave === chat.conversazione_id && s.tipo === 'non_lead')
        copie[canale].push(
          ultima
            ? { tipo: 'non_lead', chiave: chat.conversazione_id, impronta: ultima.impronta, dati: ultima.dati }
            : {
                tipo: 'non_lead',
                chiave: chat.conversazione_id,
                impronta: improntaSegnaposto('non_lead', chat.conversazione_id, 'non_lead'),
                dati: { tipo: 'non_lead', reason: 'Non è un lead.' },
              },
        )
      } else if (chat.messaggi.length > 0) {
        voci.push({ chat })
      }
    }
    pianificaCanale(canale, 'schede', await daMandare(canale, voci, 'schede'))

    candidati[canale] = candidatiRiattivazione({
      chat: ctx.chat.filter((c) => c.canale === canale && c.messaggi.length > 0 && !giaSotto14(ultime.get(c.conversazione_id))),
      delGiorno: new Set(ids),
      schede: ctx.precedenti,
      statoLead: ctx.app.stato_lead,
      oggi: op.giorno,
    })
    const perId = new Map(ctx.chat.filter((c) => c.canale === canale).map((c) => [c.conversazione_id, c]))
    const vociR = candidati[canale].flatMap((candidato) => {
      const chat = perId.get(candidato.conversazione_id)
      return chat ? [{ chat, candidato }] : []
    })
    pianificaCanale(canale, 'riattivazione', await daMandare(canale, vociR, 'riattivazione'))
  }

  // the agenda: one block for the calls without a card of the same day
  const agenda = ctx.app.agenda
  if (agenda.length > 0) {
    const payload = payloadAgenda({
      contesto: contestoDelCanale(ctx, 'instagram', op.giorno),
      voci: agenda,
      chat: ctx.chat,
      fasce: fasceEta(ctx.precedenti),
      adesso: ctx.riferimento,
    })
    const voci = payload.dati.voci
    const impronte = voci.map((v) => improntaCall({ modello, effort, tipo: v.lista === 'call' ? 'agenda' : 'show_up', corpo: v.corpo }))
    const uguali = await archivio.schedeUguali({
      esecuzione: op.esecuzione,
      giorno: op.giorno,
      canale: 'instagram',
      impronte,
      tipi: ['agenda', 'show_up'],
    })
    const restano: string[] = []
    let caratteri = 0
    voci.forEach((v, i) => {
      const uguale = uguali.get(impronte[i])
      if (uguale) copie.instagram.push({ tipo: uguale.tipo, chiave: v.chiave, impronta: impronte[i], dati: uguale.dati })
      else {
        restano.push(v.chiave)
        caratteri += JSON.stringify(v.corpo).length
      }
    })
    if (restano.length > 0) {
      blocchi.push({ canale: 'instagram', tipo: 'agenda', indice: 0, chiavi: restano })
      stime.push({ tipo: 'agenda', elementi: restano.length, caratteri })
    }
  }

  // one sintesi per document
  const documenti: CanaleInsight[] = conMessenger(ctx.lettura) ? ['instagram', 'messenger'] : ['instagram']
  for (const canale of documenti) {
    blocchi.push({ canale, tipo: 'sintesi', indice: 0, chiavi: [] })
    stime.push({ tipo: 'sintesi', elementi: 0, caratteri: 0 })
  }

  // the cap, before anything reaches Claude (D19)
  if (stimaCosto(stime) > costoMaxInsight()) {
    console.error('[insight] tetto di spesa superato:', op.esecuzione.slice(0, 8), daAnalizzare, 'chat')
    return fallita(archivio, op, FRASI_INSIGHT.costo(daAnalizzare))
  }

  await archivio.ripianifica(op.esecuzione)
  for (const canale of ['instagram', 'messenger'] as const) {
    if (copie[canale].length > 0) await archivio.salvaSchede(op.esecuzione, op.giorno, canale, copie[canale])
  }
  await archivio.inserisciBlocchi(op.esecuzione, blocchi)

  const piano: PianoEsecuzione = {
    modello,
    effort,
    concorrenza: concorrenzaInsight(),
    candidati,
    messenger: documenti.includes('messenger'),
    da_analizzare: daAnalizzare,
  }
  return finisci(archivio, op, 'analisi', { ...lettura.progresso, piano }, lettura.avvisi, {
    ...lettura.contatori,
    blocchi_totali: blocchi.length,
    blocchi_fatti: 0,
    modello,
  })
}

// ---------------------------------------------------------------------------
// analisi
// ---------------------------------------------------------------------------

const ZERO: UsageBlocco = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }

type Preparato = { payload: PayloadInsight; impronte: Map<string, string> } | { vuoto: true }

/** What one invocation of analisi spent and how it ended. */
type Lavoro = {
  usage: UsageBlocco
  fallback: number
  concorrenza: number
  fatale: CodiceErroreBlocco | null
}

async function passoAnalisi(archivio: Archivio, op: OpPasso, riga: RigaEsecuzione, dip: DipendenzePasso): Promise<EsitoPasso> {
  const letto = pianoDi(op.progresso)
  if (!letto) return fallita(archivio, op, FRASI_INSIGHT.imprevisto)
  const piano: PianoEsecuzione = letto
  const client = (dip.cliente ?? clienteInsight)()
  const esegui = dip.esegui ?? eseguiBlocco
  const ctx = await carica(archivio, op, riga)
  const lavoro: Lavoro = { usage: { ...ZERO }, fallback: 0, concorrenza: piano.concorrenza, fatale: null }
  const ac = new AbortController()
  let blocchi = await archivio.blocchi(op.esecuzione)

  /** Runs the blocks of some types still to do: 'tempo' when some are left for the next invocation. */
  const fase = async (tipi: readonly TipoBlocco[]): Promise<'fatto' | 'tempo' | 'fatale'> => {
    const daFare = blocchi.filter((b) => tipi.includes(b.tipo) && b.stato === 'da_fare')
    if (daFare.length === 0) return 'fatto'
    const preparati = new Map<string, Preparato>()
    const restano = new Set(daFare.map((b) => b.id))
    const pool = await eseguiInPool<BloccoArchiviato>({
      blocchi: daFare,
      concorrenza: lavoro.concorrenza,
      entro: op.entro,
      esegui: async (blocco, alPrimoEvento) => {
        const preparato = await prepara(archivio, op, piano, ctx, blocco)
        preparati.set(blocco.id, preparato)
        if ('vuoto' in preparato) {
          alPrimoEvento()
          return { ok: true, risultato: vuoto(blocco.tipo), usage: { ...ZERO }, servito_da_fallback: false, modello: piano.modello, request_id: null }
        }
        await archivio.aggiornaBlocco(blocco.id, { stato: 'in_corso' })
        return esegui({
          client,
          blocco,
          payload: preparato.payload,
          scadenza: op.entro,
          segnale: ac.signal,
          alPrimoEvento,
          modello: piano.modello,
          effort: piano.effort,
        })
      },
      alRimesso: async (blocco, esito) => {
        const preparato = preparati.get(blocco.id)
        const impronte = preparato && !('vuoto' in preparato) ? preparato.impronte : new Map<string, string>()
        if (esito.usage) lavoro.usage = somma(lavoro.usage, esito.usage)
        await salvaParziale(archivio, op, blocco, esito, impronte)
      },
      alTermine: async (blocco, esito) => {
        const preparato = preparati.get(blocco.id)
        const impronte = preparato && !('vuoto' in preparato) ? preparato.impronte : new Map<string, string>()
        if ((await salvaEsito(archivio, op, blocco, esito, impronte, lavoro, ac.signal.aborted)) !== 'da_fare') restano.delete(blocco.id)
      },
    })
    lavoro.concorrenza = pool.concorrenza
    if (lavoro.fatale) return 'fatale'
    return restano.size > 0 ? 'tempo' : 'fatto'
  }

  const chiudi = async (come: 'fatto' | 'tempo' | 'fatale'): Promise<EsitoPasso> => {
    const token: ContatoriPasso = {
      token_input: lavoro.usage.input_tokens,
      token_cache_scritti: lavoro.usage.cache_creation_input_tokens,
      token_cache_letti: lavoro.usage.cache_read_input_tokens,
      token_output: lavoro.usage.output_tokens,
      servito_da_fallback: lavoro.fallback,
    }
    if (come === 'fatale') {
      console.error('[insight] Claude ha rifiutato la richiesta:', lavoro.fatale)
      // the blocks done in this invocation were billed all the same
      return fallita(archivio, op, fraseDelMotivo(motivoDelBlocco(lavoro.fatale ?? 'richiesta')), token)
    }
    const tutti = await archivio.blocchi(op.esecuzione)
    const contatori: ContatoriPasso = {
      blocchi_totali: tutti.length,
      blocchi_fatti: tutti.filter((b) => b.stato === 'fatto' || b.stato === 'fallito').length,
      ...token,
    }
    return finisci(archivio, op, come === 'fatto' ? 'unione' : 'analisi', { piano: { ...piano, concorrenza: lavoro.concorrenza } }, [], contatori)
  }

  // the step's signal: the blocks in flight at the deadline go back to da_fare
  const timer = setTimeout(() => ac.abort(), Math.max(0, op.entro - Date.now()))
  try {
    // 1. the cards and the agenda
    const mappa = await fase(['schede', 'riattivazione', 'agenda'])
    if (mappa !== 'fatto') return await chiudi(mappa)

    // 2. the messages the final check sends back, once per channel
    blocchi = await archivio.blocchi(op.esecuzione)
    if (!blocchi.some((b) => b.tipo === 'correzione')) {
      const schede = await archivio.schedeDellEsecuzione(op.esecuzione)
      const nuovi: BloccoPianificato[] = []
      for (const canale of ['instagram', 'messenger'] as const) {
        const testi = daCorreggere(schede.filter((s) => s.canale === canale))
        if (testi.length > 0) nuovi.push({ canale, tipo: 'correzione', indice: 0, chiavi: testi.map(chiaveTesto) })
      }
      if (nuovi.length > 0) {
        await archivio.inserisciBlocchi(op.esecuzione, nuovi)
        blocchi = await archivio.blocchi(op.esecuzione)
      }
    }
    const correzione = await fase(['correzione'])
    if (correzione !== 'fatto') return await chiudi(correzione)

    // 3. the sintesi of each document
    return await chiudi(await fase(['sintesi']))
  } finally {
    clearTimeout(timer)
  }
}

function vuoto(tipo: TipoBlocco): unknown {
  if (tipo === 'agenda') return { call: [], show_up: [], mancanti: [] } satisfies RisultatoBloccoAgenda
  if (tipo === 'correzione') return { correzioni: [], mancanti: [] } satisfies RisultatoBloccoCorrezione
  return { schede: [], mancanti: [] } satisfies RisultatoBloccoSchede
}

/** The request of a block, rebuilt from the database (a step may resume in another invocation). */
async function prepara(
  archivio: Archivio,
  op: OpPasso,
  piano: PianoEsecuzione,
  ctx: Contesto,
  blocco: BloccoArchiviato,
): Promise<Preparato> {
  const { modello, effort } = piano
  const contesto = contestoDelCanale(ctx, blocco.canale, op.giorno)

  if (blocco.tipo === 'schede' || blocco.tipo === 'riattivazione') {
    const candidati = new Map(piano.candidati[blocco.canale].map((c) => [c.conversazione_id, c]))
    const perId = new Map(ctx.chat.filter((c) => c.canale === blocco.canale).map((c) => [c.conversazione_id, c]))
    const chat: ChatPerAnalisi[] = []
    const impronte = new Map<string, string>()
    // a block that went back (time, rate limit) keeps the cards it had validated: only the others run again
    const tipiDelBlocco: readonly TipoScheda[] = blocco.tipo === 'schede' ? ['lead', 'non_lead'] : ['riattivazione']
    const conScheda = new Set(
      (await archivio.schedeDellEsecuzione(op.esecuzione))
        .filter((s) => s.canale === blocco.canale && tipiDelBlocco.includes(s.tipo))
        .map((s) => s.chiave),
    )
    for (const chiave of blocco.chiavi) {
      if (conScheda.has(chiave)) continue
      const c = perId.get(chiave)
      // gone meanwhile (an exclusion, a deletion) or under 14 now: never sent
      if (!c || c.minore_14 || c.non_lead || c.messaggi.length === 0) continue
      const candidato = blocco.tipo === 'riattivazione' ? candidati.get(chiave) : undefined
      const perClaude = perAnalisi(ctx, c, candidato)
      chat.push(perClaude)
      impronte.set(chiave, improntaChat({ modello, effort, canale: blocco.canale, passo: blocco.tipo, chat: perClaude }))
    }
    if (chat.length === 0) return { vuoto: true }
    return { payload: payloadChat({ passo: blocco.tipo, canale: blocco.canale, contesto, media: ctx.post, chat }), impronte }
  }

  const schede = await archivio.schedeDellEsecuzione(op.esecuzione)
  if (blocco.tipo === 'agenda') {
    const voluti = new Set(blocco.chiavi)
    const voci = ctx.app.agenda.filter((v) => voluti.has(v.call_id))
    if (voci.length === 0) return { vuoto: true }
    const payload = payloadAgenda({
      contesto,
      voci,
      chat: ctx.chat,
      fasce: fasceEta([...ctx.precedenti, ...schede]),
      adesso: ctx.riferimento,
    })
    const impronte = new Map(
      payload.dati.voci.map((v) => [v.chiave, improntaCall({ modello, effort, tipo: v.lista === 'call' ? 'agenda' : 'show_up', corpo: v.corpo })]),
    )
    return { payload, impronte }
  }

  if (blocco.tipo === 'correzione') {
    const voluti = new Set(blocco.chiavi)
    const testi = daCorreggere(schede.filter((s) => s.canale === blocco.canale)).filter((t) => voluti.has(chiaveTesto(t)))
    if (testi.length === 0) return { vuoto: true }
    return { payload: payloadCorrezione({ canale: blocco.canale, contesto, testi }), impronte: new Map() }
  }

  // sintesi: the chats as this run leaves them (the origins Claude found count in the posts)
  const effettive = chatEffettive(ctx.chat, [...ctx.precedenti, ...schede], ctx.post)
  return {
    payload: payloadSintesi({
      canale: blocco.canale,
      contesto,
      chat: effettive,
      schede,
      schedeStoriche: ctx.precedenti,
      statoLead: ctx.app.stato_lead,
      esclusi: ctx.esclusi,
      media: ctx.post,
    }),
    impronte: new Map(),
  }
}

/** The cards an interrupted block had already validated, saved before it goes back (or is given up). */
async function salvaParziale(
  archivio: Archivio,
  op: OpPasso,
  blocco: BloccoArchiviato,
  esito: EsitoBlocco<unknown>,
  impronte: ReadonlyMap<string, string>,
): Promise<void> {
  if (esito.ok || !esito.parziale) return
  if (blocco.tipo !== 'schede' && blocco.tipo !== 'riattivazione') return
  const righe = schedeDelBlocco(blocco.tipo, esito.parziale as RisultatoBloccoSchede, impronte)
  if (righe.length > 0) await archivio.salvaSchede(op.esecuzione, op.giorno, blocco.canale, righe)
}

/** The chats of an interruption's partial result: they have their card, a placeholder must not replace it. */
function chiaviDelParziale(esito: EsitoBlocco<unknown>): Set<string> {
  const p = !esito.ok ? (esito.parziale as RisultatoBloccoSchede | undefined) : undefined
  return new Set([...(p?.schede ?? []).map((v) => v.chiave), ...(p?.mancanti ?? []).map((m) => m.chiave)])
}

/**
 * Stores a block's outcome: its cards at once, its result, or why not.
 * 'da_fare' when it goes back: a block the step's deadline cut (`fermato`)
 * goes back as it was; any other transient failure (a rate limit, the
 * network, a server error, its own timeout) counts as an attempt, and the
 * third gives its chats their placeholders.
 */
async function salvaEsito(
  archivio: Archivio,
  op: OpPasso,
  blocco: BloccoArchiviato,
  esito: EsitoBlocco<unknown>,
  impronte: ReadonlyMap<string, string>,
  lavoro: Lavoro,
  fermato: boolean,
): Promise<'fatto' | 'fallito' | 'da_fare'> {
  if (esito.usage) lavoro.usage = somma(lavoro.usage, esito.usage)
  if (esito.ok) {
    if (esito.servito_da_fallback) lavoro.fallback++
    if (blocco.tipo === 'schede' || blocco.tipo === 'riattivazione') {
      const righe = schedeDelBlocco(blocco.tipo, esito.risultato as RisultatoBloccoSchede, impronte)
      if (righe.length > 0) await archivio.salvaSchede(op.esecuzione, op.giorno, blocco.canale, righe)
    } else if (blocco.tipo === 'agenda') {
      const righe = schedeDellAgenda(esito.risultato as RisultatoBloccoAgenda, impronte)
      if (righe.length > 0) await archivio.salvaSchede(op.esecuzione, op.giorno, 'instagram', righe)
    }
    await archivio.aggiornaBlocco(blocco.id, {
      stato: 'fatto',
      errore: null,
      usage: esito.usage,
      servito_da_fallback: esito.servito_da_fallback,
      ...(blocco.tipo === 'sintesi' || blocco.tipo === 'correzione' ? { risultato: esito.risultato } : {}),
    })
    return 'fatto'
  }

  // an interrupted block keeps the cards it had validated (and paid for)
  await salvaParziale(archivio, op, blocco, esito, impronte)

  if (esito.esito === 'fatale') {
    lavoro.fatale ??= esito.errore
    await archivio.aggiornaBlocco(blocco.id, { stato: 'da_fare', errore: esito.errore })
    return 'da_fare'
  }
  // the step's time is over (its signal, or less than a request needs): not the block's fault, no attempt used
  const tempoFinito = fermato || op.entro - Date.now() < MINIMO_PER_INIZIARE_MS
  if (esito.esito === 'da_rifare' && tempoFinito && esito.errore === 'timeout') {
    await archivio.aggiornaBlocco(blocco.id, { stato: 'da_fare', errore: esito.errore })
    return 'da_fare'
  }
  const tentativi = blocco.tentativi + 1
  if (esito.esito === 'da_rifare' && tentativi < TENTATIVI_BLOCCO) {
    await archivio.aggiornaBlocco(blocco.id, { stato: 'da_fare', tentativi, errore: esito.errore })
    return 'da_fare'
  }
  // given up: its chats without a card get placeholder cards (never invented content)
  if (blocco.tipo === 'schede' || blocco.tipo === 'riattivazione') {
    const tipo = blocco.tipo === 'schede' ? 'lead' : 'riattivazione'
    const conScheda = chiaviDelParziale(esito)
    const righe = blocco.chiavi.filter((k) => impronte.has(k) && !conScheda.has(k)).map((k) => schedaMancante(tipo, k, esito.errore))
    if (righe.length > 0) await archivio.salvaSchede(op.esecuzione, op.giorno, blocco.canale, righe)
  }
  await archivio.aggiornaBlocco(blocco.id, { stato: 'fallito', tentativi, errore: esito.errore, ...(esito.usage ? { usage: esito.usage } : {}) })
  return 'fallito'
}

// ---------------------------------------------------------------------------
// unione
// ---------------------------------------------------------------------------

function correzioniDi(risultato: unknown): Correzione[] {
  const r = risultato as { correzioni?: unknown } | null
  return Array.isArray(r?.correzioni)
    ? r.correzioni.filter((c): c is Correzione => !!c && typeof c === 'object' && typeof (c as Correzione).testo === 'string')
    : []
}

/** What unione writes back on a chat: non-lead or under 14 without messages, the target, the origin Claude found. */
export function differenzeChat(prima: ChatSalvata, dopo: ChatSalvata): { campi: CampiChat | null; origine: boolean } {
  const campi: CampiChat = {}
  if (dopo.non_lead && !prima.non_lead) Object.assign(campi, { non_lead: true, messaggi: [], codici_condivisi: [] })
  if (dopo.minore_14 && !prima.minore_14) Object.assign(campi, { minore_14: true, messaggi: [], codici_condivisi: [] })
  if (dopo.ultimo_target !== prima.ultimo_target && dopo.ultimo_target !== null) campi.ultimo_target = dopo.ultimo_target
  const origine = prima.origine_tipo === null && dopo.origine_tipo !== null
  return { campi: Object.keys(campi).length > 0 ? campi : null, origine }
}

/**
 * The chats of a block given up without its outcome stored (insight_prendi_passo
 * fails a block a dead invocation left in_corso three times, C39) get their
 * placeholder cards here, before the documents: a chat is never left out of
 * the recap because its analysis was lost.
 */
async function segnapostiDeiBlocchiFalliti(archivio: Archivio, op: OpPasso, blocchi: readonly BloccoArchiviato[]): Promise<void> {
  const falliti = blocchi.filter((b) => b.stato === 'fallito' && (b.tipo === 'schede' || b.tipo === 'riattivazione'))
  if (falliti.length === 0) return
  const schede = await archivio.schedeDellEsecuzione(op.esecuzione)
  for (const b of falliti) {
    const tipi = b.tipo === 'schede' ? ['lead', 'non_lead'] : ['riattivazione']
    const conScheda = new Set(schede.filter((s) => s.canale === b.canale && tipi.includes(s.tipo)).map((s) => s.chiave))
    const tipo = b.tipo === 'schede' ? 'lead' : 'riattivazione'
    const righe = b.chiavi.filter((k) => !conScheda.has(k)).map((k) => schedaMancante(tipo, k, b.errore ?? 'interrotto'))
    if (righe.length > 0) await archivio.salvaSchede(op.esecuzione, op.giorno, b.canale, righe)
  }
}

async function passoUnione(archivio: Archivio, op: OpPasso, riga: RigaEsecuzione): Promise<EsitoPasso> {
  const piano = pianoDi(op.progresso)
  if (!piano) return fallita(archivio, op, FRASI_INSIGHT.imprevisto)
  const ctx = await carica(archivio, op, riga)
  const blocchi = await archivio.blocchi(op.esecuzione)
  const correzioni = blocchi.filter((b) => b.tipo === 'correzione' && b.stato === 'fatto').flatMap((b) => correzioniDi(b.risultato))
  await segnapostiDeiBlocchiFalliti(archivio, op, blocchi)
  const archiviate = await archivio.schedeDellEsecuzione(op.esecuzione)
  const schede = applicaCorrezioni(archiviate, correzioni) as SchedaArchiviata[]
  const sintesi = (canale: CanaleInsight) =>
    blocchi.find((b) => b.tipo === 'sintesi' && b.canale === canale && b.stato === 'fatto')?.risultato ?? null
  const generatoIl = ctx.riferimento.toISOString()
  const generatoCon = {
    modello: piano.modello,
    effort: piano.effort as EffortInsight,
    versione_prompt: VERSIONE_PROMPT,
    servito_da_fallback: blocchi.some((b) => b.servito_da_fallback),
  }
  const avvisi: string[] = []

  // 1. the documents (from the chats as read: messages first, then the chats lose them)
  const documenti: RecapCanale[] = []
  for (const canale of piano.messenger ? (['instagram', 'messenger'] as const) : (['instagram'] as const)) {
    const soloMessenger = canale === 'messenger'
    const doc = uniscRecap({
      canale,
      giorno: op.giorno,
      generatoIl,
      // the Instagram document counts the posts from both channels
      chat: soloMessenger ? ctx.chat.filter((c) => c.canale === 'messenger') : ctx.chat,
      schede: soloMessenger ? schede.filter((s) => s.canale === 'messenger') : schede,
      schedeStoriche: soloMessenger ? ctx.precedenti.filter((s) => s.canale === 'messenger') : ctx.precedenti,
      candidati: piano.candidati[canale],
      sintesi: sintesi(canale),
      contesto: ctx.app,
      contenuti: ctx.post,
      escluse: ctx.lettura[canale].escluse,
      avvisi: frasiAvvisi(ctx.lettura.avvisi.filter((a) => (CANALE_AVVISO as Record<string, string>)[a] === canale)),
      generatoCon,
      esclusi: ctx.esclusi,
    })
    await archivio.salvaRecap({ giorno: op.giorno, canale, esecuzione: op.esecuzione, generatoIl, documento: doc })
    documenti.push(doc)
  }

  // 2. the chats as the run leaves them (D25, C14, D26)
  const effettive = chatEffettive(ctx.chat, [...ctx.precedenti, ...schede], ctx.post)
  for (let i = 0; i < ctx.chat.length; i++) {
    const prima = ctx.chat[i]
    const dopo = effettive[i]
    const { campi, origine } = differenzeChat(prima, dopo)
    // found to be under 14 only now: what he left in the earlier recaps and cards goes too (D25).
    // Before the flag is written: if this fails, the next run finds the chat unflagged and does it again
    if (dopo.minore_14 && !prima.minore_14) await archivio.scartaMinore(prima.canale, prima.conversazione_id, op.esecuzione)
    if (campi) await archivio.aggiornaChat(prima.canale, prima.conversazione_id, campi)
    if (origine && dopo.origine_tipo && dopo.origine_il && dopo.origine_giorno) {
      await archivio.salvaOrigine(prima.canale, prima.conversazione_id, {
        tipo: dopo.origine_tipo,
        shortcode: dopo.origine_shortcode,
        il: dopo.origine_il,
        giorno: dopo.origine_giorno,
      })
    }
  }

  // 3. the leads per post and day (D27): a failure is a warning, never a failed run
  try {
    const storico = await archivio.storicoDal()
    const minimo = aggiungiGiorni(op.giorno, -29)
    const dal = storico && storico > minimo ? storico : minimo
    const chats = (await archivio.chatPerConteggi(dal)).filter((c) => !esclusa(c, ctx.esclusi))
    const { username, nomi } = chiaviStatoLead(chats)
    const statoLead = await archivio.statoLead(username, nomi)
    const righe = contaPerPost({ chats, statoLead, esclusi: ctx.esclusi, dal, oggi: op.giorno })
    // a partial reading (chats not read, the history cut) must not turn its zeros into «counted»
    await archivio.salvaConteggi(righe, { segnaGiorni: letturaCompleta(ctx.lettura) })
  } catch {
    console.error('[insight] conteggi per contenuto non aggiornati:', op.esecuzione.slice(0, 8))
    avvisi.push(AVVISI_INSIGHT.conteggi)
  }

  // 4. the reel each new lead came from, now that the chats carry their origin (1.37.0): never a failed run
  try {
    await archivio.collegaLeadAiContenuti()
  } catch {
    console.error('[insight] origine dei lead non aggiornata:', op.esecuzione.slice(0, 8))
  }

  const attribuite = documenti.flatMap((d) => d.leads).filter((l) => l.origine?.shortcode).length
  console.info(
    '[insight] token',
    `input ${riga.token_input ?? 0}`,
    `cache scritti ${riga.token_cache_scritti ?? 0}`,
    `cache letti ${riga.token_cache_letti ?? 0}`,
    `output ${riga.token_output ?? 0}`,
    `blocchi ${blocchi.length}`,
    `fallback ${riga.servito_da_fallback}`,
  )
  return finisci(archivio, op, null, {}, avvisi, { chat_attribuite: attribuite })
}
