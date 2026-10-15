import type { FasciaEta, SchedaSalvata } from '@/lib/insight/contratti'
import type { CampoCorrezione, TestoDaCorreggere } from '@/lib/insight/prompt/dati'
import type { Correzione, DatiAgenda, DatiSchedaLead, DatiShowUp } from '@/lib/insight/verifica'

/**
 * The final check of the Insight (1.35.0, CLAUDE.md section 29): every message
 * Claude suggests passes through code before it reaches the page, whatever the
 * model wrote (a lead may have tried to steer it, D24, risk 5).
 *
 * - Normalizations, silent: the long and medium dash become a comma, «fammi un
 *   attimo» becomes «dammi un attimo», a new line after every sentence (the
 *   setter's instructions: «a capo dopo ogni punto»).
 * - Safety, the message is removed (next_action says to write it by hand): a
 *   link other than Dany's Calendly; a price, except the setter's
 *   qualification of minors between 14 and 17 («100 euro al mese», C6; the
 *   ICP's prices never: N10); any proposal to a lead under 14.
 * - Style, sent back to Claude once (the correzione step), then shown with
 *   «Da ricontrollare»: «Dany» in the third person, more than one question
 *   (two only when the second asks the age), the Calendly and «Ti andrebbe?»
 *   in the same message, «Capito» as an opener, «60 minuti», «oggi o domani»
 *   with the video call, a time of day proposed to a lead without a call.
 * - The content part never names a lead: usernames and profile names of the
 *   run's chats become «un lead».
 *
 * Pure: no I/O.
 */

export const CALENDLY = 'https://calendly.com/danielemontagnolo/coaching-call'

export type DoveMessaggio = 'lead' | 'obiezione' | 'agenda' | 'show_up'

export type ContestoMessaggio = {
  dove: DoveMessaggio
  fascia_eta?: FasciaEta | null
  /** the lead has a booked call (a call in the app, or the stage says so): a time is allowed */
  conCall?: boolean
}

export type EsitoControllo = {
  testo: string
  /** why the message cannot be shown, or null */
  sicurezza: string | null
  /** the style violations left, in words */
  stile: string[]
  /** how many normalizations were applied (logged as a count only) */
  normalizzazioni: number
}

export const MOTIVI_SICUREZZA = {
  link: 'link diverso dal Calendly',
  prezzo: 'prezzo nel messaggio',
  minore: 'proposta a un minore sotto i 14 anni',
} as const

export const VIOLAZIONI_STILE = {
  terzaPersona: 'Dany in terza persona',
  domande: 'più di una domanda',
  calendlyEPitch: 'Calendly e «Ti andrebbe?» nello stesso messaggio',
  capito: '«Capito» in apertura',
  sessantaMinuti: '«60 minuti» invece della mezz’ora',
  oggiODomani: '«oggi o domani» con la videochiamata',
  orario: 'orario proposto nei DM',
} as const

/** «Messaggio non mostrato: [motivo]. Scrivilo a mano.» */
export function messaggioNonMostrato(motivo: string): string {
  return `Messaggio non mostrato: ${motivo}. Scrivilo a mano.`
}

// ---------------------------------------------------------------------------
// Normalizations
// ---------------------------------------------------------------------------

const RE_TRATTINO = /[ \t]*[—–][ \t]*/g
/** A sentence end, then a capital or an emoji that has more text after it (a closing emoji stays on its line). */
const RE_FINE_FRASE = /([.!?…])[ \t]+(?=\p{Lu}|\p{Extended_Pictographic}\uFE0F?[ \t]*[^\s])/gu
const RE_FAMMI = /\b([Ff])ammi un attimo\b/g

export function normalizzaMessaggio(testo: string): { testo: string; normalizzazioni: number } {
  let n = 0
  let t = testo.replace(RE_TRATTINO, (trattino, inizio: number, tutto: string) => {
    n++
    const prima = tutto[inizio - 1] ?? ''
    const dopo = tutto[inizio + trattino.length] ?? ''
    if (/\d/.test(prima) && /\d/.test(dopo)) return '-'
    if (prima === '' || prima === '\n') return ''
    return ', '
  })
  t = t.replace(RE_FAMMI, (_, f: string) => {
    n++
    return `${f === 'F' ? 'D' : 'd'}ammi un attimo`
  })
  t = t.replace(RE_FINE_FRASE, (_, fine: string) => {
    n++
    return `${fine}\n`
  })
  t = t
    .split('\n')
    .map((r) => r.replace(/[ \t]+$/u, ''))
    .join('\n')
    .trim()
  return { testo: t, normalizzazioni: n }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const RE_URL =
  /\bhttps?:\/\/[^\s<>"'()\]]+|\bwww\.[^\s<>"'()\]]+|\b(?:[a-z0-9-]+\.)+(?:com|it|net|org|io|me|ly|app|co|eu|info|biz|xyz|link|site|online|shop|store|test|gg|tv)\b(?:\/[^\s<>"'()\]]*)?/giu

/** The links of a text other than Dany's Calendly (with or without https, www or the final slash). */
export function linkEstranei(testo: string): string[] {
  const ammessi = new Set(['calendly.com/danielemontagnolo/coaching-call'])
  return [...testo.matchAll(RE_URL)]
    .map((m) => m[0].replace(/[.,;:!?…]+$/u, ''))
    .filter((url) => {
      const nudo = url
        .toLowerCase()
        .replace(/^https?:\/\//u, '')
        .replace(/^www\./u, '')
        .replace(/\/+$/u, '')
      return !ammessi.has(nudo)
    })
}

const RE_PREZZO = /€|\beuro\b|\beur\b/iu
/** The only price the setter's instructions allow in a DM: the qualification of minors (14 to 17). */
const RE_QUALIFICA_MINORI = /investimento di 100 euro al mese/iu

function haPrezzoNonAmmesso(testo: string, fascia: FasciaEta | null | undefined): boolean {
  const prezzi = testo.match(new RegExp(RE_PREZZO.source, 'giu'))?.length ?? 0
  if (prezzi === 0) return false
  const qualifica = fascia === '14_17' && prezzi === 1 && RE_QUALIFICA_MINORI.test(testo) && /genitori/iu.test(testo)
  return !qualifica
}

const RE_PROPOSTA = /calendly|videochiamat|\bcall\b|percorso|\b1\s*[-:]\s*1\b|investimento|prenot|\blink\b/iu

const RE_DANY = /\bDany\b/gu
const RE_ETA = /\banni\b|\bet[àa]\b/iu
const RE_ORARIO = /\balle\s+(?:ore\s+)?\d{1,2}(?:[:.][0-5]\d)?\b|\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/iu

function domandeOltreLaPrima(testo: string): boolean {
  const domande = testo
    .split(/(?<=\?+)/u)
    .filter((parte) => parte.includes('?'))
    .map((parte) => parte.trim())
  if (domande.length <= 1) return false
  if (domande.length === 2 && RE_ETA.test(domande[1])) return false
  return true
}

function terzaPersona(testo: string): boolean {
  for (const m of testo.matchAll(RE_DANY)) {
    const prima = testo.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0)
    if (!/\bsono\s+$/iu.test(prima)) return true
  }
  return false
}

/** One message through the final check: normalized, then the safety and style rules. */
export function controllaMessaggio(testo: string, contesto: ContestoMessaggio): EsitoControllo {
  const { testo: t, normalizzazioni } = normalizzaMessaggio(testo)
  if (t === '') return { testo: '', sicurezza: null, stile: [], normalizzazioni }

  let sicurezza: string | null = null
  if (linkEstranei(t).length > 0) sicurezza = MOTIVI_SICUREZZA.link
  else if (contesto.fascia_eta === 'sotto_14' && (RE_PROPOSTA.test(t) || RE_PREZZO.test(t))) sicurezza = MOTIVI_SICUREZZA.minore
  else if (haPrezzoNonAmmesso(t, contesto.fascia_eta)) sicurezza = MOTIVI_SICUREZZA.prezzo

  const stile: string[] = []
  if (terzaPersona(t)) stile.push(VIOLAZIONI_STILE.terzaPersona)
  if (domandeOltreLaPrima(t)) stile.push(VIOLAZIONI_STILE.domande)
  if (/calendly\.com/iu.test(t) && /ti andrebbe/iu.test(t)) stile.push(VIOLAZIONI_STILE.calendlyEPitch)
  if (/^\s*capito\b/iu.test(t)) stile.push(VIOLAZIONI_STILE.capito)
  if (/\b60\s*minuti\b/iu.test(t)) stile.push(VIOLAZIONI_STILE.sessantaMinuti)
  if (/videochiamat/iu.test(t) && /oggi o domani|tra oggi e i prossimi giorni/iu.test(t)) stile.push(VIOLAZIONI_STILE.oggiODomani)
  const orarioAmmesso = contesto.dove === 'agenda' || contesto.dove === 'show_up' || contesto.conCall === true
  if (!orarioAmmesso && RE_ORARIO.test(t)) stile.push(VIOLAZIONI_STILE.orario)

  return { testo: t, sicurezza, stile, normalizzazioni }
}

// ---------------------------------------------------------------------------
// Names out of the content part
// ---------------------------------------------------------------------------

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/**
 * Every username and profile name of the run's chats (at least 4 characters,
 * whole word, any case, with or without @) becomes «un lead».
 */
export function oscuraNomi(testo: string, nomi: readonly (string | null | undefined)[]): string {
  const cercati = [...new Set(nomi.map((n) => (n ?? '').trim().replace(/^@/u, '')).filter((n) => [...n].length >= 4))]
    .sort((a, b) => b.length - a.length)
  if (cercati.length === 0 || !testo) return testo
  const re = new RegExp(`(?<![\\p{L}\\p{N}_.])@?(?:${cercati.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  return testo.replace(re, 'un lead')
}

// ---------------------------------------------------------------------------
// The cards: what goes to the correction step, and the corrections back
// ---------------------------------------------------------------------------

type DatiCard = Record<string, unknown>

function dati(s: SchedaSalvata): DatiCard {
  return s.dati !== null && typeof s.dati === 'object' ? (s.dati as DatiCard) : {}
}

const FASI_CON_CALL = new Set(['call prenotata', 'nurture'])

/** The messages of a card and where each one is checked. */
function messaggiDellaScheda(s: SchedaSalvata): { campo: CampoCorrezione; testo: string; contesto: ContestoMessaggio }[] {
  const d = dati(s)
  if (s.tipo === 'agenda') return [{ campo: 'agenda', testo: String(d.suggested_message ?? ''), contesto: { dove: 'agenda' } }]
  if (s.tipo === 'show_up') return [{ campo: 'show_up', testo: String(d.suggested_message ?? ''), contesto: { dove: 'show_up' } }]
  if (d.tipo !== 'lead' || d.analisi_mancante === true || d.minore_14 === true) return []
  const lead = d as Partial<DatiSchedaLead>
  const contesto: ContestoMessaggio = {
    dove: 'lead',
    fascia_eta: lead.fascia_eta ?? null,
    conCall: FASI_CON_CALL.has(String(lead.stage ?? '')),
  }
  return [
    { campo: 'suggested_message', testo: lead.suggested_message ?? '', contesto },
    { campo: 'suggested_message_alt', testo: lead.suggested_message_alt ?? '', contesto },
    { campo: 'suggested_reply', testo: lead.objection?.suggested_reply ?? '', contesto: { ...contesto, dove: 'obiezione' } },
  ]
}

/**
 * The texts of the run's cards that break a style rule (never the unsafe
 * ones: those are removed, not corrected): one correzione block sends them
 * back to Claude with their violations.
 */
export function daCorreggere(schede: readonly SchedaSalvata[]): TestoDaCorreggere[] {
  const out: TestoDaCorreggere[] = []
  for (const s of schede) {
    for (const m of messaggiDellaScheda(s)) {
      if (!m.testo.trim()) continue
      const esito = controllaMessaggio(m.testo, m.contesto)
      if (esito.sicurezza === null && esito.stile.length > 0) {
        out.push({ tipo: s.tipo, chiave: s.chiave, campo: m.campo, testo: m.testo, violazioni: esito.stile })
      }
    }
  }
  return out
}

/** The cards with the corrected texts in place (the correction step's answer). */
export function applicaCorrezioni(schede: readonly SchedaSalvata[], correzioni: readonly Correzione[]): SchedaSalvata[] {
  if (correzioni.length === 0) return [...schede]
  const perChiave = new Map(correzioni.map((c) => [`${c.tipo}|${c.chiave}|${c.campo}`, c.testo]))
  return schede.map((s) => {
    const d = dati(s)
    const corretto = (campo: CampoCorrezione) => perChiave.get(`${s.tipo}|${s.chiave}|${campo}`)
    if (s.tipo === 'agenda' || s.tipo === 'show_up') {
      const t = corretto(s.tipo)
      return t === undefined ? s : { ...s, dati: { ...(d as DatiAgenda | DatiShowUp), suggested_message: t } }
    }
    if (d.tipo !== 'lead') return s
    const lead = d as DatiSchedaLead
    const msg = corretto('suggested_message')
    const alt = corretto('suggested_message_alt')
    const risposta = corretto('suggested_reply')
    if (msg === undefined && alt === undefined && risposta === undefined) return s
    return {
      ...s,
      dati: {
        ...lead,
        ...(msg !== undefined ? { suggested_message: msg } : {}),
        ...(alt !== undefined ? { suggested_message_alt: alt } : {}),
        ...(risposta !== undefined && lead.objection ? { objection: { ...lead.objection, suggested_reply: risposta } } : {}),
      },
    }
  })
}
