import 'server-only'

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { wrapLanguageModel } from 'ai'

import { ALLEGATI_PER_MESSAGGIO_MAX, ALLEGATI_STORIA_MAX } from '@/lib/alfire/allegati'
import { erroreStrumentoRiprovabile } from '@/lib/alfire/errori'

/**
 * Alfire talks to any OpenAI-compatible endpoint. Default: Groq with
 * gpt-oss-120b (open weights) and Whisper for the voice. Switching
 * provider or model is a matter of environment variables.
 */
const BASE_URL = process.env.ALFIRE_BASE_URL || 'https://api.groq.com/openai/v1'
const MODELLO = process.env.ALFIRE_MODEL || 'openai/gpt-oss-120b'
const MODELLO_VOCE = process.env.ALFIRE_MODEL_VOCE || 'whisper-large-v3-turbo'
/**
 * Reads photos and scanned pages for the text-only chat model (attachments,
 * 30/09/2026). Groq's vision model on that day: Qwen 3.8 27B (preview, text
 * and images, at most 3 images a request, 2,048 tokens each). "off" turns
 * the reading of images off; PDF, Word, Excel and CSV with text still work.
 */
const MODELLO_VISIONE = process.env.ALFIRE_MODEL_VISIONE || 'qwen/qwen3.8-27b'

/** For the settings page: which model answers. */
export function nomeModelloAlfire(): string {
  return MODELLO.split('/').at(-1) ?? MODELLO
}

/** For the settings page: which model reads photos and scans, or null when it is off. */
export function nomeModelloVisione(): string | null {
  return MODELLO_VISIONE === 'off' ? null : (MODELLO_VISIONE.split('/').at(-1) ?? MODELLO_VISIONE)
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

export type BudgetAllegati = {
  /** Characters of attachments the model reads with one message (all its files together). */
  perMessaggio: number
  /** Characters of attachments in the whole history: the newest keep theirs first. */
  storia: number
}

/**
 * How much of an attachment travels. Every step of an answer sends the whole
 * history again: on the Developer plan about 6,000 tokens a message; on the
 * free tier (8K tokens a minute, tools and answer included) a short excerpt.
 * The Developer numbers are the most any plan reads: the browser sends no
 * more than that (alleggerisciAllegati).
 */
export function budgetAllegati(): BudgetAllegati {
  return pianoAlfire() === 'developer'
    ? { perMessaggio: ALLEGATI_PER_MESSAGGIO_MAX, storia: ALLEGATI_STORIA_MAX }
    : { perMessaggio: 3_000, storia: 3_000 }
}

/** One reading of photos or scanned pages: images in one request (Groq takes 3 at most), longest transcription in tokens. */
export type BudgetVisione = { pagine: number; risposta: number }

export const VISIONE_PIENA: BudgetVisione = { pagine: 3, risposta: 4000 }
/** The free tier: one image and a short transcription fit its per-minute budget. */
export const VISIONE_RIDOTTA: BudgetVisione = { pagine: 1, risposta: 1500 }

/** What a full reading asks of the vision model in a minute: 3 images of 2,048 tokens, the instructions, the answer. */
const TOKEN_VISIONE_PIENA = 3 * 2048 + 1000 + VISIONE_PIENA.risposta

/** The vision model's own per-minute budget, as its last answer said (a refusal included). */
let tokenVisioneAlMinuto: number | null = null
/** The provider found a full reading too big for the plan (413): from then on, the small one. */
let visioneRifiutata = false

export function ricordaLimitiVisione(headers: Headers): void {
  const limite = Number(headers.get('x-ratelimit-limit-tokens'))
  if (Number.isFinite(limite) && limite > 0) tokenVisioneAlMinuto = limite
}

export function segnaVisioneRifiutata(): void {
  visioneRifiutata = true
}

/**
 * How much of a scan the vision model reads, and how long it may write
 * (attachments, 30/09/2026). The plan when it is known: ALFIRE_PIANO, or the
 * chat's own answers. The attachment route, though, often runs where the chat
 * never answered (a cold start, or its own function on Vercel): then the
 * vision model's own budget, once one of its answers said it; before that,
 * the full reading, and a provider that refuses it (413) gets the first page
 * alone (leggiConVisione), remembered for the next files.
 */
export function budgetVisione(): BudgetVisione {
  const forzato = process.env.ALFIRE_PIANO
  if (forzato === 'developer') return VISIONE_PIENA
  if (forzato === 'gratuito' || visioneRifiutata) return VISIONE_RIDOTTA
  if (tokenAlMinuto !== null) return pianoAlfire() === 'developer' ? VISIONE_PIENA : VISIONE_RIDOTTA
  if (tokenVisioneAlMinuto !== null) return tokenVisioneAlMinuto >= TOKEN_VISIONE_PIENA ? VISIONE_PIENA : VISIONE_RIDOTTA
  return VISIONE_PIENA
}

export function visioneAttiva(): boolean {
  return alfireConfigurata() && MODELLO_VISIONE !== 'off'
}

/**
 * The vision model, on the same provider and key. Its per-minute budget is its
 * own (ricordaLimitiVisione): it would mislead the plan of the chat.
 */
export function modelloVisione() {
  const provider = createOpenAICompatible({
    name: 'visione',
    baseURL: BASE_URL,
    apiKey: process.env.ALFIRE_API_KEY,
    includeUsage: true,
    fetch: async (input, init) => {
      const risposta = await fetch(input, init)
      ricordaLimitiVisione(risposta.headers)
      return risposta
    },
  })
  return provider.chatModel(MODELLO_VISIONE)
}

/**
 * Qwen 3 reasons by default: a transcription does not need it (and any
 * reasoning that still comes back stays out of the text). Other models may
 * refuse the field: the reading then asks once more without it.
 */
export function opzioniVisione(): Record<string, string> {
  return /qwen3/i.test(MODELLO_VISIONE) ? { reasoningEffort: 'none' } : {}
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
