'use server'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/** The first-sign-in tour is done (finished or closed): it does not come back by itself. */
export async function segnaTutorialVisto(): Promise<void> {
  const profilo = await getProfilo()
  if (!profilo || profilo.tutorial_visto) return
  const supabase = await createClient()
  await supabase.rpc('segna_tutorial_visto')
}
