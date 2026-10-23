'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { COOKIE_LINGUA, eLingua, UN_ANNO_IN_SECONDI, type Lingua } from '@/lib/i18n/lingua'

/**
 * The flag's tap (1.53.0): keeps the language on this device for a year and empties the
 * browser's page cache, so the current page and every page opened after it come in the
 * new language. A cookie of the interface, no data: it needs no session (the login page
 * has the flag too). Anything that is not a language is ignored.
 */
export async function impostaLingua(lingua: Lingua): Promise<void> {
  if (!eLingua(lingua)) return
  ;(await cookies()).set(COOKIE_LINGUA, lingua, {
    path: '/',
    maxAge: UN_ANNO_IN_SECONDI,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}
