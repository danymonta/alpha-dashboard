/**
 * The seconds of a video seen, counted in the page without any script of YouTube (release
 * B1a, docs/onboarding/rilascio-b.md, «Player»). Pure: the player component feeds it the
 * messages of the iframe and a clock; the route sends the stretches to video_progresso,
 * which joins them again in the database. A jump forward never counts.
 */

/** The only origin whose messages are read. */
export const ORIGINE_YOUTUBE = 'https://www.youtube-nocookie.com'

/** A stretch of seconds seen, [da, a): integers, a > da. */
export type Intervallo = [number, number]

/** Joins overlapping or touching stretches, sorted; drops the empty ones. */
export function unisciIntervalli(intervalli: readonly Intervallo[]): Intervallo[] {
  const ordinati = intervalli
    .filter(([da, a]) => Number.isFinite(da) && Number.isFinite(a) && a > da)
    .map(([da, a]) => [Math.max(0, Math.floor(da)), Math.ceil(a)] as Intervallo)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const uniti: Intervallo[] = []
  for (const [da, a] of ordinati) {
    const ultimo = uniti[uniti.length - 1]
    if (ultimo && da <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], a)
    else uniti.push([da, a])
  }
  return uniti
}

/** The seconds covered, inside the length. */
export function secondiVisti(intervalli: readonly Intervallo[], durata: number): number {
  return unisciIntervalli(intervalli).reduce(
    (somma, [da, a]) => somma + Math.max(0, Math.min(a, durata) - Math.min(da, durata)),
    0,
  )
}

/** The percentage (0-100, two decimals) the database would compute. */
export function percentualeVista(intervalli: readonly Intervallo[], durata: number): number {
  if (!(durata > 0)) return 0
  return Math.round((secondiVisti(intervalli, durata) * 10000) / durata) / 100
}

/** Seen from 90%, as the database says (visto_il). */
export const SOGLIA_VISTO = 90

/** At most this far ahead between two samples a second counts (a jump forward does not). */
export const SALTO_MASSIMO_S = 2

/**
 * One sample of the clock: the time the player said a moment ago and the one it says now.
 * The second counts only when the time moved forward by at most 2 seconds; the seconds
 * crossed become a stretch. A pause, a jump forward or backward, nothing.
 */
export function campiona(precedente: number | null, attuale: number): Intervallo | null {
  if (precedente === null || !Number.isFinite(precedente) || !Number.isFinite(attuale)) return null
  const avanzato = attuale - precedente
  if (avanzato <= 0 || avanzato > SALTO_MASSIMO_S) return null
  const da = Math.floor(precedente)
  const a = Math.max(da + 1, Math.floor(attuale))
  return [da, a]
}

/** What the page keeps of a message of the iframe. */
export type MessaggioPlayer = { tempo?: number; durata?: number; stato?: number }

/**
 * A message from the iframe, read only when it comes from the YouTube origin and from the
 * very window of our iframe (`source`). The protocol of iframe_api: `infoDelivery` with
 * `info.currentTime`, `info.duration`, `info.playerState`, and `onStateChange` with the
 * state as `info`. Anything else: null.
 */
export function leggiMessaggioPlayer(
  evento: { origin: string; source: unknown; data: unknown },
  finestra: unknown,
): MessaggioPlayer | null {
  if (evento.origin !== ORIGINE_YOUTUBE) return null
  if (!finestra || evento.source !== finestra) return null
  let dati: unknown = evento.data
  if (typeof dati === 'string') {
    if (dati.length > 20000) return null
    try {
      dati = JSON.parse(dati)
    } catch {
      return null
    }
  }
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return null
  const d = dati as { event?: unknown; info?: unknown }
  if (d.event === 'onStateChange' && typeof d.info === 'number') return { stato: d.info }
  if (d.event !== 'infoDelivery' && d.event !== 'initialDelivery') return null
  if (!d.info || typeof d.info !== 'object' || Array.isArray(d.info)) return null
  const info = d.info as Record<string, unknown>
  const risultato: MessaggioPlayer = {}
  if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime) && info.currentTime >= 0) {
    risultato.tempo = info.currentTime
  }
  if (typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0) {
    risultato.durata = info.duration
  }
  if (typeof info.playerState === 'number') risultato.stato = info.playerState
  return Object.keys(risultato).length > 0 ? risultato : null
}

/** The player's states (iframe_api): only «playing» moves the clock. */
export const STATO_IN_RIPRODUZIONE = 1
export const STATO_FINITO = 0

/** The message the page sends first, so that the iframe starts talking (as iframe_api does). */
export function messaggioAscolto(id: number | string = 1): string {
  return JSON.stringify({ event: 'listening', id, channel: 'widget' })
}

/** The command iframe_api sends right after: the iframe also tells every change of state. */
export function messaggioStati(id: number | string = 1): string {
  return JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id, channel: 'widget' })
}

/**
 * The stretches to send: joined, inside the length, at most `massimo` (the route takes
 * 50). Pure: the player calls it before every POST.
 */
export function intervalliDaInviare(intervalli: readonly Intervallo[], durata: number, massimo = 50): Intervallo[] {
  const fine = Math.max(1, Math.round(durata))
  return unisciIntervalli(intervalli)
    .filter(([da]) => da < fine)
    .map(([da, a]) => [da, Math.min(a, fine)] as Intervallo)
    .filter(([da, a]) => a > da)
    .slice(0, massimo)
}

/** The address of the iframe: youtube-nocookie, the JS API on, no related videos from other channels. */
export function indirizzoIframe(youtubeId: string, origine: string, autoplay = false): string | null {
  if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) return null
  const p = new URLSearchParams({ enablejsapi: '1', rel: '0', playsinline: '1', origin: origine })
  // after the client's tap on «Guarda il video»: the video starts without a second tap
  if (autoplay) p.set('autoplay', '1')
  return `${ORIGINE_YOUTUBE}/embed/${youtubeId}?${p.toString()}`
}

/** The page on YouTube, for «Apri su YouTube». */
export function indirizzoYoutube(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`
}
