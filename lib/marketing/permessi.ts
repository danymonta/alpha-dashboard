import type { AppRole } from '@/lib/auth/roles'

/**
 * Who deletes a content (open question 1, default built): the admin and
 * marketing; the video editor sets "Canceled". The mirror of the policy
 * marketing_contenuti_eliminazione: change both together.
 */
export const RUOLI_ELIMINA_CONTENUTI: readonly AppRole[] = ['admin', 'marketing']

export function eliminaContenuti(ruolo: AppRole): boolean {
  return RUOLI_ELIMINA_CONTENUTI.includes(ruolo)
}
