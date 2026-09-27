'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { correzioneReportSchema, nuovoReportSchema } from '@/lib/validation/report'

export type Esito = { ok: true } | { ok: false; errore: string }

/** The admin corrects any setter's report, whatever the day. */
export async function correggiReport(input: unknown): Promise<Esito> {
  const parsed = correzioneReportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('setter_daily_reports').update(campi).eq('id', id).select('id').maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Report non aggiornato. Riprova.') }
  if (!data) return { ok: false, errore: 'Report non trovato.' }

  revalidatePath('/setting')
  revalidatePath('/')
  revalidatePath('/my-numbers')
  return { ok: true }
}

/**
 * The admin adds a whole day for a setter (or for himself). A day that is
 * already there is corrected from its row, never overwritten from here.
 */
export async function aggiungiReport(input: unknown): Promise<Esito> {
  const parsed = nuovoReportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  if (parsed.data.data > oggiRoma()) return { ok: false, errore: 'Il futuro non si compila: scegli oggi o un giorno passato.' }

  const supabase = await createClient()
  const { data: esistente, error: erroreLettura } = await supabase
    .from('setter_daily_reports')
    .select('id')
    .eq('setter_id', parsed.data.setter_id)
    .eq('data', parsed.data.data)
    .maybeSingle()
  if (erroreLettura) return { ok: false, errore: messaggioErrore(erroreLettura, 'Giornata non salvata. Riprova.') }
  if (esistente) {
    return {
      ok: false,
      errore: `Il ${formatData(parsed.data.data)} c’è già: correggilo dalla tabella qui sotto, con la matita.`,
    }
  }

  const { error } = await supabase.from('setter_daily_reports').insert(parsed.data)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Giornata non salvata. Riprova.') }

  revalidatePath('/setting')
  revalidatePath('/')
  revalidatePath('/my-numbers')
  revalidatePath('/today')
  return { ok: true }
}

/** A day recorded by mistake: the setting numbers of that period change. */
export async function eliminaReport(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Report non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('setter_daily_reports').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Report non eliminato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Report non trovato.' }

  revalidatePath('/setting')
  revalidatePath('/')
  revalidatePath('/my-numbers')
  revalidatePath('/today')
  return { ok: true }
}
