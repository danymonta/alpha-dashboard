import { z } from 'zod'

/**
 * The recap documents of the Insight (1.35.0, CLAUDE.md section 29): one per
 * Rome day and channel, in insight_recap.dati. The keys are the artifact
 * "Recap DM Alpha"'s, so the page reproduces it section by section, plus a few
 * additive fields (marked below) that the artifact never had.
 *
 * Written only by code (lib/insight/unione.ts): identity, messages, times,
 * counts and origins come from code, the rest from Claude's validated cards.
 * Read by the page (admin and every active setter) through recapSchema, which
 * is tolerant: every field may be missing or wrong, and each gets the
 * artifact's data fallback (priority «bassa», target «da verificare», the last
 * message's author for last_from, the step from days_silent, 24 hours) or a
 * neutral one ('' , 0, null, []). An item of a list that cannot be read is
 * dropped, never the whole list. The words the artifact shows for an empty
 * value («Analisi delle ultime 24 ore», «n/d», «da verificare», «Lead») are
 * the page's.
 *
 * Shared by the AI layer, the orchestration and the page: a change here goes
 * back through phase 0 of the release.
 */

// ---------- the documents, as unione.ts writes them ----------

export type DaChi = 'lead' | 'alpha'
export type PrioritaLead = 'alta' | 'media' | 'bassa'
export type TargetLead = 'si' | 'no' | 'da verificare'
export type TipoOrigine = 'condivisione' | 'parola_chiave' | 'storia' | 'testo'
export type TipoPostOrigine = 'reel' | 'post' | 'carosello'

export type MessaggioRecap = {
  from: DaChi
  /** 'GG/MM HH:MM' in Europe/Rome (formattaOraRecap): the one shown */
  time: string
  text: string
  /** additive: the instant, ISO UTC. Never shown; the nightly cleanup drops a message by it after 30 days */
  at: string
}

/** additive, written by code: where the lead comes from, when the DMs tell (D26) */
export type OrigineRecap = {
  tipo: TipoOrigine
  shortcode?: string
  permalink?: string
  /** 'GG/MM', the Rome day the post was published */
  data?: string
  tipo_post?: TipoPostOrigine
  hook?: string
  /** the keyword, for parola_chiave */
  parola?: string
}

export type LeadRecap = {
  username?: string
  /** Messenger: the lead's PSID */
  user_id?: string
  conversation_id: string
  name: string
  age: string
  priority: PrioritaLead
  target: TargetLead
  stage: string
  status: string
  situation: string
  pain: string
  next_action: string
  suggested_message: string
  suggested_message_alt: string
  alt_condition: string
  needs_dany: string
  /** '' only on a card without analysis (analisi_mancante): the page shows no pill */
  flow: 'inbound' | 'outbound' | ''
  /** written by code from origine («reel del 03/10 condiviso in DM», …), or '' */
  source: string
  topics: string[]
  last_from: DaChi
  /** ISO UTC of the last message */
  last_message_at: string
  messages: MessaggioRecap[]
  /** additive: a placeholder card, the analysis of this chat failed */
  analisi_mancante?: true
  /** additive: why the message is to be checked by hand */
  da_ricontrollare?: string
  /** additive (D26) */
  origine?: OrigineRecap
  /** additive (D25): no messages, the fields blanked */
  minore_14?: true
}

export type PassoRiattivazione = 1 | 2 | 3
export type RiattivazioneRecap = LeadRecap & { days_silent: number; step: PassoRiattivazione }

export type ObiezioneRecap = { username?: string; user_id?: string; name?: string; text: string; suggested_reply: string }

export type AgendaRecap = {
  call_id: string
  day: 'oggi' | 'domani'
  /** 'HH:MM' in Europe/Rome */
  time: string
  name: string
  username: string
  /** always '' in 1.35.0 (no Calendly or Meet link, Q4): the «Meet» button never renders */
  meet_link: string
  status: string
  note: string
  suggested_message: string
  channel?: 'Messenger'
  user_id?: string
}

export type ShowUpRecap = {
  call_id: string
  day: 'ieri'
  time: string
  name: string
  username: string
  outcome: string
  note: string
  suggested_message: string
}

export type TemaRecap = { theme: string; count: number; target_count: number; calls: number; trend: string; insight: string }

export type PostRecap = {
  permalink: string
  /** 'GG/MM' */
  date: string
  type: string
  hook: string
  /** null: not available («n/d»), e.g. without the statistics permission */
  views: number | null
  saved: number | null
  shares: number | null
  dm: number
  target: number
  verdict: string | null
  why: string
  /** additive (D27): the join key with instagram_contenuti and the calendar */
  shortcode?: string
  /** additive (D27): leads from this post with a call in the app */
  call?: number
}

export type IdeaRecap = { hook: string; format: string; why: string }

export type ContentRecap = {
  period: string
  based_on: number
  note: string
  themes: TemaRecap[]
  posts: PostRecap[]
  keep: string[]
  change: string[]
  boost: string[]
  setting_tips: string[]
  ideas: IdeaRecap[]
  /** additive (D26): story replies, counted apart from the posts */
  storie?: { dm: number; target: number }
}

export type NonLeadRecap = { username?: string; user_id?: string; name?: string; reason: string }

export type SommarioRecap = {
  conversations: number
  leads_in_target: number
  awaiting_reply: number
  calls_booked: number
  lost: number
}

export type GeneratoCon = { modello: string; effort: string; versione_prompt: string; servito_da_fallback: boolean }

export type StatoRecap = 'completo' | 'parziale'

export type RecapCanale = {
  /** 'YYYY-MM-DD', the Rome day */
  date: string
  /** ISO UTC, the start of the run */
  generated_at: string
  window_hours: 24
  headline: string
  summary: SommarioRecap
  leads: LeadRecap[]
  reactivate: RiattivazioneRecap[]
  objections: ObiezioneRecap[]
  content: ContentRecap
  non_leads: NonLeadRecap[]
  /** Instagram document only */
  agenda?: AgendaRecap[]
  /** Instagram document only */
  show_up?: ShowUpRecap[]
  /** additive: chats left out by the settings, only their number (D5) */
  escluse: number
  /** additive */
  stato: StatoRecap
  /** additive: fixed Italian sentences, shown to the admin only */
  avvisi: string[]
  /** additive */
  generato_con: GeneratoCon
}

/** additive size rule: each document stays under this (unione.ts trims the low-priority messages) */
export const RECAP_MAX_BYTE = 400_000

/** The key of a lead for Fatto and the lists: username, PSID or conversation id (the artifact's keyOf). */
export function chiaveLead(l: { username?: string | null; user_id?: string | null; conversation_id?: string | null }): string {
  return String(l.username || l.user_id || l.conversation_id || '')
}

const formatoOra = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 'GG/MM HH:MM' in Europe/Rome from an ISO instant ('' when it is not one): the `time` of a message. */
export function formattaOraRecap(iso: string): string {
  const istante = new Date(iso)
  if (!iso || Number.isNaN(istante.getTime())) return ''
  const p = Object.fromEntries(formatoOra.formatToParts(istante).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`
}

// ---------- the tolerant reading of the page ----------

const testo = z.string().catch('')
const testoFacoltativo = z.string().optional().catch(undefined)
const numero = z.number().finite().catch(0)
const numeroONull = z.number().finite().nullable().catch(null)
const veroFacoltativo = z.literal(true).optional().catch(undefined)

/** A list whose unreadable items are dropped one by one; not a list: []. */
function elenco<T extends z.ZodTypeAny>(voce: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((voci): z.output<T>[] =>
      voci.flatMap((v) => {
        const letta = voce.safeParse(v)
        return letta.success ? [letta.data as z.output<T>] : []
      }),
    )
}

const minuscolo = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v)

const messaggioSchema = z.object({
  from: z.enum(['lead', 'alpha']).catch('lead'),
  time: testo,
  text: testo,
  at: testo,
})

const origineSchema = z
  .object({
    tipo: z.enum(['condivisione', 'parola_chiave', 'storia', 'testo']),
    shortcode: testoFacoltativo,
    permalink: testoFacoltativo,
    data: testoFacoltativo,
    tipo_post: z.enum(['reel', 'post', 'carosello']).optional().catch(undefined),
    hook: testoFacoltativo,
    parola: testoFacoltativo,
  })
  .optional()
  .catch(undefined)

const campiLead = {
  username: testoFacoltativo,
  user_id: testoFacoltativo,
  conversation_id: testo,
  name: testo,
  age: testo,
  priority: z.preprocess(minuscolo, z.enum(['alta', 'media', 'bassa'])).catch('bassa'),
  target: z.enum(['si', 'no', 'da verificare']).catch('da verificare'),
  stage: testo,
  status: testo,
  situation: testo,
  pain: testo,
  next_action: testo,
  suggested_message: testo,
  suggested_message_alt: testo,
  alt_condition: testo,
  needs_dany: testo,
  flow: z.enum(['inbound', 'outbound', '']).catch(''),
  source: testo,
  topics: elenco(z.string()),
  last_from: z.enum(['lead', 'alpha']).optional().catch(undefined),
  last_message_at: testo,
  messages: elenco(messaggioSchema),
  analisi_mancante: veroFacoltativo,
  da_ricontrollare: testoFacoltativo,
  origine: origineSchema,
  minore_14: veroFacoltativo,
}

/** last_from missing: the author of the last message, as the artifact does; no message: ours (no wait). */
function conUltimoDa<T extends { last_from?: DaChi; messages: MessaggioRecap[] }>(l: T): Omit<T, 'last_from'> & { last_from: DaChi } {
  return { ...l, last_from: l.last_from ?? l.messages.at(-1)?.from ?? 'alpha' }
}

const leadSchema = z.object(campiLead).transform(conUltimoDa)

/** The artifact's stepOf: the step written, or from the days of silence (10: 3, 5: 2, else 1). */
export function passoDiRiattivazione(step: unknown, giorniSilenzio: number): PassoRiattivazione {
  const n = Number(step)
  if (n === 1 || n === 2 || n === 3) return n
  return giorniSilenzio >= 10 ? 3 : giorniSilenzio >= 5 ? 2 : 1
}

const riattivazioneSchema = z
  .object({ ...campiLead, days_silent: numero, step: z.unknown() })
  .transform((l) => ({ ...conUltimoDa(l), step: passoDiRiattivazione(l.step, l.days_silent) }))

const obiezioneSchema = z.object({
  username: testoFacoltativo,
  user_id: testoFacoltativo,
  name: testoFacoltativo,
  text: testo,
  suggested_reply: testo,
})

const agendaSchema = z.object({
  call_id: testo,
  day: z.enum(['oggi', 'domani']),
  time: testo,
  name: testo,
  username: testo,
  meet_link: testo,
  status: testo,
  note: testo,
  suggested_message: testo,
  channel: z.literal('Messenger').optional().catch(undefined),
  user_id: testoFacoltativo,
})

const showUpSchema = z.object({
  call_id: testo,
  day: z.literal('ieri').catch('ieri'),
  time: testo,
  name: testo,
  username: testo,
  outcome: testo,
  note: testo,
  suggested_message: testo,
})

const temaSchema = z.object({
  theme: testo,
  count: numero,
  target_count: numero,
  calls: numero,
  trend: testo,
  insight: testo,
})

const postSchema = z.object({
  permalink: testo,
  date: testo,
  type: testo,
  hook: testo,
  views: numeroONull,
  saved: numeroONull,
  shares: numeroONull,
  dm: numero,
  target: numero,
  verdict: z.string().nullable().catch(null),
  why: testo,
  shortcode: testoFacoltativo,
  call: z.number().finite().optional().catch(undefined),
})

const CONTENT_VUOTO: ContentRecap = {
  period: '',
  based_on: 0,
  note: '',
  themes: [],
  posts: [],
  keep: [],
  change: [],
  boost: [],
  setting_tips: [],
  ideas: [],
}

const contentSchema = z
  .object({
    period: testo,
    based_on: numero,
    note: testo,
    themes: elenco(temaSchema),
    posts: elenco(postSchema),
    keep: elenco(z.string()),
    change: elenco(z.string()),
    boost: elenco(z.string()),
    setting_tips: elenco(z.string()),
    ideas: elenco(z.object({ hook: testo, format: testo, why: testo })),
    storie: z.object({ dm: numero, target: numero }).optional().catch(undefined),
  })
  .catch(CONTENT_VUOTO)

const SOMMARIO_VUOTO: SommarioRecap = { conversations: 0, leads_in_target: 0, awaiting_reply: 0, calls_booked: 0, lost: 0 }
const GENERATO_CON_VUOTO: GeneratoCon = { modello: '', effort: '', versione_prompt: '', servito_da_fallback: false }

/** The tolerant schema of a recap document: never fails on an object. */
export const recapSchema = z.object({
  date: testo,
  generated_at: testo,
  window_hours: z.literal(24).catch(24),
  headline: testo,
  summary: z
    .object({
      conversations: numero,
      leads_in_target: numero,
      awaiting_reply: numero,
      calls_booked: numero,
      lost: numero,
    })
    .catch(SOMMARIO_VUOTO),
  leads: elenco(leadSchema),
  reactivate: elenco(riattivazioneSchema),
  objections: elenco(obiezioneSchema),
  content: contentSchema,
  non_leads: elenco(z.object({ username: testoFacoltativo, user_id: testoFacoltativo, name: testoFacoltativo, reason: testo })),
  agenda: elenco(agendaSchema),
  show_up: elenco(showUpSchema),
  escluse: numero,
  stato: z.enum(['completo', 'parziale']).catch('completo'),
  avvisi: elenco(z.string()),
  generato_con: z
    .object({
      modello: testo,
      effort: testo,
      versione_prompt: testo,
      servito_da_fallback: z.boolean().catch(false),
    })
    .catch(GENERATO_CON_VUOTO),
})

/** A recap as the page reads it: a RecapCanale, with agenda and show_up always there ([] when absent). */
export type RecapLetto = z.output<typeof recapSchema>

/** insight_recap.dati as the page reads it; null when it is not even an object. */
export function leggiRecap(dati: unknown): RecapLetto | null {
  if (dati === null || typeof dati !== 'object' || Array.isArray(dati)) return null
  const letto = recapSchema.safeParse(dati)
  return letto.success ? letto.data : null
}
