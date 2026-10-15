import { giornoRoma } from '@/lib/setting/conteggio-dm'
import type { ChatSalvata, MessaggioChat, OrigineChat, OrigineDaCodice, OrigineDalModello, PostInsight, PostPerAnalisi } from '@/lib/insight/contratti'

/**
 * Where a lead comes from (1.35.0, D26; Dany, 10/10/2026: «incrocia lo status
 * dei lead che stanno arrivando»). Code first, the model last, and only for a
 * complete chat (fewer than 20 messages read: its start is visible), from the
 * lead's first 3 messages, in this order:
 *   1. condivisione: he shares one of Dany's posts (its shortcode, from
 *      shortcodeInstagram, is in instagram_contenuti);
 *   2. parola_chiave: he writes the keyword a caption asks for («Scrivimi
 *      "ALPHA" in DM»): the most recent post with that keyword published
 *      before his message;
 *   3. storia: he answers a story (a post only when Meta's story link is one
 *      of Dany's posts);
 *   4. testo: the post Claude says he cites (the card's post_ref), only when
 *      nothing above found one.
 * The arrival day is the Rome day of the chat's first message: the day the
 * counts per post go to (instagram_contenuti_dm, D27). An origin is frozen
 * once found (insight_chat.origine_*): these functions only find it.
 *
 * Pure: no I/O, no clock but the one passed in.
 */

/** How many of the lead's first messages say where he comes from. */
export const PRIMI_MESSAGGI_LEAD = 3

const VERBI_RICHIESTA = ['scrivi', 'scrivimi', 'commenta', 'manda', 'mandami', 'invia', 'inviami', 'dm', 'direct']
/** How far after the verb the keyword can be, in characters. */
const DISTANZA_PAROLA = 30

const RE_VERBO = new RegExp(`(?<![\\p{L}\\p{N}])(?:${VERBI_RICHIESTA.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
/** A word in quotes: «…», "…", “…”, '…', 2 to 30 letters or digits. */
const RE_TRA_VIRGOLETTE = /(?:«([\p{L}\p{N}]{2,30})»|"([\p{L}\p{N}]{2,30})"|“([\p{L}\p{N}]{2,30})”|'([\p{L}\p{N}]{2,30})')/u
/** A word in capitals, 3 to 20 letters (DM itself is 2: never a keyword). */
const RE_MAIUSCOLA = /(?<![\p{L}\p{N}])(\p{Lu}{3,20})(?![\p{L}\p{N}])/u

/** Lower case, no accents: «Alpha», «ALPHA» and «àlpha» compare equal. */
export function normalizzaParola(testo: string): string {
  return testo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** The words of a text, normalized, split on anything that is not a letter or a digit. */
function paroleDi(testo: string): string[] {
  return normalizzaParola(testo).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

/**
 * The keywords a caption asks to write: after «scrivi», «scrivimi»,
 * «commenta», «manda», «mandami», «invia», «inviami», «DM» or «direct», within
 * 30 characters, a word in quotes or a word in capitals. As written in the
 * caption, without repetitions.
 */
export function paroleChiave(didascalia: string | null | undefined): string[] {
  if (!didascalia) return []
  const trovate: string[] = []
  for (const verbo of didascalia.matchAll(RE_VERBO)) {
    const dopo = didascalia.slice((verbo.index ?? 0) + verbo[0].length, (verbo.index ?? 0) + verbo[0].length + DISTANZA_PAROLA)
    const tra = RE_TRA_VIRGOLETTE.exec(dopo)
    const maiuscola = RE_MAIUSCOLA.exec(dopo)
    // the one closest to the verb
    const candidati = [
      tra ? { indice: tra.index, parola: tra[1] ?? tra[2] ?? tra[3] ?? tra[4] } : null,
      maiuscola ? { indice: maiuscola.index, parola: maiuscola[1] } : null,
    ].filter((c): c is { indice: number; parola: string } => c !== null && Boolean(c.parola))
    candidati.sort((a, b) => a.indice - b.indice)
    const parola = candidati[0]?.parola
    if (parola && !trovate.some((t) => normalizzaParola(t) === normalizzaParola(parola))) trovate.push(parola)
  }
  return trovate
}

/** Whether a lead's message is the keyword, or has it as a whole word (no case, no accents). */
export function haParolaChiave(testo: string, parola: string): boolean {
  const cercata = normalizzaParola(parola)
  if (!cercata) return false
  return paroleDi(testo).includes(cercata)
}

/** The Rome day of the chat's first message: the day the lead arrived. Null without messages. */
export function giornoDiArrivo(chat: Pick<ChatSalvata, 'messaggi'>): string | null {
  const primo = chat.messaggi[0]
  return primo ? giornoRoma(primo.il) : null
}

function primiDelLead(messaggi: readonly MessaggioChat[]): MessaggioChat[] {
  return messaggi.filter((m) => m.da === 'lead').slice(0, PRIMI_MESSAGGI_LEAD)
}

function arrivo(chat: Pick<ChatSalvata, 'messaggi'>): { il: string; giorno: string } | null {
  const primo = chat.messaggi[0]
  const giorno = primo ? giornoRoma(primo.il) : null
  return primo && giorno ? { il: new Date(primo.il).toISOString(), giorno } : null
}

/** D26's steps from code (condivisione, parola chiave, storia), on a complete chat. */
export const origineDaCodice: OrigineDaCodice = ({ chat, post, adesso }) => {
  if (!chat.completa) return null
  const quando = arrivo(chat)
  if (!quando) return null
  const lead = primiDelLead(chat.messaggi)
  if (lead.length === 0) return null
  const diDany = new Map(post.map((p) => [p.shortcode, p]))

  // 1. a post of Dany shared in DM (never the link of a story he answers)
  for (const m of lead) {
    if (m.storia) continue
    const codice = m.codici.find((c) => diDany.has(c))
    if (codice) return { tipo: 'condivisione', shortcode: codice, ...quando }
  }

  // 2. the keyword a caption asks for: the most recent post with it, published before his message
  const adessoMs = adesso.getTime()
  const conParola = post
    .map((p) => ({ p, pubblicato: Date.parse(p.pubblicato_il), parole: paroleChiave(p.didascalia) }))
    .filter((x) => x.parole.length > 0 && Number.isFinite(x.pubblicato) && x.pubblicato <= adessoMs)
    .sort((a, b) => b.pubblicato - a.pubblicato || a.p.shortcode.localeCompare(b.p.shortcode))
  for (const m of lead) {
    const scritto = Date.parse(m.il)
    for (const x of conParola) {
      if (Number.isFinite(scritto) && x.pubblicato > scritto) continue
      const parola = x.parole.find((k) => haParolaChiave(m.testo, k))
      if (parola) return { tipo: 'parola_chiave', shortcode: x.p.shortcode, parola, ...quando }
    }
  }

  // 3. a reply to a story: a post only when Meta's story link is one of Dany's
  const storia = lead.find((m) => m.storia)
  if (storia) {
    const codice = storia.codici.find((c) => diDany.has(c)) ?? null
    return { tipo: 'storia', shortcode: codice, ...quando }
  }
  return null
}

/** The post Claude says the lead cites (post_ref, a number of contesto_giorno), only on a complete chat. */
export const origineDalModello: OrigineDalModello = (chat, postRef, postDelGiorno) => {
  if (!chat.completa || postRef === null || !Number.isInteger(postRef)) return null
  const post = postDelGiorno.find((p) => p.indice === postRef)
  const quando = arrivo(chat)
  if (!post || !quando) return null
  return { tipo: 'testo', shortcode: post.shortcode, ...quando }
}

/** An origin found by code or by the model, from a shortcode already resolved (a stored card). */
export function origineDaShortcode(chat: Pick<ChatSalvata, 'messaggi' | 'completa'>, shortcode: string | null): OrigineChat | null {
  if (!chat.completa || !shortcode) return null
  const quando = arrivo(chat)
  return quando ? { tipo: 'testo', shortcode, ...quando } : null
}

/** The type of an origin that the counts call «certa»: found by code, never by the model (D27). */
export function origineCerta(o: { tipo: OrigineChat['tipo']; shortcode: string | null }): boolean {
  return o.tipo === 'condivisione' || o.tipo === 'parola_chiave' || (o.tipo === 'storia' && o.shortcode !== null)
}

export type { PostInsight, PostPerAnalisi }
