import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { BOZZA_REEL, ORDINE_SEZIONI, SEZIONI, type SezioneContenuto } from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'
import type { Database } from '@/lib/supabase/database.types'
import {
  contenutoSchema,
  eliminaContenutoSchema,
  modificaContenutoSchema,
  normalizzaSezione,
  sezioneContenutoSchema,
  statusContenutoSchema,
} from '@/lib/validation/contenuto'

/**
 * The only way the content calendar is written (MCP release, 09/10/2026):
 * from the app (the server actions of /marketing/contenuti, with the cookie
 * session of whoever taps) and from Claude (the MCP tools, with the OAuth
 * token of whoever connected it). Same Zod schemas, same SQL, same messages;
 * the client is always the caller's, never the service role, so RLS on
 * marketing_contenuti decides who reads, writes and deletes. Who may ask is
 * the caller's guard (the actions' negaSeNon, the MCP route's token check);
 * here only a refusal of the database becomes words.
 *
 * Every success returns the row's new updated_at (versione): the properties
 * sheet saves over it, so a person's own Status tap or section save never
 * makes their own sheet look changed elsewhere. The pages are revalidated
 * here, so a change from Claude shows in the app too.
 */

export type Db = SupabaseClient<Database>

export type Esito = { ok: true; versione: string } | { ok: false; errore: string }

export type EsitoCreazione = { ok: true; id: string; versione: string } | { ok: false; errore: string }

/** For each section given to creaContenuto: true when saved, otherwise why not. */
export type SezioniScritte = Partial<Record<SezioneContenuto, true | string>>

export type EsitoCreazioneConSezioni =
  | { ok: true; id: string; versione: string; sezioni: SezioniScritte }
  | { ok: false; errore: string }

export type EsitoModifica = Esito | { ok: false; errore: string; cambiato: true }

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
const CAMBIATO = 'Il contenuto è cambiato da un’altra parte: ricarico i dati salvati.'
const SEZIONE_CAMBIATA =
  'Questa parte è cambiata da un’altra parte: ricarico il testo salvato. Il tuo testo resta qui sotto: copialo se ti serve.'
const POST_GIA_COLLEGATO = 'Questo post è già collegato a un altro contenuto.'
/** A section of a content just created, changed by someone else before its text arrived: nobody has a page to reload. */
const SEZIONE_CAMBIATA_APPENA_CREATO = 'Questa parte è cambiata da un’altra parte: rileggila prima di riscriverla.'

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

function aggiorna(id?: string) {
  revalidatePath('/marketing/contenuti')
  if (id) revalidatePath(`/marketing/contenuti/${id}`)
}

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
  const { data, error } = await db
    .from('marketing_contenuti')
    .insert({ ...parsed.data, bozza })
    .select('id, updated_at')
    .single()
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

  aggiorna(testi.length > 0 ? data.id : undefined)
  return { ok: true, id: data.id, versione, sezioni: esiti }
}

/**
 * The properties, saved only over the version the sheet read. A row changed
 * meanwhile (by someone else) is never overwritten: cambiato, and the page
 * reloads it.
 */
export async function modificaContenuto(db: Db, input: unknown): Promise<EsitoModifica> {
  const parsed = modificaContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }

  const { id, versione, ...campi } = parsed.data
  const { data, error } = await db
    .from('marketing_contenuti')
    .update(campi)
    .eq('id', id)
    .eq('updated_at', versione)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error) }

  if (!data) {
    // no row at that version: gone, or changed since the sheet read it
    const { data: ancora, error: lettura } = await db
      .from('marketing_contenuti')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (lettura) return { ok: false, errore: NON_SALVATO }
    aggiorna(id)
    return ancora ? { ok: false, errore: CAMBIATO, cambiato: true } : { ok: false, errore: SPARITO }
  }

  aggiorna(id)
  return { ok: true, versione: data.updated_at }
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

  aggiorna(parsed.data.id)
  return data ? { ok: true, versione: data.updated_at } : { ok: false, errore: SPARITO }
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
  if (esito.ok || esito.cambiata || esito.sparito) aggiorna(parsed.data.id)
  return esito
}

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

  aggiorna(parsed.data.id)
  return data.length > 0 ? { ok: true } : { ok: false, errore: SPARITO }
}
