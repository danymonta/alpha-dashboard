'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import { prodottoSchema } from '@/lib/validation/anagrafiche'

export type Esito = { ok: true } | { ok: false; errore: string }

function aggiorna() {
  revalidatePath('/settings/products')
  revalidatePath('/sales/new')
}

export async function salvaProdotto(input: unknown): Promise<Esito> {
  const parsed = prodottoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { error } = id
    ? await supabase.from('products').update(campi).eq('id', id)
    : await supabase.from('products').insert(campi)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Prodotto non salvato. Riprova.') }

  aggiorna()
  return { ok: true }
}

const attivoSchema = z.object({ id: z.string().uuid(), attivo: z.boolean() })

/** Deleting keeps past sales readable: they keep the product's name (public.elimina_prodotto). */
export async function eliminaProdotto(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Prodotto non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_prodotto', { p_product_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Prodotto non eliminato. Riprova.') }

  aggiorna()
  revalidatePath('/sales')
  return { ok: true }
}

/** Off sale: kept for the history, not offered in new sales. */
export async function cambiaAttivoProdotto(input: unknown): Promise<Esito> {
  const parsed = attivoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ attivo: parsed.data.attivo })
    .eq('id', parsed.data.id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Operazione non riuscita. Riprova.') }

  aggiorna()
  return { ok: true }
}
