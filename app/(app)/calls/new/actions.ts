'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nuovaCallAdminSchema, nuovaCallSchema, type NuovaCallInput } from '@/lib/validation/call'

export type EsitoNuovaCall =
  | {
      ok: true
      leadEsistente: boolean
      /** Where the new call shows, when not in "Le mie call": another closer's day. */
      vaiA: string | null
    }
  | {
      ok: false
      errore: string
      campi?: Partial<Record<keyof NuovaCallInput, string>>
    }

/**
 * Books a call: lead and call are created together by public.fissa_call.
 * The setter books for himself; the admin (Dany, also closer and at times
 * setter) for himself or a setter, and may add a call already done.
 */
export async function fissaCall(input: unknown): Promise<EsitoNuovaCall> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  }
  if (profilo.ruolo !== 'setter' && profilo.ruolo !== 'admin') {
    return { ok: false, errore: 'Le call le fissano il setter e l’admin.' }
  }
  const admin = profilo.ruolo === 'admin'

  const parsed = (admin ? nuovaCallAdminSchema : nuovaCallSchema).safeParse(input)
  if (!parsed.success) {
    const campi: Partial<Record<keyof NuovaCallInput, string>> = {}
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0] as keyof NuovaCallInput
      campi[campo] ??= issue.message
    }
    return { ok: false, errore: 'Controlla i campi evidenziati.', campi }
  }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('fissa_call', {
      p_nome: v.nome,
      p_fonte: v.fonte,
      // discovery calls only: strategy calls are not done with leads
      p_tipo: 'discovery',
      p_data: v.data,
      p_ora: v.ora,
      p_closer_id: v.closer_id,
      p_instagram_handle: v.instagram_handle ?? undefined,
      // the setter always books for himself: fissa_call ignores it for him too
      p_setter_id: admin ? (v.setter_id ?? undefined) : undefined,
    })
    .single()

  if (error) {
    // 22023: a rule of fissa_call, already worded for the user
    if (error.code === '22023') return { ok: false, errore: error.message }
    return { ok: false, errore: 'Non è stato possibile fissare la call. Riprova.' }
  }

  for (const pagina of ['/calls', '/leads', '/setting', '/setting/closer', '/setting/closer/giorno', '/my-numbers', '/']) {
    revalidatePath(pagina)
  }

  // "Le mie call" lists the calls the admin runs himself: one booked for another
  // closer shows on that closer's day, where the admin can also record it
  const vaiA =
    admin && v.closer_id !== profilo.id
      ? `/setting/closer/giorno?${new URLSearchParams({ data: v.data, closer: v.closer_id }).toString()}`
      : null

  return { ok: true, leadEsistente: data.lead_esistente, vaiA }
}
