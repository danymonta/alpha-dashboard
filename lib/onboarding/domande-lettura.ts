import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { domandeScheda, type DomandaScheda, type RigaDomanda } from '@/lib/percorso/questionario'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The questions of the questionnaire as the card of a client reads them (1.88.0), with the session
 * of the admin or of the coach in charge (RLS of onboarding_domande): every question, the hidden
 * ones too, so an answer given before a question was taken away stays readable. A read that does
 * not work gives the 26 of the form, never an error page.
 */
export async function leggiDomandeScheda(db: SupabaseClient<Database>): Promise<DomandaScheda[]> {
  const { data, error } = await db.from('onboarding_domande').select('*').order('sezione').order('ordine')
  if (error) {
    console.error('[onboarding] domande non lette:', error.code)
    return domandeScheda([])
  }
  return domandeScheda((data ?? []) as RigaDomanda[])
}
