import type { SupabaseClient } from '@supabase/supabase-js'
import type { cookies } from 'next/headers'

import { destinazioneCliente, destinazioneUtente } from '@/lib/auth/destinazione'
import { destinazioneSicura } from '@/lib/auth/origine'
import { COOKIE_SESSIONE } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

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

export type MotivoRifiuto = 'callback' | 'accesso-negato' | 'disattivato' | 'percorso-concluso'

/** `vai`: where to go now, already decided by destinazioneUtente (lib/auth/destinazione.ts). */
export type EsitoDopoLogin = { ok: true; vai: string } | { ok: false; motivo: MotivoRifiuto }

/**
 * What every way in (Google, the team's code, the link, the client's code) checks once
 * Supabase has given a session, through the one place that decides (destinazioneUtente):
 * a person of the team with an active profile, or a client with an account. Otherwise the
 * session goes away from this browser only (scope 'local': a client who opened /login must
 * never be signed out of his other devices) and the reason comes back.
 *
 * The database not answering is not a refusal: nothing is signed out, and the person goes
 * where she was going, where the page shows the error with «Riprova».
 */
export async function verificaDopoLogin(
  supabase: SupabaseClient<Database>,
  cookieStore: CookieStore,
  da?: string | null,
): Promise<EsitoDopoLogin> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, motivo: 'callback' }

  const destinazione = await destinazioneUtente(supabase, user, da)
  switch (destinazione.esito) {
    case 'team':
    case 'cliente':
      return { ok: true, vai: destinazione.vai }
    case 'errore':
      return { ok: true, vai: user.app_metadata?.tipo === 'cliente' ? destinazioneCliente(da) : destinazioneSicura(da) }
    case 'disattivato':
    case 'chiuso':
    case 'nessuno': {
      if (destinazione.esito === 'nessuno') console.error('[auth] utente senza profilo né account:', user.id)
      await supabase.auth.signOut({ scope: 'local' })
      togliSessione(cookieStore)
      return {
        ok: false,
        motivo:
          destinazione.esito === 'disattivato'
            ? 'disattivato'
            : destinazione.esito === 'chiuso'
              ? 'percorso-concluso'
              : 'accesso-negato',
      }
    }
  }
}

/** Where a refused sign-in lands: the team's /login with its reason, a closed path its own page. */
export function indirizzoRifiuto(motivo: MotivoRifiuto): string {
  return motivo === 'percorso-concluso' ? '/accesso-negato?motivo=percorso-concluso' : `/login?errore=${motivo}`
}
