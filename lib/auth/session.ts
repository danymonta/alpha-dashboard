import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { destinazioneUtente, indirizzoUscita } from '@/lib/auth/destinazione'
import { percorsoIniziale } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

export type Profilo = Database['public']['Tables']['profiles']['Row']

/** The signed-in profile, or null when there is no session / no profile row. */
export async function getProfilo(): Promise<Profilo | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return data ?? null
}

/**
 * The same, read once per render (React `cache`): the layout and the page of one
 * request share one getUser() and one read of `profiles` (spec 1.33.0 A5). Only the
 * render path uses it: server actions and route handlers call getProfilo, so an
 * action that changes the profile never reads a memoized one (spec R9).
 */
export const profiloDellaRichiesta = cache(getProfilo)

/**
 * What a page without a profile does with the session it has (release B1a): the one place
 * that decides (destinazioneUtente). A client goes to /percorso, a closed account or a
 * session with nothing to /auth/uscita (it signs out and says why), and the database not
 * answering is the page's error with «Riprova». Never a redirect to /login with a session
 * still alive: the proxy would send it back here, the loop of before.
 */
async function senzaProfilo(): Promise<never> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const destinazione = await destinazioneUtente(supabase, user)
  switch (destinazione.esito) {
    case 'cliente':
      redirect('/percorso')
    case 'chiuso':
      redirect(indirizzoUscita('percorso-concluso'))
    case 'nessuno':
      redirect(indirizzoUscita('nessun-account'))
    case 'disattivato':
      redirect('/account-disattivato')
    case 'team':
    // the first read of the profile failed and this one did not: a hiccup, «Riprova» renders the page again
    case 'errore':
      throw new Error('Il database non risponde: riprova tra poco.')
  }
}

/**
 * Guard for every page inside the app shell: no session -> /login, a session without a
 * profile -> where destinazioneUtente says, deactivated -> /account-disattivato.
 */
export async function requireProfilo(): Promise<Profilo> {
  const profilo = await profiloDellaRichiesta()

  if (!profilo) return senzaProfilo()
  if (!profilo.attivo) redirect('/account-disattivato')

  return profilo
}

/**
 * Same, restricted to some roles. Whoever opens a page that is not theirs goes
 * back to their own landing page (roles without an area land on /nessuna-area).
 */
export async function requireRuolo(
  ruoli: readonly Profilo['ruolo'][],
): Promise<Profilo> {
  const profilo = await requireProfilo()

  if (!ruoli.includes(profilo.ruolo)) redirect(percorsoIniziale(profilo.ruolo))

  return profilo
}
