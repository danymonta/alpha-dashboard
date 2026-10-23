'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import * as economics from '@/lib/economics/operazioni'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true; copiati?: number } | { ok: false; errore: string }

/**
 * The writes of costs live in the shared core (lib/economics/operazioni.ts),
 * the same one Claude's tools use (Claude a 360 gradi, phase 4): these actions
 * add only the cookie session. Deleting a cost stays here: never from Claude.
 */
async function nucleo(): Promise<economics.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

function aggiorna() {
  revalidatePath('/expenses')
  revalidatePath('/')
}

export async function aggiungiCosto(input: unknown): Promise<Esito> {
  const esito = await economics.aggiungiCosto(await nucleo(), input)
  return esito.ok ? { ok: true } : esito
}

export async function modificaCosto(input: unknown): Promise<Esito> {
  return economics.modificaCosto(await nucleo(), input)
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
  return economics.copiaRicorrenti(await nucleo(), input)
}
