'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { ANALISI } from '@/lib/call/analisi/parole'
import { LIVELLI_PERFORMANCE } from '@/lib/call/analisi/vista'
import { VENDITA_DA_REGISTRARE } from '@/lib/call/follow-up'
import * as operazioni from '@/lib/call/operazioni'
import type { EsitoFollowUp, EsitoModifica, EsitoRegistrazione } from '@/lib/call/operazioni'
import { createClient } from '@/lib/supabase/server'
import { collegaVenditaSchema } from '@/lib/validation/call'

export type { EsitoFollowUp, EsitoModifica, EsitoRegistrazione } from '@/lib/call/operazioni'

/**
 * The writes of calls and outcomes live in the shared core (lib/call/operazioni.ts), the same one
 * Claude's tools use (Claude a 360 gradi, phase 2): these actions add only the cookie session.
 */
async function nucleo(): Promise<operazioni.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

/**
 * The closer records how a call went, with his notes (note_closer). The closer
 * only on calls assigned to him (RLS enforces it, the filter says it). The
 * admin on any call: his own in "Le mie call", any closer's in "Compila la
 * giornata" (section 19). Never the setter (Dany, 30/09/2026): the database
 * refuses him too (calls_esito_solo_closer).
 */
export async function registraEsito(input: unknown): Promise<EsitoRegistrazione> {
  return operazioni.registraEsito(await nucleo(), input)
}

/**
 * "Fissa la call di follow-up" (Dany, 07/10/2026): a held call that ended in
 * follow-up gets its follow-up call on a day (public.fissa_follow_up). From the card and Alfire.
 */
export async function fissaFollowUp(input: unknown): Promise<EsitoFollowUp> {
  return operazioni.fissaFollowUp(await nucleo(), input)
}

/** A sale the admin may tie to a closed call (public.vendite_da_collegare): amounts from SQL. */
export type VenditaDaCollegare = {
  sale_id: string
  cliente: string
  tipo: 'nuovo' | 'rinnovo' | 'upsell'
  data_vendita: string
  valore_contratto: number
  setter: string | null
  stesso_cliente: boolean
}

export type EsitoVenditeDaCollegare = { ok: true; vendite: VenditaDaCollegare[] } | { ok: false; errore: string }

/**
 * The sales registered without the call that the admin may tie to a closed
 * call (07/10/2026): first a client with the lead's name or handle, then the
 * sales signed within a month of the call. Admin only, as the database says.
 */
export async function venditeDaCollegare(input: unknown): Promise<EsitoVenditeDaCollegare> {
  const parsed = z.object({ call_id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Call non valida.' }
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  if (profilo.ruolo !== 'admin') return { ok: false, errore: VENDITA_DA_REGISTRARE.soloAdmin }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('vendite_da_collegare', { p_call_id: parsed.data.call_id })
  if (error) {
    return { ok: false, errore: error.code === 'P0002' ? error.message : messaggioErrore(error, 'Vendite non disponibili. Riprova.') }
  }
  return { ok: true, vendite: data }
}

/**
 * «La vendita c’è già: collegala» (07/10/2026): a sale registered without the
 * call (Vendite, Alfire) is tied to the closed call (public.collega_vendita_call),
 * so the call stops asking for its sale and «Registra la vendita» never makes a
 * second one. Only sales.call_id changes. Admin only.
 */
export async function collegaVendita(input: unknown): Promise<EsitoModifica> {
  const parsed = collegaVenditaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Vendita o call non valida.' }
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  if (profilo.ruolo !== 'admin') return { ok: false, errore: VENDITA_DA_REGISTRARE.soloAdmin }

  const supabase = await createClient()
  const { error } = await supabase.rpc('collega_vendita_call', {
    p_call_id: parsed.data.call_id,
    p_sale_id: parsed.data.sale_id,
  })
  if (error) {
    // P0002 and 23505 are already in words (call or sale gone, one sale per call)
    const inParole = error.code === 'P0002' || error.code === '23505'
    return { ok: false, errore: inParole ? error.message : messaggioErrore(error, 'Vendita non collegata. Riprova.') }
  }

  for (const pagina of [...operazioni.PAGINE_DELLE_CALL, '/sales']) revalidatePath(pagina)
  return { ok: true }
}

/**
 * Move a call (Dany, 02/10/2026): the same call goes to its new day and time,
 * still to be held, with the trace "Spostata dal …" (public.sposta_call). From
 * the "Sposta" button, the outcome "Ha già una nuova data" and Alfire.
 */
export async function spostaCall(input: unknown): Promise<EsitoModifica> {
  return operazioni.spostaCall(await nucleo(), input)
}

/** Admin only (public.elimina_call): a sale that came from it stays, without the call. */
export async function eliminaCall(input: unknown): Promise<EsitoModifica> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Call non valida.' }
  const profilo = await getProfilo()
  if (profilo?.ruolo !== 'admin' || !profilo.attivo) return { ok: false, errore: 'Solo l’admin elimina una call.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_call', { p_call_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Call non eliminata. Riprova.') }

  for (const pagina of ['/calls', '/leads', '/setting', '/']) revalidatePath(pagina)
  return { ok: true }
}

/**
 * Reschedule, change type, closer or the setter's note; the closer and the
 * admin also record how the call went, with the closer's notes (dettagli_call).
 */
export async function modificaCall(input: unknown): Promise<EsitoModifica> {
  return operazioni.modificaCall(await nucleo(), input)
}

// ── the card of a held call: the recording, the proposed reason, the performance (1.37.0) ──────────────

const callIdSchema = operazioni.callIdSchema

async function chiPuo(): Promise<{ ok: true } | { ok: false; errore: string }> {
  return operazioni.chiPuoRegistrare(await nucleo())
}

export type EsitoSemplice = { ok: true } | { ok: false; errore: string }

/** «Aggiungi il link» / «Cambia» on the card, and «Call non registrata»: the same function the sheet uses. */
export async function collegaRegistrazione(input: unknown): Promise<EsitoSemplice> {
  return operazioni.collegaRegistrazione(await nucleo(), input)
}

export async function scollegaRegistrazione(input: unknown): Promise<EsitoSemplice> {
  return operazioni.scollegaRegistrazione(await nucleo(), input)
}

/**
 * «Usa come motivo di non chiusura»: writes the reason Claude proposed, only if the saved reason is
 * still the one the card showed (an update «where obiezione_principale is not distinct from»): a reason
 * someone wrote meanwhile is never overwritten. Returns the previous reason, for «Annulla».
 */
export async function usaMotivoProposto(input: unknown): Promise<{ ok: true; precedente: string | null } | { ok: false; errore: string }> {
  const letto = callIdSchema.extend({ motivo_mostrato: z.string().nullable() }).safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Richiesta non valida.' }
  const chi = await chiPuo()
  if (!chi.ok) return chi
  const supabase = await createClient()
  const { data: analisi, error: e1 } = await supabase
    .from('call_analisi')
    .select('motivo_proposto')
    .eq('call_id', letto.data.call_id)
    .eq('stato', 'pronta')
    .maybeSingle()
  const proposto = analisi?.motivo_proposto?.trim()
  if (e1 || !proposto) return { ok: false, errore: 'Claude non ha proposto un motivo per questa call.' }
  return scriviMotivo(supabase, letto.data.call_id, letto.data.motivo_mostrato, proposto)
}

/** «Annulla» of the toast: back to the reason there was, only if it is still the proposed one. */
export async function annullaMotivoProposto(input: unknown): Promise<EsitoSemplice> {
  const letto = callIdSchema.extend({ motivo_attuale: z.string(), precedente: z.string().nullable() }).safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Richiesta non valida.' }
  const chi = await chiPuo()
  if (!chi.ok) return chi
  const supabase = await createClient()
  const esito = await scriviMotivo(supabase, letto.data.call_id, letto.data.motivo_attuale, letto.data.precedente)
  return esito.ok ? { ok: true } : esito
}

async function scriviMotivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  callId: string,
  daLeggere: string | null,
  nuovo: string | null,
): Promise<{ ok: true; precedente: string | null } | { ok: false; errore: string }> {
  let q = supabase.from('calls').update({ obiezione_principale: nuovo }).eq('id', callId)
  q = daLeggere === null ? q.is('obiezione_principale', null) : q.eq('obiezione_principale', daLeggere)
  const { data, error } = await q.select('id').maybeSingle()
  if (error) return { ok: false, errore: 'Motivo non salvato. Riprova.' }
  if (!data) return { ok: false, errore: ANALISI.motivoCambiato }
  for (const pagina of operazioni.PAGINE_DELLE_CALL) revalidatePath(pagina)
  return { ok: true, precedente: daLeggere }
}

/** «Conferma» / «Cambia» of the proposed performance: only the call's closer and the admin (decidi_performance). */
export async function decidiPerformance(input: unknown): Promise<{ ok: true } | { ok: false; errore: string }> {
  const letto = callIdSchema.extend({ livello: z.enum(LIVELLI_PERFORMANCE).nullable() }).safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Livello non valido.' }
  const chi = await chiPuo()
  if (!chi.ok) return chi
  const supabase = await createClient()
  const { error } = await supabase.rpc('decidi_performance', { p_call_id: letto.data.call_id, p_livello: letto.data.livello as never })
  if (error) return { ok: false, errore: error.code === '42501' ? error.message : 'Performance non salvata. Riprova.' }
  for (const pagina of operazioni.PAGINE_DELLE_CALL) revalidatePath(pagina)
  return { ok: true }
}
