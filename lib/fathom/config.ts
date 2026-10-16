import { hostDiLoopback } from '@/lib/instagram/richieste'

/**
 * Where Fathom is (1.37.0, CLAUDE.md section 31): the official API, or the fake
 * one of the end-to-end tests (e2e/fathom-finto.mjs) when E2E_FATHOM_FINTO is
 * set, only outside production, only with the dev login on, and only on `http`
 * to a loopback host (as E2E_GRAPH_FINTO). Anything else is ignored with a
 * warning that never says the value. A test key (it contains SEGNO_CHIAVE_FINTA)
 * never leaves for a host that is not loopback, whatever base a caller passes.
 */
export const API_FATHOM = 'https://api.fathom.ai/external/v1'
export const SEGNO_CHIAVE_FINTA = 'e2eFinto'

export function baseFathom(predefinita: string = API_FATHOM): string {
  const finto = process.env.E2E_FATHOM_FINTO?.trim()
  if (!finto) return predefinita
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') {
    console.warn('[fathom] E2E_FATHOM_FINTO ignorata: vale solo in locale, col login di sviluppo')
    return predefinita
  }
  try {
    const url = new URL(finto)
    if (url.protocol === 'http:' && hostDiLoopback(url.hostname)) return `${url.origin}/external/v1`
  } catch {
    // not a URL: ignored below
  }
  console.warn('[fathom] E2E_FATHOM_FINTO ignorata: solo http su 127.0.0.1, localhost o [::1]')
  return predefinita
}

/** The window around a call where its recording is looked for (created_after / created_before of Fathom's list). */
export const FINESTRA_PRIMA_MS = 24 * 3600_000
export const FINESTRA_DOPO_MS = 3 * 24 * 3600_000
/** Pages of 10 meetings read at most to find one link (a third of the minute's limit of 60). */
export const PAGINE_MAX_PER_LINK = 3
