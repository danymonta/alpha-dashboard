import type { TipoBlocco } from '@/lib/insight/contratti'
import { CARATTERI_PER_TOKEN } from '@/lib/insight/blocchi'

/**
 * The cost of a run estimated before the analysis (1.35.0, D19): only for the
 * cap (INSIGHT_COSTO_MAX_USD, 3 $ by default), so that a loop or a broken
 * window never sends hundreds of chats to Claude. The cost the admin reads is
 * computed by SQL from the real token counters (insight_costo_usd); this one
 * is deliberately generous.
 *
 * Claude Sonnet 5.5, per million tokens: 2 $ in, 10 $ out, 2.50 $ to write
 * the 5-minute cache, 0.20 $ to read it (the same as insight_costo_usd; the
 * fallback, Claude Sonnet 5, has the same prices).
 */

export const PREZZI_USD_PER_MTOK = {
  input: 2,
  cache_scritti: 2.5,
  cache_letti: 0.2,
  output: 10,
} as const

/** The cached system prompt (preamble, setter's instructions, ICP, Setting Training, M14, task, schema). */
export const TOKEN_SYSTEM = 24_000
/** The day's context and the request's own headers, fresh in every request. */
const TOKEN_CONTESTO = 1_500
/** Output per chat or call (the card, plus adaptive thinking at effort medium). */
const OUTPUT_PER_ELEMENTO = 400
/** Output of the steps of one request. */
const OUTPUT_FISSO: Partial<Record<TipoBlocco, number>> = { sintesi: 6_000, correzione: 1_500, agenda: 1_000 }
/** Input of a sintesi (cards in short, the 14-day digest, topics, contents), without transcripts. */
const INPUT_SINTESI = 20_000

/** A block as the estimate sees it: its step, how many chats or calls, the characters of their transcripts. */
export type BloccoDaStimare = { tipo: TipoBlocco; elementi: number; caratteri: number }

/** USD, rounded up to the cent: the first request writes the system prompt, the others read it. */
export function stimaCosto(blocchi: readonly BloccoDaStimare[]): number {
  if (blocchi.length === 0) return 0
  let input = 0
  let output = 0
  for (const b of blocchi) {
    input += TOKEN_CONTESTO + (b.tipo === 'sintesi' ? INPUT_SINTESI : Math.ceil(b.caratteri / CARATTERI_PER_TOKEN))
    output += (OUTPUT_FISSO[b.tipo] ?? 0) + Math.max(0, b.elementi) * OUTPUT_PER_ELEMENTO
  }
  const cacheScritti = TOKEN_SYSTEM
  const cacheLetti = TOKEN_SYSTEM * (blocchi.length - 1)
  const usd =
    (input * PREZZI_USD_PER_MTOK.input +
      cacheScritti * PREZZI_USD_PER_MTOK.cache_scritti +
      cacheLetti * PREZZI_USD_PER_MTOK.cache_letti +
      output * PREZZI_USD_PER_MTOK.output) /
    1_000_000
  return Math.ceil(usd * 100) / 100
}

/** Whether a run fits the cap. */
export function entroIlLimite(stima: number, limite: number): boolean {
  return stima <= limite
}
