'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { COLONNE_ELENCO } from '@/lib/marketing/elenco'
import { CAMPI, CAMPO_MODELLO, BOZZA_REEL } from '@/lib/marketing/etichette'
import { RUOLI_ELIMINA_CONTENUTI } from '@/lib/marketing/permessi'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import {
  campoContenutoSchema,
  contenutoSchema,
  eliminaContenutoSchema,
  sezioneContenutoSchema,
  statusContenutoSchema,
  type CampoContenutoDati,
  type CampoContenutoInput,
  type CampoInCella,
} from '@/lib/validation/contenuto'

/**
 * The content calendar (1.32.0): Notion's "Instagram Posts" in the app, for
 * the admin, the video editor and marketing. Every action runs with the
 * session of whoever taps, never the service role: RLS on
 * marketing_contenuti decides (vede_marketing(); delete only admin and
 * marketing), and the role checks here only turn a refusal into words.
 *
 * Every success returns the row's new updated_at (versione): the panel and
 * the page keep the most recent detail they know with it (1.33.0).
 */

export type Esito = { ok: true; versione: string } | { ok: false; errore: string }

export type EsitoCreazione = { ok: true; id: string; versione: string } | { ok: false; errore: string }

/**
 * One property (1.33.0). `valore` is the field as the database saved it;
 * `cambiato` the value somebody else saved meanwhile (the field shows it).
 */
export type EsitoCampo =
  | { ok: true; valore: unknown; versione: string }
  | { ok: false; errore: string; cambiato?: { valore: unknown; versione: string }; sparito?: true }

export type EsitoSezione =
  | { ok: true; impronta: string; versione: string }
  | {
      ok: false
      errore: string
      /** the section as it is saved now: the page shows it and keeps the person's text to copy */
      cambiata?: { attuale: string | null; impronta: string; versione: string }
      sparito?: true
    }

const SOLO_MARKETING = 'Il calendario dei contenuti è dell’area Marketing.'
const SOLO_CHI_ELIMINA = 'Solo l’admin e il marketing eliminano un contenuto: puoi segnarlo «Canceled».'
const NON_SALVATO = 'Contenuto non salvato. Riprova.'
const SPARITO = 'Questo contenuto non c’è più.'
const SEZIONE_CAMBIATA =
  'Questa parte è cambiata da un’altra parte: ricarico il testo salvato. Il tuo testo resta qui sotto: copialo se ti serve.'
const POST_GIA_COLLEGATO = 'Questo post è già collegato a un altro contenuto.'

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

/**
 * The whole Marketing area: the list, a content's page, the Instagram posts
 * (1.33.0, a URL changes what is linked) and the layout's count. The
 * action's answer already carries the page redrawn: no router.refresh()
 * after it (1.33.0).
 */
function aggiorna() {
  revalidatePath('/marketing', 'layout')
}

/** A Reel Topic starts with Hook, Line, Line, CTA in its rough draft, as in Notion; a Carousel Topic empty. */
export async function creaContenuto(input: unknown): Promise<EsitoCreazione> {
  const parsed = contenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketing_contenuti')
    .insert({ ...parsed.data, bozza: parsed.data.tipo === 'reel' ? BOZZA_REEL : null })
    .select('id, updated_at')
    .single()
  if (error) return { ok: false, errore: errore(error) }

  aggiorna()
  return { ok: true, id: data.id, versione: data.updated_at }
}

/** "Post Date", "Modello": the field as the panel and the table name it. */
function nomeCampo(campo: CampoInCella): string {
  return campo === 'tipo' ? CAMPO_MODELLO : CAMPI[campo]
}

function campoCambiato(campo: CampoInCella): string {
  return `Il campo «${nomeCampo(campo)}» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.`
}

/** The one column this field writes, typed (never a key from the browser). */
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

/**
 * One property, saved only over the value the field showed (1.33.0, Dany:
 * "ogni campo deve essere modificabile direttamente dalla tabella"): one SQL
 * update with the condition `<campo> is not distinct from <prima>`, atomic,
 * no window between the check and the write. Two people on two fields of the
 * same row never block each other; two on the same field never overwrite a
 * value one of them has not seen: cambiato, with the value saved now.
 */
export async function modificaCampoContenuto(input: CampoContenutoInput): Promise<EsitoCampo> {
  const parsed = campoContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { id, campo, valore, prima } = parsed.data
  const supabase = await createClient()
  const base = supabase.from('marketing_contenuti').update(cambio(parsed.data)).eq('id', id)
  const condizionata = prima === null ? base.is(campo, null) : base.eq(campo, prima)
  const { data, error } = await condizionata.select(COLONNE_ELENCO).maybeSingle()
  if (error) return { ok: false, errore: errore(error) }

  if (data) {
    aggiorna()
    return { ok: true, valore: data[campo], versione: data.updated_at }
  }

  // no row with that value: gone, written the same by somebody else, or changed
  const { data: ora, error: lettura } = await supabase
    .from('marketing_contenuti')
    .select(COLONNE_ELENCO)
    .eq('id', id)
    .maybeSingle()
  if (lettura) return { ok: false, errore: NON_SALVATO }
  aggiorna()
  if (!ora) return { ok: false, errore: SPARITO, sparito: true }
  if (ora[campo] === valore) return { ok: true, valore: ora[campo], versione: ora.updated_at }
  return { ok: false, errore: campoCambiato(campo), cambiato: { valore: ora[campo], versione: ora.updated_at } }
}

/** One tap, no version: the last Status wins, as in Notion. */
export async function cambiaStatusContenuto(input: unknown): Promise<Esito> {
  const parsed = statusContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketing_contenuti')
    .update({ stato: parsed.data.stato })
    .eq('id', parsed.data.id)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error) }

  aggiorna()
  return data ? { ok: true, versione: data.updated_at } : { ok: false, errore: SPARITO }
}

type RispostaSezione = {
  esito?: 'salvata' | 'cambiata' | 'sparito'
  impronta?: string
  versione?: string
  attuale?: string | null
}

/**
 * One section, saved only over the text the page showed (its md5, computed
 * when the page was rendered): two people on two sections never block each
 * other, two on the same one never overwrite text they have not seen.
 */
export async function salvaSezioneContenuto(input: unknown): Promise<EsitoSezione> {
  const parsed = sezioneContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { id, campo, testo, impronta } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('salva_sezione_contenuto', {
    p_id: id,
    p_campo: campo,
    p_testo: testo,
    p_impronta: impronta,
  })
  if (error) return { ok: false, errore: errore(error) }

  const risposta = (data ?? {}) as RispostaSezione
  if (risposta.esito === 'sparito') {
    aggiorna()
    return { ok: false, errore: SPARITO, sparito: true }
  }
  if (risposta.esito === 'cambiata' && risposta.impronta && risposta.versione) {
    aggiorna()
    return {
      ok: false,
      errore: SEZIONE_CAMBIATA,
      cambiata: { attuale: risposta.attuale ?? null, impronta: risposta.impronta, versione: risposta.versione },
    }
  }
  if (risposta.esito !== 'salvata' || !risposta.impronta || !risposta.versione) {
    return { ok: false, errore: NON_SALVATO }
  }

  aggiorna()
  return { ok: true, impronta: risposta.impronta, versione: risposta.versione }
}

/** Admin and marketing; the video editor sets "Canceled". Nothing else goes with it. */
export async function eliminaContenuto(input: unknown): Promise<{ ok: true } | { ok: false; errore: string }> {
  const parsed = eliminaContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_ELIMINA_CONTENUTI, SOLO_CHI_ELIMINA)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  // a delete RLS filters out raises nothing: read back what went
  const { data, error } = await supabase
    .from('marketing_contenuti')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Contenuto non eliminato. Riprova.') }

  aggiorna()
  return data.length > 0 ? { ok: true } : { ok: false, errore: SPARITO }
}
