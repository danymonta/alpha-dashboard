'use server'

import { z } from 'zod'

import { negaSeNon } from '@/lib/auth/azioni'
import type { TipoEliminazione } from '@/lib/eliminazione'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  tipo: z.enum(['persona', 'cliente', 'vendita', 'lead', 'prodotto', 'reparto']),
  id: z.string().uuid(),
})

export type EsitoAnteprima =
  | { ok: true; dati: Record<string, number | string | null> }
  | { ok: false; errore: string }

/** Counts of what a deletion takes with it, from public.anteprima_eliminazione (admin only). */
export async function anteprimaEliminazione(tipo: TipoEliminazione, id: string): Promise<EsitoAnteprima> {
  const parsed = schema.safeParse({ tipo, id })
  if (!parsed.success) return { ok: false, errore: 'Richiesta non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('anteprima_eliminazione', { p_tipo: parsed.data.tipo, p_id: parsed.data.id })
  if (error) return { ok: false, errore: 'Anteprima non disponibile. Riprova.' }
  return { ok: true, dati: (data ?? {}) as Record<string, number | string | null> }
}
