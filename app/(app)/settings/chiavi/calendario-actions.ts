'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { FRASI_CALENDARIO, sincronizzaCalendario } from '@/lib/calendario/leggi'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type EsitoIndirizzo = { ok: true; letti: number | null; errore?: string } | { ok: false; errore: string }

const INCOLLATO_MAX = 2048

function rivalida() {
  revalidatePath('/settings/chiavi')
  revalidatePath('/setting', 'layout')
  revalidatePath('/')
}

/**
 * The admin links the calendar «Dany Discovery Call» (1.76.0): the secret iCal address goes to Vault
 * through calendario_imposta_url (the admin's own session: the function checks him and refuses the public
 * address). It arrives in a FormData (field `indirizzo`), never as a plain argument (`next dev` logs the
 * arguments of every server function call), and never comes back. Then the calendar is read once.
 */
export async function salvaIndirizzoCalendario(dati: unknown): Promise<EsitoIndirizzo> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const incollato = dati instanceof FormData ? dati.get('indirizzo') : null
  if (typeof incollato !== 'string' || !incollato.trim() || incollato.length > INCOLLATO_MAX) {
    return { ok: false, errore: 'Incolla l’indirizzo segreto copiato da Google Calendar.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('calendario_imposta_url', { p_url: incollato.trim() })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Indirizzo non salvato. Riprova.') }

  const esito = await sincronizzaCalendario(createAdminClient())
  rivalida()
  if (esito.esito === 'errore') return { ok: true, letti: null, errore: FRASI_CALENDARIO[esito.tipo] }
  return { ok: true, letti: esito.eventi }
}

export async function togliIndirizzoCalendario(): Promise<{ ok: true } | { ok: false; errore: string }> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const supabase = await createClient()
  const { error } = await supabase.rpc('calendario_togli_url')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Calendario non scollegato. Riprova.') }
  rivalida()
  return { ok: true }
}
