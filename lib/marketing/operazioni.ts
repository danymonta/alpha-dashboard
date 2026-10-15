import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { contenutoDaPost } from '@/lib/marketing/da-post'
import { COLONNE_ELENCO, type ContenutoElenco } from '@/lib/marketing/elenco'
import {
  BOZZA_REEL,
  CAMPI,
  CAMPO_MODELLO,
  ORDINE_SEZIONI,
  SEZIONI,
  type FormatContenuto,
  type ReelType,
  type SezioneContenuto,
  type StatusContenuto,
} from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import type { Database, TablesUpdate } from '@/lib/supabase/database.types'
import {
  campiContenutoSchema,
  campoContenutoSchema,
  contenutoSchema,
  eliminaContenutoSchema,
  normalizzaSezione,
  sezioneContenutoSchema,
  statusContenutoSchema,
  urlPost,
  type CampoContenutoDati,
  type CampoInCella,
  type ContenutoDati,
} from '@/lib/validation/contenuto'
import { coppiaPostSchema, postSchema } from '@/lib/validation/post-instagram'

/**
 * The only way the content calendar is written (1.34.0, 10/10/2026): from the
 * app (the server actions of /marketing/contenuti and /marketing/instagram,
 * with the cookie session of whoever taps: the new-content form, the cells,
 * the panel, the Status, the sections, the posts of Instagram) and from
 * Claude (the MCP tools, with the OAuth token of whoever connected it). Same
 * Zod schemas (lib/validation/contenuto.ts), same SQL, same messages, same
 * versions; the client is always the caller's, never the service role, so
 * RLS on marketing_contenuti decides who reads, writes and deletes. Who may
 * ask is the caller's guard (the actions' negaSeNon, the MCP route's token
 * check); here only a refusal of the database becomes words.
 *
 * Every success returns the row's new updated_at (versione): the panel and
 * the page keep the most recent detail they know with it (1.33.0), Claude
 * gets it with the values it covers (1.34.0). Every write revalidates the
 * whole Marketing area (the list, a content's page, the posts of Instagram,
 * whose links a URL changes, and the layout's count), so a change from
 * Claude shows in the app too, and the answer of an action already carries
 * the page redrawn: no router.refresh() after it (1.33.0).
 */

export type Db = SupabaseClient<Database>

export type Esito = { ok: true; versione: string } | { ok: false; errore: string }

export type EsitoCreazione = { ok: true; id: string; versione: string } | { ok: false; errore: string }

/** For each section given to creaContenuto: true when saved, otherwise why not. */
export type SezioniScritte = Partial<Record<SezioneContenuto, true | string>>

export type EsitoCreazioneConSezioni =
  | { ok: true; id: string; versione: string; sezioni: SezioniScritte }
  | { ok: false; errore: string }

/**
 * One property (1.33.0). `valore` is the field as the database saved it;
 * `cambiato` the value somebody else saved meanwhile (the field shows it).
 */
export type EsitoCampo =
  | { ok: true; valore: unknown; versione: string }
  | { ok: false; errore: string; cambiato?: { valore: unknown; versione: string }; sparito?: true }

/**
 * Several properties at once (1.34.0, Claude). `riga` is the content as the
 * write left it, its version included; `cambiato` the content as it is now,
 * when one of the fields was no longer the value read.
 */
export type EsitoCampi =
  | { ok: true; riga: ContenutoElenco }
  | { ok: false; errore: string; cambiato?: ContenutoElenco; sparito?: true }

export type EsitoSezione =
  | { ok: true; impronta: string; versione: string }
  | {
      ok: false
      errore: string
      /** the section as it is saved now: the page shows it and keeps the person's text to copy */
      cambiata?: { attuale: string | null; impronta: string; versione: string }
      sparito?: true
    }

export type EsitoEliminazione = { ok: true } | { ok: false; errore: string }

export const SOLO_MARKETING = 'Il calendario dei contenuti è dell’area Marketing.'
const NON_SALVATO = 'Contenuto non salvato. Riprova.'
const NON_ELIMINATO = 'Contenuto non eliminato. Riprova.'
const SPARITO = 'Questo contenuto non c’è più.'
const SEZIONE_CAMBIATA =
  'Questa parte è cambiata da un’altra parte: ricarico il testo salvato. Il tuo testo resta qui sotto: copialo se ti serve.'
const POST_GIA_COLLEGATO = 'Questo post è già collegato a un altro contenuto.'
/** A section of a content just created, changed by someone else before its text arrived: nobody has a page to reload. */
const SEZIONE_CAMBIATA_APPENA_CREATO = 'Questa parte è cambiata da un’altra parte: rileggila prima di riscriverla.'
/** Several properties, one of them changed meanwhile (Claude rereads it: the values come with the answer). */
const CAMBIATO = 'Il contenuto è cambiato da un’altra parte: ricarico i dati salvati.'

function primoErrore(issues: { message: string }[]): string {
  return issues[0]?.message ?? 'Dati non validi.'
}

function errore(error: { code?: string; message: string }, nonSalvato = NON_SALVATO): string {
  // the unique index of the ideas: the same idea twice
  if (error.code === '23505' && error.message.includes('marketing_contenuti_idea_idx')) return IDEA_GIA_NEL_CALENDARIO
  // the unique index on instagram_shortcode: the same post on two contents
  if (error.code === '23505') return POST_GIA_COLLEGATO
  // the trigger of the ideas, in its own words
  if (error.code === '22023' && error.message.startsWith('Idea di Claude')) return error.message
  // a write RLS refused: Postgres's own words are not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return SOLO_MARKETING
  return messaggioErrore(error, nonSalvato)
}

/** The whole Marketing area: the list, a content's page, the posts of Instagram and the layout's count. */
function aggiorna() {
  revalidatePath('/marketing', 'layout')
}

// ── a new content ───────────────────────────────────────────────────────────

/** The insert every new content goes through: the form, Claude and «Crea il contenuto» from a post. */
async function inserisci(db: Db, dati: ContenutoDati, bozza: string | null, origine?: OrigineIdea) {
  return db
    .from('marketing_contenuti')
    .insert({ ...dati, bozza, ...(origine ? { da_analisi: origine.analisi_id, da_idea: origine.idea } : {}) })
    .select('id, updated_at')
    .single()
}

/**
 * The idea of Claude a content is born from («Aggiungi al calendario», the reel
 * analysis, 1.36.0): the analysis and the index of the idea. Only the action of
 * the Analisi page passes it; the MCP server and the «Nuovo contenuto» form
 * never do (the database refuses it to a Claude token and to a made-up one).
 */
export type OrigineIdea = { analisi_id: string; idea: number }

const IDEA_GIA_NEL_CALENDARIO = 'Questa idea è già nel calendario.'

/**
 * A new content. A Reel Topic starts with Hook, Line, Line, CTA in its rough
 * draft, as in Notion; a Carousel Topic empty.
 *
 * `sezioni` (Claude creates a content with its texts): every text is checked
 * first with the rule of the section form (at most 30,000 characters once
 * normalised), and one that fails stops everything before the insert. Then
 * the content, then each section in the order of the template, saved over
 * the text the insert wrote (the reel template, or nothing). A section that
 * fails afterwards is reported by its key and never undoes the content or
 * the other sections; the version returned is the last one saved.
 */
export async function creaContenuto(
  db: Db,
  input: unknown,
  sezioni?: Partial<Record<SezioneContenuto, string>>,
  origine?: OrigineIdea,
): Promise<EsitoCreazioneConSezioni> {
  const parsed = contenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const testi: [SezioneContenuto, string][] = []
  for (const campo of ORDINE_SEZIONI) {
    const testo: unknown = sezioni?.[campo]
    if (testo === undefined) continue
    const controllo = sezioneContenutoSchema.shape.testo.safeParse(testo)
    if (!controllo.success) {
      return { ok: false, errore: `${SEZIONI[parsed.data.tipo][campo]}: ${primoErrore(controllo.error.issues)}` }
    }
    testi.push([campo, controllo.data])
  }

  const bozza = parsed.data.tipo === 'reel' ? BOZZA_REEL : null
  const { data, error } = await inserisci(db, parsed.data, bozza, origine)
  if (error) return { ok: false, errore: errore(error) }

  // what the insert left in each section: the fingerprint the first save starts from
  const scritto: Record<SezioneContenuto, string | null> = { messaggio: null, bozza, commenti: null, finale: null }
  const esiti: SezioniScritte = {}
  let versione = data.updated_at
  for (const [campo, testo] of testi) {
    // the same text as the template (an empty section left empty): nothing to write
    if (normalizzaSezione(testo) === normalizzaSezione(scritto[campo])) {
      esiti[campo] = true
      continue
    }
    const esito = await scriviSezione(db, { id: data.id, campo, testo, impronta: improntaTesto(scritto[campo]) })
    if (esito.ok) {
      esiti[campo] = true
      versione = esito.versione
    } else {
      esiti[campo] = esito.cambiata ? SEZIONE_CAMBIATA_APPENA_CREATO : esito.errore
    }
  }

  aggiorna()
  return { ok: true, id: data.id, versione, sezioni: esiti }
}

// ── the properties ──────────────────────────────────────────────────────────

/** "Post Date", "Modello": the field as the panel and the table name it. */
function nomeCampo(campo: CampoInCella): string {
  return campo === 'tipo' ? CAMPO_MODELLO : CAMPI[campo]
}

function campoCambiato(campo: CampoInCella): string {
  return `Il campo «${nomeCampo(campo)}» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.`
}

/** The one column a field writes, typed (never a key from the browser or from Claude). */
function cambio(dati: CampoContenutoDati): TablesUpdate<'marketing_contenuti'> {
  switch (dati.campo) {
    case 'tipo':
      return { tipo: dati.valore }
    case 'nome':
      return { nome: dati.valore }
    case 'reel_type':
      return { reel_type: dati.valore }
    case 'formato':
      return { formato: dati.valore }
    case 'post_date':
      return { post_date: dati.valore }
    case 'inspiration':
      return { inspiration: dati.valore }
    case 'url':
      return { url: dati.valore }
    case 'audio':
      return { audio: dati.valore }
    case 'view_count':
      return { view_count: dati.valore }
  }
}

type Scrittura =
  | { esito: 'scritto'; riga: ContenutoElenco }
  | { esito: 'cambiato'; riga: ContenutoElenco }
  | { esito: 'sparito' }
  | { esito: 'errore'; errore: string }

/**
 * The one write of the properties (1.33.0, Dany: "ogni campo deve essere
 * modificabile direttamente dalla tabella"): one SQL update with, for each
 * field, the condition `<campo> is not distinct from <prima>`, atomic, no
 * window between the check and the write. Two people on two fields of the
 * same row never block each other; two on the same field never overwrite a
 * value one of them has not seen. The Status, when given, has no condition:
 * the last tap wins, as in Notion. No row written: the content as it is now
 * (cambiato), or gone.
 */
async function scriviCampi(
  db: Db,
  id: string,
  campi: CampoContenutoDati[],
  stato?: StatusContenuto,
): Promise<Scrittura> {
  const valori: TablesUpdate<'marketing_contenuti'> = Object.assign({}, ...campi.map(cambio))
  if (stato !== undefined) valori.stato = stato
  let query = db.from('marketing_contenuti').update(valori).eq('id', id)
  for (const { campo, prima } of campi) query = prima === null ? query.is(campo, null) : query.eq(campo, prima)
  const { data, error } = await query.select(COLONNE_ELENCO).maybeSingle()
  if (error) return { esito: 'errore', errore: errore(error) }
  if (data) return { esito: 'scritto', riga: data }

  // no row with those values: gone, or changed (perhaps to the same value) by somebody else
  const { data: ora, error: lettura } = await db
    .from('marketing_contenuti')
    .select(COLONNE_ELENCO)
    .eq('id', id)
    .maybeSingle()
  if (lettura) return { esito: 'errore', errore: NON_SALVATO }
  return ora ? { esito: 'cambiato', riga: ora } : { esito: 'sparito' }
}

/**
 * One property, saved only over the value the field showed (1.33.0): a table
 * cell, a card chip, a field of the panel or of the page, «Usa la data di
 * Instagram». Somebody else who wrote the same value meanwhile is a success.
 */
export async function modificaCampoContenuto(db: Db, input: unknown): Promise<EsitoCampo> {
  const parsed = campoContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { id, campo, valore } = parsed.data
  const scritto = await scriviCampi(db, id, [parsed.data])
  if (scritto.esito === 'errore') return { ok: false, errore: scritto.errore }
  aggiorna()
  if (scritto.esito === 'scritto') return { ok: true, valore: scritto.riga[campo], versione: scritto.riga.updated_at }
  if (scritto.esito === 'sparito') return { ok: false, errore: SPARITO, sparito: true }
  const ora = scritto.riga
  if (ora[campo] === valore) return { ok: true, valore: ora[campo], versione: ora.updated_at }
  return { ok: false, errore: campoCambiato(campo), cambiato: { valore: ora[campo], versione: ora.updated_at } }
}

/**
 * Several properties of one content in one write (1.34.0, Claude's
 * modifica_contenuto): each field over the value Claude read at the version it
 * holds, the Status (if given) as one tap. All or nothing.
 */
export async function modificaCampiContenuto(db: Db, input: unknown): Promise<EsitoCampi> {
  const parsed = campiContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { id, campi, stato } = parsed.data
  const scritto = await scriviCampi(db, id, campi, stato)
  if (scritto.esito === 'errore') return { ok: false, errore: scritto.errore }
  aggiorna()
  if (scritto.esito === 'scritto') return { ok: true, riga: scritto.riga }
  if (scritto.esito === 'sparito') return { ok: false, errore: SPARITO, sparito: true }
  return { ok: false, errore: CAMBIATO, cambiato: scritto.riga }
}

/** One tap, no version: the last Status wins, as in Notion. */
export async function cambiaStatusContenuto(db: Db, input: unknown): Promise<Esito> {
  const parsed = statusContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { data, error } = await db
    .from('marketing_contenuti')
    .update({ stato: parsed.data.stato })
    .eq('id', parsed.data.id)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error) }

  aggiorna()
  return data ? { ok: true, versione: data.updated_at } : { ok: false, errore: SPARITO }
}

// ── the sections ────────────────────────────────────────────────────────────

type RispostaSezione = {
  esito?: 'salvata' | 'cambiata' | 'sparito'
  impronta?: string
  versione?: string
  attuale?: string | null
}

/** public.salva_sezione_contenuto, its answer in words. No validation, no revalidation: the callers do both. */
async function scriviSezione(
  db: Db,
  sezione: { id: string; campo: SezioneContenuto; testo: string; impronta: string },
): Promise<EsitoSezione> {
  const { data, error } = await db.rpc('salva_sezione_contenuto', {
    p_id: sezione.id,
    p_campo: sezione.campo,
    p_testo: sezione.testo,
    p_impronta: sezione.impronta,
  })
  if (error) return { ok: false, errore: errore(error) }

  const risposta = (data ?? {}) as RispostaSezione
  if (risposta.esito === 'sparito') return { ok: false, errore: SPARITO, sparito: true }
  if (risposta.esito === 'cambiata' && risposta.impronta && risposta.versione) {
    return {
      ok: false,
      errore: SEZIONE_CAMBIATA,
      cambiata: { attuale: risposta.attuale ?? null, impronta: risposta.impronta, versione: risposta.versione },
    }
  }
  if (risposta.esito !== 'salvata' || !risposta.impronta || !risposta.versione) {
    return { ok: false, errore: NON_SALVATO }
  }
  return { ok: true, impronta: risposta.impronta, versione: risposta.versione }
}

/**
 * One section, saved only over the text the page showed (its md5, computed
 * when the page was rendered): two people on two sections never block each
 * other, two on the same one never overwrite text they have not seen.
 */
export async function salvaSezioneContenuto(db: Db, input: unknown): Promise<EsitoSezione> {
  const parsed = sezioneContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const esito = await scriviSezione(db, parsed.data)
  // a database error or an answer that makes no sense leaves the pages as they are
  if (esito.ok || esito.cambiata || esito.sparito) aggiorna()
  return esito
}

// ── deleting ────────────────────────────────────────────────────────────────

/**
 * Deletes a content, nothing else with it. Who may: RLS (from the app the
 * admin and marketing, from Claude only the admin). A delete RLS filters out
 * raises nothing: the rows that went say whether it happened.
 */
export async function eliminaContenuto(db: Db, input: unknown): Promise<EsitoEliminazione> {
  const parsed = eliminaContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { data, error } = await db.from('marketing_contenuti').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, NON_ELIMINATO) }

  aggiorna()
  return data.length > 0 ? { ok: true } : { ok: false, errore: SPARITO }
}

// ── the posts of Instagram (1.33.0) ─────────────────────────────────────────
//
// The taps of the admin, the video editor and marketing on "Da collegare",
// "Collegati", "Fuori dal calendario" and the panel's «Post su Instagram»
// (Collega, Annulla, Scollega, Crea il contenuto, Non va nel calendario,
// Rimetti), all of them here: one write path. The permalink never comes
// from the input: it is read from instagram_contenuti with the caller's
// client and checked like a URL typed by hand. Unlinking a post (the URL
// emptied) leaves a "no" for that pair (trigger
// marketing_contenuti_post_scollegato): the run never proposes or links it
// again; linking it by hand takes it away. The sign «Collegato da solo» is
// never written from here. The proposals, redone with the service role after
// a tap that changes what can be proposed, are the action's: `riproponi` runs
// where the tap is done, before the redraw (the core never creates a service
// role client).

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

/** After a tap that changes what can be proposed: the action's own work (it never fails the tap). */
export type OpzioniPost = {
  riproponi?: () => Promise<void>
  /**
   * Reel Type and Format Claude gave the reel (the reel analysis, 1.36.0):
   * written in the same insert of «Crea il contenuto». Only the server passes
   * it, from the visual card: never in the input, which comes from the browser.
   */
  classificazione?: { reel_type: ReelType | null; formato: FormatContenuto | null }
}

const NON_SALVATO_POST = 'Non salvato. Riprova.'
const HA_GIA_UN_POST = 'Questo contenuto ha già un post: aprilo e cambia l’URL se è un altro.'
const ALTRO_POST = 'Questo contenuto ha già un altro post.'
const POST_SPARITO = 'Questo post non c’è più: aggiorna da Instagram.'
const POST_ELIMINATO = 'Questo post non è più su Instagram.'
const COLLEGATO_PRIMA = 'Questo post è collegato: scollegalo prima.'

function errorePost(error: { code?: string; message: string }): string {
  return errore(error, NON_SALVATO_POST)
}

type PostLetto = {
  shortcode: string
  permalink: string
  media_type: string
  reel: boolean
  pubblicato_il: string
  didascalia: string | null
  eliminato_il: string | null
}

/** The post as the caller reads it, with its permalink checked like a URL typed by hand. */
async function leggiPost(db: Db, shortcode: string): Promise<{ errore: string } | { post: PostLetto }> {
  const { data, error } = await db
    .from('instagram_contenuti')
    .select('shortcode, permalink, media_type, reel, pubblicato_il, didascalia, eliminato_il')
    .eq('shortcode', shortcode)
    .maybeSingle()
  if (error) return { errore: NON_SALVATO_POST }
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
export async function collegaPost(db: Db, input: unknown): Promise<EsitoCollega> {
  const parsed = coppiaPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { shortcode, contenuto_id: id } = parsed.data
  const letto = await leggiPost(db, shortcode)
  if ('errore' in letto) return { ok: false, errore: letto.errore }
  if (letto.post.eliminato_il) return { ok: false, errore: POST_ELIMINATO }
  const giorno = giornoRoma(letto.post.pubblicato_il)

  const { data: contenuto, error: lettura } = await db
    .from('marketing_contenuti')
    .select('id, stato, post_date, url')
    .eq('id', id)
    .maybeSingle()
  if (lettura) return { ok: false, errore: NON_SALVATO_POST }
  if (!contenuto) {
    aggiorna()
    return { ok: false, errore: SPARITO }
  }
  if (contenuto.url !== null) {
    aggiorna()
    return { ok: false, errore: HA_GIA_UN_POST }
  }

  const statoPrima = contenuto.stato
  const permalink = letto.post.permalink
  // one statement: written only while the content still has no URL (and,
  // for the Post Date, still none: a date typed meanwhile wins)
  async function scrivi(conData: boolean) {
    let query = db
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
    aggiorna()
    return { ok: false, errore: errorePost(scritto.error) }
  }
  if (!scritto.data) {
    aggiorna()
    return { ok: false, errore: HA_GIA_UN_POST }
  }

  aggiorna()
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
export async function annullaCollega(db: Db, input: unknown, opzioni: OpzioniPost = {}): Promise<EsitoPost> {
  const parsed = coppiaPostSchema
    .extend({
      prima: contenutoSchema.shape.stato.optional(),
      post_date: contenutoSchema.shape.post_date.optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { shortcode, contenuto_id: id, prima, post_date } = parsed.data
  const { data, error } = await db
    .from('marketing_contenuti')
    .update({ url: null, ...(prima ? { stato: prima } : {}) })
    .eq('id', id)
    .eq('instagram_shortcode', shortcode)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, errore: errorePost(error) }
  if (!data) {
    aggiorna()
    return { ok: false, errore: ALTRO_POST }
  }
  if (post_date) {
    // only the date this tap wrote, if nobody changed it since
    await db.from('marketing_contenuti').update({ post_date: null }).eq('id', id).eq('post_date', post_date)
  }
  // the trigger wrote the pair as refused: an undone tap is not a "no"
  await db.from('marketing_abbinamenti_rifiutati').delete().eq('shortcode', shortcode).eq('contenuto_id', id)

  await opzioni.riproponi?.()
  aggiorna()
  return { ok: true }
}

/**
 * «Scollega»: the URL off; the pair becomes a "no" the run never redoes
 * (trigger). The sign «Collegato da solo», if the run made the link, stays in
 * the database for 10 minutes with the "no" (instagram_salva_proposte keeps
 * it): «Annulla» finds it there, nothing of it goes to the browser.
 */
export async function scollegaPost(db: Db, input: unknown, opzioni: OpzioniPost = {}): Promise<EsitoScollega> {
  const parsed = coppiaPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { shortcode, contenuto_id: id } = parsed.data
  const { data, error } = await db
    .from('marketing_contenuti')
    .update({ url: null })
    .eq('id', id)
    .eq('instagram_shortcode', shortcode)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, errore: errorePost(error) }

  if (!data) {
    const { data: ora, error: lettura } = await db
      .from('marketing_contenuti')
      .select('instagram_shortcode, updated_at')
      .eq('id', id)
      .maybeSingle()
    aggiorna()
    if (lettura) return { ok: false, errore: NON_SALVATO_POST }
    if (!ora) return { ok: false, errore: SPARITO }
    // already unlinked elsewhere: what the person wanted
    if (ora.instagram_shortcode === null) return { ok: true, versione: ora.updated_at }
    return { ok: false, errore: ALTRO_POST }
  }

  await opzioni.riproponi?.()
  aggiorna()
  return { ok: true, versione: data.updated_at }
}

/**
 * «Annulla» right after «Scollega»: the post back on the content, with the
 * caller's client like every link by hand. The trigger takes the "no" away
 * and, when the run had made the link and the unlink is less than 10 minutes
 * old, the sign «Collegato da solo» it kept is there again: everything as
 * before the tap. The input is only the pair; the sign never comes from it.
 */
export async function annullaScollega(db: Db, input: unknown): Promise<EsitoPost> {
  const parsed = coppiaPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { shortcode, contenuto_id: id } = parsed.data
  const letto = await leggiPost(db, shortcode)
  if ('errore' in letto) return { ok: false, errore: letto.errore }

  const { data, error } = await db
    .from('marketing_contenuti')
    .update({ url: letto.post.permalink })
    .eq('id', id)
    .is('url', null)
    .select('id')
    .maybeSingle()
  if (error) {
    aggiorna()
    return { ok: false, errore: errorePost(error) }
  }
  if (!data) {
    aggiorna()
    return { ok: false, errore: HA_GIA_UN_POST }
  }
  aggiorna()
  return { ok: true }
}

/**
 * «Crea il contenuto»: a Posted content made from the post (Name from the
 * caption, Post Date and URL of the post), through contenutoSchema and the
 * same insert as every content, without the reel's draft: the reel is
 * already made.
 */
export async function creaContenutoDaPost(db: Db, input: unknown, opzioni: OpzioniPost = {}): Promise<EsitoCreaDaPost> {
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const letto = await leggiPost(db, parsed.data.shortcode)
  if ('errore' in letto) return { ok: false, errore: letto.errore }
  if (letto.post.eliminato_il) return { ok: false, errore: POST_ELIMINATO }

  const dati = contenutoSchema.safeParse(contenutoDaPost(letto.post, opzioni.classificazione))
  if (!dati.success) return { ok: false, errore: primoErrore(dati.error.issues) }

  const { data, error } = await inserisci(db, dati.data, null)
  if (error) {
    aggiorna()
    return { ok: false, errore: errorePost(error) }
  }

  await opzioni.riproponi?.()
  aggiorna()
  return { ok: true, id: data.id, versione: data.updated_at }
}

/**
 * «Non va nel calendario»: a repost, a personal post. Never on a post already
 * linked to a content; two taps (or two people) are one.
 */
export async function escludiPost(db: Db, input: unknown): Promise<EsitoPost> {
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { shortcode } = parsed.data
  const { data: collegato, error: lettura } = await db
    .from('marketing_contenuti')
    .select('id')
    .eq('instagram_shortcode', shortcode)
    .maybeSingle()
  if (lettura) return { ok: false, errore: NON_SALVATO_POST }
  if (collegato) {
    aggiorna()
    return { ok: false, errore: COLLEGATO_PRIMA }
  }

  const { error } = await db.from('marketing_post_esclusi').insert({ shortcode })
  // already left out (two taps, another person): what the person wanted
  if (error && error.code !== '23505') {
    aggiorna()
    return { ok: false, errore: error.code === '23503' ? POST_SPARITO : errorePost(error) }
  }
  aggiorna()
  return { ok: true }
}

/** «Rimetti» (or «Annulla» after «Non va nel calendario»): the post is work again, its proposals redone. */
export async function rimettiPost(db: Db, input: unknown, opzioni: OpzioniPost = {}): Promise<EsitoPost> {
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { error } = await db.from('marketing_post_esclusi').delete().eq('shortcode', parsed.data.shortcode)
  if (error) return { ok: false, errore: errorePost(error) }

  await opzioni.riproponi?.()
  aggiorna()
  return { ok: true }
}
