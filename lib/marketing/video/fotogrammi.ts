/**
 * Which frames of a reel Claude looks at (1.36.0, CLAUDE.md section 30). Pure.
 *
 * The first 3 seconds decide whether a reel is watched, so the hook is seen
 * almost frame by frame; then a frame every few seconds up to the end; the
 * closing (the CTA) last. At most 32 frames, plus the cover.
 *
 *   hook     0; 0.5; 1; 1.5; 2; 3 seconds (6)
 *   body     from 4 s to the length minus 1.5 s, one every P = max(2, (length - 5.5) / 23)
 *            seconds, at most 24 points, the ends included
 *   closing  the length minus 1.5 s and the last frame there is (2)
 *
 * Each wanted moment is the nearest available frame (the frames come every 0.5 s;
 * from a reel over 90 s only the key frames exist, wherever they are).
 */

export const FOTOGRAMMI_MAX = 32
/** Beyond this length the body comes from the key frames only. */
export const DURATA_PIENA_MAX = 90
/** A reel longer than this is not looked at in frames (the cover and the caption only). */
export const DURATA_FOTOGRAMMI_MAX = 900

const GANCIO = [0, 0.5, 1, 1.5, 2, 3] as const

export type FotogrammaScelto = {
  /** seconds into the reel */
  t: number
  /** where it sits: the hook (first 3.5 s), the body, the end */
  parte: 'gancio' | 'corpo' | 'fine'
}

/** The nearest of `disponibili` (sorted, seconds) to `t`; the earlier one on a tie. */
function piuVicino(disponibili: readonly number[], t: number): number | null {
  if (disponibili.length === 0) return null
  let migliore = disponibili[0]
  let distanza = Math.abs(migliore - t)
  for (const d of disponibili) {
    const x = Math.abs(d - t)
    if (x < distanza) {
      migliore = d
      distanza = x
    }
  }
  return migliore
}

/**
 * The moments to look at, in order, from the frames there are. `durata` in
 * seconds (a reel of 0 seconds or less has none); `disponibili` the times of
 * the frames the extractor made. Duplicates are dropped, so a short reel gives
 * fewer than 32.
 */
export function scegliFotogrammi(durata: number, disponibili: readonly number[]): FotogrammaScelto[] {
  if (!(durata > 0) || durata > DURATA_FOTOGRAMMI_MAX || disponibili.length === 0) return []
  const ordinati = [...disponibili].sort((a, b) => a - b)
  const ultimo = ordinati.at(-1) as number

  const voluti: { t: number; parte: FotogrammaScelto['parte'] }[] = []
  for (const t of GANCIO) if (t <= durata) voluti.push({ t, parte: 'gancio' })

  const fineCorpo = durata - 1.5
  if (fineCorpo >= 4) {
    const passo = Math.max(2, (durata - 5.5) / 23)
    for (let k = 0; k < 24; k++) {
      const t = 4 + k * passo
      // the last point is the end of the body (the ends are included), never past it
      if (t > fineCorpo + 1e-9) break
      voluti.push({ t, parte: 'corpo' })
    }
  }
  if (fineCorpo > 3) voluti.push({ t: fineCorpo, parte: 'fine' })
  voluti.push({ t: ultimo, parte: 'fine' })

  const scelti: FotogrammaScelto[] = []
  const visti = new Set<number>()
  for (const v of voluti) {
    const t = piuVicino(ordinati, v.t)
    if (t === null || visti.has(t)) continue
    visti.add(t)
    scelti.push({ t, parte: t < 3.5 ? 'gancio' : v.parte === 'gancio' ? 'corpo' : v.parte })
  }
  return scelti.slice(0, FOTOGRAMMI_MAX)
}

/** «0:12,0», «1:05,5»: the label before each frame. */
export function etichettaTempo(t: number): string {
  const decimi = Math.max(0, Math.round(t * 10))
  const minuti = Math.floor(decimi / 600)
  const secondi = Math.floor((decimi % 600) / 10)
  return `${minuti}:${String(secondi).padStart(2, '0')},${decimi % 10}`
}
