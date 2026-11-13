import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { prenotateDaAggiungere, type CallDelGestionale, type PrenotataDaAggiungere } from '@/lib/calendario/confronto'
import { prenotazioniDaIcal } from '@/lib/calendario/ical'
import { indirizzoDaLeggere, scaricaIcal } from '@/lib/calendario/leggi'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

/**
 * «Prenotate su Calendly, non ancora nel gestionale» (1.78.0, Dany, 13/11/2026: «collegato al calendar anche
 * per la pipeline e le chiamate che avrò a breve»; «Sezione con un tocco»). The sales calls booked on the
 * calendar «Dany Discovery Call» from now to 30 days ahead that have no call in the app yet, with the name and
 * the handle the lead wrote in Calendly. Read while the admin's page renders and never saved: call_calendario
 * keeps no names (CLAUDE.md section 33). Nothing is created here: each one becomes a lead and a call only with
 * Dany's tap on «Aggiungi alla pipeline», through «Nuova call».
 *
 * `sessione` is the admin's server client: calendario_url_presente answers 42501 to anyone else, so the secret
 * address (service_role) is read only after the session has proved it is the admin's. The app's calls are read
 * with the session, under RLS. Never throws; the address never reaches a log or the browser.
 */
export type EsitoPrenotate =
  | { stato: 'ok'; voci: PrenotataDaAggiungere[] }
  | { stato: 'non_collegato' }
  | { stato: 'errore' }

/** The page does not wait for Google longer than this. */
const TEMPO_MS = 8_000
const GIORNO_MS = 24 * 3_600_000

export async function prenotateNonNelGestionale(sessione: SupabaseClient<Database>): Promise<EsitoPrenotate> {
  const errore = (motivo: string): EsitoPrenotate => {
    console.warn('[calendario] prenotate non lette:', motivo)
    return { stato: 'errore' }
  }

  try {
    const { data: presente, error: errorePresenza } = await sessione.rpc('calendario_url_presente')
    if (errorePresenza) return errore('sessione')

    const { data: indirizzo, error } = await createAdminClient().rpc('calendario_url')
    if (error) return errore('database')
    const url = indirizzoDaLeggere(typeof indirizzo === 'string' ? indirizzo.trim() : '')
    if (!url) return presente || indirizzo ? errore('indirizzo') : { stato: 'non_collegato' }

    const adesso = Date.now()
    const [file, lette] = await Promise.all([
      scaricaIcal(url, TEMPO_MS),
      sessione
        .from('calls')
        .select('programmata_il, lead:leads(nome, instagram_handle)')
        .neq('stato', 'cancellata')
        // a day of slack on each side: a call moved by hand still matches by name or handle
        .gte('programmata_il', new Date(adesso - GIORNO_MS).toISOString())
        .lte('programmata_il', new Date(adesso + 31 * GIORNO_MS).toISOString())
        .limit(1000),
    ])
    if ('tipo' in file) return errore(file.tipo)
    if (lette.error) return errore('call')

    const calls: CallDelGestionale[] = (lette.data ?? []).map((c) => {
      const lead = (Array.isArray(c.lead) ? c.lead[0] : c.lead) as { nome: string | null; instagram_handle: string | null } | null
      return { programmata_il: c.programmata_il, nome: lead?.nome ?? null, instagram_handle: lead?.instagram_handle ?? null }
    })
    const voci = prenotateDaAggiungere(prenotazioniDaIcal(file.testo), calls, adesso)
    console.info('[calendario] prenotate da aggiungere:', voci.length)
    return { stato: 'ok', voci }
  } catch {
    return errore('eccezione')
  }
}
