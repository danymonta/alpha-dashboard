'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import {
  copiaSpesePersonaliSchema,
  ERRORI_SPESA_PERSONALE,
  modificaSpesaPersonaleSchema,
  spesaPersonaleSchema,
} from '@/lib/validation/spese-personali'

export type Esito = { ok: true; copiati?: number } | { ok: false; errore: string }

/**
 * Personal expenses (1.68.0): the admin's own, written with the cookie session (never the
 * service role), so RLS decides (admin only). Nothing here touches public.expenses, and only
 * this page is revalidated: no business page reads these rows. Not in Alfire, not in Claude.
 */
const primo = (parsed: { error: z.ZodError }) => parsed.error.issues[0]?.message ?? 'Dati non validi.'

function aggiorna() {
  revalidatePath('/spese-personali')
}

async function soloAdmin(): Promise<string | null> {
  return negaSeNon(['admin'], ERRORI_SPESA_PERSONALE.soloAdmin)
}

export async function aggiungiSpesaPersonale(input: unknown): Promise<Esito> {
  const parsed = spesaPersonaleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('spese_personali').insert(parsed.data)
  if (error) return { ok: false, errore: messaggioErrore(error, ERRORI_SPESA_PERSONALE.nonSalvata) }

  aggiorna()
  return { ok: true }
}

export async function modificaSpesaPersonale(input: unknown): Promise<Esito> {
  const parsed = modificaSpesaPersonaleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin()
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('spese_personali').update(campi).eq('id', id).select('id').maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, ERRORI_SPESA_PERSONALE.nonAggiornata) }
  if (!data) return { ok: false, errore: ERRORI_SPESA_PERSONALE.nonTrovata }

  aggiorna()
  return { ok: true }
}

export async function eliminaSpesaPersonale(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_SPESA_PERSONALE.nonValida }
  const negato = await soloAdmin()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('spese_personali').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, ERRORI_SPESA_PERSONALE.nonEliminata) }
  if (!data?.length) return { ok: false, errore: ERRORI_SPESA_PERSONALE.nonTrovata }

  aggiorna()
  return { ok: true }
}

export async function copiaSpesePersonaliRicorrenti(input: unknown): Promise<Esito> {
  const parsed = copiaSpesePersonaliSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Mese non valido.' }
  const negato = await soloAdmin()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('copia_spese_personali_ricorrenti', { p_mese: parsed.data.mese })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Copia non riuscita. Riprova.') }

  aggiorna()
  return { ok: true, copiati: data ?? 0 }
}
