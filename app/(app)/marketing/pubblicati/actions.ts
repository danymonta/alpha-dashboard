'use server'

import { revalidatePath } from 'next/cache'

import { negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import * as operazioni from '@/lib/marketing/operazioni'
import type { EsitoCollega, EsitoPost, EsitoScollega } from '@/lib/marketing/operazioni'
import { createClient } from '@/lib/supabase/server'

/**
 * The posts of Instagram and the content calendar (1.33.0, Dany: «volendo si
 * può collegare e linkare il post da instagram per fare comunicare le due
 * parti»), from the page Pubblicati (25/10/2026): the taps of the admin, the
 * video editor and marketing on «Collega» (the table's and the reel panel's),
 * «Scollega» and the content panel's «Post su Instagram». Every write runs
 * with the session of whoever taps, never the service role: RLS decides
 * (vede_marketing()), and the role check here only turns a refusal into words.
 *
 * What every tap writes (Collega, Annulla, Scollega) is the shared core's
 * (lib/marketing/operazioni.ts, 1.34.0), the one write path of the calendar
 * and of its posts: the permalink is read there from instagram_contenuti with
 * the session, never taken from the browser.
 * Unlinking a post (the URL emptied) leaves a "no" for that pair (trigger
 * marketing_contenuti_post_scollegato): the run never links it again; linking
 * it by hand takes it away. The sign «Collegato da solo» is never written from
 * here: only the run makes it, and the database keeps it 10 minutes with the
 * "no", for «Annulla». The proposals of the run are not shown any more (the
 * lists «Da collegare», «Crea il contenuto» and «Non va nel calendario» are
 * gone): a tap does not redo them, and nothing links by itself from a tap.
 *
 * "Aggiorna da Instagram" is not here: it is a route
 * (app/api/marketing/instagram/aggiorna), because Next sends the actions of
 * a tab one at a time and a minute-long run would hold every other save.
 */

export type { EsitoCollega, EsitoPost, EsitoScollega }

const SOLO_MARKETING = operazioni.SOLO_MARKETING

/**
 * «Collega» (or «Collega e segna Posted»): the post's permalink in the
 * content's URL, only on a content still without one; a post online makes the
 * content Posted, the Post Date is written only when it has none.
 */
export async function collegaPost(input: unknown): Promise<EsitoCollega> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.collegaPost(await createClient(), input)
}

/** «Annulla» right after «Collega»: as it was, without leaving a "no". */
export async function annullaCollega(input: unknown): Promise<EsitoPost> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.annullaCollega(await createClient(), input)
}

/** «Scollega»: the URL off, the pair a "no". */
export async function scollegaPost(input: unknown): Promise<EsitoScollega> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.scollegaPost(await createClient(), input)
}

/** «Annulla» right after «Scollega»: the post back on the content; the database puts the sign back. */
export async function annullaScollega(input: unknown): Promise<EsitoPost> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.annullaScollega(await createClient(), input)
}

/**
 * After "Aggiorna da Instagram" (a route: its run is outside the queue of the
 * actions): one redraw of the area with the new data, and the browser's cache
 * emptied. Writes nothing.
 */
export async function rivalidaMarketing(): Promise<EsitoPost> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  revalidatePath('/marketing', 'layout')
  return { ok: true }
}
