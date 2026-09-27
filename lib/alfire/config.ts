import 'server-only'

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

/**
 * Alfire talks to any OpenAI-compatible endpoint. Default: Groq's free tier
 * with gpt-oss-120b (open weights) and Whisper for the voice. Switching
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

export function modelloAlfire() {
  const provider = createOpenAICompatible({
    name: 'alfire',
    baseURL: BASE_URL,
    apiKey: process.env.ALFIRE_API_KEY,
    includeUsage: true,
  })
  return provider.chatModel(MODELLO)
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
