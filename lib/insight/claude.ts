import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { baseAnthropic, insightConfigurato } from '@/lib/insight/config'

/**
 * The Anthropic client of the Insight (1.35.0, CLAUDE.md section 29): Claude
 * Sonnet 5.5 reads the DMs of the last 24 hours. Server only: the key never
 * reaches a browser bundle, a log or a response.
 *
 * Every option is explicit, never left to the SDK's own lookup:
 * - apiKey: ANTHROPIC_API_KEY, checked first. A client without it would fall
 *   back to ANTHROPIC_AUTH_TOKEN or to an `ant auth login` profile on disk: a
 *   dev server with an empty key would then run on Dany's own credentials
 *   (C43). authToken is null for the same reason;
 * - baseURL: baseAnthropic(), https://api.anthropic.com in production (the SDK
 *   would read ANTHROPIC_BASE_URL by itself, and a stray value on Vercel would
 *   send the DMs elsewhere);
 * - maxRetries 0: the retries are lib/insight/esegui.ts's own, inside the
 *   step's deadline (Vercel Hobby: 300 seconds per invocation, C3);
 * - timeout 150 s: the longest a single attempt may last (each request passes
 *   a shorter one when the step has less time left).
 */

export const TIMEOUT_CLIENTE_MS = 150_000

/** Thrown instead of building a client when ANTHROPIC_API_KEY is missing or blank. */
export class InsightNonConfigurato extends Error {
  constructor() {
    super('Insight non configurato: manca ANTHROPIC_API_KEY.')
    this.name = 'InsightNonConfigurato'
  }
}

export function clienteInsight(): Anthropic {
  if (!insightConfigurato()) throw new InsightNonConfigurato()
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: baseAnthropic(),
    maxRetries: 0,
    timeout: TIMEOUT_CLIENTE_MS,
  })
}
