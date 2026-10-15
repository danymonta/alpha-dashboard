import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  analizzaVerbose,
  FRASI_FANTASMA,
  modelloTrascrizione,
  normalizza,
  trascriviAudio,
  VOCABOLARIO,
} from '@/lib/marketing/trascrizione'

// What is said in a reel (1.36.0): Whisper's verbose_json against a fake fetch (never Groq), and the filter
// of the segments Whisper invents on music and silence (fixtures of its real answers, with invented words).

let cartella: string
let flac: string

beforeAll(async () => {
  cartella = await mkdtemp(path.join(tmpdir(), 'alpha-prova-whisper-'))
  flac = path.join(cartella, 'audio.flac')
  await writeFile(flac, Buffer.alloc(2048, 3))
})

afterAll(async () => {
  await rm(cartella, { recursive: true, force: true })
})

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('ALFIRE_API_KEY', 'finta')
  vi.stubEnv('ALFIRE_BASE_URL', 'http://127.0.0.1:6013/v1')
})

const seg = (start: number, end: number, text: string, extra: Record<string, number> = {}) => ({
  id: 0, seek: 0, start, end, text: ` ${text}`, tokens: [], temperature: 0, avg_logprob: -0.25, compression_ratio: 1.4, no_speech_prob: 0.02, ...extra,
})

describe('analizzaVerbose, il filtro dei segmenti', () => {
  it('un parlato vero: il testo, i segmenti con tempi, il gancio (i segmenti prima dei 3 secondi)', () => {
    const r = analizzaVerbose({
      text: 'ignorato',
      segments: [seg(0, 2.4, 'Niente sbarra? Nessun problema.'), seg(2.4, 6.8, 'Ti mostro tre alternative.'), seg(7, 12, 'Salva il video.')],
    })
    expect(r).toEqual({
      trascrizione: 'Niente sbarra? Nessun problema. Ti mostro tre alternative. Salva il video.',
      segmenti: [
        { da: 0, a: 2.4, testo: 'Niente sbarra? Nessun problema.' },
        { da: 2.4, a: 6.8, testo: 'Ti mostro tre alternative.' },
        { da: 7, a: 12, testo: 'Salva il video.' },
      ],
      gancio: 'Niente sbarra? Nessun problema. Ti mostro tre alternative.',
    })
  })

  it('musica e silenzio: no_speech_prob alto, o logprob basso con compressione alta, sono scartati', () => {
    expect(analizzaVerbose({ segments: [seg(0, 6, 'La la la la la', { no_speech_prob: 0.9 })] })).toBeNull()
    expect(analizzaVerbose({ segments: [seg(0, 6, 'Parole ripetute ripetute ripetute', { avg_logprob: -1.4, compression_ratio: 3 })] })).toBeNull()
    // doubtful on one side only: kept
    expect(analizzaVerbose({ segments: [seg(0, 6, 'Una frase vera e lunga abbastanza', { avg_logprob: -1.4 })] })).not.toBeNull()
    expect(analizzaVerbose({ segments: [seg(0, 6, 'Un’altra frase vera e lunga', { compression_ratio: 3 })] })).not.toBeNull()
  })

  it('le frasi fantasma di Whisper sono scartate, in ogni forma di scrittura', () => {
    for (const frase of [
      'Sottotitoli a cura di QTSS',
      'Sottotitoli creati dalla comunità Amara.org',
      'Grazie per la visione!',
      'Iscriviti al canale',
      'Musica',
      'Sottotitoli e revisione a cura di QTSS.',
    ]) {
      expect(analizzaVerbose({ segments: [seg(0, 8, frase)] }), frase).toBeNull()
    }
    expect(FRASI_FANTASMA.every((f) => f === normalizza(f))).toBe(true)
    // a real phrase that contains one of the words is not a ghost
    expect(analizzaVerbose({ segments: [seg(0, 8, 'La musica che ascolto mentre mi alleno aiuta')] })).not.toBeNull()
  })

  it('l’eco del vocabolario dato a Whisper è scartata', () => {
    expect(analizzaVerbose({ segments: [seg(0, 8, VOCABOLARIO)] })).toBeNull()
    expect(analizzaVerbose({ segments: [seg(0, 8, 'Percorso Alpha, Dany, allenamento a corpo libero, sbarra per trazioni')] })).toBeNull()
    // fewer than 6 words in a row: a normal sentence
    expect(analizzaVerbose({ segments: [seg(0, 8, 'Faccio allenamento a corpo libero ogni giorno da anni')] })).not.toBeNull()
  })

  it('meno di 2 secondi di parlato è senza parlato', () => {
    expect(analizzaVerbose({ segments: [seg(0, 1.5, 'Ciao a tutti')] })).toBeNull()
    expect(analizzaVerbose({ segments: [seg(0, 1, 'Ciao'), seg(5, 6.2, 'a presto davvero')] })).not.toBeNull()
    expect(analizzaVerbose({ segments: [] })).toBeNull()
    expect(analizzaVerbose({})).toBeNull()
  })

  it('segmenti rotti (senza tempi, senza testo, a ritroso) si saltano', () => {
    const r = analizzaVerbose({ segments: [{ text: 'senza tempi' }, seg(5, 3, 'a ritroso'), seg(0, 4, '   '), seg(4, 9, 'Questo sì, ascolta bene')] })
    expect(r?.segmenti).toEqual([{ da: 4, a: 9, testo: 'Questo sì, ascolta bene' }])
    expect(r?.gancio).toBeNull()
  })
})

describe('trascriviAudio', () => {
  it('la richiesta: whisper-large-v3, italiano, verbose_json, segmenti, temperatura 0, il vocabolario; il FLAC com’è', async () => {
    let corpo: FormData | null = null
    let url = ''
    let intestazioni: Headers | null = null
    const fetchFinto = vi.fn(async (u: string, init: RequestInit) => {
      url = u
      corpo = init.body as FormData
      intestazioni = new Headers(init.headers)
      return Response.json({ duration: 6, text: 'x', segments: [seg(0, 4, 'Niente sbarra? Nessun problema.')] }, { headers: { 'x-ratelimit-limit-requests': '2000' } })
    })
    const r = await trascriviAudio({ file: flac, durataSecondi: 42.3, fetch: fetchFinto as unknown as typeof fetch })
    expect(url).toBe('http://127.0.0.1:6013/v1/audio/transcriptions')
    expect(intestazioni!.get('authorization')).toBe('Bearer finta')
    const f = corpo as unknown as FormData
    expect(f.get('model')).toBe('whisper-large-v3')
    expect(f.get('language')).toBe('it')
    expect(f.get('response_format')).toBe('verbose_json')
    expect(f.get('timestamp_granularities[]')).toBe('segment')
    expect(f.get('temperature')).toBe('0')
    expect(f.get('prompt')).toBe(VOCABOLARIO)
    const file = f.get('file') as File
    expect(file.name).toBe('audio.flac')
    expect(file.size).toBe(2048)
    expect(r).toMatchObject({ esito: 'pronta', modello: 'whisper-large-v3', secondiFatturati: 10 })
  })

  it('i secondi fatturati: la durata di Whisper, almeno 10 a richiesta', async () => {
    const con = (duration: number | null) => vi.fn(async () => Response.json({ ...(duration === null ? {} : { duration }), segments: [seg(0, 4, 'Una frase vera e lunga')] }))
    expect(await trascriviAudio({ file: flac, durataSecondi: 3, fetch: con(3) as never })).toMatchObject({ secondiFatturati: 10 })
    expect(await trascriviAudio({ file: flac, durataSecondi: 60, fetch: con(61.2) as never })).toMatchObject({ secondiFatturati: 62 })
    expect(await trascriviAudio({ file: flac, durataSecondi: 45.5, fetch: con(null) as never })).toMatchObject({ secondiFatturati: 46 })
  })

  it('solo musica: senza_parlato, fatturata lo stesso', async () => {
    const fetchFinto = vi.fn(async () => Response.json({ duration: 30, segments: [seg(0, 30, 'Sottotitoli a cura di QTSS')] }))
    expect(await trascriviAudio({ file: flac, durataSecondi: 30, fetch: fetchFinto as never })).toEqual({
      esito: 'senza_parlato',
      modello: 'whisper-large-v3',
      secondiFatturati: 30,
    })
  })

  it('il modello si cambia con MARKETING_MODELLO_TRASCRIZIONE', async () => {
    vi.stubEnv('MARKETING_MODELLO_TRASCRIZIONE', 'whisper-large-v3-turbo')
    expect(modelloTrascrizione()).toBe('whisper-large-v3-turbo')
    vi.stubEnv('MARKETING_MODELLO_TRASCRIZIONE', '')
    expect(modelloTrascrizione()).toBe('whisper-large-v3')
  })

  it('un 429 è il suo esito, con il retry-after; gli altri errori sono «fallita» e non lanciano mai', async () => {
    const limite = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '37' } }))
    expect(await trascriviAudio({ file: flac, durataSecondi: 20, fetch: limite as never })).toEqual({ esito: 'limite', riprovaTraSecondi: 37 })
    const senzaAttesa = vi.fn(async () => new Response('{}', { status: 429 }))
    expect(await trascriviAudio({ file: flac, durataSecondi: 20, fetch: senzaAttesa as never })).toEqual({ esito: 'limite', riprovaTraSecondi: null })
    const rotto = vi.fn(async () => new Response('boom', { status: 500 }))
    expect(await trascriviAudio({ file: flac, durataSecondi: 20, fetch: rotto as never })).toEqual({ esito: 'fallita', secondiFatturati: 20 })
    const rete = vi.fn(async () => {
      throw new Error('ECONNRESET http://127.0.0.1:6013/v1?chiave=segreta')
    })
    const r = await trascriviAudio({ file: flac, durataSecondi: 20, fetch: rete as never })
    expect(r).toEqual({ esito: 'fallita', secondiFatturati: 20 })
    expect(JSON.stringify(r)).not.toContain('segreta')
    expect(await trascriviAudio({ file: path.join(cartella, 'non-esiste.flac'), durataSecondi: 20, fetch: rete as never })).toMatchObject({ esito: 'fallita' })
  })

  it('senza la chiave di Alfire: spenta, e nessuna richiesta', async () => {
    vi.stubEnv('ALFIRE_API_KEY', '')
    const fetchFinto = vi.fn()
    expect(await trascriviAudio({ file: flac, durataSecondi: 20, fetch: fetchFinto as never })).toEqual({ esito: 'spenta' })
    expect(fetchFinto).not.toHaveBeenCalled()
  })
})
