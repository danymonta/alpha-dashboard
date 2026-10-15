import 'server-only'

import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { finished } from 'node:stream/promises'

import { urlDaLeggere } from '@/lib/instagram/contenuti'

/**
 * The download of a reel and its cover to /tmp (1.36.0, CLAUDE.md section 30),
 * to read them on the server and then forget them: nothing is kept.
 *
 * Only https to Instagram's CDN (cdninstagram.com, fbcdn.net), or, in the end
 * to end tests, the fake Graph API's own origin on a loopback host. The
 * redirects are followed by hand, at most 3, and every address is checked
 * again with the same rule. The video is at most 200 MB and 30 s, the cover
 * 10 MB and 10 s; the content-type must be video/* or image/*. The answer is
 * a code: never the URL, which is signed, nor a message that holds it.
 */

export const VIDEO_MAX_BYTE = 200 * 1024 * 1024
export const COPERTINA_MAX_BYTE = 10 * 1024 * 1024
export const VIDEO_TIMEOUT_MS = 30_000
export const COPERTINA_TIMEOUT_MS = 10_000
const REINDIRIZZAMENTI_MAX = 3
/** The folders of a step that died stay at most this long. */
const CARTELLA_VECCHIA_MS = 30 * 60_000
const PREFISSO = 'alpha-reel-'

export type CodiceScarico = 'troppo_grande' | 'non_scaricabile'
export type EsitoScarico =
  | { ok: true; byte: number }
  | { ok: false; codice: CodiceScarico; /** HTTP status of the CDN, when it answered (403: the signed URL has expired) */ stato: number | null }

/** A fresh folder /tmp/alpha-reel-<uuid>. */
export async function nuovaCartella(base: string = tmpdir()): Promise<string> {
  const cartella = path.join(base, `${PREFISSO}${randomUUID()}`)
  await mkdir(cartella, { recursive: true })
  return cartella
}

/** The folders a dead step left (an instance reused after it): older than 30 minutes go. Never throws. */
export async function pulisciCartelleVecchie(base: string = tmpdir(), adesso: number = Date.now()): Promise<void> {
  try {
    for (const nome of await readdir(base)) {
      if (!nome.startsWith(PREFISSO)) continue
      const percorso = path.join(base, nome)
      const s = await stat(percorso).catch(() => null)
      if (s && adesso - s.mtimeMs > CARTELLA_VECCHIA_MS) await rm(percorso, { recursive: true, force: true })
    }
  } catch {
    // /tmp not readable: nothing to clean
  }
}

/** Removes a folder; never throws. */
export async function togliCartella(cartella: string): Promise<void> {
  await rm(cartella, { recursive: true, force: true }).catch(() => undefined)
}

/**
 * Downloads `url` to `file`: video/* (up to `max` bytes) or image/*. Streams to
 * the file counting the bytes: past `max` it stops (`troppo_grande`).
 */
export async function scarica(op: {
  url: string
  file: string
  tipo: 'video' | 'image'
  max: number
  timeoutMs: number
  /** the fake Graph API's origin in the end to end tests (urlDaLeggere) */
  locale?: string | null
  fetch?: typeof fetch
  /** epoch ms: the step's deadline */
  entro?: number
}): Promise<EsitoScarico> {
  const fetchFn = op.fetch ?? fetch
  const scade = Math.min(Date.now() + op.timeoutMs, op.entro ?? Number.POSITIVE_INFINITY)
  const segnale = AbortSignal.timeout(Math.max(1_000, scade - Date.now()))
  const non = (stato: number | null = null): EsitoScarico => ({ ok: false, codice: 'non_scaricabile', stato })

  let indirizzo: string | null = urlDaLeggere(op.url, op.locale ?? null)
  if (!indirizzo) return non()
  try {
    for (let salto = 0; ; salto++) {
      const risposta = await fetchFn(indirizzo, { redirect: 'manual', signal: segnale, cache: 'no-store' })
      if (risposta.status >= 300 && risposta.status < 400) {
        await risposta.body?.cancel().catch(() => undefined)
        if (salto >= REINDIRIZZAMENTI_MAX) return non(risposta.status)
        const prossimo = risposta.headers.get('location')
        if (!prossimo) return non(risposta.status)
        let assoluto: string
        try {
          assoluto = new URL(prossimo, indirizzo).href
        } catch {
          return non(risposta.status)
        }
        // every address again with the same rule: a redirect never leaves the CDN
        indirizzo = urlDaLeggere(assoluto, op.locale ?? null)
        if (!indirizzo) return non(risposta.status)
        continue
      }
      if (!risposta.ok || !risposta.body) {
        await risposta.body?.cancel().catch(() => undefined)
        return non(risposta.status)
      }
      const tipo = (risposta.headers.get('content-type') ?? '').toLowerCase()
      if (!tipo.startsWith(`${op.tipo}/`)) {
        await risposta.body.cancel().catch(() => undefined)
        return non(risposta.status)
      }
      const dichiarati = Number(risposta.headers.get('content-length'))
      if (Number.isFinite(dichiarati) && dichiarati > op.max) {
        await risposta.body.cancel().catch(() => undefined)
        return { ok: false, codice: 'troppo_grande', stato: risposta.status }
      }

      const scrittura = createWriteStream(op.file)
      let byte = 0
      try {
        for await (const pezzo of risposta.body as unknown as AsyncIterable<Uint8Array>) {
          byte += pezzo.byteLength
          if (byte > op.max) {
            scrittura.destroy()
            return { ok: false, codice: 'troppo_grande', stato: risposta.status }
          }
          if (!scrittura.write(pezzo)) await new Promise<void>((pronto) => scrittura.once('drain', () => pronto()))
        }
        scrittura.end()
        await finished(scrittura)
      } catch (e) {
        scrittura.destroy()
        throw e
      }
      return byte > 0 ? { ok: true, byte } : non(risposta.status)
    }
  } catch {
    // the network, the time: never the error itself (undici may put the URL in it)
    return non()
  }
}
