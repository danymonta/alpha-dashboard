'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { ricalcolaAbbinamenti } from '@/lib/instagram/sincronizza-contenuti'
import { contenutoDaPost } from '@/lib/marketing/da-post'
import type { StatusContenuto } from '@/lib/marketing/etichette'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { contenutoSchema, urlPost } from '@/lib/validation/contenuto'
import { coppiaPostSchema, postSchema } from '@/lib/validation/post-instagram'

/**
 * The posts of Instagram and the content calendar (1.33.0, Dany: «volendo si
 * può collegare e linkare il post da instagram per fare comunicare le due
 * parti»): the taps of the admin, the video editor and marketing on
 * "Da collegare", "Collegati" and the panel's «Post su Instagram». Every write
 * runs with the session of whoever taps, never the service role: RLS decides
 * (vede_marketing()), and the role check here only turns a refusal into words.
 *
 * The permalink never comes from the browser: it is read from
 * instagram_contenuti with the session. Unlinking a post (the URL emptied)
 * leaves a "no" for that pair (trigger marketing_contenuti_post_scollegato):
 * the run never proposes or links it again; linking it by hand takes it away.
 * The sign «Collegato da solo» is never written from here: only the run makes
 * it, and the database keeps it 10 minutes with the "no", for «Annulla».
 * After a tap that changes what can be proposed (scollega, crea, rimetti) the
 * proposals are redone at once with the service role, created only there and
 * only after the role check (nothing links by itself from a tap).
 *
 * "Aggiorna da Instagram" is not here: it is a route
 * (app/api/marketing/instagram/aggiorna), because Next sends the actions of
 * a tab one at a time and a minute-long run would hold every other save.
 */

export type EsitoPost = { ok: true } | { ok: false; errore: string }

export type EsitoCollega =
  | {
      ok: true
      /** the content's new version (updated_at) and what the tap wrote: the panel's copy follows */
      versione: string
      url: string
      stato: StatusContenuto
      post_date: string | null
      /** what «Annulla» puts back: the Status before, and whether the Post Date was written here */
      prima: { stato: StatusContenuto; postDateScritta: boolean }
    }
  | { ok: false; errore: string }

export type EsitoScollega = { ok: true; versione: string | null } | { ok: false; errore: string }

export type EsitoCreaDaPost = { ok: true; id: string; versione: string } | { ok: false; errore: string }

const SOLO_MARKETING = 'Il calendario dei contenuti è dell’area Marketing.'
const NON_SALVATO = 'Non salvato. Riprova.'
const POST_GIA_COLLEGATO = 'Questo post è già collegato a un altro contenuto.'
const HA_GIA_UN_POST = 'Questo contenuto ha già un post: aprilo e cambia l’URL se è un altro.'
const ALTRO_POST = 'Questo contenuto ha già un altro post.'
const SPARITO = 'Questo contenuto non c’è più.'
const POST_SPARITO = 'Questo post non c’è più: aggiorna da Instagram.'
const POST_ELIMINATO = 'Questo post non è più su Instagram.'
const COLLEGATO_PRIMA = 'Questo post è collegato: scollegalo prima.'

function primoErrore(issues: { message: string }[]): string {
  return issues[0]?.message ?? 'Dati non validi.'
}

function errore(error: { code?: string; message: string }): string {
  // the unique index on instagram_shortcode: the same post on two contents
  if (error.code === '23505') return POST_GIA_COLLEGATO
  // a write RLS refused: Postgres's own words are not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return SOLO_MARKETING
  return messaggioErrore(error, NON_SALVATO)
}

/** Both lists and the content's own page: the server redraws, the browser's cache empties. */
function aggiorna(id?: string) {
  revalidatePath('/marketing/instagram')
  revalidatePath('/marketing/contenuti')
  if (id) revalidatePath(`/marketing/contenuti/${id}`)
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

type Supabase = Awaited<ReturnType<typeof createClient>>

type PostLetto = {
  shortcode: string
  permalink: string
  media_type: string
  reel: boolean
  pubblicato_il: string
  didascalia: string | null
  eliminato_il: string | null
}

/** The post as the session reads it, with its permalink checked like a URL typed by hand. */
async function leggiPost(supabase: Supabase, shortcode: string): Promise<{ errore: string } | { post: PostLetto }> {
  const { data, error } = await supabase
    .from('instagram_contenuti')
    .select('shortcode, permalink, media_type, reel, pubblicato_il, didascalia, eliminato_il')
    .eq('shortcode', shortcode)
    .maybeSingle()
  if (error) return { errore: NON_SALVATO }
  if (!data) return { errore: POST_SPARITO }
  const permalink = urlPost.safeParse(data.permalink)
  if (!permalink.success || !permalink.data) return { errore: POST_SPARITO }
  return { post: { ...data, permalink: permalink.data } }
}

/**
 * «Collega» (or «Collega e segna Posted»): the post's permalink in the
 * content's URL, only on a content still without one. A post online makes the
 * content Posted; the Post Date is written only when it has none (a planned
 * date is never lost without a tap: «Usa la data di Instagram» in the panel).
 */
export async function collegaPost(input: unknown): Promise<EsitoCollega> {
  const parsed = coppiaPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { shortcode, contenuto_id: id } = parsed.data
  const supabase = await createClient()
  const letto = await leggiPost(supabase, shortcode)
  if ('errore' in letto) return { ok: false, errore: letto.errore }
  if (letto.post.eliminato_il) return { ok: false, errore: POST_ELIMINATO }
  const giorno = giornoRoma(letto.post.pubblicato_il)

  const { data: contenuto, error: lettura } = await supabase
    .from('marketing_contenuti')
    .select('id, stato, post_date, url')
    .eq('id', id)
    .maybeSingle()
  if (lettura) return { ok: false, errore: NON_SALVATO }
  if (!contenuto) {
    aggiorna()
    return { ok: false, errore: SPARITO }
  }
  if (contenuto.url !== null) {
    aggiorna(id)
    return { ok: false, errore: HA_GIA_UN_POST }
  }

  const statoPrima = contenuto.stato
  const permalink = letto.post.permalink
  // one statement: written only while the content still has no URL (and,
  // for the Post Date, still none: a date typed meanwhile wins)
  async function scrivi(conData: boolean) {
    let query = supabase
      .from('marketing_contenuti')
      .update({
        url: permalink,
        ...(statoPrima !== 'posted' ? { stato: 'posted' as const } : {}),
        ...(conData ? { post_date: giorno } : {}),
      })
      .eq('id', id)
      .is('url', null)
    if (conData) query = query.is('post_date', null)
    return query.select('url, stato, post_date, updated_at').maybeSingle()
  }

  const conData = contenuto.post_date === null && giorno !== null
  let scritto = await scrivi(conData)
  if (!scritto.error && !scritto.data && conData) scritto = await scrivi(false)
  if (scritto.error) {
    aggiorna(id)
    return { ok: false, errore: errore(scritto.error) }
  }
  if (!scritto.data) {
    aggiorna(id)
    return { ok: false, errore: HA_GIA_UN_POST }
  }

  aggiorna(id)
  return {
    ok: true,
    versione: scritto.data.updated_at,
    url: scritto.data.url ?? permalink,
    stato: scritto.data.stato,
    post_date: scritto.data.post_date,
    prima: { stato: statoPrima, postDateScritta: conData && scritto.data.post_date === giorno },
  }
}

/**
 * «Annulla» right after «Collega»: the URL off again, the Status and the Post
 * Date as they were if the tap wrote them, and no "no" left for the pair (a
 * wrong tap never becomes a refusal for ever). Only while the content still
 * has that post.
 */
export async function annullaCollega(input: unknown): Promise<EsitoPost> {
  const parsed = coppiaPostSchema
    .extend({
      prima: contenutoSchema.shape.stato.optional(),
      post_date: contenutoSchema.shape.post_date.optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { shortcode, contenuto_id: id, prima, post_date } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketing_contenuti')
    .update({ url: null, ...(prima ? { stato: prima } : {}) })
    .eq('id', id)
    .eq('instagram_shortcode', shortcode)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error) }
  if (!data) {
    aggiorna(id)
    return { ok: false, errore: ALTRO_POST }
  }
  if (post_date) {
    // only the date this tap wrote, if nobody changed it since
    await supabase.from('marketing_contenuti').update({ post_date: null }).eq('id', id).eq('post_date', post_date)
  }
  // the trigger wrote the pair as refused: an undone tap is not a "no"
  await supabase.from('marketing_abbinamenti_rifiutati').delete().eq('shortcode', shortcode).eq('contenuto_id', id)

  await ripropone()
  aggiorna(id)
  return { ok: true }
}

/**
 * «Scollega»: the URL off; the pair becomes a "no" the run never redoes
 * (trigger). The sign «Collegato da solo», if the run made the link, stays in
 * the database for 10 minutes with the "no" (instagram_salva_proposte keeps
 * it): «Annulla» finds it there, nothing of it goes to the browser.
 */
export async function scollegaPost(input: unknown): Promise<EsitoScollega> {
  const parsed = coppiaPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { shortcode, contenuto_id: id } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketing_contenuti')
    .update({ url: null })
    .eq('id', id)
    .eq('instagram_shortcode', shortcode)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error) }

  if (!data) {
    const { data: ora, error: lettura } = await supabase
      .from('marketing_contenuti')
      .select('instagram_shortcode, updated_at')
      .eq('id', id)
      .maybeSingle()
    aggiorna(id)
    if (lettura) return { ok: false, errore: NON_SALVATO }
    if (!ora) return { ok: false, errore: SPARITO }
    // already unlinked elsewhere: what the person wanted
    if (ora.instagram_shortcode === null) return { ok: true, versione: ora.updated_at }
    return { ok: false, errore: ALTRO_POST }
  }

  await ripropone()
  aggiorna(id)
  return { ok: true, versione: data.updated_at }
}

/**
 * «Annulla» right after «Scollega»: the post back on the content, with the
 * session like every link by hand. The trigger takes the "no" away and, when
 * the run had made the link and the unlink is less than 10 minutes old, the
 * sign «Collegato da solo» it kept is there again: everything as before the
 * tap. The browser sends only the pair; the sign never comes from it.
 */
export async function annullaScollega(input: unknown): Promise<EsitoPost> {
  const parsed = coppiaPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { shortcode, contenuto_id: id } = parsed.data
  const supabase = await createClient()
  const letto = await leggiPost(supabase, shortcode)
  if ('errore' in letto) return { ok: false, errore: letto.errore }

  const { data, error } = await supabase
    .from('marketing_contenuti')
    .update({ url: letto.post.permalink })
    .eq('id', id)
    .is('url', null)
    .select('id')
    .maybeSingle()
  if (error) {
    aggiorna(id)
    return { ok: false, errore: errore(error) }
  }
  if (!data) {
    aggiorna(id)
    return { ok: false, errore: HA_GIA_UN_POST }
  }
  aggiorna(id)
  return { ok: true }
}

/**
 * «Crea il contenuto»: a Posted content made from the post (Name from the
 * caption, Post Date and URL of the post), through contenutoSchema like every
 * content. The page opens it in the panel.
 */
export async function creaContenutoDaPost(input: unknown): Promise<EsitoCreaDaPost> {
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const letto = await leggiPost(supabase, parsed.data.shortcode)
  if ('errore' in letto) return { ok: false, errore: letto.errore }
  if (letto.post.eliminato_il) return { ok: false, errore: POST_ELIMINATO }

  const dati = contenutoSchema.safeParse(contenutoDaPost(letto.post))
  if (!dati.success) return { ok: false, errore: primoErrore(dati.error.issues) }

  const { data, error } = await supabase
    .from('marketing_contenuti')
    .insert({ ...dati.data, bozza: null })
    .select('id, updated_at')
    .single()
  if (error) {
    aggiorna()
    return { ok: false, errore: errore(error) }
  }

  await ripropone()
  aggiorna(data.id)
  return { ok: true, id: data.id, versione: data.updated_at }
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
