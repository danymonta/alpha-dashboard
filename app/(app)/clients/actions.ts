'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { isDataISO } from '@/lib/date'
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

const nuovoClienteSchema = clienteSchema.omit({ id: true })

/** A client before any sale ("mai attivato"): today only from Alfire. */
export async function creaCliente(input: unknown): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  const parsed = nuovoClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('clients').insert(parsed.data).select('id').single()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non creato. Riprova.') }

  revalidatePath('/clients')
  return { ok: true, id: data.id }
}

/** With its sales and their instalments: public.elimina_cliente. */
export async function eliminaCliente(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_cliente', { p_client_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non eliminato. Riprova.') }

  for (const pagina of ['/clients', '/sales', '/payments', '/commissions', '/']) revalidatePath(pagina)
  // its project stays, without the link to the client
  revalidatePath('/progetti', 'layout')
  return { ok: true }
}

const interruzioneSchema = z.object({
  sale_id: z.string().uuid('Vendita non valida'),
  ultimo_giorno: z.string().refine(isDataISO, 'Scegli l’ultimo giorno'),
  togli_rate: z.boolean(),
})

export type AnteprimaInterruzione = {
  rate_tolte: number
  importo_tolto: number
  valore_prima: number
  valore_dopo: number
}

/** What "Interrompi il percorso" would do, before the confirmation: public.interrompi_percorso without running it. */
export async function anteprimaInterruzione(
  input: unknown,
): Promise<{ ok: true; anteprima: AnteprimaInterruzione } | { ok: false; errore: string }> {
  const parsed = interruzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('interrompi_percorso', {
      p_sale_id: parsed.data.sale_id,
      p_ultimo_giorno: parsed.data.ultimo_giorno,
      p_togli_rate: parsed.data.togli_rate,
      p_esegui: false,
    })
    .single()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Anteprima non disponibile. Riprova.') }
  return { ok: true, anteprima: data }
}

/** A client who stops early: the sale ends on that day, the unpaid instalments after it go if asked. */
export async function interrompiPercorso(input: unknown): Promise<Esito> {
  const parsed = interruzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('interrompi_percorso', {
    p_sale_id: parsed.data.sale_id,
    p_ultimo_giorno: parsed.data.ultimo_giorno,
    p_togli_rate: parsed.data.togli_rate,
    p_esegui: true,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Percorso non interrotto. Riprova.') }

  revalidatePath('/clients', 'layout')
  revalidatePath('/sales', 'layout')
  revalidatePath('/payments')
  revalidatePath('/rinnovi')
  revalidatePath('/')
  // the client's project ends with the path (02/10/2026)
  revalidatePath('/progetti', 'layout')
  return { ok: true }
}
