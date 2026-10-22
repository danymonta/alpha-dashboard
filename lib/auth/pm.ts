import 'server-only'

import { redirect } from 'next/navigation'

import { livelloPmEffettivo, SOLA_LETTURA, solaLettura, type LivelloPm } from '@/lib/auth/roles'
import { getProfilo, requireProfilo, type Profilo } from '@/lib/auth/session'

/**
 * Projects area guards. The level decides what the UI offers; RLS and the
 * pm_* helpers in SQL decide what actually happens.
 */
export async function requireLivelloPm(
  livelli: readonly LivelloPm[],
): Promise<{ profilo: Profilo; livello: LivelloPm }> {
  const profilo = await requireProfilo()
  const livello = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm)
  if (!livelli.includes(livello)) redirect('/progetti')
  return { profilo, livello }
}

/** Server action guard: a human message when the caller may not do this. */
export async function negaSeNonPm(
  livelli: readonly LivelloPm[] = ['admin', 'manager', 'employee'],
): Promise<string | null> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return 'Sessione scaduta. Rientra e riprova.'
  if (solaLettura(profilo.ruolo)) return SOLA_LETTURA
  const livello = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm)
  if (!livelli.includes(livello)) {
    return livelli.length === 1 && livelli[0] === 'admin'
      ? 'Operazione riservata all’admin dei progetti.'
      : 'Operazione riservata a chi gestisce i progetti.'
  }
  return null
}
