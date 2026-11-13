'use server'

import { getProfilo } from '@/lib/auth/session'
import * as aula from '@/lib/onboarding/aula'
import type { Esito } from '@/lib/onboarding/aula'
import { createClient } from '@/lib/supabase/server'

export type { Esito } from '@/lib/onboarding/aula'

/** Impostazioni › Onboarding › Aula (1.83.0): the admin's session, under RLS. */
async function nucleo() {
  return { db: await createClient(), chi: getProfilo }
}

export async function salvaModulo(input: unknown): Promise<Esito> {
  return aula.salvaModulo(await nucleo(), input)
}
export async function eliminaModulo(input: unknown): Promise<Esito> {
  return aula.eliminaModulo(await nucleo(), input)
}
export async function salvaLezione(input: unknown): Promise<Esito> {
  return aula.salvaLezione(await nucleo(), input)
}
export async function eliminaLezione(input: unknown): Promise<Esito> {
  return aula.eliminaLezione(await nucleo(), input)
}
export async function caricaCopertina(dati: FormData): Promise<Esito> {
  return aula.caricaCopertina(await nucleo(), dati instanceof FormData ? dati.get('file') : null)
}
