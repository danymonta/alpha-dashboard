/**
 * «Promemoria su Calendar» (Dany, 29/10/2026: «tutti i follow up da inviare mi
 * devi aggiungere a calendar una nota di risentire tizio… tra i miei calendari
 * ne ho uno che si chiama proprio follow-up»). The configuration of the reminder
 * of a follow-up by chat, shared by the server (what to hand to the card) and the
 * browser.
 *
 * Two public values, never secrets, read with or without the NEXT_PUBLIC_
 * prefix like the Picker's (CLAUDE.md section 5): the OAuth web client id (the
 * same GOOGLE_CLIENT_ID of «Scegli da Drive») and the id of the «Follow up»
 * calendar (GOOGLE_CALENDAR_FOLLOW_UP, «…@group.calendar.google.com»). With
 * both, the browser writes the event straight into that calendar (Google
 * Identity Services, scope calendar.events); with either missing, the card
 * opens Google Calendar's own «new event» page, already filled in, which always
 * works.
 */

export type ConfigCalendar = {
  /** OAuth 2.0 web client id: null = no direct insert, only the prefilled page. */
  clientId: string | null
  /** The «Follow up» calendar's id: null = the person's default calendar, chosen on Google's page. */
  calendarioId: string | null
}

type Ambiente = Partial<Record<string, string | undefined>>

/** The least scope that writes an event: the events of the person's calendars, never their settings or sharing. */
export const SCOPE_CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events'

function valore(env: Ambiente, nome: string): string {
  return (env[`NEXT_PUBLIC_${nome}`] || env[nome] || '').trim()
}

/** A calendar id: an address-like id or «primary», never with spaces, quotes or angle brackets. */
const ID_CALENDARIO = /^[^\s"'<>/?#]{3,200}$/

/** The configuration from the environment; each value null when missing or pasted wrong (spaces, quotes). */
export function configCalendar(env: Ambiente = process.env): ConfigCalendar {
  const clientId = valore(env, 'GOOGLE_CLIENT_ID')
  const calendarioId = valore(env, 'GOOGLE_CALENDAR_FOLLOW_UP')
  return {
    clientId: clientId && !/[\s"']/.test(clientId) ? clientId : null,
    calendarioId: calendarioId && ID_CALENDARIO.test(calendarioId) ? calendarioId : null,
  }
}

/** The event goes straight into the calendar only with both values; otherwise Google's prefilled page. */
export function inserimentoDiretto(config: ConfigCalendar | null | undefined): boolean {
  return Boolean(config?.clientId && config?.calendarioId)
}
