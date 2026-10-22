import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Writes the address pg_net posts every step of the Insight to (D18).
 *
 * Only here, only with the service role, and only after the action has
 * checked the role (the admin; for «Aggiorna dati» also an active setter,
 * 1.50.0) and built the address from APP_URL (urlPasso): the RPCs a session
 * may call (insight_imposta_automazione, insight_richiedi) take no address,
 * so a session, even one calling the Data API from a console, can never aim
 * the key of the steps at another host.
 *
 * True when the database has the address; the log says nothing but that it
 * failed (the address is not a secret, the key is, and never travels here).
 */
export async function salvaUrlPasso(url: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient().rpc('insight_imposta_url', { p_url: url })
    if (error) {
      console.error('[insight] indirizzo dei passi non salvato:', error.code ?? 'errore')
      return false
    }
    return true
  } catch {
    console.error('[insight] indirizzo dei passi non salvato: client di servizio non disponibile')
    return false
  }
}

export const URL_PASSO_NON_SALVATO = 'Indirizzo dell’app non salvato. Riprova.'
