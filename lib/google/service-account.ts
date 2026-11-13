import 'server-only'

import { createSign } from 'node:crypto'

import { hostDiLoopback } from '@/lib/instagram/richieste'

/**
 * The Google service account of Percorso Alpha (1.82.0, CLAUDE.md section 34, release C): its
 * key is only in Vault (google_chiave(), service role), it signs a JWT with node:crypto and
 * exchanges it for an access token of one hour, scope «spreadsheets» only. No library, the
 * token stays in the memory of the function. In the tests the bases come as arguments; in the
 * local e2e E2E_GOOGLE_FINTO (only outside production, with the dev login, http on loopback,
 * like E2E_FATHOM_FINTO). The key never reaches a log or the browser.
 */

export const TOKEN_GOOGLE = 'https://oauth2.googleapis.com/token'
export const API_FOGLI = 'https://sheets.googleapis.com/v4'
export const SCOPE_FOGLI = 'https://www.googleapis.com/auth/spreadsheets'

export type Basi = { token: string; fogli: string }

export function basiGoogle(): Basi {
  const reali = { token: TOKEN_GOOGLE, fogli: API_FOGLI }
  const finto = process.env.E2E_GOOGLE_FINTO?.trim()
  if (!finto) return reali
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
    console.warn('[google] E2E_GOOGLE_FINTO ignorata: vale solo in locale, col login di sviluppo')
    return reali
  }
  try {
    const url = new URL(finto)
    if (url.protocol === 'http:' && hostDiLoopback(url.hostname)) {
      return { token: `${url.origin}/token`, fogli: `${url.origin}/v4` }
    }
  } catch {
    // not a URL: ignored below
  }
  console.warn('[google] E2E_GOOGLE_FINTO ignorata: solo http su 127.0.0.1, localhost o [::1]')
  return reali
}

export type ChiaveServizio = { client_email: string; private_key: string }

/** The secret of Vault read back: only a well-formed key, otherwise null. */
export function leggiChiave(testo: string | null | undefined): ChiaveServizio | null {
  if (!testo) return null
  try {
    const v = JSON.parse(testo) as Partial<ChiaveServizio>
    if (typeof v.client_email !== 'string' || typeof v.private_key !== 'string') return null
    if (!v.private_key.includes('PRIVATE KEY')) return null
    return { client_email: v.client_email, private_key: v.private_key }
  } catch {
    return null
  }
}

function base64url(dati: string | Buffer): string {
  return Buffer.from(dati).toString('base64url')
}

/** The signed assertion of the JWT bearer flow (RFC 7523), valid one hour. */
export function asserzione(chiave: ChiaveServizio, adesso: number, aud: string = TOKEN_GOOGLE): string {
  const iat = Math.floor(adesso / 1000)
  const testa = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = base64url(
    JSON.stringify({ iss: chiave.client_email, scope: SCOPE_FOGLI, aud, iat, exp: iat + 3600 }),
  )
  const firma = createSign('RSA-SHA256').update(`${testa}.${corpo}`).sign(chiave.private_key)
  return `${testa}.${corpo}.${base64url(firma)}`
}

export class ErroreGoogle extends Error {
  constructor(
    readonly tipo: 'chiave' | 'permesso' | 'non_trovato' | 'rete' | 'risposta',
    readonly stato?: number,
  ) {
    super(`google ${tipo}${stato ? ` ${stato}` : ''}`)
    this.name = 'ErroreGoogle'
  }
}

const ATTESA_MS = 15_000

/** The access token (scope spreadsheets). Throws ErroreGoogle('chiave') when Google refuses the key. */
export async function tokenServizio(chiave: ChiaveServizio, basi: Basi = basiGoogle()): Promise<string> {
  let risposta: Response
  try {
    risposta = await fetch(basi.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: asserzione(chiave, Date.now(), TOKEN_GOOGLE),
      }),
      signal: AbortSignal.timeout(ATTESA_MS),
      cache: 'no-store',
    })
  } catch {
    throw new ErroreGoogle('rete')
  }
  if (risposta.status >= 500 || risposta.status === 429) throw new ErroreGoogle('rete', risposta.status)
  if (!risposta.ok) throw new ErroreGoogle('chiave', risposta.status)
  const json = (await risposta.json().catch(() => null)) as { access_token?: unknown } | null
  if (!json || typeof json.access_token !== 'string') throw new ErroreGoogle('risposta')
  return json.access_token
}
