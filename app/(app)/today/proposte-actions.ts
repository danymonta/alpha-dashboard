'use server'

import { revalidatePath } from 'next/cache'

import {
  chiedeCommento,
  confermaPropostaSetterSchema,
  messaggioProposta as messaggio,
  propostaCambiata as cambiata,
  propostaChiusa as chiusa,
  scartaPropostaSetterSchema,
  type CommentoProposta,
} from '@/app/(app)/today/proposta-instagram'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type EsitoProposta =
  | { ok: true }
  /**
   * chiusa: the proposal is no longer to decide (decided elsewhere, or gone): its card leaves.
   * serveCommento: the setter's decision needs the comment of the day first (08/10/2026): the card asks it.
   * cambiata: the proposal was recomputed after the page read it: the card shows the new numbers first.
   * commentoSalvato: with chiusa, the answers he gave with the decision went into his report all the
   * same (true) or did not (false); undefined when he gave none.
   */
  | { ok: false; errore: string; chiusa?: boolean; serveCommento?: boolean; cambiata?: boolean; commentoSalvato?: boolean }

/** Only the setter decides his proposal here; the admin from the "Setter" page (the database checks it again). */
async function negaSeNonSetter(): Promise<{ errore: string } | { id: string }> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { errore: 'Sessione scaduta. Rientra e riprova.' }
  if (profilo.ruolo !== 'setter') return { errore: 'La proposta la decide il setter che lavora i DM.' }
  return { id: profilo.id }
}

type Client = Awaited<ReturnType<typeof createClient>>

/**
 * The proposal was decided elsewhere (the admin, another device) while the
 * setter wrote the comment of the day in the card's step (08/10/2026): the
 * decision is not his any more, the comment still is. His three answers go
 * into his own report of that day, through his own policies: an update of
 * those three columns only, or a report with only them when the day has none
 * (as scarta_proposta_instagram does). Never a number, never created_by of a
 * report that is there. The day is the proposal's, read under RLS (his own);
 * a proposal gone leaves nothing to write. True: saved.
 */
async function salvaCommentoRimasto(
  supabase: Client,
  setterId: string,
  idProposta: string,
  commento: CommentoProposta,
): Promise<boolean> {
  const { data: proposta, error } = await supabase
    .from('report_proposte_instagram')
    .select('data')
    .eq('id', idProposta)
    .maybeSingle()
  if (error || !proposta) return false
  const risposte = {
    lead_in_target: commento.lead_in_target,
    qualita_conversazioni: commento.qualita_conversazioni,
    cosa_frenava: commento.cosa_frenava,
  }
  const aggiorna = () =>
    supabase
      .from('setter_daily_reports')
      .update(risposte)
      .eq('setter_id', setterId)
      .eq('data', proposta.data)
      .select('id')
      .maybeSingle()
  const primo = await aggiorna()
  if (primo.error) return false
  if (primo.data) return true
  const nuovo = await supabase
    .from('setter_daily_reports')
    .insert({ setter_id: setterId, data: proposta.data, created_by: setterId, ...risposte })
  if (!nuovo.error) return true
  // the report was created meanwhile (his form, the decision elsewhere): the answers go into it
  if (nuovo.error.code !== '23505') return false
  const secondo = await aggiorna()
  return !secondo.error && !!secondo.data
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
 * With `commento` (the card's step, 08/10/2026) the three required answers
 * of the day go into the same report in the same transaction (p_commento):
 * the database confirms a day from 08/10/2026 with activity only with them.
 */
export async function confermaPropostaInstagram(input: unknown): Promise<EsitoProposta> {
  const parsed = confermaPropostaSetterSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const setter = await negaSeNonSetter()
  if ('errore' in setter) return { ok: false, errore: setter.errore }

  const supabase = await createClient()
  const { error } = await supabase.rpc('conferma_proposta_instagram', {
    p_id: parsed.data.id,
    p_valori: parsed.data.valori,
    p_calcolato_il: parsed.data.calcolato_il,
    p_commento: parsed.data.commento,
  })
  if (error) return rifiutata(supabase, setter.id, parsed.data, error, 'Conferma non riuscita. Riprova.')

  aggiornaPagine(true)
  return { ok: true }
}

/**
 * "Tieni i miei": the proposal is left, his numbers stay as he wrote them.
 * With `commento` the three required answers of the day go into his report
 * first (p_commento), in the same transaction.
 */
export async function scartaPropostaInstagram(input: unknown): Promise<EsitoProposta> {
  const parsed = scartaPropostaSetterSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  }
  const setter = await negaSeNonSetter()
  if ('errore' in setter) return { ok: false, errore: setter.errore }

  const supabase = await createClient()
  const { error } = await supabase.rpc('scarta_proposta_instagram', {
    p_id: parsed.data.id,
    p_commento: parsed.data.commento,
  })
  if (error) return rifiutata(supabase, setter.id, parsed.data, error, 'Non riuscito. Riprova.')
  // the answers of the day may have changed his report: the pages that read it
  aggiornaPagine(!!parsed.data.commento)
  return { ok: true }
}

/**
 * A decision the database refused, in words for him. A proposal decided
 * elsewhere (another tab, another device, the admin) or gone leaves the page;
 * with the answers he gave in the step, they go into his report all the same
 * (salvaCommentoRimasto). The page reloads in any case.
 */
async function rifiutata(
  supabase: Client,
  setterId: string,
  dati: { id: string; commento?: CommentoProposta },
  error: { code?: string; message: string },
  fallback: string,
): Promise<EsitoProposta> {
  const decisaAltrove = chiusa(error)
  const commentoSalvato =
    decisaAltrove && dati.commento ? await salvaCommentoRimasto(supabase, setterId, dati.id, dati.commento) : undefined
  aggiornaPagine(commentoSalvato === true)
  return {
    ok: false,
    errore: messaggio(error, fallback),
    chiusa: decisaAltrove,
    serveCommento: chiedeCommento(error),
    cambiata: cambiata(error),
    commentoSalvato,
  }
}
