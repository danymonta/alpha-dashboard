'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { BOZZA_REEL } from '@/lib/marketing/etichette'
import { RUOLI_ELIMINA_CONTENUTI } from '@/lib/marketing/permessi'
import { createClient } from '@/lib/supabase/server'
import {
  contenutoSchema,
  eliminaContenutoSchema,
  modificaContenutoSchema,
  sezioneContenutoSchema,
  statusContenutoSchema,
} from '@/lib/validation/contenuto'

/**
 * The content calendar (1.32.0): Notion's "Instagram Posts" in the app, for
 * the admin, the video editor and marketing. Every action runs with the
 * session of whoever taps, never the service role: RLS on
 * marketing_contenuti decides (vede_marketing(); delete only admin and
 * marketing), and the role checks here only turn a refusal into words.
 *
 * Every success returns the row's new updated_at (versione): the properties
 * sheet saves over it, so a person's own Status tap or section save never
 * makes their own sheet look changed elsewhere.
 */

export type Esito = { ok: true; versione: string } | { ok: false; errore: string }

export type EsitoCreazione = { ok: true; id: string; versione: string } | { ok: false; errore: string }

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

const SOLO_MARKETING = 'Il calendario dei contenuti è dell’area Marketing.'
const SOLO_CHI_ELIMINA = 'Solo l’admin e il marketing eliminano un contenuto: puoi segnarlo «Canceled».'
const NON_SALVATO = 'Contenuto non salvato. Riprova.'
const SPARITO = 'Questo contenuto non c’è più.'
const CAMBIATO = 'Il contenuto è cambiato da un’altra parte: ricarico i dati salvati.'
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

function aggiorna(id?: string) {
  revalidatePath('/marketing/contenuti')
  if (id) revalidatePath(`/marketing/contenuti/${id}`)
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

/**
 * The properties, saved only over the version the sheet read. A row changed
 * meanwhile (by someone else) is never overwritten: cambiato, and the page
 * reloads it.
 */
export async function modificaContenuto(input: unknown): Promise<EsitoModifica> {
  const parsed = modificaContenutoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primoErrore(parsed.error.issues) }
  const negato = await negaSeNon(RUOLI_MARKETING, SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }

  const { id, versione, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('marketing_contenuti')
    .update(campi)
    .eq('id', id)
    .eq('updated_at', versione)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error) }

  if (!data) {
    // no row at that version: gone, or changed since the sheet read it
    const { data: ancora, error: lettura } = await supabase
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

  aggiorna(parsed.data.id)
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
    aggiorna(id)
    return { ok: false, errore: SPARITO, sparito: true }
  }
  if (risposta.esito === 'cambiata' && risposta.impronta && risposta.versione) {
    aggiorna(id)
    return {
      ok: false,
      errore: SEZIONE_CAMBIATA,
      cambiata: { attuale: risposta.attuale ?? null, impronta: risposta.impronta, versione: risposta.versione },
    }
  }
  if (risposta.esito !== 'salvata' || !risposta.impronta || !risposta.versione) {
    return { ok: false, errore: NON_SALVATO }
  }

  aggiorna(id)
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

  aggiorna(parsed.data.id)
  return data.length > 0 ? { ok: true } : { ok: false, errore: SPARITO }
}
