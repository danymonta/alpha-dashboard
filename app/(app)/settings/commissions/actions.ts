'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import * as economics from '@/lib/economics/operazioni'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * The writes of commission rules live in the shared core
 * (lib/economics/operazioni.ts), the same one Claude's tools use (Claude a 360
 * gradi, phase 4): these actions add only the cookie session. Deleting a rule
 * stays here: never from Claude.
 */
async function nucleo(): Promise<economics.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

function aggiorna() {
  revalidatePath('/settings/commissions')
  revalidatePath('/commissions')
  revalidatePath('/my-numbers')
  revalidatePath('/')
}

/** A new rule starts on a date and closes the one in force: history never changes. */
export async function nuovaRegola(input: unknown): Promise<Esito> {
  const esito = await economics.nuovaRegola(await nucleo(), input)
  return esito.ok ? { ok: true } : esito
}

export async function chiudiRegola(input: unknown): Promise<Esito> {
  return economics.chiudiRegola(await nucleo(), input)
}

/** Correct a rule in place. The overlap guard in the database keeps one rule per day. */
export async function modificaRegola(input: unknown): Promise<Esito> {
  return economics.modificaRegola(await nucleo(), input)
}

/** Commissions accrued under it disappear: the rule no longer applies to any month. */
export async function eliminaRegola(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Regola non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('commission_rules').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non eliminata. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Regola non trovata.' }

  aggiorna()
  return { ok: true }
}
