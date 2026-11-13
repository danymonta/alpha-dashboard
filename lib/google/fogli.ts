import 'server-only'

import { ErroreGoogle, basiGoogle, type Basi } from '@/lib/google/service-account'

/**
 * The few calls of the Google Sheets API the onboarding sheet needs (1.82.0): read one column,
 * append a row, write and clear ranges. USER_ENTERED, so dates and numbers are dates and
 * numbers in the sheet; every text that could start a formula arrives with a leading
 * apostrophe (lib/onboarding/foglio.ts). Errors are ErroreGoogle with a kind, never a body.
 */

const ATTESA_MS = 20_000

export type Foglio = { id: string; scheda: string; token: string; basi?: Basi }

/** «'Risposte del modulo'!A2:AC2»: the tab quoted (its name has no quote or «!», a check of the table). */
export function intervallo(scheda: string, celle: string): string {
  return `'${scheda}'!${celle}`
}

async function chiama(f: Foglio, percorso: string, init?: { method: string; body?: unknown }): Promise<unknown> {
  const basi = f.basi ?? basiGoogle()
  let risposta: Response
  try {
    risposta = await fetch(`${basi.fogli}/spreadsheets/${encodeURIComponent(f.id)}${percorso}`, {
      method: init?.method ?? 'GET',
      headers: { authorization: `Bearer ${f.token}`, 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(ATTESA_MS),
      cache: 'no-store',
    })
  } catch {
    throw new ErroreGoogle('rete')
  }
  if (risposta.status === 401 || risposta.status === 403) throw new ErroreGoogle('permesso', risposta.status)
  if (risposta.status === 404 || risposta.status === 400) throw new ErroreGoogle('non_trovato', risposta.status)
  if (!risposta.ok) throw new ErroreGoogle('rete', risposta.status)
  return risposta.json().catch(() => {
    throw new ErroreGoogle('risposta')
  })
}

/** The values of one column (the first cell of each row), as the sheet has them. */
export async function leggiColonna(f: Foglio, colonna: string): Promise<string[]> {
  const json = (await chiama(
    f,
    `/values/${encodeURIComponent(intervallo(f.scheda, `${colonna}:${colonna}`))}?majorDimension=COLUMNS`,
  )) as { values?: unknown }
  const valori = Array.isArray(json.values) && Array.isArray(json.values[0]) ? (json.values[0] as unknown[]) : []
  return valori.map((v) => (v == null ? '' : String(v)))
}

/** A new row after the table; the number of the row written («…!A92:AH92» gives 92). */
export async function aggiungiRiga(f: Foglio, celle: string, valori: (string | number)[]): Promise<number | null> {
  const json = (await chiama(
    f,
    `/values/${encodeURIComponent(intervallo(f.scheda, celle))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: { values: [valori] } },
  )) as { updates?: { updatedRange?: unknown } }
  return rigaDi(json.updates?.updatedRange)
}

export function rigaDi(intervalloScritto: unknown): number | null {
  if (typeof intervalloScritto !== 'string') return null
  const m = /![A-Z]+(\d+)(?::[A-Z]+\d+)?$/.exec(intervalloScritto)
  return m ? Number(m[1]) : null
}

/** Several ranges written at once (each a single row). */
export async function scriviIntervalli(f: Foglio, dati: { celle: string; valori: (string | number)[] }[]): Promise<void> {
  await chiama(f, '/values:batchUpdate', {
    method: 'POST',
    body: {
      valueInputOption: 'USER_ENTERED',
      data: dati.map((d) => ({ range: intervallo(f.scheda, d.celle), values: [d.valori] })),
    },
  })
}

export async function svuotaIntervalli(f: Foglio, celle: string[]): Promise<void> {
  await chiama(f, '/values:batchClear', {
    method: 'POST',
    body: { ranges: celle.map((c) => intervallo(f.scheda, c)) },
  })
}
