'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import { correzioneReportSchema } from '@/lib/validation/report'

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
