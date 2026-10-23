'use server'

import { getProfilo } from '@/lib/auth/session'
import * as economics from '@/lib/economics/operazioni'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * Targets of the month (admin). Both empty: the targets are removed. The body
 * lives in the shared core (lib/economics/operazioni.ts), the same one Claude's
 * tools use (Claude a 360 gradi, phase 4), which never removes them.
 */
export async function salvaObiettivi(input: unknown): Promise<Esito> {
  return economics.salvaObiettivi({ db: await createClient(), chi: getProfilo }, input)
}
