'use server'

import { getProfilo } from '@/lib/auth/session'
import * as contenuti from '@/lib/onboarding/contenuti'
import type { Esito, EsitoBlocco } from '@/lib/onboarding/contenuti'
import { createClient } from '@/lib/supabase/server'

export type { Esito, EsitoBlocco } from '@/lib/onboarding/contenuti'

/** Impostazioni › Onboarding › Contenuti (1.78.0): the admin's session, under RLS. */
async function nucleo() {
  return { db: await createClient(), chi: getProfilo }
}

export async function salvaBlocco(input: unknown): Promise<EsitoBlocco> {
  return contenuti.salvaBlocco(await nucleo(), input)
}

export async function eliminaBlocco(input: unknown): Promise<Esito> {
  return contenuti.eliminaBlocco(await nucleo(), input)
}
