import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { baseAnthropic, baseSuQuestaMacchina, inProduzione, insightConfigurato } from '@/lib/insight/config'

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
 * - a test key (anything that is not an Anthropic key, sk-ant-…, like the
 *   fake model's «finta») never leaves this machine outside production: a
 *   variable already set in the shell wins over .env.local, and a shell that
 *   exports ANTHROPIC_BASE_URL=https://api.anthropic.com would otherwise send
 *   the invented chats of the tests to Anthropic (like the Instagram test
 *   token, SEGNO_TOKEN_FINTO);
 * - maxRetries 0: the retries are lib/insight/esegui.ts's own, inside the
 *   step's deadline (Vercel Hobby: 300 seconds per invocation, C3);
 * - timeout 150 s: the longest a single attempt may last (each request passes
 *   a shorter one when the step has less time left).
 */

export const TIMEOUT_CLIENTE_MS = 150_000
/** An Anthropic API key; anything else is a test key. */
const RE_CHIAVE_ANTHROPIC = /^sk-ant-/

/** Thrown instead of building a client when ANTHROPIC_API_KEY is missing or blank. */
export class InsightNonConfigurato extends Error {
  constructor(messaggio = 'Insight non configurato: manca ANTHROPIC_API_KEY.') {
    super(messaggio)
    this.name = 'InsightNonConfigurato'
  }
}

export function clienteInsight(): Anthropic {
  if (!insightConfigurato()) throw new InsightNonConfigurato()
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  const baseURL = baseAnthropic()
  if (!inProduzione() && !RE_CHIAVE_ANTHROPIC.test(apiKey) && !baseSuQuestaMacchina(baseURL)) {
    console.warn('[insight] chiave di prova: Claude si chiama solo sul modello finto (ANTHROPIC_BASE_URL su 127.0.0.1)')
    throw new InsightNonConfigurato('Insight non configurato: una chiave di prova non parte mai verso Anthropic.')
  }
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL,
    maxRetries: 0,
    timeout: TIMEOUT_CLIENTE_MS,
  })
}
