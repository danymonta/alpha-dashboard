'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { getProfilo } from '@/lib/auth/session'
import { UN_ANNO_IN_SECONDI } from '@/lib/i18n/lingua'
import { COOKIE_SOLDI, SOLDI_NASCOSTI } from '@/lib/panoramica/soldi'

/**
 * The eye of the Panoramica: hides or shows the money on this device for a year. A cookie of the
 * interface, no data; only for the admin, the one who has the Panoramica.
 */
export async function impostaSoldiNascosti(nascosti: boolean): Promise<void> {
  const profilo = await getProfilo()
  if (!profilo || profilo.ruolo !== 'admin' || !profilo.attivo) return
  const archivio = await cookies()
  if (nascosti) {
    archivio.set(COOKIE_SOLDI, SOLDI_NASCOSTI, { path: '/', maxAge: UN_ANNO_IN_SECONDI, sameSite: 'lax' })
  } else {
    archivio.delete(COOKIE_SOLDI)
  }
  revalidatePath('/')
}
