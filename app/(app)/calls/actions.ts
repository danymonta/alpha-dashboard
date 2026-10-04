'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { motivoNonSpostabile } from '@/lib/call/spostamento'
import { createClient } from '@/lib/supabase/server'
import { modificaCallSchema, schemaSpostamento } from '@/lib/validation/call'
import { aggiornamentoDaEsito, esitoCallSchema, nuovaDataEsito } from '@/lib/validation/esito'

/** Every page that lists calls or counts them by day. */
const PAGINE_DELLE_CALL = ['/calls', '/', '/setting', '/setting/closer', '/setting/closer/giorno', '/leads', '/my-numbers']

export type EsitoRegistrazione =
  | { ok: true; vaiA: string | null }
  | { ok: false; errore: string }

/**
 * The closer records how a call went, with his notes (note_closer). The closer
 * only on calls assigned to him (RLS enforces it, the filter says it). The
 * admin on any call: his own in "Le mie call", any closer's in "Compila la
 * giornata" (section 19). Never the setter (Dany, 30/09/2026): the database
 * refuses him too (calls_esito_solo_closer).
 */
export async function registraEsito(input: unknown): Promise<EsitoRegistrazione> {
  const parsed = esitoCallSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Esito non valido.' }
  }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  }
  if (profilo.ruolo !== 'closer' && profilo.ruolo !== 'admin') {
    return { ok: false, errore: 'L’esito lo registra chi ha fatto la call.' }
  }

  const supabase = await createClient()
  const v = parsed.data

  // "Ha già una nuova data" moves the same call to its new day (Dany, 02/10/2026)
  const nuova = nuovaDataEsito(v)
  if (nuova) {
    const mossa = await sposta({ call_id: v.call_id, ...nuova }, profilo.ruolo === 'admin')
    if (!mossa.ok) return mossa
    if (v.esito === 'riprogrammata' && v.note_closer !== undefined) {
      let note = supabase.from('calls').update({ note_closer: v.note_closer }).eq('id', v.call_id)
      if (profilo.ruolo === 'closer') note = note.eq('closer_id', profilo.id)
      const { error } = await note
      if (error) return { ok: false, errore: 'Call spostata, note non salvate. Riprova.' }
    }
    return { ok: true, vaiA: null }
  }

  // "In attesa di conferma" (04/10/2026): a held call or a no-show never leaves
  // its outcome for it, as it never moves (lib/call/spostamento.ts)
  if (v.esito === 'riprogrammata') {
    const { data: attuale, error } = await supabase.from('calls').select('stato').eq('id', v.call_id).maybeSingle()
    if (error) return { ok: false, errore: 'Esito non salvato. Riprova.' }
    const ferma = attuale ? motivoNonSpostabile(attuale.stato, profilo.ruolo) : null
    if (ferma) return { ok: false, errore: ferma }
  }

  let query = supabase.from('calls').update(aggiornamentoDaEsito(v)).eq('id', v.call_id)
  if (profilo.ruolo === 'closer') query = query.eq('closer_id', profilo.id)
  const { data, error } = await query.select('id').maybeSingle()

  if (error) return { ok: false, errore: 'Esito non salvato. Riprova.' }
  if (!data) return { ok: false, errore: 'Questa call non è assegnata a te.' }

  for (const pagina of PAGINE_DELLE_CALL) revalidatePath(pagina)

  // A closed call goes straight to the prefilled sale
  return {
    ok: true,
    vaiA: v.esito === 'chiusa' ? `/sales/new?call=${data.id}` : null,
  }
}

export type EsitoModifica = { ok: true } | { ok: false; errore: string }

/**
 * Move a call (Dany, 02/10/2026): the same call goes to its new day and time,
 * still to be held, with the trace "Spostata dal …" (public.sposta_call). The
 * closer his calls, the admin any (also to the past), the setter the calls he
 * booked while they are still to be held: the RPC decides with RLS and says
 * why in words. From the "Sposta" button, the outcome "Ha già una nuova data" and Alfire.
 */
export async function spostaCall(input: unknown): Promise<EsitoModifica> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'closer' && profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'Le call le spostano chi le ha fissate, il closer e l’admin.' }
  }
  return sposta(input, profilo.ruolo === 'admin')
}

async function sposta(input: unknown, admin: boolean): Promise<EsitoModifica> {
  const parsed = schemaSpostamento(admin).safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('sposta_call', {
    p_call_id: parsed.data.call_id,
    p_data: parsed.data.data,
    p_ora: parsed.data.ora,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Call non spostata. Riprova.') }

  for (const pagina of PAGINE_DELLE_CALL) revalidatePath(pagina)
  return { ok: true }
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
 * Who may touch which call is decided by RLS inside the RPCs. The closer reads
 * the setter's note and never rewrites it: modifica_call keeps it for him.
 */
export async function modificaCall(input: unknown): Promise<EsitoModifica> {
  const parsed = modificaCallSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }

  const v = parsed.data
  const supabase = await createClient()

  // the setter never changes the type: a call of his keeps the one it has
  let tipo = v.tipo
  if (profilo.ruolo === 'setter') {
    const { data: attuale, error: erroreLettura } = await supabase.from('calls').select('tipo').eq('id', v.call_id).maybeSingle()
    if (erroreLettura || !attuale) return { ok: false, errore: 'Call non trovata.' }
    tipo = attuale.tipo
  }

  const { error } = await supabase.rpc('modifica_call', {
    p_call_id: v.call_id,
    p_tipo: tipo,
    p_data: v.data,
    p_ora: v.ora,
    p_closer_id: v.closer_id,
    // the closer's sheet never sends the setter's note; the RPC keeps it for him anyway
    p_note: profilo.ruolo === 'closer' ? undefined : (v.note ?? undefined),
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Call non aggiornata. Riprova.') }

  if (v.dettagli && (profilo.ruolo === 'closer' || profilo.ruolo === 'admin')) {
    const { error: erroreDettagli } = await supabase.rpc('dettagli_call', {
      p_call_id: v.call_id,
      p_link_registrazione: v.dettagli.link_registrazione ?? undefined,
      p_performance: v.dettagli.performance ?? undefined,
      p_prodotto_proposto_id: v.dettagli.prodotto_proposto_id ?? undefined,
      p_importo_proposto: v.dettagli.importo_proposto ?? undefined,
      p_note_closer: v.dettagli.note_closer ?? undefined,
    })
    if (erroreDettagli) {
      return { ok: false, errore: messaggioErrore(erroreDettagli, 'Data salvata, dettagli no. Riprova.') }
    }
  }

  revalidatePath('/calls')
  revalidatePath('/leads')
  revalidatePath('/')
  revalidatePath('/setting')
  return { ok: true }
}
