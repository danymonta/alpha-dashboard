'use server'

import { getProfilo } from '@/lib/auth/session'
import * as operazioni from '@/lib/call/operazioni'
import type { EsitoNuovaCall } from '@/lib/call/operazioni'
import { createClient } from '@/lib/supabase/server'

export type { EsitoNuovaCall } from '@/lib/call/operazioni'

/**
 * Books a call: lead and call are created together by public.fissa_call.
 * The setter books for himself; the admin (Dany, also closer and at times
 * setter) for himself or a setter, and may add a call already done. The body
 * is the shared core (lib/call/operazioni.ts), the same Claude's tools use.
 */
export async function fissaCall(input: unknown): Promise<EsitoNuovaCall> {
  return operazioni.fissaCall({ db: await createClient(), chi: getProfilo }, input)
}
