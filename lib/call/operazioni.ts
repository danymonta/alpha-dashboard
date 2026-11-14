import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

import { funzioneMancante, messaggioErrore } from '@/lib/auth/azioni'
import type { AppRole } from '@/lib/auth/roles'
import { FOLLOW_UP } from '@/lib/call/follow-up'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { motivoNonSpostabile } from '@/lib/call/spostamento'
import { formatOra, oggiRoma } from '@/lib/date'
import type { Database } from '@/lib/supabase/database.types'
import {
  erroreGiornoFollowUp,
  modificaCallSchema,
  nuovaCallAdminSchema,
  nuovaCallSchema,
  schemaFollowUp,
  schemaSpostamento,
  type NuovaCallInput,
} from '@/lib/validation/call'
import { aggiornamentoDaEsito, esitoCallSchema, followUpEsito, nuovaDataEsito } from '@/lib/validation/esito'
import { aggiornaStatoLeadSchema, modificaLeadSchema } from '@/lib/validation/lead'
import { chiedeRegistrazione, registrazioneMancante, sceltaRegistrazioneSchema } from '@/lib/validation/registrazione'
import { z } from 'zod'
import { messaggioErroreFissa, rigaLogErroreFissa } from '@/lib/call/errore-fissa'

/**
 * The only way calls, leads and outcomes are written (Claude a 360 gradi,
 * phase 2, 23/10/2026): from the app (the server actions of /calls, /calls/new
 * and /leads, with the cookie session of whoever taps, and Alfire, which calls
 * those actions) and from Claude (the MCP tools, with the OAuth token of
 * whoever connected it). Same Zod schemas, same SQL, same messages; the client
 * is always the caller's, never the service role, so RLS and the functions in
 * SQL decide what actually happens. Who asks (`chi`) is read when the action
 * read it: the actions read the profile of the cookie session, the MCP route
 * passes the person behind the token. Every write revalidates the pages it
 * touches, so a change from Claude shows in the app too.
 */

export type Db = SupabaseClient<Database>

/** Who asks: the fields the guards read. */
export type Chi = { id: string; ruolo: AppRole; attivo: boolean }

export type Contesto = { db: Db; chi: () => Promise<Chi | null> }

const SESSIONE = 'Sessione scaduta. Rientra e riprova.'

/** Every page that lists calls or counts them by day. */
export const PAGINE_DELLE_CALL = ['/calls', '/', '/setting', '/setting/closer', '/setting/closer/giorno', '/leads', '/my-numbers']

function aggiornaCall() {
  for (const pagina of PAGINE_DELLE_CALL) revalidatePath(pagina)
}

export type EsitoModifica = { ok: true } | { ok: false; errore: string }

// ---------------------------------------------------------------------------
// The outcome
// ---------------------------------------------------------------------------
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
export async function registraEsito(ctx: Contesto, input: unknown): Promise<EsitoRegistrazione> {
  const parsed = esitoCallSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Esito non valido.' }
  }

  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: SESSIONE }
  }
  if (profilo.ruolo !== 'closer' && profilo.ruolo !== 'admin') {
    return { ok: false, errore: 'L’esito lo registra chi ha fatto la call.' }
  }

  const supabase = ctx.db
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
    const mossa = await sposta(ctx, { call_id: v.call_id, ...nuova }, admin)
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
  if (followUp) fissata = await fissa(ctx, { call_id: v.call_id, ...followUp }, admin)

  aggiornaCall()

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

// ---------------------------------------------------------------------------
// The follow-up call
// ---------------------------------------------------------------------------
/** giaPresente: the call already has its follow-up call, so booking it again from the card never works. */
export type EsitoFollowUp = { ok: true; id: string } | { ok: false; errore: string; giaPresente?: boolean }

/**
 * "Fissa la call di follow-up" (Dany, 07/10/2026): a held call that ended in
 * follow-up gets its follow-up call on a day, as "Sì, call fissata" in the
 * outcome sheet. A new call, linked to the first one (calls.follow_up_di):
 * same lead, setter, closer and type, still to be held. The call's closer and
 * the admin (also a follow-up already held, up to a year back); one per call.
 * public.fissa_follow_up decides and says why in words.
 */
export async function fissaFollowUp(ctx: Contesto, input: unknown): Promise<EsitoFollowUp> {
  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return { ok: false, errore: SESSIONE }
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'closer') return { ok: false, errore: FOLLOW_UP.chiPuo }

  const esito = await fissa(ctx, input, profilo.ruolo === 'admin')
  if (esito.ok) aggiornaCall()
  return esito
}

async function fissa(ctx: Contesto, input: unknown, admin: boolean): Promise<EsitoFollowUp> {
  const parsed = schemaFollowUp(admin).safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? FOLLOW_UP.manca }

  const { data, error } = await ctx.db.rpc('fissa_follow_up', {
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

// ---------------------------------------------------------------------------
// Moving and editing a call
// ---------------------------------------------------------------------------
/**
 * Move a call (Dany, 02/10/2026): the same call goes to its new day and time,
 * still to be held, with the trace "Spostata dal …" (public.sposta_call). The
 * closer his calls, the admin any (also to the past), the setter the calls he
 * booked while they are still to be held: the RPC decides with RLS and says
 * why in words.
 */
export async function spostaCall(ctx: Contesto, input: unknown): Promise<EsitoModifica> {
  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return { ok: false, errore: SESSIONE }
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'closer' && profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'Le call le spostano chi le ha fissate, il closer e l’admin.' }
  }
  return sposta(ctx, input, profilo.ruolo === 'admin')
}

async function sposta(ctx: Contesto, input: unknown, admin: boolean): Promise<EsitoModifica> {
  const parsed = schemaSpostamento(admin).safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const { error } = await ctx.db.rpc('sposta_call', {
    p_call_id: parsed.data.call_id,
    p_data: parsed.data.data,
    p_ora: parsed.data.ora,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Call non spostata. Riprova.') }

  aggiornaCall()
  return { ok: true }
}

/**
 * Reschedule, change type, closer or the setter's note; the closer and the
 * admin also record how the call went, with the closer's notes (dettagli_call).
 * Who may touch which call is decided by RLS inside the RPCs. The closer reads
 * the setter's note and never rewrites it: modifica_call keeps it for him.
 */
export async function modificaCall(ctx: Contesto, input: unknown): Promise<EsitoModifica> {
  const parsed = modificaCallSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return { ok: false, errore: SESSIONE }

  const v = parsed.data
  const supabase = ctx.db

  // the setter never changes the type: a call of his keeps the one it has. Read through
  // call_per_claude, where a setter's token of Claude reads the call too (never its link)
  let tipo = v.tipo
  if (profilo.ruolo === 'setter') {
    let { data: attuale, error: erroreLettura } = await supabase.rpc('call_per_claude', { p_id: v.call_id }).maybeSingle()
    if (funzioneMancante(erroreLettura)) {
      // 20261029090000 not applied yet: the app session reads its own call as before
      ;({ data: attuale, error: erroreLettura } = await supabase.from('calls').select('tipo').eq('id', v.call_id).maybeSingle())
    }
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

// ---------------------------------------------------------------------------
// The recording of a held call (1.37.0)
// ---------------------------------------------------------------------------
export const callIdSchema = z.object({ call_id: z.string().uuid('Call non valida') })

/** The call's closer and the admin: who records how the call went. */
export async function chiPuoRegistrare(ctx: Contesto): Promise<{ ok: true } | { ok: false; errore: string }> {
  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return { ok: false, errore: SESSIONE }
  if (profilo.ruolo !== 'closer' && profilo.ruolo !== 'admin') return { ok: false, errore: REGISTRAZIONE.soloChiHaFatto }
  return { ok: true }
}

/** «Aggiungi il link» / «Cambia» on the card, and «Call non registrata»: the same function the sheet uses. */
export async function collegaRegistrazione(ctx: Contesto, input: unknown): Promise<EsitoModifica> {
  const letto = callIdSchema.extend({ scelta: sceltaRegistrazioneSchema }).safeParse(input)
  if (!letto.success) return { ok: false, errore: letto.error.issues[0]?.message ?? 'Registrazione non valida.' }
  const chi = await chiPuoRegistrare(ctx)
  if (!chi.ok) return chi
  const { error } = await ctx.db.rpc('collega_registrazione', { p_call_id: letto.data.call_id, p_scelta: letto.data.scelta })
  if (error) return { ok: false, errore: error.code === '22023' || error.code === '42501' ? error.message : 'Registrazione non salvata. Riprova.' }
  aggiornaCall()
  return { ok: true }
}

/** «Scollega» on the card (the app only: from Claude a recording is never unlinked). */
export async function scollegaRegistrazione(ctx: Contesto, input: unknown): Promise<EsitoModifica> {
  const letto = callIdSchema.safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Call non valida.' }
  const chi = await chiPuoRegistrare(ctx)
  if (!chi.ok) return chi
  const { error } = await ctx.db.rpc('scollega_registrazione', { p_call_id: letto.data.call_id })
  if (error) return { ok: false, errore: error.code === '42501' ? error.message : 'Registrazione non tolta. Riprova.' }
  aggiornaCall()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Booking a call
// ---------------------------------------------------------------------------
export type EsitoNuovaCall =
  | {
      ok: true
      leadEsistente: boolean
      /** Where the new call shows, when not in "Le mie call": another closer's day. */
      vaiA: string | null
      /** The call and the lead just created (or reused): Claude reads them back by id. */
      callId?: string
      leadId?: string
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
export async function fissaCall(ctx: Contesto, input: unknown): Promise<EsitoNuovaCall> {
  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) {
    return { ok: false, errore: SESSIONE }
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
  const { data, error } = await ctx.db
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
    // 22023 is a rule of fissa_call, already worded for the user; anything else gets a precise
    // sentence with its code, and the code goes to the logs (never the lead)
    console.error(rigaLogErroreFissa(error))
    return { ok: false, errore: messaggioErroreFissa(error) }
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

  return { ok: true, leadEsistente: data.lead_esistente, vaiA, callId: data.id_call, leadId: data.id_lead }
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
/** Manual pipeline move. Who may do it is decided by public.aggiorna_stato_lead. */
export async function aggiornaStatoLead(ctx: Contesto, input: unknown): Promise<EsitoModifica> {
  const parsed = aggiornaStatoLeadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return { ok: false, errore: SESSIONE }

  const { error } = await ctx.db.rpc('aggiorna_stato_lead', {
    p_lead_id: parsed.data.lead_id,
    p_stato: parsed.data.stato,
  })

  if (error) {
    return { ok: false, errore: error.code === '42501' ? error.message : 'Stato non aggiornato. Riprova.' }
  }

  revalidatePath('/leads')
  revalidatePath('/')
  return { ok: true }
}

/** Name, handle, source, notes. RLS decides: the admin, or the setter on their own leads. The app only. */
export async function modificaLead(ctx: Contesto, input: unknown): Promise<EsitoModifica> {
  const parsed = modificaLeadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }

  const profilo = await ctx.chi()
  if (!profilo || !profilo.attivo) return { ok: false, errore: SESSIONE }
  if (profilo.ruolo !== 'admin' && profilo.ruolo !== 'setter') {
    return { ok: false, errore: 'I dati del lead li corregge il setter o l’admin.' }
  }

  const { id, ...campi } = parsed.data
  const { data, error } = await ctx.db.from('leads').update(campi).eq('id', id).select('id').maybeSingle()

  if (error) return { ok: false, errore: 'Lead non aggiornato. Riprova.' }
  if (!data) return { ok: false, errore: 'Lead non trovato o non tuo.' }

  revalidatePath('/leads')
  revalidatePath('/calls')
  return { ok: true }
}
