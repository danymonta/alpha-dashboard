'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { FOLLOW_UP, VENDITA_DA_REGISTRARE } from '@/lib/call/follow-up'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { motivoNonSpostabile } from '@/lib/call/spostamento'
import { formatOra, oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import {
  collegaVenditaSchema,
  erroreGiornoFollowUp,
  modificaCallSchema,
  schemaFollowUp,
  schemaSpostamento,
} from '@/lib/validation/call'
import { aggiornamentoDaEsito, esitoCallSchema, followUpEsito, nuovaDataEsito } from '@/lib/validation/esito'
import { chiedeRegistrazione, registrazioneMancante } from '@/lib/validation/registrazione'

/** Every page that lists calls or counts them by day. */
const PAGINE_DELLE_CALL = ['/calls', '/', '/setting', '/setting/closer', '/setting/closer/giorno', '/leads', '/my-numbers']

export type EsitoRegistrazione =
  | {
      ok: true
      vaiA: string | null
      /** The follow-up call booked with the outcome ("Sì, call fissata"): its id. */
      followUp?: string
      /**
       * The outcome is saved, the follow-up call is not (the database's reason
       * in words): a warning, never an error that keeps the sheet open to repeat
       * an outcome already saved.
       */
      avviso?: string
      /**
       * Whether «Fissa la call di follow-up» on the card can still book it: not
       * when the call already has its follow-up call (handed to another closer).
       */
      avvisoRiprova?: boolean
      /** The outcome is saved, the recording is not (the card of the call adds it). */
      avvisoRegistrazione?: string
    }
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
  const admin = profilo.ruolo === 'admin'

  // The recording of a held call (Dany, 16/10/2026): the link of Fathom, or «Call non registrata». Checked
  // before anything is saved, so a missing link never leaves half the work done. «Cambia esito» on a call
  // that already has its link, or a call from before the day it became required, is not asked.
  const scelta = 'registrazione' in v ? v.registrazione : undefined
  if (chiedeRegistrazione(v.esito)) {
    const [chiamata, registrata] = await Promise.all([
      supabase.from('calls').select('programmata_il, link_registrazione').eq('id', v.call_id).maybeSingle(),
      supabase.from('call_registrazioni').select('stato').eq('call_id', v.call_id).maybeSingle(),
    ])
    if (chiamata.error || registrata.error) return { ok: false, errore: 'Esito non salvato. Riprova.' }
    if (chiamata.data) {
      const mancante = registrazioneMancante(v.esito, scelta, {
        giorno: oggiRoma(new Date(chiamata.data.programmata_il)),
        haRegistrazione: chiamata.data.link_registrazione !== null || registrata.data !== null,
      })
      if (mancante) return { ok: false, errore: mancante }
    }
  }

  // "Sì, call fissata" (Dany, 07/10/2026): the follow-up call's day is checked
  // before the outcome is saved, so a wrong day never leaves half the work done
  const followUp = followUpEsito(v)
  if (followUp) {
    const { data: partenza, error } = await supabase.from('calls').select('programmata_il').eq('id', v.call_id).maybeSingle()
    if (error) return { ok: false, errore: 'Esito non salvato. Riprova.' }
    const problema = erroreGiornoFollowUp(
      { call_id: v.call_id, ...followUp },
      partenza ? { giorno: oggiRoma(new Date(partenza.programmata_il)), ora: formatOra(partenza.programmata_il) } : null,
      admin,
    )
    if (problema) return { ok: false, errore: problema }
  }

  // "Ha già una nuova data" moves the same call to its new day (Dany, 02/10/2026)
  const nuova = nuovaDataEsito(v)
  if (nuova) {
    const mossa = await sposta({ call_id: v.call_id, ...nuova }, admin)
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

  // the outcome is saved: then the recording (it never undoes the outcome), then the follow-up call, on its own day
  let avvisoRegistrazione: string | undefined
  if (scelta && chiedeRegistrazione(v.esito)) {
    const { error: erroreRegistrazione } = await supabase.rpc('collega_registrazione', {
      p_call_id: v.call_id,
      p_scelta: scelta,
    })
    if (erroreRegistrazione) avvisoRegistrazione = REGISTRAZIONE.avvisoNonSalvata
  }
  let fissata: EsitoFollowUp | null = null
  if (followUp) fissata = await fissa({ call_id: v.call_id, ...followUp }, admin)

  for (const pagina of PAGINE_DELLE_CALL) revalidatePath(pagina)

  return {
    ok: true,
    // A closed call goes straight to the prefilled sale
    vaiA: v.esito === 'chiusa' ? `/sales/new?call=${data.id}` : null,
    ...(avvisoRegistrazione ? { avvisoRegistrazione } : {}),
    ...(fissata?.ok ? { followUp: fissata.id } : {}),
    ...(fissata && !fissata.ok
      ? { avviso: FOLLOW_UP.nonFissata(fissata.errore.replace(/\.$/, '')), avvisoRiprova: !fissata.giaPresente }
      : {}),
  }
}

/** giaPresente: the call already has its follow-up call, so booking it again from the card never works. */
export type EsitoFollowUp = { ok: true; id: string } | { ok: false; errore: string; giaPresente?: boolean }

/**
 * "Fissa la call di follow-up" (Dany, 07/10/2026): a held call that ended in
 * follow-up gets its follow-up call on a day, as "Sì, call fissata" in the
 * outcome sheet. A new call, linked to the first one (calls.follow_up_di):
 * same lead, setter, closer and type, still to be held. The call's closer and
 * the admin (also a follow-up already held, up to a year back); one per call.
 * public.fissa_follow_up decides and says why in words. From the card and Alfire.
 */
export async function fissaFollowUp(input: unknown): Promise<EsitoFollowUp> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return { ok: false, errore: 'Sessione scaduta. Rientra e riprova.' }
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'closer') return { ok: false, errore: FOLLOW_UP.chiPuo }

  const esito = await fissa(input, profilo.ruolo === 'admin')
  if (esito.ok) for (const pagina of PAGINE_DELLE_CALL) revalidatePath(pagina)
  return esito
}

async function fissa(input: unknown, admin: boolean): Promise<EsitoFollowUp> {
  const parsed = schemaFollowUp(admin).safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? FOLLOW_UP.manca }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fissa_follow_up', {
    p_call_id: parsed.data.call_id,
    p_data: parsed.data.data,
    p_ora: parsed.data.ora,
  })
  if (error) {
    // P0002: the call is gone (or not readable); 22023 and 42501 are already in words
    const errore = error.code === 'P0002' ? error.message : messaggioErrore(error, 'Call di follow-up non fissata. Riprova.')
    return { ok: false, errore, giaPresente: error.code === '22023' && error.message.startsWith(FOLLOW_UP.giaPresente) }
  }
  return { ok: true, id: data }
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

  for (const pagina of [...PAGINE_DELLE_CALL, '/sales']) revalidatePath(pagina)
  return { ok: true }
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
