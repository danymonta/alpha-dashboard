/**
 * Whether «Analizza» also reads the reel again (1.36.0, CLAUDE.md section 30).
 * Pure: the route passes what the reading says now.
 *
 * Reading again costs the video's download, ffmpeg, Whisper and Claude's look:
 * it is done when there is no reading yet, when only the speech was read, when
 * the visual card is missing, when it was made with an older prompt, and when
 * something that can pass went wrong the last time (the video did not download,
 * the frames did not come out, Whisper failed or was off with its key now there,
 * the speech was lost because there was no video). A reel Instagram gives no
 * video for (licensed music) and a reel with no speech are never read again for
 * that: nothing would change.
 */

export type LetturaPerRileggere = {
  richiesta: string
  visione_esito: string | null
  versione_prompt_visione: string | null
  video: string | null
  trascrizione_esito: string | null
}

export function dovrebbeRileggere(
  lettura: LetturaPerRileggere | null,
  opzioni: { versionePrompt: string; trascrizioneAttiva: boolean },
): boolean {
  if (!lettura) return true
  if (lettura.richiesta === 'trascrizione') return true
  if (lettura.visione_esito !== 'pronta') return true
  if (lettura.versione_prompt_visione !== opzioni.versionePrompt) return true
  if (lettura.video === 'non_scaricabile' || lettura.video === 'senza_estrattore') return true
  if (lettura.trascrizione_esito === 'fallita') return true
  if (lettura.trascrizione_esito === 'spenta' && opzioni.trascrizioneAttiva) return true
  if (lettura.trascrizione_esito === 'senza_video' && lettura.video !== 'senza_media_url') return true
  return false
}
