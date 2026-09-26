'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import {
  modificaPagamentoProvvigioneSchema,
  pagamentoProvvigioneSchema,
} from '@/lib/validation/provvigione'

export type Esito = { ok: true } | { ok: false; errore: string }

export async function registraPagamentoProvvigione(input: unknown): Promise<Esito> {
  const parsed = pagamentoProvvigioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('commission_payouts').insert(parsed.data)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Pagamento non registrato. Riprova.') }

  aggiorna()
  return { ok: true }
}

function aggiorna() {
  revalidatePath('/commissions')
  revalidatePath('/my-numbers')
  revalidatePath('/')
}

export async function modificaPagamentoProvvigione(input: unknown): Promise<Esito> {
  const parsed = modificaPagamentoProvvigioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commission_payouts')
    .update({ ...campi, metodo: campi.metodo ?? null })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Pagamento non aggiornato. Riprova.') }
  if (!data) return { ok: false, errore: 'Pagamento non trovato.' }

  aggiorna()
  return { ok: true }
}

/** A payout recorded by mistake. The audit log keeps a copy of the row. */
export async function eliminaPagamentoProvvigione(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Pagamento non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('commission_payouts').delete().eq('id', parsed.data.id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Pagamento non eliminato. Riprova.') }

  aggiorna()
  return { ok: true }
}
