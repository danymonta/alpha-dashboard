'use server'

import type { Anteprima } from '@/lib/alfire/riassunto'
import { anteprimaScrittura } from '@/lib/alfire/strumenti'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The confirmation card asks, before the tap, what a write will touch: the
 * real row, before → after, what a deletion takes with it. Read only, with
 * the user's session, and only for a write tool this person has (the same
 * preview the app's own sheets and deletion questions show).
 */
export async function anteprimaAlfire(nome: string, input: unknown): Promise<Anteprima> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { errore: 'Sessione scaduta. Rientra e riprova.' }
  if (typeof nome !== 'string') return { errore: 'Operazione non valida.' }

  const supabase = await createClient()
  try {
    return await anteprimaScrittura(supabase, profilo, livelloPmEffettivo(profilo.ruolo, profilo.livello_pm), nome, input)
  } catch (e) {
    // the card still shows what the model asked; the tool checks again when it runs
    console.error('[alfire] anteprima', nome, e instanceof Error ? e.message : e)
    return { righe: ['Non riesco a leggere i dati attuali: controlla bene prima di confermare.'], incompleta: true }
  }
}
