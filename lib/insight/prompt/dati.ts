import 'server-only'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import {
  GIORNI_CONTENT,
  leadDelPeriodo,
  nomeNormalizzato,
  postDelRecap,
  postPerAnalisi,
  statoLeadDi,
  temiDelPeriodo,
  tipoDellaScheda,
  ultimaSchedaPerChat,
} from '@/lib/insight/contenuti'
import type {
  CanaleInsight,
  CandidatoRiattivazione,
  ChatEscluse,
  ChatPerAnalisi,
  ChatSalvata,
  FasciaEta,
  PayloadBlocco,
  PostInsight,
  PostPerAnalisi,
  SchedaSalvata,
  StatoLeadApp,
  VoceAgendaApp,
} from '@/lib/insight/contratti'
import { attendeRisposta } from '@/lib/insight/filtri'
import { formattaOraRecap } from '@/lib/insight/recap'
import { giornoRoma } from '@/lib/setting/conteggio-dm'

/**
 * What Claude reads in the user turn of each request of the Insight (1.35.0,
 * CLAUDE.md section 29), built only from code: the day's context (cached per
 * run and channel) and the data of one block, every element with the ref the
 * code issued (c01, r01, a01, s01, k01). The refs live inside one request:
 * the answer is mapped back to conversazione_id or call_id through `voci`.
 *
 * Never in a payload: excluded chats (D5), under-14 chats after the run that
 * classified them (D25), tokens, contacts, amounts, setter or closer notes,
 * `cliente` and `ha_call` of the app (D15), anything from the economics
 * tables. Usernames and profile names go, as Dany decided.
 */

const ORA_MS = 3_600_000

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A row of insight_profili as the payload uses it (never the picture). */
export type ProfiloInsight = {
  username: string
  nome: string | null
  follower: number | null
  verificato: boolean | null
  ti_segue: boolean | null
  lo_segui: boolean | null
}

/** <contesto_giorno>: the same for every block of a run and channel (the second cache breakpoint). */
export type ContestoGiornoDati = {
  canale: CanaleInsight
  /** 'YYYY-MM-DD', the Rome day of the run */
  giorno: string
  giorno_settimana: string
  /** 'HH:MM' in Rome: the start of the run, the instant the facts are computed at */
  ora: string
  /** Dany's posts of the last 30 days, the most recent first: a card's post_ref is `n` */
  post: { n: number; data: string; tipo: PostPerAnalisi['tipo']; hook: string }[]
  call_in_agenda: { oggi: number; domani: number }
}

/** The lists Claude answers element by element. */
export type ListaVoci = 'chat' | 'candidati' | 'call' | 'show_up' | 'testi'

/** One element of a block: what Claude reads (`corpo`, with its ref) and what code keeps (`chiave`, `meta`). */
export type VoceBlocco = {
  lista: ListaVoci
  ref: string
  /** conversazione_id, call_id, or the key of a text to correct */
  chiave: string
  corpo: Record<string, unknown>
  /** code only, never sent: what the answer is matched or completed with */
  meta?: MetaVoce
}

export type MetaVoce = {
  /** schede, riattivazione: the origin is known from code, post_ref is ignored */
  origine_nota?: boolean
  /** agenda: the lead's chat is a Messenger chat matched by name */
  messenger_user_id?: string | null
  /** correzione: where the corrected text goes */
  correzione?: { tipo: SchedaSalvata['tipo']; chiave: string; campo: CampoCorrezione }
}

export type CampoCorrezione = 'suggested_message' | 'suggested_message_alt' | 'suggested_reply' | 'agenda' | 'show_up'

/** PayloadBlocco.dati of the Insight. */
export type DatiBlocco = {
  contesto: ContestoGiornoDati
  voci: VoceBlocco[]
  /** sintesi: the data that is not a list of elements */
  altro?: Record<string, unknown>
  /** sintesi: the topic of each id (t01 → «poco tempo») */
  temi?: Record<string, string>
  /** schede, riattivazione, sintesi: the shortcode of each post number (post_ref) */
  post?: Record<string, string>
}

export type PayloadInsight = Omit<PayloadBlocco, 'dati'> & { dati: DatiBlocco }

/** Whether a PayloadBlocco carries the Insight's data. */
export function datiDelPayload(payload: PayloadBlocco): DatiBlocco | null {
  const d = payload.dati as Partial<DatiBlocco> | null
  return d && typeof d === 'object' && d.contesto && Array.isArray(d.voci) ? (d as DatiBlocco) : null
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const formatoGiornoSettimana = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long' })
const formatoOra = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 'HH:MM' in Rome. */
export function oraRoma(istante: Date | string): string {
  const d = typeof istante === 'string' ? new Date(istante) : istante
  return Number.isNaN(d.getTime()) ? '' : formatoOra.format(d)
}

/** «oggi 19:30», «domani 18:00», «ieri 21:00», otherwise 'GG/MM HH:MM' (Rome). */
export function quandoRelativo(iso: string, adesso: Date): string {
  const giorno = giornoRoma(iso)
  if (!giorno) return ''
  const oggi = oggiRoma(adesso)
  const ora = oraRoma(iso)
  if (giorno === oggi) return `oggi ${ora}`
  if (giorno === aggiungiGiorni(oggi, 1)) return `domani ${ora}`
  if (giorno === aggiungiGiorni(oggi, -1)) return `ieri ${ora}`
  return formattaOraRecap(iso)
}

/** Ref c01, c02, …: two digits, three past 99. */
export function ref(prefisso: string, i: number): string {
  return `${prefisso}${String(i + 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// The day's context
// ---------------------------------------------------------------------------

export function contestoGiornoDati(op: {
  canale: CanaleInsight
  /** 'YYYY-MM-DD' */
  giorno: string
  /** the start of the run */
  adesso: Date
  media: readonly PostInsight[]
  agenda: readonly VoceAgendaApp[]
}): ContestoGiornoDati {
  return {
    canale: op.canale,
    giorno: op.giorno,
    giorno_settimana: formatoGiornoSettimana.format(new Date(`${op.giorno}T12:00:00Z`)),
    ora: oraRoma(op.adesso),
    post: postPerAnalisi(op.media, op.giorno).map((p) => ({ n: p.indice, data: p.data, tipo: p.tipo, hook: p.hook })),
    call_in_agenda: {
      oggi: op.agenda.filter((v) => v.giorno === 'oggi' && v.stato !== 'riprogrammata').length,
      domani: op.agenda.filter((v) => v.giorno === 'domani' && v.stato !== 'riprogrammata').length,
    },
  }
}

/** The posts of the context by number (n → shortcode): a card's post_ref goes back to its post through it. */
export function riferimentiPost(media: readonly PostInsight[], giorno: string): Record<string, string> {
  return Object.fromEntries(postPerAnalisi(media, giorno).map((p) => [String(p.indice), p.shortcode]))
}

// ---------------------------------------------------------------------------
// One chat (schede, riattivazione)
// ---------------------------------------------------------------------------

/** The call of a chat's lead in the agenda (by handle on Instagram, by a unique name on Messenger). */
function callDellaChat(chat: ChatSalvata, agenda: readonly VoceAgendaApp[]): VoceAgendaApp | null {
  const future = agenda.filter((v) => v.giorno !== 'ieri' && v.stato !== 'cancellata')
  if (chat.canale === 'instagram') {
    return (chat.username && future.find((v) => v.username === chat.username)) || null
  }
  const nome = nomeNormalizzato(chat.nome)
  if (!nome) return null
  const stesse = future.filter((v) => nomeNormalizzato(v.nome) === nome)
  // a name that belongs to two leads says nothing
  return stesse.length > 0 && stesse.every((v) => v.lead_id === stesse[0].lead_id) ? stesse[0] : null
}

/**
 * A chat as code describes it to Claude (ref still '': the block assigns it).
 * The facts are code's and true (who wrote last, the hours he has been
 * waiting, the Calendly sent, the lead and his call in the app, the shared
 * contents, whether the origin is already known); the messages are his and
 * ours, oldest first, with the Rome time.
 */
export function chatPerAnalisi(op: {
  chat: ChatSalvata
  profilo: ProfiloInsight | null
  statoLead: readonly StatoLeadApp[]
  agenda: readonly VoceAgendaApp[]
  /** the start of the run */
  adesso: Date
  candidato?: CandidatoRiattivazione
}): ChatPerAnalisi {
  const { chat, adesso } = op
  const stato = statoLeadDi(chat, op.statoLead)
  const voce = callDellaChat(chat, op.agenda)
  const ultimoDa = chat.ultimo_da ?? chat.messaggi.at(-1)?.da ?? null
  const ultimoIl = chat.ultimo_il ?? chat.messaggi.at(-1)?.il ?? null
  const attesa =
    ultimoDa === 'lead' && ultimoIl ? Math.max(0, Math.round((adesso.getTime() - Date.parse(ultimoIl)) / ORA_MS)) : null
  const call = voce
    ? { quando: quandoRelativo(voce.programmata_il, adesso), stato: voce.stato, esito: voce.esito, di_follow_up: voce.di_follow_up }
    : stato?.prossima_call_il && stato.prossima_call_stato
      ? { quando: quandoRelativo(stato.prossima_call_il, adesso), stato: stato.prossima_call_stato, esito: null, di_follow_up: false }
      : null
  return {
    ref: '',
    canale: chat.canale,
    conversation_id: chat.conversazione_id,
    username: chat.username,
    user_id: chat.utente_id,
    nome_profilo: op.profilo?.nome ?? chat.nome,
    profilo: op.profilo
      ? { follower: op.profilo.follower, ti_segue: op.profilo.ti_segue, lo_segui: op.profilo.lo_segui }
      : null,
    completa: chat.completa,
    messaggi: chat.messaggi.map((m) => ({ da: m.da, quando: formattaOraRecap(m.il), testo: m.testo })),
    ultimo_da: ultimoDa,
    ultimo_il: ultimoIl,
    ore_attesa: Number.isFinite(attesa) ? attesa : null,
    calendly_inviato_il: chat.calendly_inviato_il,
    app: {
      stato_lead: stato?.stato_lead ?? null,
      call,
      no_show_precedenti: voce?.no_show_precedenti ?? stato?.no_show_precedenti ?? 0,
    },
    contenuti_condivisi: chat.codici_condivisi,
    origine_da_codice: chat.origine_tipo !== null,
    ...(op.candidato ? { giorni_silenzio: op.candidato.giorni_silenzio, passo: op.candidato.passo } : {}),
  }
}

/** The band of the hours of waiting: what the impronta uses instead of the hours. */
export function fasciaAttesa(ore: number | null): string | null {
  if (ore === null) return null
  if (ore < 12) return '<12h'
  if (ore < 24) return '12-24h'
  if (ore < 48) return '24-48h'
  return '>48h'
}

/** What Claude reads of a chat, without its ref. `fascia` replaces the hours (for the impronta). */
export function corpoChat(c: ChatPerAnalisi, opzioni: { fascia?: boolean } = {}): Record<string, unknown> {
  const profilo: Record<string, unknown> = { nome: c.nome_profilo ?? '' }
  if (c.canale === 'instagram') profilo.username = c.username ?? ''
  if (c.profilo) {
    profilo.follower = c.profilo.follower
    profilo.ti_segue = c.profilo.ti_segue
    profilo.lo_segui = c.profilo.lo_segui
  }
  const fatti: Record<string, unknown> = {
    ultimo_da: c.ultimo_da,
    [opzioni.fascia ? 'fascia_attesa' : 'ore_attesa']: opzioni.fascia ? fasciaAttesa(c.ore_attesa) : c.ore_attesa,
    calendly_inviato: c.calendly_inviato_il !== null,
    chat_completa: c.completa,
    stato_nell_app: c.app.stato_lead,
    call: c.app.call
      ? `${c.app.call.quando}, ${c.app.call.stato}${c.app.call.esito ? ` (${c.app.call.esito})` : ''}${c.app.call.di_follow_up ? ', call di follow-up' : ''}`
      : null,
    no_show_precedenti: c.app.no_show_precedenti,
    contenuti_condivisi: c.contenuti_condivisi.length,
    origine_nota: c.origine_da_codice,
  }
  if (c.giorni_silenzio !== undefined) fatti.giorni_silenzio = c.giorni_silenzio
  if (c.passo !== undefined) fatti.step = c.passo
  return { profilo, fatti, messaggi: c.messaggi }
}

/** schede or riattivazione: one element per chat, c01… (schede) or r01… (riattivazione). */
export function payloadChat(op: {
  passo: 'schede' | 'riattivazione'
  canale: CanaleInsight
  contesto: ContestoGiornoDati
  /** the posts the context lists (the same media contestoGiornoDati got): post_ref → shortcode */
  media: readonly PostInsight[]
  chat: readonly ChatPerAnalisi[]
}): PayloadInsight {
  const lista: ListaVoci = op.passo === 'schede' ? 'chat' : 'candidati'
  const prefisso = op.passo === 'schede' ? 'c' : 'r'
  return {
    passo: op.passo,
    canale: op.canale,
    dati: {
      contesto: op.contesto,
      voci: op.chat.map((c, i) => ({
        lista,
        ref: ref(prefisso, i),
        chiave: c.conversation_id,
        corpo: corpoChat(c),
        meta: { origine_nota: c.origine_da_codice },
      })),
      post: riferimentiPost(op.media, op.contesto.giorno),
    },
  }
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

/** The chat of an agenda call: by handle on Instagram, by an exact normalized name of one Messenger chat. */
export function chatDellaCall(
  voce: Pick<VoceAgendaApp, 'username' | 'nome'>,
  chat: readonly ChatSalvata[],
): ChatSalvata | null {
  if (voce.username) {
    const ig = chat.find((c) => c.canale === 'instagram' && c.username === voce.username)
    if (ig) return ig
  }
  const nome = nomeNormalizzato(voce.nome)
  if (!nome) return null
  const fb = chat.filter((c) => c.canale === 'messenger' && nomeNormalizzato(c.nome) === nome)
  return fb.length === 1 ? fb[0] : null
}

/** The outcome of yesterday's call, as code reads it (lib/insight/agenda.ts uses the same words). */
export function esitoShowUp(v: Pick<VoceAgendaApp, 'stato'>): string {
  if (v.stato === 'svolta') return 'presentato'
  if (v.stato === 'no_show') return 'no-show'
  return 'da verificare'
}

/**
 * The agenda block: today's and tomorrow's calls (a01…, never the ones
 * waiting for a confirmed date) and yesterday's (s01…), each with the facts
 * of code and its lead's chat when one is stored and readable (never an
 * under-14 chat). Without a chat: null, and the item says «chat non
 * disponibile».
 */
export function payloadAgenda(op: {
  contesto: ContestoGiornoDati
  voci: readonly VoceAgendaApp[]
  chat: readonly ChatSalvata[]
  /** the age band of each chat's latest card (conversazione_id → band), for the minors' nurture */
  fasce?: ReadonlyMap<string, FasciaEta>
  adesso: Date
}): PayloadInsight {
  const voci: VoceBlocco[] = []
  const conChat = (v: VoceAgendaApp) => {
    const c = chatDellaCall(v, op.chat)
    if (!c || c.minore_14 || c.non_lead || c.messaggi.length === 0) return { chat: null, c }
    return {
      chat: { canale: c.canale, messaggi: c.messaggi.map((m) => ({ da: m.da, quando: formattaOraRecap(m.il), testo: m.testo })) },
      c,
    }
  }
  const prossime = op.voci
    .filter((v) => (v.giorno === 'oggi' || v.giorno === 'domani') && v.stato !== 'riprogrammata' && v.stato !== 'cancellata')
    .sort((a, b) => a.programmata_il.localeCompare(b.programmata_il) || a.call_id.localeCompare(b.call_id))
  prossime.forEach((v, i) => {
    const { chat, c } = conChat(v)
    const fascia = c ? op.fasce?.get(c.conversazione_id) : undefined
    voci.push({
      lista: 'call',
      ref: ref('a', i),
      chiave: v.call_id,
      corpo: {
        giorno: v.giorno,
        ora: oraRoma(v.programmata_il),
        ore_alla_call: Math.round((Date.parse(v.programmata_il) - op.adesso.getTime()) / ORA_MS),
        nome: v.nome ?? '',
        stato: v.stato,
        call_di_follow_up: v.di_follow_up,
        volte_spostata: v.volte_spostata,
        no_show_precedenti: v.no_show_precedenti,
        minore: fascia === '14_17',
        chat: chat ?? null,
        ...(chat ? {} : { nota: 'chat non disponibile' }),
      },
      meta: { messenger_user_id: c?.canale === 'messenger' ? c.utente_id : null },
    })
  })
  const ieri = op.voci
    .filter((v) => v.giorno === 'ieri' && v.stato !== 'cancellata')
    .sort((a, b) => a.programmata_il.localeCompare(b.programmata_il) || a.call_id.localeCompare(b.call_id))
  ieri.forEach((v, i) => {
    const { chat } = conChat(v)
    voci.push({
      lista: 'show_up',
      ref: ref('s', i),
      chiave: v.call_id,
      corpo: {
        ora: oraRoma(v.programmata_il),
        nome: v.nome ?? '',
        esito: esitoShowUp(v),
        ...(v.stato === 'riprogrammata' ? { nota_app: 'in attesa di conferma' } : {}),
        chat: chat ?? null,
        ...(chat ? {} : { nota: 'chat non disponibile' }),
      },
    })
  })
  return { passo: 'agenda', canale: 'instagram', dati: { contesto: op.contesto, voci } }
}

// ---------------------------------------------------------------------------
// Sintesi
// ---------------------------------------------------------------------------

type DatiCard = Record<string, unknown>

function datiCard(s: SchedaSalvata): DatiCard {
  return s.dati !== null && typeof s.dati === 'object' ? (s.dati as DatiCard) : {}
}

const testoBreve = (v: unknown, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * The sintesi block: the day's cards in short (without names or quotes:
 * situation and pain cut short), the 14-day digest of the leads (latest
 * state, never their words), the topics with their ids, the contents with the
 * numbers of code, the summary. Claude groups the topics, judges the posts and
 * writes the content part; every number is code's.
 */
export function payloadSintesi(op: {
  canale: CanaleInsight
  contesto: ContestoGiornoDati
  /** the channel's chats of the run (for the Instagram document, the Messenger ones too: the posts count both) */
  chat: readonly ChatSalvata[]
  /** this run's cards (lead and non_lead) */
  schede: readonly SchedaSalvata[]
  /** the latest card of each chat from earlier runs of the last 14 days, oldest first */
  schedeStoriche?: readonly SchedaSalvata[]
  statoLead: readonly StatoLeadApp[]
  esclusi: ChatEscluse
  media: readonly PostInsight[]
  /** the day's numbers; by default counted here from the cards, as unione.ts counts them */
  sommario?: Record<string, number>
}): PayloadInsight {
  const oggi = op.contesto.giorno
  const delCanale = op.chat.filter((c) => c.canale === op.canale)
  const tutte = [...(op.schedeStoriche ?? []), ...op.schede]
  const ultime = ultimaSchedaPerChat(op.schede)
  const sommario = op.sommario ?? sommarioDalleSchede(delCanale, ultime)

  const schedeDelGiorno = delCanale.flatMap((c) => {
    const s = ultime.get(c.conversazione_id)
    if (!s || tipoDellaScheda(s) !== 'lead' || c.minore_14) return []
    const d = datiCard(s)
    if (d.analisi_mancante === true) return []
    const breve = d.priority === 'bassa'
    return [
      breve
        ? { priority: d.priority, stage: d.stage, target: d.target, topics: d.topics }
        : {
            priority: d.priority,
            stage: d.stage,
            target: d.target,
            status: testoBreve(d.status, 80),
            situation: testoBreve(d.situation),
            pain: testoBreve(d.pain),
            topics: d.topics,
            serve_dany: typeof d.needs_dany === 'string' && d.needs_dany.trim() !== '',
            origine: c.origine_tipo ?? '',
            attende_risposta: attendeRisposta({ stage: String(d.stage ?? ''), last_from: c.ultimo_da ?? 'alpha' }),
          },
    ]
  })

  const lead = leadDelPeriodo({ chat: delCanale, schede: tutte, statoLead: op.statoLead, oggi })
  const temi = temiDelPeriodo(lead)
  const storico = lead
    .filter((l) => l.risposte > 0)
    .map((l) => ({ giorno: l.giorno, target: l.target, stage: l.stage, flow: l.flow, topics: l.topics, origine: l.origine, call: l.call }))

  const post: Record<string, string> = {}
  const altro: Record<string, unknown> = {
    sommario,
    periodo: { dal: aggiungiGiorni(oggi, -(GIORNI_CONTENT - 1)), al: oggi },
    schede_del_giorno: schedeDelGiorno,
    storico,
    temi: temi.map((t) => ({ id: t.id, tema: t.tema, chat: t.chat })),
  }
  if (op.canale === 'instagram') {
    const numeri = new Map(postPerAnalisi(op.media, oggi).map((p) => [p.shortcode, p.indice]))
    let prossimo = Math.max(0, ...numeri.values()) + 1
    const righe = postDelRecap({ media: op.media, chats: op.chat, statoLead: op.statoLead, esclusi: op.esclusi, sintesi: [], oggi })
    altro.contenuti = righe.map((r) => {
      const n = (r.shortcode && numeri.get(r.shortcode)) || prossimo++
      if (r.shortcode) post[String(n)] = r.shortcode
      return { n, data: r.date, tipo: r.type, hook: r.hook, views: r.views, salvati: r.saved, condivisioni: r.shares, dm: r.dm, in_target: r.target, call: r.call ?? 0 }
    })
  } else {
    altro.contenuti = []
  }
  return {
    passo: 'sintesi',
    canale: op.canale,
    dati: {
      contesto: op.contesto,
      voci: [],
      altro,
      temi: Object.fromEntries(temi.map((t) => [t.id, t.tema])),
      post,
    },
  }
}

/** The day's numbers from this run's cards (the same rules as the recap's summary, D8 and D9). */
function sommarioDalleSchede(chat: readonly ChatSalvata[], ultime: ReadonlyMap<string, SchedaSalvata>): Record<string, number> {
  let conversazioni = 0
  let inTarget = 0
  let attendono = 0
  let call = 0
  let persi = 0
  for (const c of chat) {
    const s = ultime.get(c.conversazione_id)
    if (!s) continue
    conversazioni++
    if (tipoDellaScheda(s) !== 'lead' || c.minore_14) continue
    const d = datiCard(s)
    const stage = String(d.stage ?? '')
    if (d.target === 'si') inTarget++
    if (attendeRisposta({ stage, last_from: c.ultimo_da ?? 'alpha' })) attendono++
    if (/call prenotata/iu.test(stage)) call++
    if (/perso|chiuso|uscita/iu.test(stage)) persi++
  }
  return { conversazioni, lead_in_target: inTarget, attendono_risposta: attendono, call_prenotate: call, persi }
}

// ---------------------------------------------------------------------------
// Correzione
// ---------------------------------------------------------------------------

/** A text the final check sends back once, with its violations (lib/insight/controllo-finale.ts). */
export type TestoDaCorreggere = {
  tipo: SchedaSalvata['tipo']
  chiave: string
  campo: CampoCorrezione
  testo: string
  violazioni: string[]
}

/** The key of a text to correct: tipo|chiave|campo. */
export function chiaveTesto(t: Pick<TestoDaCorreggere, 'tipo' | 'chiave' | 'campo'>): string {
  return `${t.tipo}|${t.chiave}|${t.campo}`
}

export function payloadCorrezione(op: { canale: CanaleInsight; contesto: ContestoGiornoDati; testi: readonly TestoDaCorreggere[] }): PayloadInsight {
  return {
    passo: 'correzione',
    canale: op.canale,
    dati: {
      contesto: op.contesto,
      voci: op.testi.map((t, i) => ({
        lista: 'testi',
        ref: ref('k', i),
        chiave: chiaveTesto(t),
        corpo: { campo: t.campo, testo: t.testo, violazioni: t.violazioni },
        meta: { correzione: { tipo: t.tipo, chiave: t.chiave, campo: t.campo } },
      })),
    },
  }
}
