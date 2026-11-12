import 'server-only'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

import { negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import type { Json } from '@/lib/supabase/database.types'
import {
  ERRORI_ONBOARDING,
  avviaOnboardingSchema,
  consensoGenitoreSchema,
  eStatoInvito,
  impostazioniOnboardingSchema,
  incarichiSchema,
  invitoSchema,
  revocaSchema,
  telegramClienteSchema,
  validaNuovoCliente,
  type CampiWizard,
  type ClienteOnboarding,
  type StatoInvito,
} from '@/lib/validation/onboarding'
import { PERSONALIZZATO } from '@/lib/validation/vendita'

/**
 * The only way an onboarding is written from the app (1.77.0, release A): the wizard
 * «Nuovo cliente», «Avvia onboarding» on a sale that exists, the actions on a link, the
 * people in charge, Telegram and the settings. The same shape as the other cores
 * (lib/vendite, lib/clienti): the client is the caller's (the cookie session), never the
 * service role, so RLS and the functions in SQL decide (20261108090200: security invoker,
 * admin only, never an OAuth token). The admin only; Alfire and Claude have no tool here.
 */

export type { Contesto } from '@/lib/call/operazioni'

const E = ERRORI_ONBOARDING

export type Esito = { ok: true } | { ok: false; errore: string }

/** The start of an onboarding: the ids to go on from, and the state the link was born in. */
export type EsitoAvvio =
  | { ok: true; idCliente: string; idInvito: string; idVendita: string; stato: StatoInvito }
  | {
      ok: false
      errore: string
      campi?: CampiWizard
      /** The call already has its sale: the wizard offers «Avvia onboarding» on that one. */
      idEsistente?: string
    }

/** An action on a link: the client it belongs to and the state it is in now. */
export type EsitoLink = { ok: true; idCliente: string; stato: StatoInvito } | { ok: false; errore: string }

type ErroreDb = { code?: string; message: string }

async function nega(ctx: Contesto): Promise<string | null> {
  return negaPer(await ctx.chi(), ['admin'], E.soloAdmin)
}

function primo(parsed: { error: z.ZodError }): string {
  return parsed.error.issues[0]?.message ?? E.nonValidi
}

/** Postgres' own words: a write refused by RLS, a privilege or a check inside the functions. */
const PAROLE_DI_POSTGRES = /^(new row|permission denied|null value|duplicate key|insert or update|update or delete)|violates|constraint/i

/**
 * The functions of the onboarding raise 22023 and 42501 with a message already worded for
 * people (and registra_vendita, inside the wizard, its 23514). The same codes come from a write
 * refused by RLS, a privilege or a check, with Postgres' own English words: those answer with
 * the fallback.
 */
function messaggio(error: ErroreDb, fallback: string): string {
  const nostro = error.code === '22023' || error.code === '42501' || error.code === '23514'
  return nostro && !PAROLE_DI_POSTGRES.test(error.message) ? error.message : fallback
}

/** The pages that show an onboarding, its link or its project. */
function aggiornaOnboarding(idCliente?: string) {
  revalidatePath('/onboarding', 'layout')
  revalidatePath('/clients')
  revalidatePath('/clients/[id]', 'page')
  if (idCliente) revalidatePath(`/clients/${idCliente}`)
  revalidatePath('/sales')
  revalidatePath('/sales/[id]', 'page')
  revalidatePath('/calls')
  // the project opens at the start, coach and reviewer join it when the link turns active
  revalidatePath('/progetti', 'layout')
  revalidatePath('/task')
}

/** A new sale as well: every page «Nuova vendita» refreshes (lib/vendite/operazioni.ts). */
function aggiornaVendita() {
  for (const percorso of ['/', '/payments', '/my-sales', '/commissions']) revalidatePath(percorso)
}

/**
 * A link that turns active writes a notification for the admins: the bell lives in the
 * app's shell, above every page.
 */
function aggiornaDopo(stato: StatoInvito, idCliente: string) {
  if (stato === 'attivo') revalidatePath('/', 'layout')
  else aggiornaOnboarding(idCliente)
}

type RispostaAvvio = { invito_id: string; client_id: string; stato: StatoInvito; sale_id?: string }

/** The jsonb the functions return ({ invito_id, client_id, stato } and, for the wizard, sale_id). */
function leggiRisposta(data: unknown): RispostaAvvio | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const r = data as Record<string, unknown>
  if (typeof r.invito_id !== 'string' || typeof r.client_id !== 'string' || !eStatoInvito(r.stato)) return null
  return {
    invito_id: r.invito_id,
    client_id: r.client_id,
    stato: r.stato,
    ...(typeof r.sale_id === 'string' ? { sale_id: r.sale_id } : {}),
  }
}

/** The contacts of the screen «Cliente»: every field shown is written, an emptied one empty. */
function contatti(c: ClienteOnboarding) {
  return {
    nome: c.nome,
    cognome: c.cognome,
    email: c.email,
    telefono: c.telefono,
    instagram_handle: c.instagram_handle,
  }
}

/** Only the keys with a value: jsonb for the functions that read their arguments by name. */
function senzaVuoti(oggetto: { [chiave: string]: Json | undefined }): { [chiave: string]: Json } {
  const pieno: { [chiave: string]: Json } = {}
  for (const [chiave, valore] of Object.entries(oggetto)) {
    if (valore !== null && valore !== undefined) pieno[chiave] = valore
  }
  return pieno
}

// ---------------------------------------------------------------------------
// The start
// ---------------------------------------------------------------------------
/**
 * The wizard «Nuovo cliente»: the sale and the onboarding in one transaction
 * (public.nuovo_cliente = registra_vendita + avvia_onboarding). If a step fails nothing
 * stays half done. The sale goes through nuovaVenditaSchema, the rules of «Nuova vendita».
 */
export async function nuovoCliente(ctx: Contesto, input: unknown): Promise<EsitoAvvio> {
  const valido = validaNuovoCliente(input)
  if (!valido.ok) return { ok: false, errore: E.controlla, campi: valido.campi }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { cliente, vendita: v, team } = valido.dati
  const personalizzato = v.product_id === PERSONALIZZATO
  const { data, error } = await ctx.db.rpc('nuovo_cliente', {
    p_vendita: senzaVuoti({
      // a custom path has no catalogue product
      product_id: personalizzato ? null : v.product_id,
      data_vendita: v.data_vendita,
      data_inizio: v.data_inizio,
      valore_contratto: v.valore_contratto,
      numero_rate: v.numero_rate,
      call_id: v.call_id,
      client_id: v.client_id,
      nome: v.nome,
      cognome: v.cognome,
      email: v.email,
      telefono: v.telefono,
      instagram_handle: v.instagram_handle,
      note: v.note,
      prodotto_personalizzato: personalizzato ? v.prodotto_personalizzato : null,
      data_fine: v.data_fine,
      rate: v.piano === 'personalizzato' ? v.rate.map((r) => ({ scadenza: r.scadenza, importo: r.importo })) : null,
    }),
    p_onboarding: {
      ...senzaVuoti({ coach: team.coach, revisore: team.revisore }),
      // always given: an emptied username is taken away (null would leave it as it is)
      telegram: cliente.telegram ?? '',
      responsabile: team.responsabile,
      contatti: contatti(cliente),
      minorenne: cliente.minorenne,
    },
  })

  if (error) {
    if (error.code === '23505') {
      // the call already has its sale (sales_una_per_call), or the client a living link
      if (v.call_id) {
        const { data: esistente } = await ctx.db.from('sales').select('id').eq('call_id', v.call_id).maybeSingle()
        if (esistente) return { ok: false, errore: E.callConVendita, idEsistente: esistente.id }
      }
      return { ok: false, errore: E.giaAvviato }
    }
    return { ok: false, errore: messaggio(error, E.nonAvviato) }
  }

  // written: the pages refresh whatever the answer looks like
  aggiornaVendita()
  aggiornaOnboarding()
  const r = leggiRisposta(data)
  if (!r || !r.sale_id) return { ok: false, errore: E.risposta }
  if (r.stato === 'attivo') revalidatePath('/', 'layout')
  return { ok: true, idCliente: r.client_id, idInvito: r.invito_id, idVendita: r.sale_id, stato: r.stato }
}

/**
 * «Avvia onboarding» on a «nuovo» sale that exists (registered from «Nuova vendita»,
 * Alfire or Claude): the screens «Cliente» and «Team». With money already cashed the link
 * is born active.
 */
export async function avviaOnboarding(ctx: Contesto, input: unknown): Promise<EsitoAvvio> {
  const parsed = avviaOnboardingSchema.safeParse(input)
  if (!parsed.success) {
    const campi: CampiWizard = {}
    for (const issue of parsed.error.issues) {
      const [schermata, campo] = issue.path
      if ((schermata === 'cliente' || schermata === 'team') && typeof campo === 'string') {
        const dove = (campi[schermata] ??= {}) as Record<string, string>
        dove[campo] ??= issue.message
      }
    }
    return Object.keys(campi).length > 0
      ? { ok: false, errore: E.controlla, campi }
      : { ok: false, errore: primo(parsed) }
  }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { sale_id, cliente, team } = parsed.data
  const { data, error } = await ctx.db.rpc('avvia_onboarding', {
    p_sale_id: sale_id,
    // nobody for the coach or the reviewer: the function takes null
    p_coach: team.coach as string,
    p_revisore: team.revisore as string,
    p_responsabile: team.responsabile,
    p_contatti: contatti(cliente),
    // an emptied username is taken away (null would leave it as it is)
    p_telegram: cliente.telegram ?? '',
    p_minorenne: cliente.minorenne,
  })
  if (error) {
    return { ok: false, errore: error.code === '23505' ? E.giaAvviato : messaggio(error, E.nonAvviato) }
  }

  aggiornaOnboarding()
  const r = leggiRisposta(data)
  if (!r) return { ok: false, errore: E.risposta }
  if (r.stato === 'attivo') revalidatePath('/', 'layout')
  return { ok: true, idCliente: r.client_id, idInvito: r.invito_id, idVendita: sale_id, stato: r.stato }
}

// ---------------------------------------------------------------------------
// The admin's actions on a link: each one leaves its line in the log (SQL)
// ---------------------------------------------------------------------------
function esitoLink(data: unknown, error: ErroreDb | null, fallback: string): EsitoLink {
  if (error) return { ok: false, errore: messaggio(error, fallback) }
  const r = leggiRisposta(data)
  if (!r) {
    aggiornaOnboarding()
    return { ok: false, errore: fallback }
  }
  aggiornaDopo(r.stato, r.client_id)
  return { ok: true, idCliente: r.client_id, stato: r.stato }
}

/**
 * «Conferma pagamento»: the link waiting for the payment turns active, by hand. No cash-in
 * is registered. A minor without a parent's consent stays waiting (the state says so).
 */
export async function confermaPagamento(ctx: Contesto, input: unknown): Promise<EsitoLink> {
  const parsed = invitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_conferma_pagamento', { p_invito: parsed.data.invito_id })
  return esitoLink(data, error, E.nonConfermato)
}

/** The consent of a parent, for a minor: the link turns active if it was paid or confirmed already. */
export async function registraConsensoGenitore(ctx: Contesto, input: unknown): Promise<EsitoLink> {
  const parsed = consensoGenitoreSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_consenso_genitore', {
    p_invito: parsed.data.invito_id,
    p_nota: parsed.data.nota as string,
  })
  return esitoLink(data, error, E.consensoNonRegistrato)
}

/** «Revoca», with its reason: the link stops working and the path is suspended. */
export async function revocaLink(ctx: Contesto, input: unknown): Promise<EsitoLink> {
  const parsed = revocaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_revoca', {
    p_invito: parsed.data.invito_id,
    p_motivo: parsed.data.motivo,
  })
  return esitoLink(data, error, E.nonRevocato)
}

/** «Riattiva»: a revoked link goes back to what it was, active or waiting for the payment. */
export async function riattivaLink(ctx: Contesto, input: unknown): Promise<EsitoLink> {
  const parsed = invitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_riattiva', { p_invito: parsed.data.invito_id })
  return esitoLink(data, error, E.nonRiattivato)
}

/** «Rigenera link»: a new token on the same link, not used yet; the one of before stops working. */
export async function rigeneraLink(ctx: Contesto, input: unknown): Promise<EsitoLink> {
  const parsed = invitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_rigenera_link', { p_invito: parsed.data.invito_id })
  return esitoLink(data, error, E.nonRigenerato)
}

// ---------------------------------------------------------------------------
// The people in charge, Telegram, the settings
// ---------------------------------------------------------------------------
/** Coach, reviewer and responsible of a client in onboarding: with an active link project and tasks follow. */
export async function impostaIncarichi(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = incarichiSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { error } = await ctx.db.rpc('onboarding_imposta_incarichi', {
    p_client_id: v.client_id,
    p_coach: v.coach as string,
    p_revisore: v.revisore as string,
    p_responsabile: v.responsabile,
  })
  if (error) return { ok: false, errore: messaggio(error, E.incarichiNonSalvati) }

  aggiornaOnboarding(v.client_id)
  return { ok: true }
}

/** The client on Telegram, from the card: username and private group (its own table, the admin's). */
export async function salvaTelegram(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = telegramClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { client_id, username, gruppo_privato_url } = parsed.data
  const { error } = await ctx.db
    .from('clienti_telegram')
    .upsert({ client_id, username, gruppo_privato_url }, { onConflict: 'client_id' })
  if (error) return { ok: false, errore: E.telegramNonSalvato }

  revalidatePath('/onboarding', 'layout')
  return { ok: true }
}

/**
 * Impostazioni › Onboarding: the people the wizard proposes, the community's link, the
 * days a link lasts. aperto_ai_clienti is never written from a session (no grant on it).
 */
export async function salvaImpostazioni(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = impostazioniOnboardingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const profilo = await ctx.chi()
  const negato = negaPer(profilo, ['admin'], E.soloAdmin)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db
    .from('onboarding_impostazioni')
    .update({ ...parsed.data, updated_by: profilo?.id ?? null })
    .eq('id', true)
    .select('id')
    .maybeSingle()
  // 23503: a person deleted meanwhile
  if (error) return { ok: false, errore: error.code === '23503' ? E.persona : E.impostazioniNonSalvate }
  if (!data) return { ok: false, errore: E.impostazioniNonSalvate }

  revalidatePath('/onboarding', 'layout')
  revalidatePath('/settings', 'layout')
  return { ok: true }
}
