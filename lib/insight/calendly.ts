/**
 * «Link mandati, call non prenotate» (1.75.0, Dany, 10/11/2026: «una lista in
 * Oggi per Loris: chi ha ricevuto il Calendly e non ha prenotato, da quanti
 * giorni, con il messaggio di follow-up suggerito dall'Insight. Lui spunta
 * quelli fatti»). Pure: it reads the recap the setter already reads
 * (insight_recap, RLS), never a new table, never the database of the chats.
 */
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { chiaveLead, type LeadRecap, type MessaggioRecap, type RecapLetto } from '@/lib/insight/recap'

/** A lead that got the Calendly and has no booked call. */
export type LinkSenzaPrenotazione = {
  /** The key of «Fatto» in the Insight: the same switch, on the same recap. */
  chiave: string
  nome: string
  username: string
  /** ISO UTC of our last message with the link, null when the chat no longer has it in view. */
  inviato_il: string | null
  /** Whole days since then (0 = today), null without the instant. */
  giorni: number | null
  /** The follow-up the Insight suggests, '' when it says not to write now. */
  messaggio: string
  alternativa: string
  situazione: string
  /** Who has the last word: the lead answered after the link. */
  ultimo_da_lead: boolean
}

const RE_CALENDLY = /calendly\.com/iu
/** The stages that mean the call is booked or the chat is over. */
const FASI_CHIUSE = new Set(['call prenotata', 'perso', 'uscita'])

function ultimoLink(messaggi: readonly MessaggioRecap[]): MessaggioRecap | null {
  for (let i = messaggi.length - 1; i >= 0; i--) {
    const m = messaggi[i]
    if (m.from === 'alpha' && RE_CALENDLY.test(m.text)) return m
  }
  return null
}

/** Days between a Rome day and today, counting calendar days. */
function giorniDa(iso: string, oggi: string): number | null {
  const istante = new Date(iso)
  if (Number.isNaN(istante.getTime())) return null
  const giorno = oggiRoma(istante)
  let n = 0
  let d = giorno
  while (d < oggi && n < 400) {
    d = aggiungiGiorni(d, 1)
    n += 1
  }
  return n
}

function daLead(l: LeadRecap, oggi: string): LinkSenzaPrenotazione | null {
  if (l.minore_14 || FASI_CHIUSE.has(l.stage)) return null
  const link = ultimoLink(l.messages ?? [])
  // the Calendly went out: the message says so, or Claude read it as the stage
  if (!link && l.stage !== 'calendly inviato') return null
  const ultimo = l.messages?.[l.messages.length - 1]
  return {
    chiave: chiaveLead(l),
    nome: l.name || l.username || '',
    username: l.username ?? '',
    inviato_il: link?.at || null,
    giorni: link?.at ? giorniDa(link.at, oggi) : null,
    messaggio: l.suggested_message ?? '',
    alternativa: l.suggested_message_alt ?? '',
    situazione: l.situation ?? '',
    ultimo_da_lead: ultimo?.from === 'lead',
  }
}

/**
 * The leads of one recap (the chats of the day and the ones to reactivate)
 * that got the Calendly and did not book: once each, the oldest link first,
 * those without the instant last.
 */
export function linkSenzaPrenotazione(recap: Pick<RecapLetto, 'leads' | 'reactivate'>, oggi: string): LinkSenzaPrenotazione[] {
  const visti = new Set<string>()
  const righe: LinkSenzaPrenotazione[] = []
  for (const l of [...(recap.leads ?? []), ...(recap.reactivate ?? [])]) {
    const riga = daLead(l as LeadRecap, oggi)
    if (!riga || !riga.chiave || visti.has(riga.chiave)) continue
    visti.add(riga.chiave)
    righe.push(riga)
  }
  return righe.sort((a, b) => {
    if (a.giorni === null || b.giorni === null) return a.giorni === null ? (b.giorni === null ? 0 : 1) : -1
    return b.giorni - a.giorni
  })
}
