'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import { chiudiRegolaSchema, modificaRegolaSchema, regolaSchema } from '@/lib/validation/team'

export type Esito = { ok: true } | { ok: false; errore: string }

function aggiorna() {
  revalidatePath('/settings/commissions')
  revalidatePath('/commissions')
  revalidatePath('/my-numbers')
  revalidatePath('/')
}

/** A new rule starts on a date and closes the one in force: history never changes. */
export async function nuovaRegola(input: unknown): Promise<Esito> {
  const parsed = regolaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('nuova_regola_provvigione', {
    p_profile_id: parsed.data.profile_id,
    // points -> fraction, the one and only conversion (7 -> 0.07)
    p_percentuale: Math.round(parsed.data.percentuale * 100) / 10000,
    p_applica_a: parsed.data.applica_a,
    p_valida_dal: parsed.data.valida_dal,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non salvata. Riprova.') }

  aggiorna()
  return { ok: true }
}

export async function chiudiRegola(input: unknown): Promise<Esito> {
  const parsed = chiudiRegolaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('chiudi_regola_provvigione', {
    p_rule_id: parsed.data.rule_id,
    p_valida_al: parsed.data.valida_al,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non chiusa. Riprova.') }

  aggiorna()
  return { ok: true }
}

/** Correct a rule in place. The overlap guard in the database keeps one rule per day. */
export async function modificaRegola(input: unknown): Promise<Esito> {
  const parsed = modificaRegolaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commission_rules')
    .update({
      // points -> fraction, as in nuovaRegola
      percentuale: Math.round(v.percentuale * 100) / 10000,
      applica_a: v.applica_a,
      valida_dal: v.valida_dal,
      valida_al: v.valida_al,
    })
    .eq('id', v.id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non aggiornata. Riprova.') }
  if (!data) return { ok: false, errore: 'Regola non trovata.' }

  aggiorna()
  return { ok: true }
}

/** Commissions accrued under it disappear: the rule no longer applies to any month. */
export async function eliminaRegola(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Regola non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('commission_rules').delete().eq('id', parsed.data.id).select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non eliminata. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Regola non trovata.' }

  aggiorna()
  return { ok: true }
}
