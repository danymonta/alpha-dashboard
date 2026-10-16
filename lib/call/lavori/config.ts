import { publicEnv } from '@/lib/env'
import { inProduzione } from '@/lib/insight/config'

/**
 * Where the database posts every step of the call work (call_dispatch): the analysis
 * of a held call and the weekly brief of the Marketing area (1.37.0, CLAUDE.md section
 * 31). The same forms as the reels' (lib/marketing/analisi/config.ts): in production
 * APP_URL + /api/cron/call, https only (CALL_URL_PASSO is ignored); elsewhere
 * CALL_URL_PASSO (a local address the local Supabase reaches from Docker), «manuale»
 * or empty = null (nothing is posted: a test drives the steps).
 */
export const PERCORSO_PASSO_CALL = '/api/cron/call'
const RE_URL_HTTPS = /^https:\/\/[a-z0-9.-]+\/api\/cron\/call$/
const RE_URL_LOCALE = /^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:[0-9]{2,5})?\/api\/cron\/call$/

export class UrlPassoCallNonValido extends Error {
  constructor() {
    super('Indirizzo dei passi non valido.')
    this.name = 'UrlPassoCallNonValido'
  }
}

export function urlPassoCall(): string | null {
  if (inProduzione()) {
    let url: string
    try {
      url = new URL(PERCORSO_PASSO_CALL, publicEnv.appUrl).href
    } catch {
      throw new UrlPassoCallNonValido()
    }
    if (!RE_URL_HTTPS.test(url)) throw new UrlPassoCallNonValido()
    return url
  }
  const locale = process.env.CALL_URL_PASSO?.trim()
  if (!locale || locale === 'manuale') return null
  if (!RE_URL_LOCALE.test(locale)) throw new UrlPassoCallNonValido()
  return locale
}

/** CALL_EFFORT: low, medium or high; medium (the call analysis). */
export function effortCall(): 'low' | 'medium' | 'high' {
  const v = process.env.CALL_EFFORT?.trim().toLowerCase()
  return v === 'low' || v === 'medium' || v === 'high' ? v : 'medium'
}

/** A step works for 240 of the route's 300 seconds. */
export const TEMPO_PASSO_CALL_MS = 240_000
