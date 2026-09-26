'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { isDataISO } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { costoSchema, modificaCostoSchema } from '@/lib/validation/anagrafiche'

export type Esito = { ok: true; copiati?: number } | { ok: false; errore: string }

function aggiorna() {
  revalidatePath('/expenses')
  revalidatePath('/')
}

export async function aggiungiCosto(input: unknown): Promise<Esito> {
  const parsed = costoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').insert(parsed.data)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Costo non salvato. Riprova.') }

  aggiorna()
  return { ok: true }
}

export async function modificaCosto(input: unknown): Promise<Esito> {
  const parsed = modificaCostoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('expenses').update(campi).eq('id', id).select('id').maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Costo non aggiornato. Riprova.') }
  if (!data) return { ok: false, errore: 'Costo non trovato.' }

  aggiorna()
  return { ok: true }
}

export async function eliminaCosto(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Costo non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  // the audit trigger keeps a copy of the deleted row
  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', parsed.data.id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Costo non eliminato. Riprova.') }

  aggiorna()
  return { ok: true }
}

export async function copiaRicorrenti(input: unknown): Promise<Esito> {
  const parsed = z.object({ mese: z.string().refine(isDataISO) }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Mese non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('copia_costi_ricorrenti', { p_mese: parsed.data.mese })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Copia non riuscita. Riprova.') }

  aggiorna()
  return { ok: true, copiati: data }
}
