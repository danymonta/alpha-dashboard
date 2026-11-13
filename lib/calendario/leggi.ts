import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { eventiDaIcal } from '@/lib/calendario/ical'
import { hostDiLoopback } from '@/lib/instagram/richieste'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The reading of the calendar «Dany Discovery Call» (1.76.0, CLAUDE.md section 33): the secret iCal
 * address from Vault (calendario_url, service_role), the whole .ics, its events parsed
 * (lib/calendario/ical.ts) and saved in one transaction (calendario_salva). Never throws: every failure is
 * a fixed sentence written for the admin (calendario_segna_errore). The address never reaches a log, an
 * error or the browser.
 */
export const FRASI_CALENDARIO = {
  non_collegato: 'Il calendario non è collegato: l’admin incolla l’indirizzo segreto in Impostazioni › Chiavi e collegamenti.',
  indirizzo: 'Google non dà più il calendario con questo indirizzo: copia di nuovo l’«Indirizzo segreto in formato iCal» e incollalo in Impostazioni › Chiavi e collegamenti.',
  rete: 'Google Calendar non risponde: riprova più tardi.',
  formato: 'Google Calendar ha risposto con un file che non è un calendario: riprova più tardi.',
  troppo_grande: 'Il calendario è troppo grande da leggere in una volta.',
  database: 'Il calendario non si è salvato: riprova più tardi.',
} as const

export type TipoErroreCalendario = keyof typeof FRASI_CALENDARIO

export type EsitoCalendario =
  | { esito: 'ok'; eventi: number }
  | { esito: 'errore'; tipo: TipoErroreCalendario }

const TEMPO_MS = 20_000
const DIMENSIONE_MAX = 10 * 1024 * 1024
const INDIRIZZO_SEGRETO = /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/\s?#]+\/private-[0-9a-z]{16,}\/basic\.ics$/i

/**
 * Where the .ics is read: the secret address, or the fake calendar of the end-to-end tests
 * (E2E_CALENDARIO_FINTO, only outside production, with the dev login on, `http` to a loopback host).
 */
export function indirizzoDaLeggere(indirizzo: string): string | null {
  const finto = process.env.E2E_CALENDARIO_FINTO?.trim()
  if (finto && process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_LOGIN === 'true') {
    try {
      const url = new URL(finto)
      if (url.protocol === 'http:' && hostDiLoopback(url.hostname)) return `${url.origin}/calendario.ics`
    } catch {
      // ignored below
    }
  }
  return INDIRIZZO_SEGRETO.test(indirizzo) ? indirizzo : null
}

/**
 * Downloads the .ics (shared by the nightly reading and by the admin's «Prenotate su Calendly» section,
 * lib/calendario/prenotate.ts, which waits less). Never throws; the address never reaches a log.
 */
export async function scaricaIcal(
  url: string,
  tempoMs: number = TEMPO_MS,
): Promise<{ testo: string } | { tipo: TipoErroreCalendario }> {
  let risposta: Response
  try {
    risposta = await fetch(url, {
      signal: AbortSignal.timeout(tempoMs),
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'text/calendar' },
    })
  } catch {
    return { tipo: 'rete' }
  }
  if (risposta.status === 404 || risposta.status === 403 || risposta.status === 401) return { tipo: 'indirizzo' }
  if (!risposta.ok) return { tipo: 'rete' }
  const lunghezza = Number(risposta.headers.get('content-length') ?? 0)
  if (lunghezza > DIMENSIONE_MAX) return { tipo: 'troppo_grande' }
  let testo: string
  try {
    testo = await risposta.text()
  } catch {
    return { tipo: 'rete' }
  }
  if (testo.length > DIMENSIONE_MAX) return { tipo: 'troppo_grande' }
  if (!testo.includes('BEGIN:VCALENDAR')) return { tipo: 'formato' }
  return { testo }
}

/** Reads the calendar and saves it. `db` is the service_role client. */
export async function sincronizzaCalendario(db: SupabaseClient<Database>): Promise<EsitoCalendario> {
  const errore = async (tipo: TipoErroreCalendario): Promise<EsitoCalendario> => {
    if (tipo !== 'non_collegato') {
      await db.rpc('calendario_segna_errore', { p_errore: FRASI_CALENDARIO[tipo] }).then(
        () => undefined,
        () => undefined,
      )
    }
    console.warn('[calendario] lettura non riuscita:', tipo)
    return { esito: 'errore', tipo }
  }

  const { data: indirizzo, error } = await db.rpc('calendario_url')
  if (error) return errore('database')
  const url = typeof indirizzo === 'string' ? indirizzoDaLeggere(indirizzo.trim()) : indirizzoDaLeggere('')
  if (!url) return errore(indirizzo ? 'indirizzo' : 'non_collegato')

  const file = await scaricaIcal(url)
  if ('tipo' in file) return errore(file.tipo)
  const eventi = eventiDaIcal(file.testo)
  // a calendar that gave no event at all is not a reason to empty the counts
  if (eventi.length === 0 && !file.testo.includes('BEGIN:VEVENT')) {
    const { error: e } = await db.rpc('calendario_salva', { p_eventi: [] })
    if (e) return errore('database')
    return { esito: 'ok', eventi: 0 }
  }
  if (eventi.length === 0) return errore('formato')

  const { data: n, error: e } = await db.rpc('calendario_salva', { p_eventi: eventi as never })
  if (e) return errore('database')
  console.info('[calendario] letti', n)
  return { esito: 'ok', eventi: Number(n ?? eventi.length) }
}
