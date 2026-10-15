'use server'

import { negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import * as operazioni from '@/lib/marketing/operazioni'
import type { Esito, EsitoCampo, EsitoCreazione, EsitoEliminazione, EsitoSezione } from '@/lib/marketing/operazioni'
import { RUOLI_ELIMINA_CONTENUTI } from '@/lib/marketing/permessi'
import { createClient } from '@/lib/supabase/server'
import type { CampoContenutoInput } from '@/lib/validation/contenuto'

/**
 * The content calendar (1.32.0): Notion's "Instagram Posts" in the app, for
 * the admin, the video editor and marketing. Every action runs with the
 * session of whoever taps, never the service role: RLS on
 * marketing_contenuti decides (vede_marketing(); delete only admin and
 * marketing), and the role checks here only turn a refusal into words.
 *
 * The body of every action is the shared core (lib/marketing/operazioni.ts,
 * 1.34.0): Claude's tools call the same functions with the OAuth token of
 * whoever connected it instead of the cookie session, so the calendar has one
 * write path, with the same schemas, the same messages and the same versions.
 * Every success returns the row's new updated_at (versione): the panel and
 * the page keep the most recent detail they know with it (1.33.0).
 */

export type { Esito, EsitoCampo, EsitoCreazione, EsitoEliminazione, EsitoSezione }

const SOLO_CHI_ELIMINA = 'Solo l’admin e il marketing eliminano un contenuto: puoi segnarlo «Canceled».'

/** A Reel Topic starts with Hook, Line, Line, CTA in its rough draft, as in Notion; a Carousel Topic empty. */
export async function creaContenuto(input: unknown): Promise<EsitoCreazione> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  const esito = await operazioni.creaContenuto(await createClient(), input)
  // the form sends no sections: the answer stays the one of 1.32.0
  return esito.ok ? { ok: true, id: esito.id, versione: esito.versione } : esito
}

/**
 * One property, saved only over the value the field showed (1.33.0): a table
 * cell, a card chip, a field of the panel or of the page. Somebody else's
 * value is never overwritten: cambiato, with the value saved now.
 */
export async function modificaCampoContenuto(input: CampoContenutoInput): Promise<EsitoCampo> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.modificaCampoContenuto(await createClient(), input)
}

/** One tap, no version: the last Status wins, as in Notion. */
export async function cambiaStatusContenuto(input: unknown): Promise<Esito> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.cambiaStatusContenuto(await createClient(), input)
}

/** One section, saved only over the text the page showed (its md5). */
export async function salvaSezioneContenuto(input: unknown): Promise<EsitoSezione> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  return operazioni.salvaSezioneContenuto(await createClient(), input)
}

/** Admin and marketing; the video editor sets "Canceled". Nothing else goes with it. */
export async function eliminaContenuto(input: unknown): Promise<EsitoEliminazione> {
  const negato = await negaSeNon(RUOLI_ELIMINA_CONTENUTI, SOLO_CHI_ELIMINA)
  if (negato) return { ok: false, errore: negato }
  return operazioni.eliminaContenuto(await createClient(), input)
}
