import { mkdtemp, readFile, rm, stat, utimes } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { nuovaCartella, pulisciCartelleVecchie, scarica, togliCartella } from '@/lib/marketing/video/scarica'

// The download of a reel (1.36.0): only the CDN of Instagram (here, the test server's own origin stands
// for it), redirects by hand and re-checked, a byte limit, a time limit, the right content-type, and
// never the URL in an answer.

let server: Server
let origine = ''
let cartella: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/ok.mp4') {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      return res.end(Buffer.alloc(1000, 7))
    }
    if (url === '/ok.jpg') {
      res.writeHead(200, { 'content-type': 'image/jpeg' })
      return res.end(Buffer.alloc(500, 9))
    }
    if (url === '/salta') {
      res.writeHead(302, { location: '/ok.mp4' })
      return res.end()
    }
    if (url === '/salta-fuori') {
      res.writeHead(302, { location: 'https://esempio.test/altrove.mp4' })
      return res.end()
    }
    if (url === '/salta-in-https-cdn') {
      res.writeHead(302, { location: 'http://127.0.0.1:1/non-della-cdn.mp4' })
      return res.end()
    }
    if (url.startsWith('/catena/')) {
      res.writeHead(302, { location: `/catena/${Number(url.split('/')[2]) + 1}` })
      return res.end()
    }
    if (url === '/grande-dichiarato') {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(500 * 1024 * 1024) })
      return res.end()
    }
    if (url === '/grande-senza-misura') {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      const pezzo = Buffer.alloc(64 * 1024, 1)
      for (let i = 0; i < 40; i++) res.write(pezzo)
      return res.end()
    }
    if (url === '/html') {
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end('<html></html>')
    }
    if (url === '/scaduto') {
      res.writeHead(403)
      return res.end()
    }
    if (url === '/vuoto') {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      return res.end()
    }
    if (url === '/lento') {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      res.write(Buffer.alloc(10))
      return // never ends
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((pronto) => server.listen(0, '127.0.0.1', () => pronto()))
  origine = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.closeAllConnections()
  return new Promise<void>((chiuso) => server.close(() => chiuso()))
})

beforeEach(async () => {
  cartella = await mkdtemp(path.join(tmpdir(), 'alpha-prova-scarica-'))
})

afterEach(async () => {
  await rm(cartella, { recursive: true, force: true })
})

const prova = (url: string, extra: Partial<Parameters<typeof scarica>[0]> = {}) =>
  scarica({ url, file: path.join(cartella, 'f'), tipo: 'video', max: 200_000, timeoutMs: 5_000, locale: origine, ...extra })

describe('scarica', () => {
  it('un video della CDN (qui l’origine locale): lo scrive e dice quanti byte', async () => {
    expect(await prova(`${origine}/ok.mp4`)).toEqual({ ok: true, byte: 1000 })
    expect((await readFile(path.join(cartella, 'f'))).length).toBe(1000)
  })

  it('una copertina: image/*', async () => {
    expect(await prova(`${origine}/ok.jpg`, { tipo: 'image' })).toEqual({ ok: true, byte: 500 })
    // a video where an image is wanted: no
    expect(await prova(`${origine}/ok.mp4`, { tipo: 'image' })).toMatchObject({ ok: false, codice: 'non_scaricabile' })
  })

  it('segue un reindirizzamento dentro la CDN, ma non uno fuori né uno senza fine', async () => {
    expect(await prova(`${origine}/salta`)).toEqual({ ok: true, byte: 1000 })
    expect(await prova(`${origine}/salta-fuori`)).toMatchObject({ ok: false, codice: 'non_scaricabile' })
    expect(await prova(`${origine}/salta-in-https-cdn`)).toMatchObject({ ok: false, codice: 'non_scaricabile' })
    // more than 3 hops
    expect(await prova(`${origine}/catena/0`)).toMatchObject({ ok: false, codice: 'non_scaricabile' })
  })

  it('un host che non è la CDN non parte nemmeno: nessuna richiesta', async () => {
    const fetchFinto = vi.fn()
    for (const url of ['https://esempio.test/v.mp4', 'http://scontent.cdninstagram.com/v.mp4', 'https://cdninstagram.com.altrove.test/v.mp4', 'file:///etc/passwd']) {
      expect(await prova(url, { fetch: fetchFinto as unknown as typeof fetch, locale: null })).toMatchObject({ ok: false, codice: 'non_scaricabile' })
    }
    expect(fetchFinto).not.toHaveBeenCalled()
  })

  it('l’origine locale vale solo se data: senza, anche http su loopback no', async () => {
    expect(await prova(`${origine}/ok.mp4`, { locale: null })).toMatchObject({ ok: false, codice: 'non_scaricabile' })
  })

  it('oltre il tetto di byte: troppo_grande, dichiarato o contato durante il download', async () => {
    expect(await prova(`${origine}/grande-dichiarato`, { max: 1_000_000 })).toMatchObject({ ok: false, codice: 'troppo_grande' })
    expect(await prova(`${origine}/grande-senza-misura`, { max: 200_000 })).toMatchObject({ ok: false, codice: 'troppo_grande' })
  })

  it('un content-type sbagliato, un 403 (con lo stato, per rileggere l’URL firmato), un file vuoto, un 404', async () => {
    expect(await prova(`${origine}/html`)).toMatchObject({ ok: false, codice: 'non_scaricabile', stato: 200 })
    expect(await prova(`${origine}/scaduto`)).toEqual({ ok: false, codice: 'non_scaricabile', stato: 403 })
    expect(await prova(`${origine}/vuoto`)).toMatchObject({ ok: false, codice: 'non_scaricabile' })
    expect(await prova(`${origine}/nonc-e`)).toMatchObject({ ok: false, codice: 'non_scaricabile', stato: 404 })
  })

  it('un download che non finisce: il tempo scade, e la risposta non contiene l’indirizzo', async () => {
    const r = await prova(`${origine}/lento`, { timeoutMs: 400 })
    expect(r).toMatchObject({ ok: false, codice: 'non_scaricabile' })
    expect(JSON.stringify(r)).not.toContain('127.0.0.1')
  })

  it('la scadenza del passo accorcia il tempo', async () => {
    const t0 = Date.now()
    const r = await prova(`${origine}/lento`, { timeoutMs: 30_000, entro: Date.now() + 500 })
    expect(r.ok).toBe(false)
    expect(Date.now() - t0).toBeLessThan(5_000)
  })
})

describe('le cartelle di /tmp', () => {
  it('nuova, tolta, e quelle di un passo morto (più vecchie di 30 minuti) si puliscono all’avvio', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'alpha-prova-base-'))
    try {
      const nuova = await nuovaCartella(base)
      const vecchia = await nuovaCartella(base)
      const altra = path.join(base, 'non-mia')
      await import('node:fs/promises').then((fs) => fs.mkdir(altra))
      const quarantaMinutiFa = new Date(Date.now() - 40 * 60_000)
      await utimes(vecchia, quarantaMinutiFa, quarantaMinutiFa)
      await utimes(altra, quarantaMinutiFa, quarantaMinutiFa)
      await pulisciCartelleVecchie(base)
      await expect(stat(nuova)).resolves.toBeTruthy()
      await expect(stat(vecchia)).rejects.toThrow()
      // only the folders of this module: another is never touched
      await expect(stat(altra)).resolves.toBeTruthy()
      await togliCartella(nuova)
      await expect(stat(nuova)).rejects.toThrow()
      // removing what is not there never throws
      await expect(togliCartella(nuova)).resolves.toBeUndefined()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
