import 'server-only'

import type { InsightsMedia, MetricheLette, StatoMetriche } from '@/lib/instagram/contenuti'
import { ErroreInstagram } from '@/lib/instagram/richieste'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The statistics of the posts (1.36.0, CLAUDE.md section 30): which posts the
 * morning run reads, and the one way they are saved.
 *
 * Saving goes through instagram_salva_metriche only, for the morning run and
 * for the Insight: a post already read stays read, a metric a lower step did
 * not give leaves the column as it is, an answer with no number is no reading.
 */

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

const ORA_MS = 3_600_000
const GIORNO_MS = 24 * ORA_MS

/** A post is read at most this far back. */
export const GIORNI_NUMERI = 180
/** The posts up to this age are read often; older ones by rotation. */
export const GIORNI_RECENTI = 30
/** Rows per call of instagram_salva_metriche (the function takes 200 at most). */
export const BLOCCO_METRICHE = 25

export type ModoLettura = 'notte' | 'manuale'

/** What the choice of the posts to read needs of a row of instagram_contenuti. */
export type PostPerNumeri = {
  media_id: string
  media_type: string
  reel: boolean
  pubblicato_il: string
  metriche_il: string | null
  metriche_stato: string
  eliminato_il: string | null
}

/**
 * The posts whose numbers are read now. Never a deleted post (Meta answers «it
 * does not exist» and the e2e run would touch the seed's), a post published
 * before the account was professional, or one older than 180 days.
 * - night: those never read (also the ones refused or without data: tried
 *   again, they are few) always; up to 30 days old, read more than 20 hours
 *   ago; older, read more than 6.5 days ago (by rotation);
 * - «Aggiorna da Instagram»: those never read always; up to 30 days old, read
 *   more than an hour ago; no older ones.
 */
export function daLeggere(righe: readonly PostPerNumeri[], adesso: Date, modo: ModoLettura): PostPerNumeri[] {
  const ora = adesso.getTime()
  return righe.filter((r) => {
    if (r.eliminato_il || r.metriche_stato === 'prima_della_conversione') return false
    const pubblicato = Date.parse(r.pubblicato_il)
    if (!Number.isFinite(pubblicato)) return false
    const eta = ora - pubblicato
    if (eta > GIORNI_NUMERI * GIORNO_MS) return false
    const letto = r.metriche_il ? Date.parse(r.metriche_il) : Number.NaN
    // a post with no reading date (never read, refused, without data) is read
    if (!Number.isFinite(letto) || r.metriche_stato !== 'lette') return true
    const daQuanto = ora - letto
    if (eta <= GIORNI_RECENTI * GIORNO_MS) return daQuanto > (modo === 'notte' ? 20 * ORA_MS : ORA_MS)
    return modo === 'notte' && daQuanto > 6.5 * GIORNO_MS
  })
}

/**
 * The order of reading: never read, newest first; then up to 3 days old; then
 * up to 30 days old, the one read longest ago first; then the others, the one
 * read longest ago first.
 */
export function ordinaDaLeggere<T extends PostPerNumeri>(righe: readonly T[], adesso: Date): T[] {
  const ora = adesso.getTime()
  const gruppo = (r: PostPerNumeri): number => {
    if (!r.metriche_il || r.metriche_stato !== 'lette') return 0
    const eta = ora - Date.parse(r.pubblicato_il)
    if (eta <= 3 * GIORNO_MS) return 1
    return eta <= GIORNI_RECENTI * GIORNO_MS ? 2 : 3
  }
  const letto = (r: PostPerNumeri) => (r.metriche_il ? Date.parse(r.metriche_il) : 0)
  return [...righe].sort((a, b) => {
    const ga = gruppo(a)
    const gb = gruppo(b)
    if (ga !== gb) return ga - gb
    if (ga <= 1) return Date.parse(b.pubblicato_il) - Date.parse(a.pubblicato_il)
    return letto(a) - letto(b)
  })
}

/** An error of Meta that means the permission instagram_business_manage_insights is missing (not «few viewers»). */
export function erroriPermesso(e: unknown): boolean {
  if (!(e instanceof ErroreInstagram) || e.tipo !== 'meta') return false
  if (e.code === 10 && /not enough viewers/i.test(e.message)) return false
  return e.code === 10 || (e.code !== null && e.code >= 200 && e.code <= 299) || (e.code !== 100 && /permission/i.test(e.message))
}

export type RigaMetriche = { media_id: string; stato: StatoMetriche; valori: MetricheLette }

/** A reading as the function takes it. */
export function rigaMetriche(mediaId: string, letto: InsightsMedia): RigaMetriche {
  return { media_id: mediaId, stato: letto.stato, valori: letto.valori }
}

/**
 * Saves the readings in blocks of 25 (a time run out loses 25 at most).
 * Returns how many rows got numbers. Throws on a database error.
 */
export async function salvaMetriche(db: Db, righe: readonly RigaMetriche[]): Promise<number> {
  let scritte = 0
  for (let i = 0; i < righe.length; i += BLOCCO_METRICHE) {
    const blocco = righe.slice(i, i + BLOCCO_METRICHE)
    const { data, error } = await db.rpc('instagram_salva_metriche', { p_righe: blocco })
    if (error) throw new Error(`metriche non salvate (${error.code ?? 'errore'})`)
    scritte += typeof data === 'number' ? data : 0
  }
  return scritte
}
