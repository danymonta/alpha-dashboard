'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import { obiettiviSchema } from '@/lib/validation/obiettivi'

export type Esito = { ok: true } | { ok: false; errore: string }

/** Targets of the month (admin). Both empty: the targets are removed. */
export async function salvaObiettivi(input: unknown): Promise<Esito> {
  const parsed = obiettiviSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { mese, cash, nuovi_clienti } = parsed.data
  const supabase = await createClient()
  const { error } =
    cash === null && nuovi_clienti === null
      ? await supabase.from('obiettivi_mese').delete().eq('mese', mese)
      : await supabase.from('obiettivi_mese').upsert({ mese, cash, nuovi_clienti }, { onConflict: 'mese' })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Obiettivi non salvati. Riprova.') }

  revalidatePath('/')
  return { ok: true }
}
