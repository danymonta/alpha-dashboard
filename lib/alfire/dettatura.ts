/**
 * Live text while dictating (Dany, 29/09/2026): the audio recorded so far is
 * transcribed about every 2 seconds by the same provider as the final text
 * (Groq Whisper via /api/alfire/voce), and shown in the box until the final
 * transcription of the whole recording replaces it. Pure rules, tested.
 */

/** The recorder hands over a piece of audio every second. */
export const PEZZO_MS = 1000

/** About every 2 seconds a new partial transcription. */
export const INTERVALLO_PARZIALE_MS = 2000

/**
 * Speech needs little: every partial sends the audio from the start again, so
 * a lighter recording is a lighter upload (Chrome's default is 128 kbit/s).
 */
export const BIT_AL_SECONDO = 32_000

/** A recording under 1 KB is a mistaken tap: no request for it. */
export const AUDIO_MINIMO_BYTE = 1000

export type StatoParziali = {
  /** When the last partial left (or the recording started), in ms. */
  ultimoInvio: number
  /** Pieces of audio already covered by the last partial. */
  pezziInviati: number
  /** A partial is waiting for its answer: one at a time. */
  inVolo: boolean
  /** No more partials for this recording (the provider said "too many", or kept failing). */
  sospesi: boolean
  /** Partials failed in a row. */
  falliti: number
}

/** Two failed partials in a row and the live text stops for this recording. */
export const FALLITI_DI_FILA_MAX = 2

/**
 * Whether to send a partial now: none in flight, at least one new second of
 * audio since the last one, and about 2 seconds since it left.
 */
export function serveParziale(stato: StatoParziali, ora: number, pezzi: number): boolean {
  return (
    !stato.inVolo &&
    !stato.sospesi &&
    pezzi > stato.pezziInviati &&
    ora - stato.ultimoInvio >= INTERVALLO_PARZIALE_MS
  )
}

/**
 * Answers after which no partial goes out again for this recording: the
 * limit reached (the final text needs what is left), the audio too long, the
 * session over or Alfire switched off. Any other failure is skipped.
 */
export function sospendeParziali(status: number): boolean {
  return status === 401 || status === 413 || status === 429 || status === 503
}

/**
 * The state after a partial's answer (its HTTP status, or null when the
 * network failed). A success resets the count; the answers above stop the live
 * text at once; any other failure twice in a row stops it too, so audio the
 * provider cannot read (a 502) is not sent again every 2 seconds, eating the
 * limits the final transcription needs.
 */
export function dopoParziale(stato: StatoParziali, status: number | null): StatoParziali {
  if (status !== null && status >= 200 && status < 300) return { ...stato, inVolo: false, falliti: 0 }
  const falliti = stato.falliti + 1
  const sospesi = stato.sospesi || (status !== null && sospendeParziali(status)) || falliti >= FALLITI_DI_FILA_MAX
  return { ...stato, inVolo: false, falliti, sospesi }
}

/**
 * The warning when the final transcription fails. After live text the box
 * keeps it, no longer muted: it may miss the end, and must not pass for final.
 */
export function avvisoTrascrizione(errore: string, conTestoInDiretta: boolean): string {
  return conTestoInDiretta
    ? `${errore} Nella casella c’è solo il testo in diretta, forse incompleto: controllalo prima di inviarlo.`
    : errore
}

/** What the user had typed before the recording, then the dictated text. */
export function unisciTesto(prima: string, dettato: string): string {
  const t = dettato.trim()
  if (!t) return prima
  return prima.trim() ? `${prima.trimEnd()} ${t}` : t
}
