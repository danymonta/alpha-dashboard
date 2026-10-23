'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import * as economics from '@/lib/economics/operazioni'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * The writes of commission payouts live in the shared core
 * (lib/economics/operazioni.ts), the same one Claude's tools use (Claude a 360
 * gradi, phase 4): these actions add only the cookie session. Deleting a
 * payout stays here: never from Claude.
 */
async function nucleo(): Promise<economics.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

export async function registraPagamentoProvvigione(input: unknown): Promise<Esito> {
  const esito = await economics.registraPagamentoProvvigione(await nucleo(), input)
  return esito.ok ? { ok: true } : esito
}

function aggiorna() {
  revalidatePath('/commissions')
  revalidatePath('/my-numbers')
  revalidatePath('/')
}

export async function modificaPagamentoProvvigione(input: unknown): Promise<Esito> {
  return economics.modificaPagamentoProvvigione(await nucleo(), input)
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
