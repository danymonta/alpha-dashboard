import 'server-only'

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { wrapLanguageModel } from 'ai'

import { erroreStrumentoRiprovabile } from '@/lib/alfire/errori'

/**
 * Alfire talks to any OpenAI-compatible endpoint. Default: Groq with
 * gpt-oss-120b (open weights) and Whisper for the voice. Switching
 * provider or model is a matter of environment variables.
 */
const BASE_URL = process.env.ALFIRE_BASE_URL || 'https://api.groq.com/openai/v1'
const MODELLO = process.env.ALFIRE_MODEL || 'openai/gpt-oss-120b'
const MODELLO_VOCE = process.env.ALFIRE_MODEL_VOCE || 'whisper-large-v3-turbo'

/** For the settings page: which model answers. */
export function nomeModelloAlfire(): string {
  return MODELLO.split('/').at(-1) ?? MODELLO
}

export function alfireConfigurata(): boolean {
  return Boolean(process.env.ALFIRE_API_KEY)
}

/**
 * Tokens a minute the provider grants, as its last answer said: Groq sends
 * x-ratelimit-limit-tokens on every reply (8K on the free tier, 250K on the
 * Developer plan). Kept for the life of the server instance.
 */
let tokenAlMinuto: number | null = null

export function ricordaLimiti(headers: Headers): void {
  const limite = Number(headers.get('x-ratelimit-limit-tokens'))
  if (Number.isFinite(limite) && limite > 0) tokenAlMinuto = limite
}

/** A per-minute budget this large is a paid plan: Alfire can work as a full agent. */
const SOGLIA_PIANO_A_CONSUMO = 100_000

export type PianoAlfire = 'gratuito' | 'developer'

/**
 * Which plan Alfire works with. ALFIRE_PIANO forces it ("developer" or
 * "gratuito"); otherwise Groq's own limit decides, so upgrading on
 * console.groq.com is enough (Dany, 29/09/2026). Until the first answer of an
 * instance arrives, the free budget: it always fits.
 */
export function pianoAlfire(): PianoAlfire {
  const forzato = process.env.ALFIRE_PIANO
  if (forzato === 'developer' || forzato === 'gratuito') return forzato
  return (tokenAlMinuto ?? 0) >= SOGLIA_PIANO_A_CONSUMO ? 'developer' : 'gratuito'
}

/**
 * How much one answer may use. Groq's free tier gives 8K tokens a minute, and
 * reserves the longest answer up front: a short history, short answers, few
 * steps. On the Developer plan (250K a minute) Alfire reads, reasons and
 * writes as a full agent.
 */
export function budgetAlfire(): { messaggi: number; passi: number; risposta: number; sempreTutti: boolean } {
  return pianoAlfire() === 'developer'
    ? { messaggi: 30, passi: 10, risposta: 4000, sempreTutti: true }
    : // a chat that only reads goes without the write tools (conversazioneScrive)
      { messaggi: 8, passi: 6, risposta: 1200, sempreTutti: false }
}

export function modelloAlfire() {
  const provider = createOpenAICompatible({
    name: 'alfire',
    baseURL: BASE_URL,
    apiKey: process.env.ALFIRE_API_KEY,
    includeUsage: true,
    // every reply says the plan's per-minute budget (ricordaLimiti)
    fetch: async (input, init) => {
      const risposta = await fetch(input, init)
      ricordaLimiti(risposta.headers)
      return risposta
    },
  })
  return wrapLanguageModel({
    model: provider.chatModel(MODELLO),
    middleware: {
      specificationVersion: 'v4',
      // a tool call refused before the stream starts: ask again, twice at most
      // (refusals inside the stream are retried by streamText, see the route)
      wrapStream: async ({ doStream }) => {
        for (let tentativo = 0; ; tentativo++) {
          try {
            return await doStream()
          } catch (errore) {
            if (tentativo >= 2 || !erroreStrumentoRiprovabile(errore)) throw errore
          }
        }
      },
    },
  })
}

/**
 * Requests a day Whisper grants, as its last answer said: Groq's
 * x-ratelimit-limit-requests is the per-day count (2K for Whisper on the free
 * tier, 200K on the Developer plan). Kept for the life of the server instance.
 */
let richiesteVoceAlGiorno: number | null = null

export function ricordaLimitiVoce(headers: Headers): void {
  const limite = Number(headers.get('x-ratelimit-limit-requests'))
  if (Number.isFinite(limite) && limite > 0) richiesteVoceAlGiorno = limite
}

/** Above this many requests a day, Whisper is on a paid plan. */
const SOGLIA_VOCE_A_CONSUMO = 20_000

/**
 * Whether the live text of a dictation may run. Every partial sends the whole
 * audio so far again: on Groq's free tier (Whisper: 20 requests a minute, 7,200
 * audio seconds an hour for the whole team) a minute of dictation would use
 * about 1,000 seconds and leave the final transcription no room. So on the
 * free plan (ALFIRE_PIANO, or Whisper's own answers) only the final text;
 * until the plan is known, the live text runs.
 */
export function testoInDirettaConsentito(): boolean {
  const forzato = process.env.ALFIRE_PIANO
  if (forzato === 'developer' || forzato === 'gratuito') return forzato === 'developer'
  return richiesteVoceAlGiorno === null || richiesteVoceAlGiorno >= SOGLIA_VOCE_A_CONSUMO
}

/**
 * Italian speech to text, OpenAI-style multipart endpoint. `signal`: the
 * browser gave up (a partial still in flight at the stop), so the provider
 * stops too instead of counting against the limits next to the final.
 */
export async function trascrivi(audio: Blob, nomeFile: string, signal?: AbortSignal): Promise<string> {
  const corpo = new FormData()
  corpo.append('file', audio, nomeFile)
  corpo.append('model', MODELLO_VOCE)
  corpo.append('language', 'it')
  corpo.append('response_format', 'json')

  const risposta = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ALFIRE_API_KEY}` },
    body: corpo,
    signal,
  })
  ricordaLimitiVoce(risposta.headers)
  if (risposta.status === 429) throw new LimiteRaggiunto()
  if (!risposta.ok) throw new Error(`Trascrizione non riuscita (${risposta.status})`)
  const dati = (await risposta.json()) as { text?: string }
  return (dati.text ?? '').trim()
}

/** The free tier's per-minute or per-day limit. */
export class LimiteRaggiunto extends Error {
  constructor() {
    super('Limite del piano gratuito raggiunto')
  }
}
