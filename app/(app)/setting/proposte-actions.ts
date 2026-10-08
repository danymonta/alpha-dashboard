'use server'

import { revalidatePath } from 'next/cache'

import {
  confermaPropostaAdminSchema,
  messaggioProposta,
  propostaChiusa,
  scartaPropostaSchema,
} from '@/app/(app)/today/proposta-instagram'
import type { EsitoProposta } from '@/app/(app)/today/proposte-actions'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The admin decides the setters' days proposed from the Instagram DMs (Dany,
 * 08/10/2026: "Anche tu, con una scheda e la notifica"), from the "Setter"
 * page, with the same functions as the setter and with his own session (never
 * the service role): conferma_proposta_instagram writes into the report of
 * the proposal's setter, scarta_proposta_instagram leaves it as it is. The
 * first decision wins, his or the setter's; the database writes who decided,
 * and the setter sees it on his day. Only the outcome comes back, never a
 * number.
 */

/** Only the active admin decides from here (the database checks it again). */
async function negaSeNonAdmin(): Promise<string | null> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return 'Sessione scaduta. Rientra e riprova.'
  if (profilo.ruolo !== 'admin') return 'Le giornate dei setter le decide l’admin da qui.'
  return null
}

/** The pages that read the setter's report, and the badges of the layout. */
function aggiornaPagine(reportCambiato: boolean) {
  revalidatePath('/setting')
  revalidatePath('/today')
  if (!reportCambiato) return
  revalidatePath('/')
  revalidatePath('/my-numbers')
  revalidatePath('/setting', 'layout')
}

/**
 * "Conferma", "Usa quelli di Instagram" and "Conferma questi numeri": the six
 * numbers (Instagram's, or his correction) into the setter's report of that
 * day; every other field stays as it is. Only the proposal he saw
 * (calcolato_il), and only over the setter's numbers he saw (visti, null:
 * none). The database checks those under a lock on the report, in the
 * transaction of the write (p_visti): numbers the setter wrote after the page
 * was read are never replaced unseen ("Loris ha cambiato i suoi numeri di
 * quel giorno"), and the page reloads with them.
 */
export async function confermaPropostaAdmin(input: unknown): Promise<EsitoProposta> {
  const parsed = confermaPropostaAdminSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const negato = await negaSeNonAdmin()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('conferma_proposta_instagram', {
    p_id: parsed.data.id,
    p_valori: parsed.data.valori,
    p_calcolato_il: parsed.data.calcolato_il,
    // {}: the card showed no numbers of his (no report, or all at zero)
    p_visti: parsed.data.visti ?? {},
  })
  if (error) {
    // decided by the setter meanwhile, recomputed, or his numbers changed: the page reloads it
    aggiornaPagine(false)
    return {
      ok: false,
      errore: messaggioProposta(error, 'Conferma non riuscita. Riprova.'),
      chiusa: propostaChiusa(error),
    }
  }

  aggiornaPagine(true)
  return { ok: true }
}

/** "Tieni quelli di Loris": the proposal is left, the setter's report stays as he wrote it. */
export async function scartaPropostaAdmin(input: unknown): Promise<EsitoProposta> {
  const parsed = scartaPropostaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const negato = await negaSeNonAdmin()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('scarta_proposta_instagram', { p_id: parsed.data.id })
  aggiornaPagine(false)
  if (error) {
    return { ok: false, errore: messaggioProposta(error, 'Non riuscito. Riprova.'), chiusa: propostaChiusa(error) }
  }
  return { ok: true }
}
