import 'server-only'

import { redirect } from 'next/navigation'

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
 * Guard for every page inside the app shell: no session -> /login,
 * deactivated -> /account-disattivato.
 */
export async function requireProfilo(): Promise<Profilo> {
  const profilo = await getProfilo()

  if (!profilo) redirect('/login')
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
