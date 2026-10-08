'use server'

import { revalidatePath } from 'next/cache'

import { confermaPropostaSchema, scartaPropostaSchema } from '@/app/(app)/today/proposta-instagram'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type EsitoProposta =
  | { ok: true }
  /** chiusa: the proposal is no longer to decide (decided elsewhere, or gone): its card leaves */
  | { ok: false; errore: string; chiusa?: boolean }

/** Only the setter decides his proposal (the database checks it again). */
async function negaSeNonSetter(): Promise<string | null> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return 'Sessione scaduta. Rientra e riprova.'
  if (profilo.ruolo !== 'setter') return 'La proposta la decide il setter che lavora i DM.'
  return null
}

/**
 * Our functions raise 22023/42501 with words already for people ("Questa
 * proposta è già stata confermata", "Un giorno che non è ancora arrivato non
 * si compila."); a proposal that is not his, or not there any more, is P0002.
 * A policy refusal from PostgREST is not worded: the generic sentence.
 */
function messaggio(error: { code?: string; message: string }, fallback: string) {
  if (error.code === 'P0002') return 'Questa proposta non c’è più.'
  if ((error.code === '22023' || error.code === '42501') && !/row-level security/i.test(error.message)) {
    return error.message.endsWith('.') ? error.message : `${error.message}.`
  }
  return fallback
}

/** Decided in another tab or device, or not there any more. */
function chiusa(error: { code?: string; message: string }) {
  return error.code === 'P0002' || (error.code === '22023' && /^Questa proposta è già stata/.test(error.message))
}

/** The pages that read the setter's report (the setter's and the admin's). */
function aggiornaPagine(reportCambiato: boolean) {
  revalidatePath('/today')
  if (!reportCambiato) return
  revalidatePath('/')
  revalidatePath('/my-numbers')
  revalidatePath('/setting', 'layout')
}

/**
 * "Conferma" and "Conferma questi numeri": conferma_proposta_instagram writes
 * the six numbers (the proposal's, or his correction) into the setter's own
 * report of that day, through his own policies as "Oggi" does, and leaves
 * every other field as it is. Only the proposal he saw (calcolato_il): one
 * recomputed meanwhile is refused with its sentence, and the page reloads it
 * with the new numbers. Only the outcome comes back.
 */
export async function confermaPropostaInstagram(input: unknown): Promise<EsitoProposta> {
  const parsed = confermaPropostaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const negato = await negaSeNonSetter()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('conferma_proposta_instagram', {
    p_id: parsed.data.id,
    p_valori: parsed.data.valori,
    p_calcolato_il: parsed.data.calcolato_il,
  })
  if (error) {
    // a proposal decided elsewhere (another tab, another device) leaves the page
    aggiornaPagine(false)
    return { ok: false, errore: messaggio(error, 'Conferma non riuscita. Riprova.'), chiusa: chiusa(error) }
  }

  aggiornaPagine(true)
  return { ok: true }
}

/** "Tieni i miei": the proposal is left, his report stays as he wrote it. */
export async function scartaPropostaInstagram(input: unknown): Promise<EsitoProposta> {
  const parsed = scartaPropostaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const negato = await negaSeNonSetter()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('scarta_proposta_instagram', { p_id: parsed.data.id })
  aggiornaPagine(false)
  if (error) return { ok: false, errore: messaggio(error, 'Non riuscito. Riprova.'), chiusa: chiusa(error) }
  return { ok: true }
}
