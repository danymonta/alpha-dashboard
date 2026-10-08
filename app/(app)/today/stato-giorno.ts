import { PROPOSTE_MAX, firmaProposte } from '@/app/(app)/today/proposta-instagram'
import { createClient } from '@/lib/supabase/client'

/** A read that takes longer is given up: the form never waits on a stalled connection. */
const ATTESA_MAX_MS = 8000

/** What the open day of "Oggi" holds on the server now. */
export type StatoGiorno = {
  /** updated_at of the setter's report of that day, null when it has none */
  versione: string | null
  /** firmaProposte of the proposals still to decide and of the open day's decision */
  proposte: string
}

/**
 * Reads, from the browser and under RLS, whether the open day changed on the
 * server: the version of the setter's report and the proposals, with the very
 * queries of the page. It never navigates and never throws: null when it
 * could not read (no connection, a read refused, too slow). "Oggi" reads the
 * page again (router.refresh) only after this answered: a refresh that fails
 * does not throw, it falls back to a full browser navigation, and without a
 * connection the whole screen would give way to the browser's error page.
 */
export async function leggiStatoGiorno(setterId: string, data: string): Promise<StatoGiorno | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  const interrompi = new AbortController()
  const scadenza = setTimeout(() => interrompi.abort(), ATTESA_MAX_MS)
  try {
    const supabase = createClient()
    const [report, proposte, decisa] = await Promise.all([
      supabase
        .from('setter_daily_reports')
        .select('updated_at')
        .eq('setter_id', setterId)
        .eq('data', data)
        .abortSignal(interrompi.signal)
        .maybeSingle(),
      supabase
        .from('report_proposte_instagram')
        .select('id, calcolato_il')
        .eq('setter_id', setterId)
        .eq('stato', 'da_confermare')
        .order('data', { ascending: false })
        .limit(PROPOSTE_MAX + 1)
        .abortSignal(interrompi.signal),
      supabase
        .from('report_proposte_instagram')
        .select('deciso_il')
        .eq('setter_id', setterId)
        .eq('data', data)
        .neq('stato', 'da_confermare')
        .abortSignal(interrompi.signal)
        .maybeSingle(),
    ])
    if (report.error || proposte.error || decisa.error) return null
    return {
      versione: report.data?.updated_at ?? null,
      proposte: firmaProposte(proposte.data, decisa.data?.deciso_il ?? null),
    }
  } catch {
    return null
  } finally {
    clearTimeout(scadenza)
  }
}
