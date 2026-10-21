import { formatNumero } from '@/lib/format'
import { tipoDelPost, type TipoPost } from '@/lib/marketing/abbinamento'

/**
 * The words and small rules of the Pubblicati page, pure (client and server components, and the tests). No number is
 * computed here: every figure of a post comes from SQL; here it is only said.
 */

export const TRATTINO = '–'

/** A number as the table says it: «–» when Instagram has not given it (never 0 for a number not read), else with the thousands. */
export function numeroOTrattino(valore: number | null | undefined): string {
  return valore === null || valore === undefined || !Number.isFinite(valore) ? TRATTINO : formatNumero(valore)
}

/** The kind of a row of v_pubblicati. */
export function tipoDellaRiga(r: { media_type: string | null; reel: boolean | null }): TipoPost {
  return tipoDelPost({ media_type: r.media_type ?? 'VIDEO', reel: r.reel ?? false })
}

/** A reel (or any video): the only kind with a verdict, a score and an analysis. */
export function eReel(r: { media_type: string | null; reel: boolean | null }): boolean {
  return tipoDellaRiga(r) === 'reel'
}

/** What the page says where the statistics are missing (Instagram does not give them, or not yet for this post). */
export const SENZA_NUMERI_INSTAGRAM =
  'Views, Reach, Salvati e Condivisioni arrivano dalle statistiche di Instagram: finché Instagram non le dà restano «–» e il View Count del Piano editoriale si scrive a mano.'

/** The tooltip and the accessible text of a View Count that comes from Instagram. */
export const VIEW_COUNT_DA_INSTAGRAM = 'Da Instagram: si aggiorna da solo'

/** The help line of a View Count that can be written by hand, in the panel. */
export const VIEW_COUNT_A_MANO =
  'Si compila da solo quando il contenuto ha il link di un reel che Instagram ha già letto con le sue statistiche; finché non è così lo scrivi tu.'
