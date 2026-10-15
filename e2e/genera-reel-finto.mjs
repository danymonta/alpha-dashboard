// Makes the fake reel files of the end-to-end tests (1.36.0) in e2e/.cache/,
// with the ffmpeg of the project (ffmpeg-static): a 6-second test pattern at
// 1080x1920 with a sine tone, the same without audio, and a cover. Never a
// video in the repository: e2e/.cache/ is ignored. Run by hand
// (node e2e/genera-reel-finto.mjs) or by e2e/graph-finto.mjs on first use;
// the files already there are kept.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RADICE = fileURLToPath(new URL('..', import.meta.url))
const FFMPEG = join(RADICE, 'node_modules', 'ffmpeg-static', 'ffmpeg')
export const CARTELLA = join(RADICE, 'e2e', '.cache')

const VIDEO = ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=6']
const SUONO = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6']

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg non è riuscito: ${r.stderr.slice(0, 200)}`)
}

export function generaReelFinti() {
  mkdirSync(CARTELLA, { recursive: true })
  const file = (nome) => join(CARTELLA, nome)
  if (!existsSync(file('reel.mp4'))) {
    ffmpeg([...VIDEO, ...SUONO, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file('reel.mp4')])
  }
  if (!existsSync(file('reel-senza-audio.mp4'))) {
    ffmpeg([...VIDEO, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', file('reel-senza-audio.mp4')])
  }
  if (!existsSync(file('copertina.jpg'))) {
    ffmpeg([...VIDEO, '-frames:v', '1', '-q:v', '3', file('copertina.jpg')])
  }
  return { reel: file('reel.mp4'), senzaAudio: file('reel-senza-audio.mp4'), copertina: file('copertina.jpg') }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  console.log(generaReelFinti())
}
