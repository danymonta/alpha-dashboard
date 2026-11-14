/**
 * The booking page of Google Calendar inside the client's area (Dany, 14/11/2026: «l'ideale sarebbe che te lo
 * facessi imbeddato… senza aprire una nuova scheda»). Google lets a booking page be framed only in its embed form:
 * the long address calendar.google.com/calendar/appointments/… with gv=true. A short link (calendar.app.google)
 * cannot be framed: the settings resolve it to the long one when they save it, and until then the client has the
 * button that opens it in a new tab.
 */

const PERCORSO_APPUNTAMENTI = /^\/calendar\/(u\/\d+\/)?appointments\//

/** The address to frame, or null when this link cannot be framed. */
export function calendarioIncorporato(link: string): string | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' || !PERCORSO_APPUNTAMENTI.test(url.pathname)) return null
  url.searchParams.set('gv', 'true')
  return url.toString()
}

/** A short link of Google Calendar, which the settings try to resolve to the long one. */
export function linkCorto(link: string): boolean {
  try {
    const url = new URL(link)
    return url.protocol === 'https:' && url.hostname === 'calendar.app.google'
  } catch {
    return false
  }
}

/** Where a short link goes: the long address of the booking page, or null (never throws, at most 5 seconds). */
export async function risolviLinkCorto(link: string): Promise<string | null> {
  if (!linkCorto(link)) return null
  try {
    let attuale = link
    for (let i = 0; i < 3; i++) {
      const r = await fetch(attuale, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
      const dove = r.headers.get('location')
      if (!dove || r.status < 300 || r.status >= 400) return null
      const prossimo = new URL(dove, attuale).toString()
      if (calendarioIncorporato(prossimo)) {
        const u = new URL(prossimo)
        u.searchParams.delete('gv')
        return u.toString()
      }
      attuale = prossimo
    }
    return null
  } catch {
    return null
  }
}
