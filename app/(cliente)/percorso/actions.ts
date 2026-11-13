'use server'

import { revalidatePath } from 'next/cache'

import * as percorso from '@/lib/percorso/operazioni'
import type { EsitoConsenso, EsitoPercorso } from '@/lib/percorso/operazioni'
import { createClient } from '@/lib/supabase/server'

export type { EsitoConsenso, EsitoPercorso } from '@/lib/percorso/operazioni'

/**
 * The client's writes from the area /percorso (release B1a): the core
 * (lib/percorso/operazioni.ts) with the client's cookie session, never the service role.
 * The database decides who the client is (cliente_corrente()) and what can move. They
 * revalidate only /percorso.
 */

/** A step completed with its action: «Ho guardato il video», «Accetto e vado avanti». */
export async function avanzaPasso(input: unknown): Promise<EsitoPercorso> {
  const esito = await percorso.avanzaPasso(await createClient(), input)
  revalidatePath('/percorso', 'layout')
  return esito
}

/** A consent given again after its text changed. */
export async function daiConsenso(input: unknown): Promise<EsitoConsenso> {
  const esito = await percorso.daiConsenso(await createClient(), input)
  revalidatePath('/percorso', 'layout')
  return esito
}
