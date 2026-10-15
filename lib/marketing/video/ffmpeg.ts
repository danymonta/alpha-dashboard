import 'server-only'

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, constants, copyFile, readdir, readFile } from 'node:fs/promises'
import { setPriority } from 'node:os'
import path from 'node:path'

import {
  DURATA_FOTOGRAMMI_MAX,
  DURATA_PIENA_MAX,
  scegliFotogrammi,
  type FotogrammaScelto,
} from '@/lib/marketing/video/fotogrammi'

/**
 * ffmpeg on the server (1.36.0, CLAUDE.md section 30): the length and the audio
 * of a reel, its audio as a small FLAC for Whisper, and the frames Claude
 * looks at. A separate program (ffmpeg-static 5.3.0, a GPL-3 binary run by the
 * server and never imported nor distributed), found by its path and never by
 * `import`: the package's index.js builds the path from __dirname, which the
 * bundler of Next rewrites.
 *
 * ffmpeg reads only the file the app downloaded: `-protocol_whitelist file
 * -f mov` (a file that pretends to be an mp4 and is a playlist is not
 * followed anywhere), and the static build does not resolve a name. One thread
 * and the lowest priority, so a page served by the same instance goes first.
 * Never the URL, the stderr or the frames in a log: only the exit code.
 */

/** Frames and audio of the reel's body: two a second, the long side of this many pixels. */
export const LATO_PREDEFINITO = 896
/** The hook is seen almost frame by frame: two a second for its first seconds. */
const SECONDI_GANCIO = 3.5
/** stderr kept at most this much. */
const STDERR_MAX = 64 * 1024
/** One pass lasts at most this long. */
const PASSO_MAX_MS = 90_000
/** Kept free for Claude and the database after the pass. */
const MARGINE_MS = 100_000
/** The least a pass is given. */
const PASSO_MIN_MS = 5_000

export type Sonda = {
  /** seconds, null when ffmpeg did not say */
  durata: number | null
  larghezza: number | null
  altezza: number | null
  audio: boolean
}

/** What `ffmpeg -i file` writes on stderr (it exits 1 with no output): length, size of the video, whether there is audio. */
export function leggiSonda(stderr: string): Sonda {
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr)
  const durata = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null
  const v = /Stream #\d+:\d+[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr)
  return {
    durata: durata !== null && Number.isFinite(durata) && durata > 0 ? durata : null,
    larghezza: v ? Number(v[1]) : null,
    altezza: v ? Number(v[2]) : null,
    audio: /Stream #\d+:\d+[^\n]*Audio:/.test(stderr),
  }
}

let copiaInTmp: string | null = null

/** The path of the binary, or null when it is not there (the reading goes on from the cover). */
export async function percorsoFfmpeg(): Promise<string | null> {
  const daModulo = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg')
  try {
    await access(daModulo, constants.X_OK)
    return daModulo
  } catch {
    // not executable where it is (a read-only copy without the bit): a copy in /tmp, once per instance
  }
  try {
    await access(daModulo, constants.R_OK)
    if (!copiaInTmp) {
      const destinazione = path.join('/tmp', 'alpha-ffmpeg')
      await copyFile(daModulo, destinazione)
      await chmod(destinazione, 0o755)
      copiaInTmp = destinazione
    }
    return copiaInTmp
  } catch {
    return null
  }
}

export type EsitoProcesso = { codice: number | null; stderr: string; ucciso: boolean }

/**
 * Runs ffmpeg. `ms` is the longest it lives: then SIGKILL (the exit code stays
 * null and `ucciso` is true). The priority is lowered in a try: some systems
 * refuse it.
 */
export function eseguiFfmpeg(bin: string, args: readonly string[], ms: number): Promise<EsitoProcesso> {
  return new Promise((risolvi) => {
    let stderr = ''
    let ucciso = false
    let finito = false
    const figlio = spawn(bin, [...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    try {
      if (figlio.pid) setPriority(figlio.pid, 19)
    } catch {
      // no refusal matters here
    }
    const timer = setTimeout(() => {
      ucciso = true
      figlio.kill('SIGKILL')
    }, Math.max(1_000, ms))
    figlio.stderr?.on('data', (pezzo: Buffer) => {
      if (stderr.length < STDERR_MAX) stderr += pezzo.toString('utf8', 0, STDERR_MAX - stderr.length)
    })
    const fine = (codice: number | null) => {
      if (finito) return
      finito = true
      clearTimeout(timer)
      risolvi({ codice, stderr, ucciso })
    }
    figlio.on('error', () => fine(null))
    figlio.on('close', (codice) => fine(codice))
  })
}

/** A pass lives at most 90 s and never past the step's deadline minus the margin. */
export function tempoPasso(entro: number, adesso: number = Date.now()): number {
  return Math.max(PASSO_MIN_MS, Math.min(PASSO_MAX_MS, entro - adesso - MARGINE_MS))
}

/** The scale filter: the long side of `lato` pixels, the short one even (9:16 gives 504x896). */
export function filtroScala(lato: number): string {
  return `scale=w='if(gte(ih,iw),-2,${lato})':h='if(gte(ih,iw),${lato},-2)':flags=lanczos`
}

/** The input options that keep ffmpeg on the downloaded file only. */
const SOLO_FILE = ['-protocol_whitelist', 'file'] as const

export type Fotogramma = { t: number; file: string; parte: FotogrammaScelto['parte'] }

export type Estratto = {
  durata: number | null
  larghezza: number | null
  altezza: number | null
  ha_audio: boolean
  /** audio.flac (16 kHz mono), null without audio or when the pass failed */
  audio: string | null
  /** the frames Claude looks at, in order, each an existing file */
  fotogrammi: Fotogramma[]
  /** 'timeout' / 'errore' when a pass was killed or failed (the log says only this), else null */
  problema: 'timeout' | 'errore' | null
}

const numeroDelFile = (nome: string, prefisso: string) => {
  const m = new RegExp(`^${prefisso}_(\\d+)\\.jpg$`).exec(nome)
  return m ? Number(m[1]) : null
}

/** SHA-1 of a file's bytes: the same frame repeated by the 2 a second filter is one. */
async function impronta(file: string): Promise<string> {
  return createHash('sha1').update(await readFile(file)).digest('hex')
}

/**
 * The probe, then one pass that makes the audio and the frames, and for a
 * reel over 90 s a short second one for the hook. Never throws: a pass that is
 * killed or fails leaves what it made, and `problema` says so.
 */
export async function estraiDalVideo(op: {
  bin: string
  file: string
  cartella: string
  entro: number
  /** the long side of the frames; 896 by default (MARKETING_LATO_FOTOGRAMMI) */
  lato?: number
  /** the recovery of an old reel needs only the speech: no frames */
  soloAudio?: boolean
}): Promise<Estratto> {
  const lato = op.lato ?? LATO_PREDEFINITO
  const vuoto: Estratto = { durata: null, larghezza: null, altezza: null, ha_audio: false, audio: null, fotogrammi: [], problema: null }

  // the probe: no decoding, ffmpeg exits with 1 for lack of an output and writes what it found
  const prova = await eseguiFfmpeg(op.bin, ['-hide_banner', '-nostdin', ...SOLO_FILE, '-f', 'mov', '-i', op.file], 20_000)
  if (prova.ucciso) return { ...vuoto, problema: 'timeout' }
  const sonda = leggiSonda(prova.stderr)
  if (sonda.durata === null) return { ...vuoto, problema: 'errore' }
  const lungo = sonda.durata > DURATA_PIENA_MAX
  const senzaFotogrammi = sonda.durata > DURATA_FOTOGRAMMI_MAX || op.soloAudio === true

  const audio = path.join(op.cartella, 'audio.flac')
  const argomenti = [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-y',
    '-threads',
    '1',
    ...SOLO_FILE,
    '-f',
    'mov',
    ...(lungo ? ['-skip_frame', 'nokey'] : []),
    '-i',
    op.file,
    // no audio output without an audio stream: an output with no stream makes ffmpeg stop
    ...(sonda.audio ? ['-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', audio] : []),
    ...(senzaFotogrammi
      ? []
      : [
          '-map',
          '0:v:0',
          '-an',
          '-vf',
          `fps=2,${filtroScala(lato)}`,
          '-q:v',
          '3',
          '-frame_pts',
          '1',
          '-f',
          'image2',
          path.join(op.cartella, 'f_%05d.jpg'),
        ]),
  ]
  // nothing to make (speech only, and no audio): no pass
  const haUscite = sonda.audio || !senzaFotogrammi
  const passo = haUscite ? await eseguiFfmpeg(op.bin, argomenti, tempoPasso(op.entro)) : { codice: 0, stderr: '', ucciso: false }
  let problema: Estratto['problema'] = passo.ucciso ? 'timeout' : passo.codice === 0 ? null : 'errore'

  // the hook of a long reel, frame by frame (the pass above kept only its key frames)
  if (lungo && !senzaFotogrammi && problema === null) {
    const gancio = await eseguiFfmpeg(
      op.bin,
      [
        '-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-threads', '1', ...SOLO_FILE, '-f', 'mov',
        '-t', String(SECONDI_GANCIO), '-i', op.file, '-an', '-vf', `fps=2,${filtroScala(lato)}`, '-q:v', '3',
        '-frame_pts', '1', '-f', 'image2', path.join(op.cartella, 'g_%05d.jpg'),
      ],
      tempoPasso(op.entro),
    )
    if (gancio.ucciso) problema = 'timeout'
    else if (gancio.codice !== 0) problema = 'errore'
  }

  // the candidates: f_N at N / 2 seconds (the filter's time base is 1/2); the hook's g_N likewise
  const nomi = await readdir(op.cartella).catch(() => [] as string[])
  const candidati = new Map<number, string>()
  const viste = new Set<string>()
  for (const prefisso of lungo ? ['g', 'f'] : ['f']) {
    const files = nomi
      .map((n) => ({ n, k: numeroDelFile(n, prefisso) }))
      .filter((x): x is { n: string; k: number } => x.k !== null)
      .sort((a, b) => a.k - b.k)
    for (const { n, k } of files) {
      const t = k / 2
      if (prefisso === 'f' && lungo && t < SECONDI_GANCIO) continue
      if (candidati.has(t)) continue
      const file = path.join(op.cartella, n)
      if (lungo) {
        // the filter repeats the last key frame: one frame once
        const h = await impronta(file)
        if (viste.has(h)) continue
        viste.add(h)
      }
      candidati.set(t, file)
    }
  }
  const scelti = scegliFotogrammi(sonda.durata, [...candidati.keys()])
  const fotogrammi: Fotogramma[] = scelti.flatMap((s) => {
    const file = candidati.get(s.t)
    return file ? [{ t: s.t, file, parte: s.parte }] : []
  })

  const haAudioFile = await access(audio).then(
    () => true,
    () => false,
  )
  return {
    durata: sonda.durata,
    larghezza: sonda.larghezza,
    altezza: sonda.altezza,
    ha_audio: sonda.audio && haAudioFile,
    audio: haAudioFile ? audio : null,
    fotogrammi,
    problema,
  }
}

/**
 * The cover (thumbnail_url, usually 1080x1920) at the size of the frames: so
 * it arrives to Claude at about 576 tokens and not at 1800. Null if ffmpeg
 * cannot (the caller sends it as it is only under 2000 px a side).
 */
export async function riduciCopertina(op: { bin: string; file: string; cartella: string; entro: number; lato?: number }): Promise<string | null> {
  const uscita = path.join(op.cartella, 'copertina_ridotta.jpg')
  const r = await eseguiFfmpeg(
    op.bin,
    [
      '-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-threads', '1', ...SOLO_FILE, '-f', 'image2',
      '-i', op.file, '-vf', filtroScala(op.lato ?? LATO_PREDEFINITO), '-frames:v', '1', '-q:v', '3', uscita,
    ],
    Math.min(20_000, tempoPasso(op.entro)),
  )
  if (r.codice !== 0) return null
  return access(uscita).then(
    () => uscita,
    () => null,
  )
}
