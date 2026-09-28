'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { isDevLoginEnabled } from '@/lib/auth/dev-login'
import { COOKIE_DOPO_LOGIN, destinazioneSicura } from '@/lib/auth/origine'
import { origineCorrente } from '@/lib/auth/origine-server'
import { createClient } from '@/lib/supabase/server'

export type StatoLogin = { errore?: string }

export async function accediConGoogle(formData: FormData): Promise<void> {
  const da = destinazioneSicura(String(formData.get('da') ?? '/'))
  const supabase = await createClient()
  // back to the domain the person is on (dashboard.percorsoalpha.com), not to
  // whatever APP_URL said at build time: cookies live on one domain only
  const origine = await origineCorrente()

  // the return address stays exactly "/auth/callback" (Supabase's allow list
  // compares the query too): where to go afterwards rides in a cookie
  ;(await cookies()).set(COOKIE_DOPO_LOGIN, da, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origine.startsWith('https://'),
    path: '/',
    maxAge: 60 * 15,
  })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origine}/auth/callback`,
    },
  })

  if (error || !data.url) {
    redirect('/login?errore=google')
  }

  redirect(data.url)
}

/** Local development only: signs in a seed user with email and password. */
export async function accediConPassword(
  _statoPrecedente: StatoLogin,
  formData: FormData,
): Promise<StatoLogin> {
  if (!isDevLoginEnabled()) {
    return { errore: 'Login di sviluppo non disponibile.' }
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { errore: 'Inserisci email e password.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { errore: 'Credenziali non valide.' }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
