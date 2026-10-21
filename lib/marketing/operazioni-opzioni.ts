import 'server-only'

import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import type { Db } from '@/lib/marketing/operazioni'
import { isColore, type Opzione, type CampoOpzione } from '@/lib/marketing/opzioni'
import { creaOpzioneSchema, eliminaOpzioneSchema, modificaOpzioneSchema } from '@/lib/validation/opzione'

/**
 * The only way the labels of Reel Type and Format are written (21/10/2026):
 * the menu of a cell, of the panel and of the card, with the cookie session of
 * whoever taps, never the service role: RLS on marketing_opzioni decides (admin,
 * video editor and marketing create, rename and recolour; admin and marketing
 * delete). Claude's tools never call these: a Claude token reads the options
 * and the database refuses its writes (restrictive policies, test 75). Who may
 * ask is the action's guard; here a refusal of the database becomes words.
 */

export type EsitoOpzione = { ok: true; opzione: Opzione } | { ok: false; errore: string }
export type EsitoEliminaOpzione = { ok: true } | { ok: false; errore: string }

export const SOLO_CHI_ELIMINA_ETICHETTE = 'Solo l’admin e il marketing eliminano un’etichetta.'
const NON_SALVATA = 'Etichetta non salvata. Riprova.'
const NON_ELIMINATA = 'Etichetta non eliminata. Riprova.'
const SPARITA = 'Questa etichetta non c’è più.'
const NOME_USATO = 'C’è già un’etichetta con questo nome.'
const SOLO_AREA_MARKETING = 'Le etichette sono dell’area Marketing.'

const COLONNE = 'id, campo, valore, nome, colore, ordine'

type RigaOpzione = { id: string; campo: string; valore: string; nome: string; colore: string; ordine: number }

function daRiga(riga: RigaOpzione): Opzione {
  return {
    id: riga.id,
    campo: riga.campo as CampoOpzione,
    valore: riga.valore,
    nome: riga.nome,
    colore: isColore(riga.colore) ? riga.colore : 'default',
    ordine: riga.ordine,
  }
}

function errore(error: { code?: string; message: string }, nonSalvata: string): string {
  if (error.code === '23505') return NOME_USATO
  // the function's own words (nome vuoto, troppo lungo, colore) are already for people
  if (error.code === '22023') return error.message
  if (error.code === '42501') return SOLO_AREA_MARKETING
  return messaggioErrore(error, nonSalvata)
}

function aggiorna() {
  revalidatePath('/marketing', 'layout')
}

/** «Crea «nome»»: public.crea_opzione_marketing (slug, order and colour are its work). */
export async function creaOpzione(db: Db, input: unknown): Promise<EsitoOpzione> {
  const parsed = creaOpzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const { data, error } = await db.rpc('crea_opzione_marketing', {
    p_campo: parsed.data.campo,
    p_nome: parsed.data.nome,
    ...(parsed.data.colore ? { p_colore: parsed.data.colore } : {}),
  })
  if (error) return { ok: false, errore: errore(error, NON_SALVATA) }
  if (!data) return { ok: false, errore: NON_SALVATA }

  aggiorna()
  return { ok: true, opzione: daRiga(data) }
}

/** Rename and/or recolour. The slug never changes: the contents keep pointing at it. */
export async function modificaOpzione(db: Db, input: unknown): Promise<EsitoOpzione> {
  const parsed = modificaOpzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const { id, nome, colore } = parsed.data
  const { data, error } = await db
    .from('marketing_opzioni')
    .update({ ...(nome !== undefined ? { nome } : {}), ...(colore !== undefined ? { colore } : {}) })
    .eq('id', id)
    .select(COLONNE)
    .maybeSingle()
  if (error) return { ok: false, errore: errore(error, NON_SALVATA) }
  if (!data) return { ok: false, errore: SPARITA }

  aggiorna()
  return { ok: true, opzione: daRiga(data) }
}

/**
 * Deletes a label: the contents that used it keep everything and lose only
 * that property (the foreign key sets it to null). A delete RLS filters out
 * raises nothing: the rows that went say whether it happened.
 */
export async function eliminaOpzione(db: Db, input: unknown): Promise<EsitoEliminaOpzione> {
  const parsed = eliminaOpzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const { data, error } = await db.from('marketing_opzioni').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: errore(error, NON_ELIMINATA) }

  aggiorna()
  return data.length > 0 ? { ok: true } : { ok: false, errore: SPARITA }
}
