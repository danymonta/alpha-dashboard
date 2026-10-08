'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { reportGiornalieroSchema, valoriDaRiga, type ValoriReport } from '@/lib/validation/report'

/** The day's report as it is saved now: what the form shows of it, and its version. */
export type RigaReport = {
  valori: ValoriReport
  /** updated_at, the version a save goes over */
  salvatoAlle: string
  dmTotali: number | null
}

export type EsitoSalvataggio =
  /** dmTotali: the saved row's generated column (outbound + inbound + follow up), never summed in TS */
  | { ok: true; salvatoAlle: string; creato: boolean; dmTotali: number | null }
  /**
   * cambiato: the report of that day is not at the version the screen holds:
   * the admin decided its proposal from Instagram, or corrected it from
   * "Setter", another tab or device of his; or a save of this very screen
   * landed while its answer was lost on the way back. Nothing was written.
   * attuale is the report as it is saved now (null: the day has none),
   * undefined when it could not be read: the screen tells its own lost save
   * from a change made elsewhere, and reloads the day only for the latter.
   */
  | { ok: false; errore: string; cambiato?: true; attuale?: RigaReport | null }

/**
 * The version of the report the save goes over: its updated_at as the screen
 * last read or saved it, passed back untouched (a Date would drop the
 * microseconds); null when the day has no report yet.
 */
const versioneSchema = z
  .string()
  .max(64, 'Report non valido')
  .refine((v) => Number.isFinite(Date.parse(v)), 'Report non valido')
  .nullable()

const salvataggioSchema = reportGiornalieroSchema.extend({ versione: versioneSchema })

const CAMBIATO = 'Il report di quel giorno è cambiato nel frattempo: rileggilo e riprova.'

/**
 * Autosave of the setter's daily report. Creates the row on the first touch
 * and then writes only over the version it read (Dany, 08/10/2026: the admin
 * decides the setter's days from Instagram too, from another device): an
 * insert when there was no report, an update of that same updated_at
 * otherwise. A report changed or created meanwhile is never overwritten with
 * the numbers on an older screen: the save is refused (cambiato) and the
 * screen reloads the day. An update never touches created_by: whoever created
 * the report (the admin confirming a proposal) stays written. Any past day
 * can be corrected; RLS refuses the future, this code only turns the refusal
 * into a readable message.
 */
export async function salvaReportGiornaliero(input: unknown): Promise<EsitoSalvataggio> {
  const parsed = salvataggioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  }
  if (profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'Il report giornaliero lo compila il setter.' }
  }

  const { versione, ...valori } = parsed.data
  const supabase = await createClient()
  const colonne = 'updated_at, dm_totali'
  const { data, error } =
    versione === null
      ? await supabase
          .from('setter_daily_reports')
          .insert({ ...valori, setter_id: profilo.id, created_by: profilo.id })
          .select(colonne)
          .single()
      : await supabase
          .from('setter_daily_reports')
          .update(valori)
          .eq('setter_id', profilo.id)
          .eq('data', valori.data)
          .eq('updated_at', versione)
          .select(colonne)
          .maybeSingle()

  if (error) {
    // the day got its report meanwhile (a decision of the admin, another device, a lost answer)
    if (error.code === '23505') return cambiato(supabase, profilo.id, valori.data)
    if (error.code === '42501') {
      return { ok: false, errore: 'Un giorno che non è ancora arrivato non si compila.' }
    }
    return { ok: false, errore: 'Salvataggio non riuscito. Riprova.' }
  }
  // no row at that version: changed, or removed, since it was read
  if (!data) return cambiato(supabase, profilo.id, valori.data)

  // Pages that read these numbers. /today itself keeps its local state.
  revalidatePath('/')
  revalidatePath('/setting')
  revalidatePath('/my-numbers')

  return {
    ok: true,
    salvatoAlle: data.updated_at,
    creato: versione === null,
    dmTotali: data.dm_totali,
  }
}

/** The refusal of a save over an old version, with the day as it is saved now. */
async function cambiato(
  supabase: Awaited<ReturnType<typeof createClient>>,
  setterId: string,
  data: string,
): Promise<EsitoSalvataggio> {
  const { data: riga, error } = await supabase
    .from('setter_daily_reports')
    .select(
      'dm_outbound, dm_inbound, conversazioni, call_proposte, discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate, follow_up, contenuto_pubblicato, note, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, updated_at, dm_totali',
    )
    .eq('setter_id', setterId)
    .eq('data', data)
    .maybeSingle()
  const attuale = error
    ? undefined
    : riga
      ? { valori: valoriDaRiga(riga), salvatoAlle: riga.updated_at, dmTotali: riga.dm_totali }
      : null
  return { ok: false, errore: CAMBIATO, cambiato: true, attuale }
}
