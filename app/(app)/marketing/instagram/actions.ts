'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { ricalcolaAbbinamenti } from '@/lib/instagram/sincronizza-contenuti'
import * as operazioni from '@/lib/marketing/operazioni'
import type { EsitoCollega, EsitoCreaDaPost, EsitoPost, EsitoScollega } from '@/lib/marketing/operazioni'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { postSchema } from '@/lib/validation/post-instagram'

/**
 * The posts of Instagram and the content calendar (1.33.0, Dany: «volendo si
 * può collegare e linkare il post da instagram per fare comunicare le due
 * parti»): the taps of the admin, the video editor and marketing on
 * "Da collegare", "Collegati" and the panel's «Post su Instagram». Every write
 * runs with the session of whoever taps, never the service role: RLS decides
 * (vede_marketing()), and the role check here only turns a refusal into words.
 *
 * What a tap writes in the calendar (Collega, Annulla, Scollega, Crea il
 * contenuto) is the shared core's (lib/marketing/operazioni.ts, 1.34.0), the
 * one write path of marketing_contenuti: the permalink is read there from
 * instagram_contenuti with the session, never taken from the browser.
 * Unlinking a post (the URL emptied) leaves a "no" for that pair (trigger
 * marketing_contenuti_post_scollegato): the run never proposes or links it
 * again; linking it by hand takes it away. The sign «Collegato da solo» is
 * never written from here: only the run makes it, and the database keeps it
 * 10 minutes with the "no", for «Annulla». After a tap that changes what can
 * be proposed (scollega, crea, rimetti) the proposals are redone at once with
 * the service role, created only here and only after the role check (nothing
 * links by itself from a tap).
 *
 * "Aggiorna da Instagram" is not here: it is a route
 * (app/api/marketing/instagram/aggiorna), because Next sends the actions of
 * a tab one at a time and a minute-long run would hold every other save.
 */

export type { EsitoCollega, EsitoCreaDaPost, EsitoPost, EsitoScollega }

const SOLO_MARKETING = operazioni.SOLO_MARKETING
const NON_SALVATO = 'Non salvato. Riprova.'
const POST_GIA_COLLEGATO = 'Questo post è già collegato a un altro contenuto.'
const POST_SPARITO = 'Questo post non c’è più: aggiorna da Instagram.'
const COLLEGATO_PRIMA = 'Questo post è collegato: scollegalo prima.'

function primoErrore(issues: { message: string }[]): string {
  return issues[0]?.message ?? 'Dati non validi.'
}

function errore(error: { code?: string; message: string }): string {
  if (error.code === '23505') return POST_GIA_COLLEGATO
  // a write RLS refused: Postgres's own words are not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return SOLO_MARKETING
  return messaggioErrore(error, NON_SALVATO)
}

/** The posts' page and the calendar: the server redraws, the browser's cache empties. */
function aggiorna() {
  revalidatePath('/marketing', 'layout')
}

/**
 * The proposals again after a person's tap, with the service role created
 * only here (the role was checked). A failure leaves the tap done: the view
 * already hides the superseded proposals, the next run redoes them.
 */
async function ripropone() {
  try {
    await ricalcolaAbbinamenti({ db: createAdminClient(), automatico: false })
  } catch (e) {
    console.error('[contenuti-instagram] proposte non rifatte dopo un tocco:', e instanceof Error ? e.name : 'errore')
  }
}

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

/** «Annulla» right after «Collega»: as it was, without leaving a "no"; then the proposals again. */
export async function annullaCollega(input: unknown): Promise<EsitoPost> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.annullaCollega(await createClient(), input, { riproponi: ripropone })
}

/** «Scollega»: the URL off, the pair a "no"; then the proposals again. */
export async function scollegaPost(input: unknown): Promise<EsitoScollega> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.scollegaPost(await createClient(), input, { riproponi: ripropone })
}

/** «Annulla» right after «Scollega»: the post back on the content; the database puts the sign back. */
export async function annullaScollega(input: unknown): Promise<EsitoPost> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.annullaScollega(await createClient(), input)
}

/** «Crea il contenuto»: a Posted content made from the post; then the proposals again. */
export async function creaContenutoDaPost(input: unknown): Promise<EsitoCreaDaPost> {
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.creaContenutoDaPost(await createClient(), input, { riproponi: ripropone })
}

/** «Non va nel calendario»: a repost, a personal post. Never on a post already linked. */
export async function escludiPost(input: unknown): Promise<EsitoPost> {
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { shortcode } = parsed.data
  const supabase = await createClient()
  const { data: collegato, error: lettura } = await supabase
    .from('marketing_contenuti')
    .select('id')
    .eq('instagram_shortcode', shortcode)
    .maybeSingle()
  if (lettura) return { ok: false, errore: NON_SALVATO }
  if (collegato) {
    aggiorna()
    return { ok: false, errore: COLLEGATO_PRIMA }
  }

  const { error } = await supabase.from('marketing_post_esclusi').insert({ shortcode })
  // already left out (two taps, another person): what the person wanted
  if (error && error.code !== '23505') {
    aggiorna()
    return { ok: false, errore: error.code === '23503' ? POST_SPARITO : errore(error) }
  }
  aggiorna()
  return { ok: true }
}

/** «Rimetti» (or «Annulla» after «Non va nel calendario»): the post is work again, its proposals redone. */
export async function rimettiPost(input: unknown): Promise<EsitoPost> {
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('marketing_post_esclusi').delete().eq('shortcode', parsed.data.shortcode)
  if (error) return { ok: false, errore: errore(error) }

  await ripropone()
  aggiorna()
  return { ok: true }
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
