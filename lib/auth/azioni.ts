import 'server-only'

import { getProfilo } from '@/lib/auth/session'
import type { AppRole } from '@/lib/auth/roles'

/** Server action guard: returns a human message when the caller is not allowed. */
export async function negaSeNon(ruoli: readonly AppRole[]): Promise<string | null> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return 'Sessione scaduta. Rientra e riprova.'
  if (!ruoli.includes(profilo.ruolo)) return 'Operazione riservata all’admin.'
  return null
}

/** Our own SQL rules raise 22023/42501 with a message already worded for people. */
export function messaggioErrore(error: { code?: string; message: string }, fallback: string) {
  return error.code === '22023' || error.code === '42501' ? error.message : fallback
}
