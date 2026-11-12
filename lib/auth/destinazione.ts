import type { SupabaseClient, User } from '@supabase/supabase-js'

import { destinazioneSicura } from '@/lib/auth/origine'
import { percorsoIniziale, type AppRole } from '@/lib/auth/roles'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The one place that decides where an authenticated user goes (release B1a,
 * docs/onboarding/rilascio-b.md, «Autenticazione»): the returns from the sign-in (Google,
 * the team's code, the link, the client's code), requireProfilo and requireCliente use it.
 * It reads the user's own row of `profiles` and of `clienti_account` with the user's
 * session (RLS lets each read only its own). The profile wins when both exist.
 *
 * - team: an active profile; `vai` = the safe «da», or the home of the role
 * - disattivato: a profile not active
 * - cliente: an account attivo or sospeso; `vai` = /percorso, or the «da» only inside /percorso
 * - chiuso: a client's account closed (the path ended 12 months ago)
 * - nessuno: a session with neither (never a redirect loop: the caller signs it out)
 * - errore: the database did not answer (never a sign-out, never a redirect to /login)
 *
 * No 'server-only': pure apart from the client handed in, tested with a fake one.
 */
export type Destinazione =
  | { esito: 'team'; vai: string; ruolo: AppRole }
  | { esito: 'disattivato' }
  | { esito: 'cliente'; vai: string; stato: 'attivo' | 'sospeso'; clientId: string }
  | { esito: 'chiuso' }
  | { esito: 'nessuno' }
  | { esito: 'errore' }

/** Where a client may be sent after the sign-in: only a page of the area /percorso. */
export function destinazioneCliente(da: string | null | undefined): string {
  const sicura = destinazioneSicura(da)
  return sicura === '/percorso' || sicura.startsWith('/percorso/') || sicura.startsWith('/percorso?') ? sicura : '/percorso'
}

/** Where a person of the team lands: the safe «da», or the home of the role. */
export function destinazioneTeam(da: string | null | undefined, ruolo: AppRole): string {
  const sicura = destinazioneSicura(da)
  // a page of the client's area is not for the team
  if (sicura === '/' || sicura === '/percorso' || sicura.startsWith('/percorso/') || sicura.startsWith('/percorso?')) {
    return percorsoIniziale(ruolo)
  }
  return sicura
}

export async function destinazioneUtente(
  supabase: SupabaseClient<Database>,
  user: Pick<User, 'id'>,
  da?: string | null,
): Promise<Destinazione> {
  const [profiloLetto, accountLetto] = await Promise.all([
    supabase.from('profiles').select('ruolo, attivo').eq('id', user.id).maybeSingle(),
    supabase.from('clienti_account').select('client_id, stato').eq('user_id', user.id).maybeSingle(),
  ])

  if (profiloLetto.error) {
    console.error('[auth] profilo non letto:', profiloLetto.error.code)
    return { esito: 'errore' }
  }
  const profilo = profiloLetto.data
  if (profilo) {
    if (!profilo.attivo) return { esito: 'disattivato' }
    return { esito: 'team', vai: destinazioneTeam(da, profilo.ruolo), ruolo: profilo.ruolo }
  }

  if (accountLetto.error) {
    console.error('[auth] account del cliente non letto:', accountLetto.error.code)
    return { esito: 'errore' }
  }
  const account = accountLetto.data
  if (!account) return { esito: 'nessuno' }
  if (account.stato === 'chiuso') return { esito: 'chiuso' }
  if (account.stato === 'attivo' || account.stato === 'sospeso') {
    return { esito: 'cliente', vai: destinazioneCliente(da), stato: account.stato, clientId: account.client_id }
  }
  return { esito: 'nessuno' }
}

/** The page that says why a session has no way in: /auth/uscita signs it out, then /accesso-negato. */
export type MotivoUscita = 'nessun-account' | 'percorso-concluso' | 'disattivato'

export function indirizzoUscita(motivo: MotivoUscita): string {
  return `/auth/uscita?motivo=${motivo}`
}
