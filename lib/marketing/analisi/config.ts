import { publicEnv } from '@/lib/env'
import { inProduzione } from '@/lib/insight/config'
import type { IdeeDaProporre } from '@/lib/marketing/analisi/tipi'

/**
 * The configuration of the reel analysis (1.36.0, CLAUDE.md section 30). No
 * import of the SDK here: pages and settings read it too. Server only (the
 * variables are never NEXT_PUBLIC_).
 */

export const MODELLO_ANALISI_PREDEFINITO = 'claude-sonnet-5-5'
export const EFFORT_AMMESSI = ['low', 'medium', 'high'] as const
export type EffortAnalisi = (typeof EFFORT_AMMESSI)[number]

/** A step works for 240 of the route's 300 seconds. */
export const TEMPO_PASSO_MS = 240_000
/** Claude looks at a reel only with this much time left (the video, the frames and the answer), else the step resumes. */
export const MINIMO_VISIONE_MS = 150_000
/** The analysis (text only) needs this much. */
export const MINIMO_ANALISI_MS = 90_000
/** The longest a single request to Claude may last. */
export const TIMEOUT_CLAUDE_MAX_MS = 200_000
/** Kept free before the step's deadline. */
export const MARGINE_CLAUDE_MS = 10_000

const RE_MODELLO = /^claude-[a-z0-9.-]{1,60}$/

function variabile(nome: string): string | null {
  const valore = process.env[nome]?.trim()
  return valore ? valore : null
}

export function modelloAnalisi(): string {
  const valore = variabile('MARKETING_MODELLO_ANALISI')
  if (valore && RE_MODELLO.test(valore)) return valore
  return MODELLO_ANALISI_PREDEFINITO
}

function effort(nome: string, predefinito: EffortAnalisi): EffortAnalisi {
  const valore = variabile(nome)?.toLowerCase()
  return valore && (EFFORT_AMMESSI as readonly string[]).includes(valore) ? (valore as EffortAnalisi) : predefinito
}

/** MARKETING_EFFORT_VISIONE: low, medium or high; medium. */
export function effortVisione(): EffortAnalisi {
  return effort('MARKETING_EFFORT_VISIONE', 'medium')
}

/** MARKETING_EFFORT_ANALISI: low, medium or high; medium. */
export function effortAnalisi(): EffortAnalisi {
  return effort('MARKETING_EFFORT_ANALISI', 'medium')
}

/** The long side of the frames: 896 (default, 576 tokens a frame at 9:16) or 1280 (to read small text). */
export function latoFotogrammi(): 896 | 1280 {
  return variabile('MARKETING_LATO_FOTOGRAMMI') === '1280' ? 1280 : 896
}

/** How many ideas, and of which kind, for a verdict (D13); none given: two new ones. */
export function ideeDaProporre(verdetto: string | null | undefined): IdeeDaProporre {
  switch (verdetto) {
    case 'cambiare':
      return { quante: 3, tipo: 'rifacimento' }
    case 'spingere':
      return { quante: 2, tipo: 'seguito' }
    case 'mantenere':
      return { quante: 2, tipo: 'rifacimento_o_nuovo' }
    default:
      return { quante: 2, tipo: 'nuovo' }
  }
}

export const PERCORSO_PASSO_MARKETING = '/api/cron/marketing'
export const RE_URL_PASSO_MARKETING_HTTPS = /^https:\/\/[a-z0-9.-]+\/api\/cron\/marketing$/
export const RE_URL_PASSO_MARKETING_LOCALE =
  /^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:[0-9]{2,5})?\/api\/cron\/marketing$/

/** The address of the steps cannot be built: nothing is saved. */
export class UrlPassoMarketingNonValido extends Error {
  constructor() {
    super('Indirizzo dei passi non valido.')
    this.name = 'UrlPassoMarketingNonValido'
  }
}

/**
 * Where the database posts every step of the reel work (marketing_dispatch).
 * - Production: APP_URL + /api/cron/marketing, https only; otherwise it throws.
 *   MARKETING_URL_PASSO is ignored.
 * - Elsewhere: MARKETING_URL_PASSO (a local address the local Supabase reaches
 *   from Docker), «manuale» or empty = null (nothing is posted: a test drives
 *   the steps), else the app address as in production, http allowed locally.
 */
export function urlPassoMarketing(): string | null {
  if (inProduzione()) {
    let url: string
    try {
      url = new URL(PERCORSO_PASSO_MARKETING, publicEnv.appUrl).href
    } catch {
      throw new UrlPassoMarketingNonValido()
    }
    if (!RE_URL_PASSO_MARKETING_HTTPS.test(url)) throw new UrlPassoMarketingNonValido()
    return url
  }
  const locale = variabile('MARKETING_URL_PASSO')
  if (locale === null || locale === 'manuale') return null
  if (!RE_URL_PASSO_MARKETING_LOCALE.test(locale)) throw new UrlPassoMarketingNonValido()
  return locale
}
