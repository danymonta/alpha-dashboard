import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { profiloDellaRichiesta } from '@/lib/auth/session'
import { formato, type Formato } from '@/lib/format'
import { COOKIE_LINGUA, eLingua, linguaIniziale, type Lingua } from '@/lib/i18n/lingua'

/**
 * The language of this request (1.53.0): the device's cookie, or, without one, the
 * person's role (English for the business coach). Read once per render: the root
 * layout, the app layout and the page share it, and the profile it may read is the
 * same memoized read of requireProfilo (no second getUser). Outside a render (a
 * server action, a route) it reads the cookie again each time.
 */
export const getLingua = cache(async (): Promise<Lingua> => {
  const valore = (await cookies()).get(COOKIE_LINGUA)?.value
  if (eLingua(valore)) return valore
  const profilo = await profiloDellaRichiesta()
  return linguaIniziale(null, profilo?.ruolo ?? null)
})

/** The language and its number and date formatting, for a server component. */
export async function getFormato(): Promise<Formato> {
  return formato(await getLingua())
}
