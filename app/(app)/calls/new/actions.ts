'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nuovaCallSchema, type NuovaCallInput } from '@/lib/validation/call'

export type EsitoNuovaCall =
  | { ok: true; leadEsistente: boolean }
  | {
      ok: false
      errore: string
      campi?: Partial<Record<keyof NuovaCallInput, string>>
    }

/** Books a call: lead and call are created together by public.fissa_call. */
export async function fissaCall(input: unknown): Promise<EsitoNuovaCall> {
  const parsed = nuovaCallSchema.safeParse(input)
  if (!parsed.success) {
    const campi: Partial<Record<keyof NuovaCallInput, string>> = {}
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0] as keyof NuovaCallInput
      campi[campo] ??= issue.message
    }
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  }
  if (profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'Le call da questa schermata le fissa il setter.' }
  }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('fissa_call', {
      p_nome: v.nome,
      p_fonte: v.fonte,
      // the setter books discovery calls only: strategy calls are not done with leads
      p_tipo: 'discovery',
      p_data: v.data,
      p_ora: v.ora,
      p_closer_id: v.closer_id,
      p_instagram_handle: v.instagram_handle ?? undefined,
    })
    .single()

  if (error) {
    // 22023: a rule of fissa_call, already worded for the user
    if (error.code === '22023') return { ok: false, errore: error.message }
    return { ok: false, errore: 'Non è stato possibile fissare la call. Riprova.' }
  }

  revalidatePath('/calls')
  revalidatePath('/setting')
  revalidatePath('/')

  return { ok: true, leadEsistente: data.lead_esistente }
}
