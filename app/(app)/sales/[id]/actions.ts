'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import * as vendite from '@/lib/vendite/operazioni'
import type { EsitoRata } from '@/lib/vendite/operazioni'

export type { EsitoRata } from '@/lib/vendite/operazioni'

/**
 * The writes of sales, instalments and cash-ins live in the shared core
 * (lib/vendite/operazioni.ts), the same one Claude's tools use (Claude a 360
 * gradi, phase 3): these actions add only the cookie session. Deleting an
 * instalment or a sale stays here: never from Claude.
 */
async function nucleo(): Promise<vendite.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

function messaggio(error: { code?: string; message: string }, fallback: string) {
  // 22023 / 42501 / 23514: our own rules and checks, already worded for people
  return error.code === '22023' || error.code === '42501' ? error.message : fallback
}

export async function segnaIncassata(input: unknown): Promise<EsitoRata> {
  return vendite.segnaIncassata(await nucleo(), input)
}

export async function annullaIncasso(input: unknown): Promise<EsitoRata> {
  return vendite.annullaIncasso(await nucleo(), input)
}

export async function segnaFallita(input: unknown): Promise<EsitoRata> {
  return vendite.segnaFallita(await nucleo(), input)
}

export async function modificaRata(input: unknown): Promise<EsitoRata> {
  return vendite.modificaRata(await nucleo(), input)
}

export async function registraRimborso(input: unknown): Promise<EsitoRata> {
  return vendite.registraRimborso(await nucleo(), input)
}

/** The admin corrects a recorded sale. The instalments stay as they are. */
export async function modificaVendita(input: unknown): Promise<EsitoRata> {
  return vendite.modificaVendita(await nucleo(), input)
}

/**
 * Correct a recorded payment: date, amount, method. The admin on every sale,
 * the closer on their own (RLS and the payments guard decide).
 */
export async function modificaIncasso(input: unknown): Promise<EsitoRata> {
  return vendite.modificaIncasso(await nucleo(), input)
}

/** An extra instalment on a recorded sale; numbers follow the due dates. */
export async function aggiungiRata(input: unknown): Promise<EsitoRata> {
  const esito = await vendite.aggiungiRata(await nucleo(), input)
  // the page needs only the outcome and the amount, as before
  return esito.ok ? { ok: true, importo: esito.importo } : esito
}

const idRata = z.object({ payment_id: z.string().uuid() })

export async function eliminaRata(input: unknown): Promise<EsitoRata> {
  const parsed = idRata.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Rata non valida.' }
  const negato = await vendite.autorizza(await nucleo(), ['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_rata', { p_payment_id: parsed.data.payment_id })
  if (error) return { ok: false, errore: messaggio(error, 'Rata non eliminata. Riprova.') }

  vendite.aggiornaPagine()
  return { ok: true }
}

const idVendita = z.object({ id: z.string().uuid() })

/** The whole sale and its instalments (the audit log keeps a copy). */
export async function eliminaVendita(input: unknown): Promise<EsitoRata> {
  const parsed = idVendita.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Vendita non valida.' }
  const negato = await vendite.autorizza(await nucleo(), ['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('sales').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: messaggio(error, 'Vendita non eliminata. Riprova.') }
  if (!data?.length) return { ok: false, errore: 'Vendita non trovata.' }

  vendite.aggiornaPagine()
  revalidatePath('/clients/[id]', 'page')
  return { ok: true }
}
