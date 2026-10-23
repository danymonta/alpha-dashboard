import 'server-only'

import { getProfilo } from '@/lib/auth/session'
import { SOLA_LETTURA, solaLettura, type AppRole } from '@/lib/auth/roles'

/**
 * Server action guard: returns a human message when the caller is not allowed.
 * The default message fits the admin-only actions; other areas pass their own
 * (the Marketing area: 'Il calendario dei contenuti è dell’area Marketing.').
 */
export async function negaSeNon(
  ruoli: readonly AppRole[],
  messaggio = 'Operazione riservata all’admin.',
): Promise<string | null> {
  return negaPer(await getProfilo(), ruoli, messaggio)
}

/**
 * The same guard on a profile already read: the shared cores (lib/clienti,
 * lib/vendite) pass the person behind the cookie session or behind Claude's
 * token (Claude a 360 gradi, phase 3).
 */
export function negaPer(
  profilo: { ruolo: AppRole; attivo: boolean } | null,
  ruoli: readonly AppRole[],
  messaggio = 'Operazione riservata all’admin.',
): string | null {
  if (!profilo || !profilo.attivo) return 'Sessione scaduta. Rientra e riprova.'
  // the business coach reads and never writes (22/10/2026), whatever list an action passes
  if (solaLettura(profilo.ruolo)) return SOLA_LETTURA
  if (!ruoli.includes(profilo.ruolo)) return messaggio
  return null
}

/** Our own SQL rules raise 22023/42501 with a message already worded for people. */
export function messaggioErrore(error: { code?: string; message: string }, fallback: string) {
  return error.code === '22023' || error.code === '42501' ? error.message : fallback
}
