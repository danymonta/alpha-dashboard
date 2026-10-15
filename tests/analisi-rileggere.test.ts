import { describe, expect, it } from 'vitest'

import { dovrebbeRileggere, type LetturaPerRileggere } from '@/lib/marketing/analisi/rileggere'

const OPZ = { versionePrompt: 'v2', trascrizioneAttiva: true }
const BUONA: LetturaPerRileggere = { richiesta: 'completa', visione_esito: 'pronta', versione_prompt_visione: 'v2', video: 'letto', trascrizione_esito: 'pronta' }

describe('dovrebbeRileggere', () => {
  it('una lettura buona e aggiornata non si rifà', () => {
    expect(dovrebbeRileggere(BUONA, OPZ)).toBe(false)
    expect(dovrebbeRileggere({ ...BUONA, trascrizione_esito: 'senza_parlato' }, OPZ)).toBe(false)
    expect(dovrebbeRileggere({ ...BUONA, trascrizione_esito: 'senza_audio' }, OPZ)).toBe(false)
  })

  it('manca, solo il parlato, senza scheda o con un prompt vecchio: si rifà', () => {
    expect(dovrebbeRileggere(null, OPZ)).toBe(true)
    expect(dovrebbeRileggere({ ...BUONA, richiesta: 'trascrizione' }, OPZ)).toBe(true)
    expect(dovrebbeRileggere({ ...BUONA, visione_esito: 'rifiutata' }, OPZ)).toBe(true)
    expect(dovrebbeRileggere({ ...BUONA, versione_prompt_visione: 'v1' }, OPZ)).toBe(true)
  })

  it('una causa che può passare (video non scaricato, ffmpeg, Whisper fallito) si rifà', () => {
    expect(dovrebbeRileggere({ ...BUONA, video: 'non_scaricabile', trascrizione_esito: 'senza_video' }, OPZ)).toBe(true)
    expect(dovrebbeRileggere({ ...BUONA, video: 'senza_estrattore', trascrizione_esito: 'senza_video' }, OPZ)).toBe(true)
    expect(dovrebbeRileggere({ ...BUONA, trascrizione_esito: 'fallita' }, OPZ)).toBe(true)
  })

  it('Whisper spento si rifà solo se ora la chiave c’è', () => {
    expect(dovrebbeRileggere({ ...BUONA, trascrizione_esito: 'spenta' }, OPZ)).toBe(true)
    expect(dovrebbeRileggere({ ...BUONA, trascrizione_esito: 'spenta' }, { ...OPZ, trascrizioneAttiva: false })).toBe(false)
  })

  it('un reel senza video da Instagram (musica protetta) non si rilegge per quello', () => {
    expect(dovrebbeRileggere({ ...BUONA, video: 'senza_media_url', trascrizione_esito: 'senza_video', visione_esito: 'pronta' }, OPZ)).toBe(false)
  })
})
