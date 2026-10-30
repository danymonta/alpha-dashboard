import {
  codiceRispostaCalendar,
  corpoEvento,
  indirizzoInserimento,
  linkEventoSicuro,
  type CodiceErroreCalendar,
  type EventoPromemoria,
} from '@/lib/call/promemoria-calendar'
import { SCOPE_CALENDAR_EVENTS } from '@/lib/google/calendar'
import { caricaIdentita, identitaPronta, oauth2Google } from '@/lib/google/drive-browser'

/**
 * The browser side of «Promemoria su Calendar» (1.67.0): Google Identity
 * Services gives an access token with the calendar.events scope (a popup, after
 * the person's tap), then the browser writes the event in the «Follow up»
 * calendar with Google Calendar's API. The token lives in this page's memory
 * only, until it expires: never sent to our server, never stored, never logged.
 */

export type Esito<T> = { ok: true; valore: T } | { ok: false; codice: CodiceErroreCalendar }

let token: { valore: string; scadeAlle: number } | null = null

/** A token of this page still good for at least a minute: no popup needed. */
function tokenValido(): string | null {
  return token && token.scadeAlle - Date.now() > 60_000 ? token.valore : null
}

/** Google's library is on the page, or a token is already there: a tap can ask without a late popup. */
export function calendarPronto(): boolean {
  return Boolean(tokenValido()) || identitaPronta()
}

export const caricaGoogleCalendar = caricaIdentita

/**
 * The access token, asking Google's popup only when the page has none. To be
 * called right inside the tap: the browser opens a popup only then.
 */
export function chiediTokenCalendar(clientId: string): Promise<Esito<string>> {
  const valido = tokenValido()
  if (valido) return Promise.resolve({ ok: true, valore: valido })
  return new Promise((risolvi) => {
    const oauth2 = oauth2Google()
    if (!oauth2) return risolvi({ ok: false, codice: 'caricamento' })
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE_CALENDAR_EVENTS,
      // only calendar.events in the token, never the login's own scopes of the same client
      include_granted_scopes: false,
      callback: (risposta) => {
        // with Google's granular consent the person may leave the calendar unticked
        if (risposta.error || !risposta.access_token || !(risposta.scope ?? '').split(' ').includes(SCOPE_CALENDAR_EVENTS)) {
          return risolvi({ ok: false, codice: 'accesso_negato' })
        }
        const secondi = Number(risposta.expires_in) || 3600
        token = { valore: risposta.access_token, scadeAlle: Date.now() + secondi * 1000 }
        risolvi({ ok: true, valore: risposta.access_token })
      },
      error_callback: (errore) =>
        risolvi({
          ok: false,
          codice:
            errore?.type === 'popup_failed_to_open'
              ? 'popup_bloccato'
              : errore?.type === 'popup_closed'
                ? 'popup_chiuso'
                : 'accesso_negato',
        }),
    })
    client.requestAccessToken()
  })
}

/** events.insert on the calendar: the event's page in Google Calendar, or why it did not go. */
export async function inserisciEvento(
  accesso: string,
  calendarioId: string,
  evento: EventoPromemoria,
): Promise<Esito<string | null>> {
  let risposta: Response
  try {
    risposta = await fetch(indirizzoInserimento(calendarioId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accesso}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpoEvento(evento)),
    })
  } catch {
    return { ok: false, codice: 'rete' }
  }
  if (!risposta.ok) {
    // an expired or revoked token: the next tap asks Google again
    if (risposta.status === 401) token = null
    return { ok: false, codice: codiceRispostaCalendar(risposta.status) }
  }
  const dati = (await risposta.json().catch(() => null)) as { htmlLink?: unknown } | null
  return { ok: true, valore: linkEventoSicuro(dati?.htmlLink) }
}
