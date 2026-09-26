'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import { clienteSchema } from '@/lib/validation/anagrafiche'

export type Esito = { ok: true } | { ok: false; errore: string }

export async function aggiornaCliente(input: unknown): Promise<Esito> {
  const parsed = clienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('clients').update(campi).eq('id', id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non aggiornato. Riprova.') }

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { ok: true }
}
