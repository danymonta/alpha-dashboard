import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { destinazioneUtente, indirizzoUscita } from '@/lib/auth/destinazione'
import { createClient } from '@/lib/supabase/server'

/**
 * The guard of the client's area (release B1a, docs/onboarding/rilascio-b.md): the row of
 * clienti_account of the session, read once per request (React `cache`, as
 * profiloDellaRichiesta), through the one place that decides (destinazioneUtente).
 *
 * - no session: /entra?da=/percorso (the proxy already does it; this is the net)
 * - a person of the team: her own page (a collaborator who opens /percorso)
 * - closed account: /auth/uscita?motivo=percorso-concluso
 * - no account: /auth/uscita?motivo=nessun-account
 * - the database not answering: the page's error (error.tsx, «Riprova»)
 *
 * It returns the client and the state of the account: a suspended account is drawn by the
 * layout, one page only.
 */
export type ClienteSessione = { clientId: string; stato: 'attivo' | 'sospeso' }

export const requireCliente = cache(async (): Promise<ClienteSessione> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entra?da=%2Fpercorso')

  const destinazione = await destinazioneUtente(supabase, user)
  switch (destinazione.esito) {
    case 'cliente':
      return { clientId: destinazione.clientId, stato: destinazione.stato }
    case 'team':
      redirect(destinazione.vai)
    case 'disattivato':
      redirect('/account-disattivato')
    case 'chiuso':
      redirect(indirizzoUscita('percorso-concluso'))
    case 'nessuno':
      redirect(indirizzoUscita('nessun-account'))
    case 'errore':
      throw new Error('Il database non risponde: riprova tra poco.')
  }
})
