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
 * How much one answer may use. Groq's free tier gives 8K tokens a minute, and
 * reserves the longest answer up front: a short history, short answers, few
 * steps. On the Developer plan (ALFIRE_PIANO=developer, 250K a minute) Alfire
 * reads, reasons and writes as a full agent.
 */
export function budgetAlfire(): { messaggi: number; passi: number; risposta: number; sempreTutti: boolean } {
  return process.env.ALFIRE_PIANO === 'developer'
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

/** Italian speech to text, OpenAI-style multipart endpoint. */
export async function trascrivi(audio: Blob, nomeFile: string): Promise<string> {
  const corpo = new FormData()
  corpo.append('file', audio, nomeFile)
  corpo.append('model', MODELLO_VOCE)
  corpo.append('language', 'it')
  corpo.append('response_format', 'json')

  const risposta = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ALFIRE_API_KEY}` },
    body: corpo,
  })
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
