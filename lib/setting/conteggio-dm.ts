/**
 * The setter's day counted from the Instagram DMs (Dany, 08/10/2026: "il
 * connettore di Instagram capisce se e quante convos outbound inbound sono
 * stati fatti e ogni giorno compila il tracciamento"). Pure functions, no I/O:
 * lib/instagram/report.ts reads the chats and hands over, for each one, only
 * when every message was sent, whether it is ours and whether it carries the
 * call link. Nothing here ever sees a text; the lead's username is here only
 * to leave out the excluded accounts, and never leaves.
 *
 * The numbers are a PROPOSAL for the setter, who confirms or corrects it: the
 * report stays his own declaration (section 17, as changed by Dany on
 * 08/10/2026). Only the totals he already declares, never times of activity,
 * response times or anything by person.
 *
 * The rules, validated by Dany on real data (07/10/2026: outbound 53 against
 * Loris's 52, follow up 16 against 18, call proposte 4 against 4). For each
 * chat its messages (at most the last 20, Meta's limit) in chronological
 * order; "ours" = written by the account; days in Europe/Rome; D = the day
 * counted; a chat is whole when fewer than 20 messages were read. Each item
 * counts at most once per chat and day:
 * - dm_outbound: whole chat, the first message is ours and was sent in D;
 * - dm_inbound: whole chat, the first message is the lead's, and our first
 *   reply is in D;
 * - follow_up: in D one of our messages comes right after one of ours of an
 *   earlier day (the lead did not answer in between);
 * - conversazioni: in D one of our messages comes right after a message of
 *   the lead of D or D-1 that was itself an answer to one of ours (the
 *   message before the lead's is ours). Our first reply to a new inbound chat
 *   does not count here (it is the inbound);
 * - call_proposte: in D one of our messages carries
 *   calendly.com/danielemontagnolo (a link the lead sends never counts);
 * - discovery_prenotate is not from the DMs: the database counts the calls
 *   the setter booked that day (public.discovery_prenotate_del_giorno).
 * The excluded accounts (public.instagram_esclusi) are never counted.
 */

import { aggiungiGiorni, oggiRoma } from '@/lib/date'

/** Meta returns at most the last 20 messages of a chat. */
export const MESSAGGI_PER_CHAT_MAX = 20

/** The booking link of Dany's calendar: a message of ours carrying it proposes the call. */
const LINK_CALL = /calendly\.com\/danielemontagnolo/i

/** An Instagram username as the database keeps it (instagram_esclusi): lowercase, no @. */
const USERNAME = /^[a-z0-9._]{1,30}$/

export type MessaggioDm = {
  /** ISO instant, as Meta writes it ("2026-10-07T23:17:59+0000") */
  created_time: string
  /** written by the account (Loris or Dany, from @_danymonta) */
  nostro: boolean
  /** carries calendly.com/danielemontagnolo */
  calendly: boolean
}

export type ChatDm = {
  messaggi: readonly MessaggioDm[]
  /** how many messages were read: MESSAGGI_PER_CHAT_MAX means the chat may be longer */
  letti: number
  /** the lead's username, only to leave out the excluded accounts */
  username?: string | null
}

export type VociDm = {
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  conversazioni: number
  call_proposte: number
}

export type ConteggioDm = VociDm & {
  /**
   * chats of the day (excluded accounts left out): with at least one message
   * in it, or read up to Meta's limit only after it (it may have had some)
   */
  chat_lette: number
  /** of those, the ones read up to Meta's limit: their first message, or the day's, is not known */
  chat_incerte: number
}

export const VOCI_DM = ['dm_outbound', 'dm_inbound', 'follow_up', 'conversazioni', 'call_proposte'] as const

/** Whether a text (ours: the caller checks who wrote it) carries the call link. */
export function contieneLinkCall(testo: unknown): boolean {
  return typeof testo === 'string' && LINK_CALL.test(testo)
}

/** "@Marco_Fit " -> "marco_fit"; null when it is not a username. */
export function normalizzaUsername(valore: unknown): string | null {
  if (typeof valore !== 'string') return null
  const pulito = valore.trim().replace(/^@/, '').toLowerCase()
  return USERNAME.test(pulito) ? pulito : null
}

/** The day in Europe/Rome of an instant; null when the instant is not one. */
export function giornoRoma(istante: string): string | null {
  const ms = Date.parse(istante)
  return Number.isFinite(ms) ? oggiRoma(new Date(ms)) : null
}

const orologioRoma = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Minutes Rome is ahead of UTC at an instant (60 in winter, 120 in summer). */
function scartoRomaMinuti(ms: number): number {
  const p = Object.fromEntries(orologioRoma.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const comeUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return Math.round((comeUtc - ms) / 60_000)
}

/**
 * 00:00 in Europe/Rome of a 'YYYY-MM-DD', as an instant. Midnight is never in
 * the hour the clocks skip (Rome changes at 02:00 and 03:00).
 */
export function inizioGiornoRoma(giorno: string): Date {
  const [anno, mese, data] = giorno.split('-').map(Number)
  const comeUtc = Date.UTC(anno, mese - 1, data)
  let ms = comeUtc - scartoRomaMinuti(comeUtc) * 60_000
  // the offset of the instant found, not of UTC midnight (the night of a change)
  ms = comeUtc - scartoRomaMinuti(ms) * 60_000
  return new Date(ms)
}

type Datato = MessaggioDm & { giorno: string }

/** The messages that have a time, oldest first (same instant: the order given). */
function inOrdine(messaggi: readonly MessaggioDm[]): Datato[] {
  return messaggi
    .map((m, indice) => ({ m, indice, ms: Date.parse(m.created_time) }))
    .filter((x) => Number.isFinite(x.ms))
    .sort((a, b) => a.ms - b.ms || a.indice - b.indice)
    .map((x) => ({ ...x.m, giorno: oggiRoma(new Date(x.ms)) }))
}

/**
 * The lead's answer right before our message i: the run of the lead's
 * messages before it (a lead often writes two or three in a row) must follow
 * one of ours, and its last message must be of D or D-1.
 */
function rispostaAUnNostro(messaggi: readonly Datato[], i: number, giorno: string, ieri: string): boolean {
  const precedente = messaggi[i - 1]
  if (!precedente || precedente.nostro) return false
  if (precedente.giorno !== giorno && precedente.giorno !== ieri) return false
  let inizio = i - 1
  while (inizio > 0 && !messaggi[inizio - 1].nostro) inizio--
  return inizio > 0 && messaggi[inizio - 1].nostro
}

/**
 * What one chat adds to the day: each item 0 or 1. `attiva`: the chat belongs
 * to the day's chats (a message in it, or a chat read up to Meta's limit only
 * after it, whose messages of the day may have scrolled out of the 20);
 * `incerta`: read up to Meta's limit.
 */
export function contaChat(chat: ChatDm, giorno: string): VociDm & { attiva: boolean; incerta: boolean } {
  const messaggi = inOrdine(chat.messaggi)
  const letti = Number.isFinite(chat.letti) ? Math.max(chat.letti, chat.messaggi.length) : MESSAGGI_PER_CHAT_MAX
  const intera = letti < MESSAGGI_PER_CHAT_MAX
  const ieri = aggiungiGiorni(giorno, -1)
  const primo = messaggi[0]
  const primaRisposta = messaggi.find((m) => m.nostro)

  let followUp = false
  let conversazione = false
  let linkCall = false
  messaggi.forEach((m, i) => {
    if (!m.nostro || m.giorno !== giorno) return
    const precedente = messaggi[i - 1]
    if (precedente?.nostro && precedente.giorno < giorno) followUp = true
    if (rispostaAUnNostro(messaggi, i, giorno, ieri)) conversazione = true
    if (m.calendly) linkCall = true
  })

  return {
    dm_outbound: intera && primo?.nostro && primo.giorno === giorno ? 1 : 0,
    dm_inbound: intera && primo && !primo.nostro && primaRisposta?.giorno === giorno ? 1 : 0,
    follow_up: followUp ? 1 : 0,
    conversazioni: conversazione ? 1 : 0,
    call_proposte: linkCall ? 1 : 0,
    attiva: messaggi.some((m) => m.giorno === giorno) || (!intera && (!primo || primo.giorno > giorno)),
    incerta: !intera,
  }
}

/**
 * The day's totals from the chats read. `esclusi`: usernames never counted
 * (lowercase, no @), and not in chat_lette either.
 */
export function contaGiornoDm(
  chat: readonly ChatDm[],
  giorno: string,
  esclusi: ReadonlySet<string> = new Set(),
): ConteggioDm {
  const totale: ConteggioDm = {
    dm_outbound: 0,
    dm_inbound: 0,
    follow_up: 0,
    conversazioni: 0,
    call_proposte: 0,
    chat_lette: 0,
    chat_incerte: 0,
  }
  for (const c of chat) {
    const username = normalizzaUsername(c.username)
    if (username && esclusi.has(username)) continue
    const voci = contaChat(c, giorno)
    for (const voce of VOCI_DM) totale[voce] += voci[voce]
    if (voci.attiva) {
      totale.chat_lette++
      if (voci.incerta) totale.chat_incerte++
    }
  }
  return totale
}
