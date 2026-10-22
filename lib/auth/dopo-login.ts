import type { SupabaseClient } from '@supabase/supabase-js'
import type { cookies } from 'next/headers'

import { destinazioneSicura } from '@/lib/auth/origine'
import { percorsoIniziale } from '@/lib/auth/roles'
import { COOKIE_SESSIONE } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import type { AppRole } from '@/lib/auth/roles'

// No 'server-only' of its own: it only works on a client and a cookie store handed in, and
// lib/supabase/server (server-only) keeps it out of any browser bundle.
type CookieStore = Awaited<ReturnType<typeof cookies>>

/** Every session cookie in the response goes: signOut() cannot see them through the filtered client. */
export function togliSessione(cookieStore: CookieStore) {
  for (const { name } of cookieStore.getAll()) {
    if (COOKIE_SESSIONE.test(name)) cookieStore.delete(name)
  }
}

/**
 * The session already in the browser, as it came in. Hidden from the sign-in
 * (a dead one would take the PKCE verifier with it, and would fail to refresh
 * when the client starts) and left alone if the sign-in fails: an old or
 * forged link never signs anyone out.
 */
export function sessioneVecchia(cookieStore: CookieStore) {
  return cookieStore
    .getAll()
    .filter((c) => COOKIE_SESSIONE.test(c.name))
    .map((c) => ({ nome: c.name, valore: c.value }))
}

/**
 * The new session is written: what it did not overwrite of the old one goes
 * (a stale ".2" chunk must never be glued to the new session).
 */
export function togliSessioneVecchia(cookieStore: CookieStore, vecchia: ReturnType<typeof sessioneVecchia>) {
  for (const { nome, valore } of vecchia) {
    if (cookieStore.get(nome)?.value === valore) cookieStore.delete(nome)
  }
}

export type MotivoRifiuto = 'callback' | 'accesso-negato' | 'disattivato'

export type EsitoDopoLogin = { ok: true; ruolo: AppRole } | { ok: false; motivo: MotivoRifiuto }

/**
 * What every way in (Google, the code, the link) checks once Supabase has
 * given a session: the person has a profile and it is active. Otherwise the
 * session goes away again and the reason comes back as the `?errore=` of /login.
 */
export async function verificaDopoLogin(
  supabase: SupabaseClient<Database>,
  cookieStore: CookieStore,
): Promise<EsitoDopoLogin> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, motivo: 'callback' }

  const { data: profilo, error: erroreProfilo } = await supabase
    .from('profiles')
    .select('ruolo, attivo')
    .eq('id', user.id)
    .maybeSingle()

  // the database did not answer (e.g. a deploy reloading its schema): not a
  // refusal. Only this browser gives the new session back, the others stay in.
  if (erroreProfilo) {
    console.error('[auth] profilo non letto:', erroreProfilo.code, erroreProfilo.message)
    await supabase.auth.signOut({ scope: 'local' })
    togliSessione(cookieStore)
    return { ok: false, motivo: 'callback' }
  }

  if (!profilo) {
    console.error('[auth] utente senza profilo:', user.id)
    await supabase.auth.signOut()
    togliSessione(cookieStore)
    return { ok: false, motivo: 'accesso-negato' }
  }

  if (!profilo.attivo) {
    await supabase.auth.signOut()
    togliSessione(cookieStore)
    return { ok: false, motivo: 'disattivato' }
  }

  return { ok: true, ruolo: profilo.ruolo }
}

/** Where a person lands: where they were going (only a path of this app), or the home of their role. */
export function destinazioneDopoLogin(da: string | null | undefined, ruolo: AppRole): string {
  const sicura = destinazioneSicura(da)
  return sicura === '/' ? percorsoIniziale(ruolo) : sicura
}
