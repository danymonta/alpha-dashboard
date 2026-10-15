// Before the build (1.36.0): is the ffmpeg binary where the server will look for it?
// ffmpeg-static downloads it at install time; without it the reading of the reels
// falls back to the cover only (lib/marketing/video/ffmpeg.ts), so this warns and
// never fails the build. Prints paths and sizes, nothing else.
import { stat } from 'node:fs/promises'
import path from 'node:path'

const percorso = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg')
try {
  const s = await stat(percorso)
  if (!s.isFile() || s.size < 1_000_000) {
    console.warn(`[ffmpeg] ${percorso} non sembra un binario (${s.size} byte): la lettura dei reel userà solo la copertina.`)
  } else {
    console.log(`[ffmpeg] trovato (${Math.round(s.size / 1_000_000)} MB)`)
  }
} catch {
  console.warn(`[ffmpeg] manca ${percorso}: la lettura dei reel userà solo la copertina. Controlla l'installazione di ffmpeg-static.`)
}
