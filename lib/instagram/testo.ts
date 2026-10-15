import type { ConversazioneGraph, MessaggioGraph, AllegatoGraph, StoriaGraph } from '@/lib/instagram/graph'
import type { ChatSalvata, MessaggioChat } from '@/lib/insight/contratti'
import { shortcodeInstagram } from '@/lib/marketing/shortcode'
import { contieneLinkCall, normalizzaUsername } from '@/lib/setting/conteggio-dm'

/**
 * From the messages Meta gives to the messages the Insight keeps (1.35.0,
 * CLAUDE.md section 29): pure functions, no I/O. The DM Reader's Italian
 * labels for what is not text (the playbook reads them literally, «[contenuto
 * non supportato dall'API]» first of all), with three differences:
 * - a story reply is «[risposta a una storia]», never its link (a CDN asset
 *   that expires, someone else's content); its shortcode is kept when the
 *   story is one of the account's posts (shortcodeInstagram);
 * - a shared link is written only when it is an instagram.com one, without
 *   its query (the share id says who shared it); any other link is
 *   «[contenuto condiviso]»;
 * - a message Meta did not give is «[non leggibile]», never the error.
 * The text the person wrote is kept as written, cleaned only of control and
 * direction characters and cut at 2000 characters (Messenger's own limit).
 *
 * The shortcodes come from shortcodeInstagram (lib/marketing/shortcode.ts),
 * the one join key with instagram_contenuti: never a regex of our own.
 *
 * Messenger's messages have the same shape (lib/messenger/graph.ts reads them
 * and builds its chats with descriviMessaggio and chatDaMessaggi).
 */

/** The labels, as the DM Reader writes them. */
export const ETICHETTE = {
  vocale: '[messaggio vocale]',
  video: '[video]',
  immagine: '[immagine]',
  template: '[template]',
  file: '[file]',
  allegato: '[allegato]',
  rispostaStoria: '[risposta a una storia]',
  menzioneStoria: '[menzione in una storia]',
  condiviso: '[contenuto condiviso]',
  sticker: '[sticker]',
  nonSupportato: "[contenuto non supportato dall'API]",
  nonLeggibile: '[non leggibile]',
  nonDisponibile: '[contenuto non disponibile]',
} as const

/** A shared instagram.com link, written in the text. */
export function etichettaCondiviso(link: string): string {
  return `[contenuto condiviso: ${link}]`
}

/** Meta returns at most the last 20 messages of a chat (MESSAGGI_MAX of the readers). */
export const MESSAGGI_LETTI_MAX = 20
/** No stored message is older than this (D13). */
export const GIORNI_MESSAGGI = 30
/** The text of one message, in code points (Messenger's own limit; Instagram's is 1000). */
export const TESTO_MAX = 2000

/** What descriviMessaggio reads of a message: Instagram's or Messenger's. */
export type MessaggioDaDescrivere = {
  created_time?: string
  message?: string
  attachments?: { data?: (AllegatoGraph | null)[] }
  story?: StoriaGraph
  shares?: { data?: ({ link?: string } | null)[] }
  sticker?: unknown
  is_unsupported?: boolean
  non_leggibile?: true
}

/** A chat as the reading hands it over: the columns of insight_chat that come from Meta. */
export type ChatTesto = Pick<
  ChatSalvata,
  | 'conversazione_id'
  | 'username'
  | 'utente_id'
  | 'nome'
  | 'aggiornata_il'
  | 'messaggi'
  | 'messaggi_letti'
  | 'completa'
  | 'ultimo_da'
  | 'ultimo_il'
  | 'calendly_inviato_il'
  | 'codici_condivisi'
>

const HOST_INSTAGRAM = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am', 'www.instagr.am'])
/** A link inside a text (the shortcode, if any, is shortcodeInstagram's). */
const LINK_NEL_TESTO = /https?:\/\/[^\s<>"']+/gi

/** A time of Meta's ('2026-10-07T20:00:00+0000') as ISO UTC; null when it is not one. */
export function istanteISO(valore: unknown): string | null {
  if (typeof valore !== 'string' || valore === '') return null
  const ms = Date.parse(valore)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** A code point that never belongs in a stored text: controls (but tab and line feed) and direction overrides. */
function daTogliere(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a) return false
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true
  // bidirectional embeddings, overrides and isolates: they reorder what is shown
  return (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)
}

/**
 * The text as written, cleaned: line breaks as \n, no control or direction
 * characters, trimmed, at most TESTO_MAX code points. Emoji and their joiners
 * stay. Empty: null.
 */
export function pulisciTesto(valore: unknown): string | null {
  if (typeof valore !== 'string') return null
  let out = ''
  for (const carattere of valore.replace(/\r\n?/g, '\n')) {
    if (!daTogliere(carattere.codePointAt(0) ?? 0)) out += carattere
  }
  out = out.trim()
  if (out === '') return null
  // fewer UTF-16 units than the limit: fewer code points too
  if (out.length > TESTO_MAX) {
    const caratteri = [...out]
    if (caratteri.length > TESTO_MAX) out = `${caratteri.slice(0, TESTO_MAX - 1).join('').trimEnd()}…`
  }
  return out
}

/**
 * A shared link as it may be written: only an instagram.com one, without its
 * query and fragment; null for any other (a CDN asset, a site).
 */
export function linkInstagram(valore: unknown): string | null {
  if (typeof valore !== 'string' || valore.length > 2000) return null
  try {
    const u = new URL(valore.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!HOST_INSTAGRAM.has(u.hostname.toLowerCase())) return null
    return `https://${u.hostname.toLowerCase()}${u.pathname}`
  } catch {
    return null
  }
}

/** The shortcode of a link, when it is a post, a reel or an IGTV of instagram.com. */
function codiceDi(link: unknown): string | null {
  return typeof link === 'string' ? shortcodeInstagram(link.trim()) : null
}

/** The label of an attachment, as the DM Reader decides it. */
function etichettaAllegato(a: AllegatoGraph): string {
  const mime = typeof a.mime_type === 'string' ? a.mime_type : ''
  if (a.audio_data || mime.startsWith('audio')) return ETICHETTE.vocale
  if (a.video_data || mime.startsWith('video')) return ETICHETTE.video
  if (a.image_data || mime.startsWith('image')) return ETICHETTE.immagine
  if (a.generic_template) return ETICHETTE.template
  if (a.file_url) return ETICHETTE.file
  return ETICHETTE.allegato
}

/**
 * One message as stored: who wrote it (`nostro`: the account, or the Page),
 * when (ISO UTC), the text and the labels in the DM Reader's order (text,
 * attachments, story, shares, sticker, unsupported, unreadable; nothing at
 * all: «[contenuto non disponibile]»), the shortcodes it shares (links in the
 * text and shared links) or the story it answers, and whether it is about a
 * story. Null when Meta gave no valid time: it cannot be placed in the chat.
 */
export function descriviMessaggio(m: MessaggioDaDescrivere, nostro: boolean): MessaggioChat | null {
  const il = istanteISO(m.created_time)
  if (!il) return null
  const parti: string[] = []
  const codici: string[] = []
  const aggiungiCodice = (codice: string | null) => {
    if (codice && !codici.includes(codice)) codici.push(codice)
  }

  const testo = pulisciTesto(m.message)
  if (testo) {
    parti.push(testo)
    for (const link of testo.match(LINK_NEL_TESTO) ?? []) aggiungiCodice(codiceDi(link))
  }

  for (const a of m.attachments?.data ?? []) {
    if (a && typeof a === 'object') parti.push(etichettaAllegato(a))
  }

  const storia = Boolean(m.story?.reply_to || m.story?.mention)
  if (m.story?.reply_to) {
    parti.push(ETICHETTE.rispostaStoria)
    aggiungiCodice(codiceDi(m.story.reply_to.link))
  }
  if (m.story?.mention) {
    parti.push(ETICHETTE.menzioneStoria)
    aggiungiCodice(codiceDi(m.story.mention.link))
  }

  for (const s of m.shares?.data ?? []) {
    if (!s || typeof s !== 'object') continue
    const link = linkInstagram(s.link)
    parti.push(link ? etichettaCondiviso(link) : ETICHETTE.condiviso)
    aggiungiCodice(codiceDi(s.link))
  }

  if (m.sticker) parti.push(ETICHETTE.sticker)
  if (m.is_unsupported === true) parti.push(ETICHETTE.nonSupportato)
  if (m.non_leggibile === true) parti.push(ETICHETTE.nonLeggibile)
  if (parti.length === 0) parti.push(ETICHETTE.nonDisponibile)

  return { da: nostro ? 'alpha' : 'lead', il, testo: parti.join(' '), codici, storia }
}

/** Who wrote a message: the account, by username (by id only when Meta gives no username). */
export function scrittoDa(account: { username: string; id: string | null }) {
  return (m: MessaggioGraph): boolean => {
    const username = normalizzaUsername(m.from?.username)
    if (username) return username === account.username
    return Boolean(account.id && m.from?.id && String(m.from.id) === account.id)
  }
}

/** The lead's username, only to leave out the excluded accounts; never kept. */
export function usernameDelLead(
  conversazione: ConversazioneGraph,
  messaggi: readonly MessaggioGraph[],
  account: string,
  nostro: (m: MessaggioGraph) => boolean,
): string | null {
  const candidati = [
    ...(conversazione.participants?.data ?? []).map((p) => p?.username),
    ...messaggi.filter((m) => !nostro(m)).map((m) => m.from?.username),
    ...messaggi.filter(nostro).flatMap((m) => (m.to?.data ?? []).map((p) => p?.username)),
  ]
  for (const c of candidati) {
    const u = normalizzaUsername(c)
    if (u && u !== account) return u
  }
  return null
}

/** The lead's Instagram-scoped id (digits): from the participants, then from the messages. */
function idDelLead(
  conversazione: ConversazioneGraph,
  messaggi: readonly MessaggioGraph[],
  account: { username: string; id: string | null },
  nostro: (m: MessaggioGraph) => boolean,
): string | null {
  const altro = (p: { username?: string; id?: string } | null | undefined) => {
    if (!p) return null
    const id = typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id) : null
    if (!id || !/^[0-9]{1,30}$/.test(id) || id === account.id) return null
    const username = normalizzaUsername(p.username)
    return username === account.username ? null : id
  }
  const candidati = [
    ...(conversazione.participants?.data ?? []),
    ...messaggi.filter((m) => !nostro(m) && !m.non_leggibile).map((m) => m.from),
    ...messaggi.filter(nostro).flatMap((m) => m.to?.data ?? []),
  ]
  for (const c of candidati) {
    const id = altro(c)
    if (id) return id
  }
  return null
}

/** A message described, and whether its author is known (an unreadable one has no `from`). */
export type MessaggioLetto = { messaggio: MessaggioChat; autoreNoto: boolean; calendly: boolean }

/**
 * Describes Meta's messages of one chat (most recent first, as Meta gives
 * them) and puts them oldest first; equal instants keep their order. Messages
 * without a valid time are left out.
 */
export function messaggiInOrdine<M extends MessaggioDaDescrivere>(
  messaggi: readonly M[],
  nostro: (m: M) => boolean,
  autoreNoto: (m: M) => boolean,
): MessaggioLetto[] {
  const letti: MessaggioLetto[] = []
  for (const m of [...messaggi].reverse()) {
    const mio = nostro(m)
    const messaggio = descriviMessaggio(m, mio)
    if (!messaggio) continue
    const calendly = mio && (contieneLinkCall(m.message) || (m.shares?.data ?? []).some((s) => contieneLinkCall(s?.link)))
    letti.push({ messaggio, autoreNoto: autoreNoto(m), calendly })
  }
  // a stable sort: Meta's order for equal instants, reversed like the messages
  return letti
    .map((l, i) => ({ l, i, t: Date.parse(l.messaggio.il) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.l)
}

/**
 * The columns of a chat that come from its messages: oldest first, complete
 * when fewer than 20 were read (its start is visible), the last word (of a
 * known author), the last time we sent the call link, the shortcodes shared.
 */
export function chatDaMessaggi(
  letti: readonly MessaggioLetto[],
  quantiLetti: number,
): Pick<ChatTesto, 'messaggi' | 'messaggi_letti' | 'completa' | 'ultimo_da' | 'ultimo_il' | 'calendly_inviato_il' | 'codici_condivisi'> {
  const messaggi = letti.map((l) => l.messaggio)
  const noti = letti.filter((l) => l.autoreNoto)
  const ultimo = (noti.length > 0 ? noti : letti).at(-1)?.messaggio ?? null
  const calendly = letti.filter((l) => l.calendly).at(-1)?.messaggio.il ?? null
  const codici: string[] = []
  for (const m of messaggi) for (const c of m.codici) if (!codici.includes(c)) codici.push(c)
  const n = Math.max(0, Math.floor(quantiLetti))
  return {
    messaggi,
    messaggi_letti: n,
    completa: n < MESSAGGI_LETTI_MAX,
    ultimo_da: ultimo?.da ?? null,
    ultimo_il: ultimo?.il ?? null,
    calendly_inviato_il: calendly,
    codici_condivisi: codici,
  }
}

/**
 * An Instagram chat as the Insight keeps it, from what creaGraph(…).messaggi
 * read: the lead's username and id (never the account's), the messages oldest
 * first with their labels and codes. The name comes from the profile, not
 * from here. Older messages are dropped before storing (senzaVecchi).
 */
export function versoChatTesto(
  conversazione: ConversazioneGraph,
  letti: { messaggi: readonly MessaggioGraph[]; letti: number },
  account: { username: string; id: string | null },
): ChatTesto {
  const nostro = scrittoDa(account)
  const inOrdine = messaggiInOrdine(letti.messaggi, nostro, (m) => !m.non_leggibile && Boolean(m.from?.username || m.from?.id))
  return {
    conversazione_id: conversazione.id,
    username: usernameDelLead(conversazione, letti.messaggi, account.username, nostro),
    utente_id: idDelLead(conversazione, letti.messaggi, account, nostro),
    nome: null,
    aggiornata_il: istanteISO(conversazione.updated_time),
    ...chatDaMessaggi(inOrdine, letti.letti),
  }
}

/** The messages of the last 30 days (D13): no stored message is older. */
export function senzaVecchi<M extends Pick<MessaggioChat, 'il'>>(messaggi: readonly M[], adesso: Date): M[] {
  const dal = adesso.getTime() - GIORNI_MESSAGGI * 86_400_000
  return messaggi.filter((m) => {
    const t = Date.parse(m.il)
    return Number.isFinite(t) && t >= dal
  })
}
