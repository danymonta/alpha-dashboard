import 'server-only'

import { readFile } from 'node:fs/promises'

import { ricordaLimitiVoce } from '@/lib/alfire/config'

/**
 * What is said in a reel (1.36.0, CLAUDE.md section 30): Whisper on Groq, with
 * the key and the address of Alfire (ALFIRE_API_KEY, ALFIRE_BASE_URL), from the
 * FLAC the server extracted (16 kHz mono, about 1 MB a minute), never from
 * the URL of the video. The audio goes to Groq (United States) and is kept
 * nowhere; only the text comes back to the database.
 *
 * Whisper invents sentences on music and silence («Sottotitoli a cura di…»,
 * «Grazie per la visione») or repeats the vocabulary it was given: the
 * segments are filtered (analizzaVerbose), and a reel with less than 2
 * seconds of speech left is «senza parlato».
 */

export const MODELLO_PREDEFINITO = 'whisper-large-v3'
const BASE_PREDEFINITA = 'https://api.groq.com/openai/v1'
/** Whisper reads the first 224 tokens of the prompt: this is well under. */
export const VOCABOLARIO =
  'Percorso Alpha, Dany, allenamento a corpo libero, sbarra per trazioni, piegamenti, pectus excavatum, ricomposizione corporea, massa pulita, addominali, call conoscitiva, uomini over 30'
/** The longest a request waits. */
const TIMEOUT_MS = 60_000
/** Groq bills at least this many seconds of audio for each request. */
export const SECONDI_MINIMI_FATTURATI = 10
/** The limits of a segment that Whisper itself doubts. */
const NO_SPEECH_MAX = 0.6
const LOGPROB_MIN = -1
const COMPRESSIONE_MAX = 2.4
/** Less speech than this is no speech. */
const PARLATO_MINIMO_S = 2
/** The speech that starts before this is the hook. */
const GANCIO_SECONDI = 3
const GANCIO_MAX = 300
const ECO_PAROLE = 6

/** The sentences Whisper writes over music or silence, in the normalized form (no accents, lower case, no punctuation). */
export const FRASI_FANTASMA: readonly string[] = [
  'sottotitoli a cura di qtss',
  'sottotitoli creati dalla comunita amara org',
  'sottotitoli e revisione a cura di qtss',
  'sottotitoli a cura della comunita di amara org',
  'sottotitoli di amara org',
  'sottotitoli',
  'grazie per la visione',
  'grazie per aver guardato il video',
  'grazie per aver guardato',
  'grazie a tutti per la visione',
  'iscriviti al canale',
  'iscrivetevi al canale',
  'musica',
  'musica di sottofondo',
  'applausi',
  'risate',
  'a presto',
]

export type SegmentoParlato = { da: number; a: number; testo: string }

export type EsitoTrascrizione =
  | {
      esito: 'pronta'
      trascrizione: string
      segmenti: SegmentoParlato[]
      gancio: string | null
      modello: string
      /** the audio seconds Groq bills for this request */
      secondiFatturati: number
    }
  | { esito: 'senza_parlato'; modello: string; secondiFatturati: number }
  | { esito: 'spenta' }
  /** Groq's rate limit: the step goes back to the queue and stops the chain */
  | { esito: 'limite'; riprovaTraSecondi: number | null }
  | { esito: 'fallita'; secondiFatturati: number }

export function modelloTrascrizione(): string {
  return process.env.MARKETING_MODELLO_TRASCRIZIONE?.trim() || MODELLO_PREDEFINITO
}

export function trascrizioneAttiva(): boolean {
  return Boolean(process.env.ALFIRE_API_KEY?.trim())
}

/** Lower case, no accents, no punctuation, single spaces. */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const PAROLE_VOCABOLARIO = normalizza(VOCABOLARIO).split(' ')

/** `ECO_PAROLE` words in a row of the vocabulary, in its order: Whisper repeating its prompt. */
function eco(testo: string): boolean {
  const parole = normalizza(testo).split(' ')
  for (let i = 0; i + ECO_PAROLE <= parole.length; i++) {
    const finestra = parole.slice(i, i + ECO_PAROLE).join(' ')
    for (let j = 0; j + ECO_PAROLE <= PAROLE_VOCABOLARIO.length; j++) {
      if (finestra === PAROLE_VOCABOLARIO.slice(j, j + ECO_PAROLE).join(' ')) return true
    }
  }
  return false
}

type SegmentoGrezzo = {
  start?: unknown
  end?: unknown
  text?: unknown
  avg_logprob?: unknown
  no_speech_prob?: unknown
  compression_ratio?: unknown
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * The verbose_json of Whisper as what the app keeps: the segments that are
 * speech (no `no_speech_prob` above 0.6, no doubtful one with a high
 * compression, no ghost sentence, no echo of the prompt), the text, the hook.
 */
export function analizzaVerbose(
  risposta: { text?: unknown; segments?: unknown },
): { trascrizione: string; segmenti: SegmentoParlato[]; gancio: string | null } | null {
  const grezzi = Array.isArray(risposta.segments) ? (risposta.segments as SegmentoGrezzo[]) : []
  const segmenti: SegmentoParlato[] = []
  for (const g of grezzi) {
    const testo = typeof g.text === 'string' ? g.text.replace(/\s+/g, ' ').trim() : ''
    const da = num(g.start)
    const a = num(g.end)
    if (!testo || da === null || a === null || a < da) continue
    const noSpeech = num(g.no_speech_prob)
    const logprob = num(g.avg_logprob)
    const compressione = num(g.compression_ratio)
    if (noSpeech !== null && noSpeech > NO_SPEECH_MAX) continue
    if (logprob !== null && compressione !== null && logprob < LOGPROB_MIN && compressione > COMPRESSIONE_MAX) continue
    const norm = normalizza(testo)
    if (norm === '' || FRASI_FANTASMA.includes(norm) || /^sottotitoli\b/.test(norm) || norm.includes('amara org')) continue
    if (eco(testo)) continue
    segmenti.push({ da: Math.round(da * 10) / 10, a: Math.round(a * 10) / 10, testo })
  }
  const parlato = segmenti.reduce((somma, s) => somma + (s.a - s.da), 0)
  if (parlato < PARLATO_MINIMO_S) return null
  const gancio = segmenti
    .filter((s) => s.da < GANCIO_SECONDI)
    .map((s) => s.testo)
    .join(' ')
    .slice(0, GANCIO_MAX)
    .trim()
  return {
    trascrizione: segmenti.map((s) => s.testo).join(' ').slice(0, 20_000),
    segmenti: segmenti.slice(0, 400),
    gancio: gancio || null,
  }
}

/**
 * Whisper on the FLAC at `file`. `durataSecondi`: what the probe said, for the
 * seconds Groq bills (at least 10 a request). A rate limit is its own answer
 * (the step waits); any other failure is `fallita`. Never throws, never logs
 * the audio, the text or the key.
 */
export async function trascriviAudio(op: {
  file: string
  durataSecondi: number | null
  segnale?: AbortSignal
  fetch?: typeof fetch
}): Promise<EsitoTrascrizione> {
  if (!trascrizioneAttiva()) return { esito: 'spenta' }
  const modello = modelloTrascrizione()
  const fatturati = Math.max(SECONDI_MINIMI_FATTURATI, Math.ceil(op.durataSecondi ?? SECONDI_MINIMI_FATTURATI))
  const base = (process.env.ALFIRE_BASE_URL?.trim() || BASE_PREDEFINITA).replace(/\/+$/, '')
  try {
    const corpo = new FormData()
    corpo.append('file', new Blob([new Uint8Array(await readFile(op.file))], { type: 'audio/flac' }), 'audio.flac')
    corpo.append('model', modello)
    corpo.append('language', 'it')
    corpo.append('response_format', 'verbose_json')
    corpo.append('timestamp_granularities[]', 'segment')
    corpo.append('temperature', '0')
    corpo.append('prompt', VOCABOLARIO)
    const segnali = [AbortSignal.timeout(TIMEOUT_MS), ...(op.segnale ? [op.segnale] : [])]
    const risposta = await (op.fetch ?? fetch)(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.ALFIRE_API_KEY}` },
      body: corpo,
      signal: AbortSignal.any(segnali),
    })
    ricordaLimitiVoce(risposta.headers)
    if (risposta.status === 429) {
      // no header is an unknown wait, not zero (Number(null) is 0)
      const intestazione = risposta.headers.get('retry-after')
      const attesa = intestazione === null || intestazione.trim() === '' ? Number.NaN : Number(intestazione)
      return { esito: 'limite', riprovaTraSecondi: Number.isFinite(attesa) && attesa >= 0 ? attesa : null }
    }
    if (!risposta.ok) return { esito: 'fallita', secondiFatturati: fatturati }
    const dati = (await risposta.json()) as { text?: unknown; segments?: unknown; duration?: unknown }
    const durata = num(dati.duration)
    const secondiFatturati = Math.max(SECONDI_MINIMI_FATTURATI, Math.ceil(durata ?? op.durataSecondi ?? SECONDI_MINIMI_FATTURATI))
    const letto = analizzaVerbose(dati)
    return letto ? { esito: 'pronta', ...letto, modello, secondiFatturati } : { esito: 'senza_parlato', modello, secondiFatturati }
  } catch {
    return { esito: 'fallita', secondiFatturati: fatturati }
  }
}
