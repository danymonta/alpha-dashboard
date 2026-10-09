import type { SupabaseClient } from '@supabase/supabase-js'

import {
  COMMENTO_OBBLIGATORIO_DAL,
  FILTRO_ATTIVITA,
  FILTRO_COMMENTO_MANCANTE,
} from '@/lib/setting/commento'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The setter's own days still without the required comment (Dany,
 * 08/10/2026): from COMMENTO_OBBLIGATORIO_DAL to today, with activity,
 * without one of the three answers (the rule of commento_da_scrivere). Read
 * with the setter's session, under RLS: only his own reports, and only his
 * screens ask (the number on "Oggi", the line on top of it). Never the
 * admin's: no list and no count of a person's days to complete for him
 * (CLAUDE.md section 17).
 */

type Client = SupabaseClient<Database>

/** How many: null when the read failed (the badge keeps its last number). */
export async function contaCommentiMancanti(supabase: Client, setterId: string, oggi: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('setter_daily_reports')
    .select('id', { count: 'exact', head: true })
    .eq('setter_id', setterId)
    .gte('data', COMMENTO_OBBLIGATORIO_DAL)
    .lte('data', oggi)
    .or(FILTRO_ATTIVITA)
    .or(FILTRO_COMMENTO_MANCANTE)
  return error ? null : (count ?? 0)
}

/** On top of "Oggi": at most this many days by name, then "e altri N". */
export const GIORNI_SENZA_COMMENTO_MAX = 7

/**
 * Which days, but the one open below (its own bar says it): the most recent
 * GIORNI_SENZA_COMMENTO_MAX, oldest first, and how many in all. Null when the
 * read failed: the line is a reminder, never a reason for "Oggi" not to open.
 */
export async function giorniSenzaCommento(
  supabase: Client,
  setterId: string,
  oggi: string,
  aperto: string,
): Promise<{ giorni: string[]; totale: number } | null> {
  const { data, count, error } = await supabase
    .from('setter_daily_reports')
    .select('data', { count: 'exact' })
    .eq('setter_id', setterId)
    .gte('data', COMMENTO_OBBLIGATORIO_DAL)
    .lte('data', oggi)
    .neq('data', aperto)
    .or(FILTRO_ATTIVITA)
    .or(FILTRO_COMMENTO_MANCANTE)
    .order('data', { ascending: false })
    .limit(GIORNI_SENZA_COMMENTO_MAX)
  if (error) return null
  return { giorni: (data ?? []).map((r) => r.data).reverse(), totale: count ?? 0 }
}
