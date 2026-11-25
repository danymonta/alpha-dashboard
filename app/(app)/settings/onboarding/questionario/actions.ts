'use server'

import { getProfilo } from '@/lib/auth/session'
import * as domande from '@/lib/onboarding/domande'
import type { Esito, EsitoDomanda } from '@/lib/onboarding/domande'
import { createClient } from '@/lib/supabase/server'

/** Impostazioni › Questionario (1.88.0): the admin's session, under RLS. */
async function nucleo() {
  return { db: await createClient(), chi: getProfilo }
}

export async function salvaDomanda(input: unknown): Promise<EsitoDomanda> {
  return domande.salvaDomanda(await nucleo(), input)
}

export async function spostaDomanda(input: unknown): Promise<Esito> {
  return domande.spostaDomanda(await nucleo(), input)
}

export async function cambiaAttivaDomanda(input: unknown): Promise<Esito> {
  return domande.cambiaAttivaDomanda(await nucleo(), input)
}
