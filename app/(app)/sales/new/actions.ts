'use server'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import * as vendite from '@/lib/vendite/operazioni'
import { z } from 'zod'

import { anteprimaPianoSchema, rataSchema, type NuovaVenditaInput } from '@/lib/validation/vendita'

export type RataAnteprima = { numero_rata: number; scadenza: string; importo: number }

export type EsitoNuovaVendita =
  | { ok: true; idVendita: string }
  | {
      ok: false
      errore: string
      campi?: Partial<Record<keyof NuovaVenditaInput, string>>
      idEsistente?: string
    }

/**
 * The write of a sale lives in the shared core (lib/vendite/operazioni.ts),
 * the same one Claude's tools use (Claude a 360 gradi, phase 3): this action
 * adds only the cookie session.
 */

async function puoRegistrareVendite() {
  return vendite.puoRegistrareVendite({ db: await createClient(), chi: getProfilo })
}

/** Preview of the plan, computed by public.piano_rate: the same code the trigger uses. */
export async function anteprimaPianoRate(input: unknown): Promise<RataAnteprima[] | null> {
  const parsed = anteprimaPianoSchema.safeParse(input)
  if (!parsed.success || !(await puoRegistrareVendite())) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('piano_rate', {
    p_valore: parsed.data.valore,
    p_numero_rate: parsed.data.numero_rate,
    p_data_vendita: parsed.data.data_vendita,
  })
  return error ? null : data
}

export type TotalePiano = { numero_rate: number; totale: number; scarto: number }

const anteprimaPersonalizzataSchema = z.object({
  rate: z.array(rataSchema).max(60),
  valore: z.number().nonnegative(),
})

/** Sum of a hand-written plan against the contract, computed by public.anteprima_piano. */
export async function totalePianoPersonalizzato(input: unknown): Promise<TotalePiano | null> {
  const parsed = anteprimaPersonalizzataSchema.safeParse(input)
  if (!parsed.success || !(await puoRegistrareVendite())) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('anteprima_piano', { p_rate: parsed.data.rate, p_valore: parsed.data.valore })
    .single()
  return error ? null : data
}

export async function registraVendita(input: unknown): Promise<EsitoNuovaVendita> {
  const esito = await vendite.registraVendita({ db: await createClient(), chi: getProfilo }, input)
  // the form needs only the sale, as before
  return esito.ok ? { ok: true, idVendita: esito.idVendita } : esito
}
