import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const vediReel = vi.fn()
vi.mock('@/lib/marketing/analisi/visione', () => ({ vediReel: (...a: unknown[]) => vediReel(...a) }))
vi.mock('@/lib/marketing/analisi/analizza', () => ({ datiCalendario: async () => ({ calendario: null, candidati: [] }) }))
vi.mock('@/lib/instagram/contenuti', () => ({
  origineLocale: () => null,
  creaGraphContenuti: () => ({ video: async () => ({ url: 'https://x.cdninstagram.com/v.mp4', copertina: null, audio: 'ORIGINAL_SOUND' }) }),
}))
vi.mock('@/lib/instagram/richieste', () => ({ baseGraph: () => 'https://graph.instagram.com', ErroreInstagram: class extends Error {} }))
vi.mock('@/lib/marketing/video/scarica', () => ({
  COPERTINA_MAX_BYTE: 1,
  COPERTINA_TIMEOUT_MS: 1,
  VIDEO_MAX_BYTE: 1,
  VIDEO_TIMEOUT_MS: 1,
  nuovaCartella: async () => '/tmp/alpha-reel-test',
  pulisciCartelleVecchie: async () => undefined,
  togliCartella: async () => undefined,
  scarica: async () => ({ ok: true, byte: 10 }),
}))
vi.mock('@/lib/marketing/video/ffmpeg', () => ({
  percorsoFfmpeg: async () => '/bin/ffmpeg',
  riduciCopertina: async () => null,
  estraiDalVideo: async () => ({
    durata: 30,
    larghezza: 504,
    altezza: 896,
    ha_audio: true,
    audio: '/tmp/a.flac',
    fotogrammi: [
      { t: 0, file: '/tmp/f1.jpg', parte: 'gancio' },
      { t: 6, file: '/tmp/f2.jpg', parte: 'corpo' },
    ],
    problema: null,
  }),
}))
vi.mock('@/lib/marketing/trascrizione', () => ({
  trascriviAudio: async () => ({
    esito: 'pronta',
    trascrizione: 'x',
    segmenti: [
      { da: 0, a: 4, testo: 'Ciao Gustavo, scrivimi a gustavo@esempio.it o al 333 123 4567' },
      { da: 6, a: 9, testo: 'Il percorso costa 500 euro, vedi https://esempio.it/offerta' },
    ],
    gancio: 'x',
    modello: 'whisper',
    secondiFatturati: 10,
  }),
}))
vi.mock('node:fs/promises', async (originale) => ({ ...(await originale<typeof import('node:fs/promises')>()), readFile: async () => Buffer.from('jpeg') }))

import { leggiReel } from '@/lib/marketing/video/leggi'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'

function dbFinto() {
  const righe: Record<string, unknown> = {
    instagram_contenuti: { media_id: 'm1', shortcode: 'SeedX', pubblicato_il: '2026-10-10T08:00:00Z', didascalia: 'Ciao', eliminato_il: null, audio_tipo: null },
    instagram_letture: { stato: 'in_corso', richiesta: 'completa', trascrizione_esito: null, trascrizione: null, segmenti: null, gancio_parlato: null, modello_trascrizione: null },
  }
  const from = (tabella: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: righe[tabella] ?? null, error: null }) }
    return q
  }
  const rpc = vi.fn(async (nome: string) => {
    if (nome === 'instagram_token') return { data: 'token-di-prova', error: null }
    if (nome === 'marketing_da_oscurare') return { data: ['gustavo'], error: null }
    return { data: null, error: null }
  })
  return { db: { from, rpc } as unknown as AdminClient, rpc }
}

beforeEach(() => {
  vediReel.mockReset()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

describe('leggiReel: il parlato che arriva a Claude', () => {
  it('passa dai nomi da oscurare, dai link, dagli importi, dalle email e dai telefoni, come l’analisi', async () => {
    vediReel.mockResolvedValue({ ok: false, codice: 'tempo', uso: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } })
    const { db } = dbFinto()
    await leggiReel({ db, media_id: 'm1', entro: Date.now() + 240_000 })
    expect(vediReel).toHaveBeenCalledTimes(1)
    const inviato = JSON.stringify(vediReel.mock.calls[0][0].immagini.map((i: { parlato?: string }) => i.parlato))
    expect(inviato).toContain('[lead]')
    expect(inviato).not.toMatch(/gustavo/i)
    expect(inviato).not.toContain('esempio.it')
    expect(inviato).not.toContain('4567')
    expect(inviato).not.toContain('500 euro')
    expect(inviato).not.toContain('https://')
  })
})
