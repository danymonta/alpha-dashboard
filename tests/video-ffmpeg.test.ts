import { copyFile, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { generaReelFinti } from '../e2e/genera-reel-finto.mjs'
import { dimensioniJpeg } from '@/lib/marketing/video/leggi'
import { eseguiFfmpeg, estraiDalVideo, filtroScala, leggiSonda, percorsoFfmpeg, riduciCopertina, tempoPasso } from '@/lib/marketing/video/ffmpeg'

// ffmpeg on the server (1.36.0): the probe's reading of stderr (real outputs saved as fixtures),
// the arguments that keep it on the file, and, with the real binary, the frames of a 6 second clip.

const STDERR_CON_AUDIO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'video.mp4':
  Duration: 00:00:58.43, start: 0.000000, bitrate: 3512 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1080x1920 [SAR 1:1 DAR 9:16], 3380 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)
At least one output file must be specified`

const STDERR_SENZA_AUDIO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'video.mp4':
  Duration: 00:01:02.00, start: 0.000000, bitrate: 1200 kb/s
  Stream #0:0[0x1](und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p(tv, bt709), 720x1280, 1100 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
At least one output file must be specified`

describe('leggiSonda', () => {
  it('durata, dimensioni e audio dallo stderr di ffmpeg', () => {
    expect(leggiSonda(STDERR_CON_AUDIO)).toEqual({ durata: 58.43, larghezza: 1080, altezza: 1920, audio: true })
    expect(leggiSonda(STDERR_SENZA_AUDIO)).toEqual({ durata: 62, larghezza: 720, altezza: 1280, audio: false })
  })

  it('un file illeggibile: tutto null, mai un errore', () => {
    expect(leggiSonda('moov atom not found')).toEqual({ durata: null, larghezza: null, altezza: null, audio: false })
    expect(leggiSonda('')).toEqual({ durata: null, larghezza: null, altezza: null, audio: false })
  })
})

describe('gli argomenti', () => {
  it('il filtro porta il lato lungo a 896 (504x896 per un 9:16) o a 1280', () => {
    expect(filtroScala(896)).toBe("scale=w='if(gte(ih,iw),-2,896)':h='if(gte(ih,iw),896,-2)':flags=lanczos")
    expect(filtroScala(1280)).toContain('1280')
  })

  it('un passaggio dura al massimo 90 secondi e mai oltre la scadenza del passo meno il margine', () => {
    const adesso = 1_000_000
    expect(tempoPasso(adesso + 240_000, adesso)).toBe(90_000)
    expect(tempoPasso(adesso + 160_000, adesso)).toBe(60_000)
    expect(tempoPasso(adesso + 50_000, adesso)).toBe(5_000)
  })
})

describe('dimensioniJpeg', () => {
  it('legge le misure di un JPEG, e null per altro', async () => {
    const file = generaReelFinti().copertina
    expect(dimensioniJpeg(await readFile(file))).toEqual({ larghezza: 1080, altezza: 1920 })
    expect(dimensioniJpeg(Buffer.from('non sono un jpeg'))).toBeNull()
  })
})

const conBinario = existsSync(path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'))

describe.skipIf(!conBinario)('col binario vero', () => {
  let cartella: string
  let bin: string
  let file: ReturnType<typeof generaReelFinti>

  beforeAll(async () => {
    file = generaReelFinti()
    bin = (await percorsoFfmpeg()) as string
    cartella = await mkdtemp(path.join(tmpdir(), 'alpha-prova-ffmpeg-'))
  })

  afterAll(async () => {
    await rm(cartella, { recursive: true, force: true })
  })

  it('trova il binario', () => {
    expect(bin).toContain('ffmpeg')
  })

  it('un clip di 6 secondi: durata, audio FLAC, i fotogrammi di 504x896 coi tempi giusti', async () => {
    const lavoro = await mkdtemp(path.join(cartella, 'a-'))
    const video = path.join(lavoro, 'video.mp4')
    await copyFile(file.reel, video)
    const estratto = await estraiDalVideo({ bin, file: video, cartella: lavoro, entro: Date.now() + 240_000 })
    expect(estratto.problema).toBeNull()
    expect(estratto.durata).toBeCloseTo(6, 0)
    expect(estratto.ha_audio).toBe(true)
    expect(estratto.audio && (await stat(estratto.audio)).size).toBeGreaterThan(1000)
    const t = estratto.fotogrammi.map((f) => f.t)
    // 6 hook frames (0 to 3), the body at 4 s, the closing
    expect(t.slice(0, 6)).toEqual([0, 0.5, 1, 1.5, 2, 3])
    expect(t).toContain(4)
    expect(Math.max(...t)).toBeLessThanOrEqual(6)
    // the number in the file name is twice the time (-frame_pts with fps=2)
    for (const f of estratto.fotogrammi) {
      expect(Number(/f_(\d+)\.jpg$/.exec(f.file)?.[1])).toBe(f.t * 2)
    }
    // 9:16 at 896: 504 x 896
    const misure = dimensioniJpeg(await readFile(estratto.fotogrammi[0].file))
    expect(misure).toEqual({ larghezza: 504, altezza: 896 })
  })

  it('con 1280 il lato lungo è 1280', async () => {
    const lavoro = await mkdtemp(path.join(cartella, 'b-'))
    const video = path.join(lavoro, 'video.mp4')
    await copyFile(file.reel, video)
    const estratto = await estraiDalVideo({ bin, file: video, cartella: lavoro, entro: Date.now() + 240_000, lato: 1280 })
    expect(dimensioniJpeg(await readFile(estratto.fotogrammi[0].file))).toEqual({ larghezza: 720, altezza: 1280 })
  })

  it('senza audio non c’è il FLAC', async () => {
    const lavoro = await mkdtemp(path.join(cartella, 'c-'))
    const video = path.join(lavoro, 'video.mp4')
    await copyFile(file.senzaAudio, video)
    const estratto = await estraiDalVideo({ bin, file: video, cartella: lavoro, entro: Date.now() + 240_000 })
    expect(estratto.ha_audio).toBe(false)
    expect(estratto.audio).toBeNull()
    expect(estratto.fotogrammi.length).toBeGreaterThan(6)
  })

  it('soloAudio: l’audio e nessun fotogramma', async () => {
    const lavoro = await mkdtemp(path.join(cartella, 'd-'))
    const video = path.join(lavoro, 'video.mp4')
    await copyFile(file.reel, video)
    const estratto = await estraiDalVideo({ bin, file: video, cartella: lavoro, entro: Date.now() + 240_000, soloAudio: true })
    expect(estratto.audio).not.toBeNull()
    expect(estratto.fotogrammi).toEqual([])
    expect((await readdir(lavoro)).some((n) => n.endsWith('.jpg'))).toBe(false)
  })

  it('un file che finge di essere un mp4: problema «errore», nessun fotogramma, mai un’eccezione', async () => {
    const lavoro = await mkdtemp(path.join(cartella, 'e-'))
    const video = path.join(lavoro, 'video.mp4')
    await writeFile(video, '#EXTM3U\n#EXT-X-VERSION:3\nhttp://127.0.0.1:1/segmento.ts\n')
    const estratto = await estraiDalVideo({ bin, file: video, cartella: lavoro, entro: Date.now() + 240_000 })
    expect(estratto.problema).toBe('errore')
    expect(estratto.fotogrammi).toEqual([])
  })

  it('un processo che non finisce in tempo è ucciso con SIGKILL', async () => {
    const r = await eseguiFfmpeg(bin, ['-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30', '-f', 'null', '-'], 1_000)
    expect(r.ucciso).toBe(true)
    expect(r.codice).toBeNull()
  })

  it('la copertina di 1080x1920 arriva a 504x896', async () => {
    const lavoro = await mkdtemp(path.join(cartella, 'f-'))
    const ridotta = await riduciCopertina({ bin, file: file.copertina, cartella: lavoro, entro: Date.now() + 240_000 })
    expect(ridotta).not.toBeNull()
    expect(dimensioniJpeg(await readFile(ridotta as string))).toEqual({ larghezza: 504, altezza: 896 })
  })
})
