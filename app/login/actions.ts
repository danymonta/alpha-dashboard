'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { isDevLoginEnabled } from '@/lib/auth/dev-login'
import { publicEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

export type StatoLogin = { errore?: string }

export async function accediConGoogle(formData: FormData): Promise<void> {
  const da = String(formData.get('da') ?? '/')
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${publicEnv.appUrl}/auth/callback?da=${encodeURIComponent(da)}`,
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
