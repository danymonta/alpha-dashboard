import 'server-only'

import { publicEnv } from '@/lib/env'
import { URL_PASSO_MANCANTE } from '@/lib/validation/insight'

/**
 * The Insight's configuration (1.35.0, CLAUDE.md section 29): whether Claude
 * is reachable, which model and effort, how many blocks at once, the cost cap,
 * where Anthropic is and where the scheduler sends each step of a run.
 *
 * No SDK import here: the page (whether «Aggiorna dati» can work), the
 * settings and the automation actions read it too, and none of them must pull
 * @anthropic-ai/sdk into their bundle. Server only: it reads the presence of
 * ANTHROPIC_API_KEY, which never reaches a browser (the setter never learns
 * whether the Insight is configured, D23).
 *
 * Production (Vercel, or any `next start`) ignores the local variables:
 * ANTHROPIC_BASE_URL (the fake model of the tests) and INSIGHT_URL_PASSO (the
 * dev server seen from Docker). Reading the environment at every call, never
 * at import: a changed variable on Vercel is read from the next deploy anyway,
 * and the tests stub it.
 */

export const ANTHROPIC_API_BASE = 'https://api.anthropic.com'
export const MODELLO_PREDEFINITO = 'claude-sonnet-5-5'
export const EFFORT_INSIGHT = ['low', 'medium', 'high'] as const
export type EffortInsight = (typeof EFFORT_INSIGHT)[number]
export const EFFORT_PREDEFINITO: EffortInsight = 'medium'
/** Blocks sent to Claude at once (halved for the rest of a run after a rate limit). */
export const CONCORRENZA_PREDEFINITA = 6
const CONCORRENZA_MAX = 12
/** USD: a run whose estimate goes above it never reaches Claude (D19). */
export const COSTO_MAX_PREDEFINITO = 3
const COSTO_MAX_MASSIMO = 100

/** The route every step of a run is sent to (D1). */
export const PERCORSO_PASSO = '/api/cron/insight'
/** INSIGHT_URL_PASSO=manuale: nothing is dispatched, a test drives the run (e2e/insight-db.ts). */
export const PASSO_MANUALE = 'manuale'

/**
 * The twins of the check on insight_impostazioni.url_passo
 * (20261014090000_insight_dati.sql): https on a public host without a port,
 * or http on the hosts a local Supabase reaches the dev server with.
 */
export const RE_URL_PASSO_HTTPS = /^https:\/\/[a-z0-9.-]+\/api\/cron\/insight$/
export const RE_URL_PASSO_LOCALE = /^http:\/\/(host\.docker\.internal|localhost|127\.0\.0\.1)(:[0-9]{2,5})?\/api\/cron\/insight$/

const RE_MODELLO = /^claude-[a-z0-9.-]{1,60}$/
const HOST_LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Vercel's production, or a production build: the local variables do not count. */
export function inProduzione(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}

function variabile(nome: string): string | null {
  const valore = process.env[nome]?.trim()
  return valore ? valore : null
}

/** Whether the Insight can call Claude: ANTHROPIC_API_KEY set, not blank. */
export function insightConfigurato(): boolean {
  return variabile('ANTHROPIC_API_KEY') !== null
}

/** INSIGHT_MODEL, or Claude Sonnet 5.5. A value that is not a Claude model id is ignored. */
export function modelloInsight(): string {
  const valore = variabile('INSIGHT_MODEL')
  if (valore && RE_MODELLO.test(valore)) return valore
  if (valore) console.warn('[insight] INSIGHT_MODEL ignorata: non è un modello di Claude')
  return MODELLO_PREDEFINITO
}

/** INSIGHT_EFFORT (low, medium or high), or medium (D14). */
export function effortInsight(): EffortInsight {
  const valore = variabile('INSIGHT_EFFORT')?.toLowerCase()
  if (valore && (EFFORT_INSIGHT as readonly string[]).includes(valore)) return valore as EffortInsight
  if (valore) console.warn('[insight] INSIGHT_EFFORT ignorata: vale low, medium o high')
  return EFFORT_PREDEFINITO
}

/** INSIGHT_CONCORRENZA, an integer from 1 to 12, or 6. */
export function concorrenzaInsight(): number {
  const valore = variabile('INSIGHT_CONCORRENZA')
  if (valore === null) return CONCORRENZA_PREDEFINITA
  const n = Number(valore)
  if (Number.isInteger(n) && n >= 1 && n <= CONCORRENZA_MAX) return n
  console.warn('[insight] INSIGHT_CONCORRENZA ignorata: vale un intero da 1 a 12')
  return CONCORRENZA_PREDEFINITA
}

/** INSIGHT_COSTO_MAX_USD, a number above 0 and up to 100, or 3. */
export function costoMaxInsight(): number {
  const valore = variabile('INSIGHT_COSTO_MAX_USD')
  if (valore === null) return COSTO_MAX_PREDEFINITO
  const n = Number(valore.replace(',', '.'))
  if (Number.isFinite(n) && n > 0 && n <= COSTO_MAX_MASSIMO) return n
  console.warn('[insight] INSIGHT_COSTO_MAX_USD ignorata: vale un numero sopra 0, al massimo 100')
  return COSTO_MAX_PREDEFINITO
}

/**
 * Where Anthropic is: always https://api.anthropic.com in production.
 * Elsewhere ANTHROPIC_BASE_URL (the fake model of the tests,
 * e2e/claude-finto.mjs) when it is https, or http on a loopback host (the key
 * never travels in clear to another machine); anything else is ignored with a
 * warning that never says the value. The client always gets this explicitly
 * (lib/insight/claude.ts): the SDK never looks the variable up by itself.
 */
export function baseAnthropic(): string {
  if (inProduzione()) return ANTHROPIC_API_BASE
  const valore = variabile('ANTHROPIC_BASE_URL')
  if (!valore) return ANTHROPIC_API_BASE
  try {
    const url = new URL(valore)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && HOST_LOOPBACK.has(url.hostname.toLowerCase()))) {
      return url.href.replace(/\/+$/, '')
    }
  } catch {
    // not a URL: ignored below
  }
  console.warn('[insight] ANTHROPIC_BASE_URL ignorata: solo https, o http su 127.0.0.1, localhost o [::1]')
  return ANTHROPIC_API_BASE
}

/** The step URL cannot be built: the actions refuse with a sentence and save nothing (D18). */
export class UrlPassoNonValido extends Error {
  constructor() {
    super(URL_PASSO_MANCANTE)
    this.name = 'UrlPassoNonValido'
  }
}

/** Whether a step URL passes the database's check (production: https only). */
export function urlPassoValido(url: string, produzione = inProduzione()): boolean {
  return RE_URL_PASSO_HTTPS.test(url) || (!produzione && RE_URL_PASSO_LOCALE.test(url))
}

function daIndirizzo(base: string, produzione: boolean): string {
  let url: string
  try {
    url = new URL(PERCORSO_PASSO, base).href
  } catch {
    throw new UrlPassoNonValido()
  }
  if (!urlPassoValido(url, produzione)) throw new UrlPassoNonValido()
  return url
}

/**
 * The URL pg_net posts every step of a run to (D18), never taken from the
 * request's Host.
 * - Production: APP_URL (publicEnv.appUrl) + /api/cron/insight, https only;
 *   otherwise UrlPassoNonValido. INSIGHT_URL_PASSO is ignored.
 * - Elsewhere: INSIGHT_URL_PASSO (locally
 *   http://host.docker.internal:<port of the dev server>/api/cron/insight: the
 *   local Supabase runs in Docker), «manuale» = null (nothing is dispatched);
 *   without it, the app URL as in production, http allowed on the local hosts.
 */
export function urlPasso(): string | null {
  if (inProduzione()) return daIndirizzo(publicEnv.appUrl, true)
  const locale = variabile('INSIGHT_URL_PASSO')
  if (locale === PASSO_MANUALE) return null
  if (locale) {
    if (!urlPassoValido(locale, false)) throw new UrlPassoNonValido()
    return locale
  }
  return daIndirizzo(publicEnv.appUrl, false)
}
