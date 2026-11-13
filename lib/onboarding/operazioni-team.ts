import 'server-only'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

import { negaPer } from '@/lib/auth/azioni'
import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import type { Contesto } from '@/lib/call/operazioni'
import { istanteRoma } from '@/lib/date'
import { avvisaCliente, type AvvisoCliente } from '@/lib/percorso/tocca-a-te'
import { ERRORI_ONBOARDING_TEAM as E } from '@/lib/validation/onboarding-team'
import {
  clienteTeamSchema,
  communitySchema,
  confermaCallSchema,
  consegnaSchema,
  esitoCallSchema,
  programmaSchema,
  riavviaSchema,
  sbloccaPassoSchema,
  togliConsegnaSchema,
} from '@/lib/validation/onboarding-team'

/**
 * The team's work on an onboarding (release B2, 1.81.0, docs/onboarding/rilascio-b.md,
 * «Funzioni del team»): the coach in charge, the responsible (the community only) and the
 * admin. The caller's client (the cookie session), never the service role for the writes:
 * the functions in SQL decide who may (onboarding_guardia_team, 42501 for anybody else and
 * for Claude's tokens). When the client's turn comes back, the client is told («Tocca a te»,
 * lib/onboarding/avviso.ts) and the page gets only whether the email left, or the message to
 * copy for Telegram. Never Alfire, never Claude.
 */

export type EsitoTeam = { ok: true; avviso?: AvvisoCliente } | { ok: false; errore: string }
export type EsitoArea = { ok: true; aperto: boolean } | { ok: false; errore: string }

type ErroreDb = { code?: string; message: string }

/** Postgres' own words: a write refused by RLS, a privilege or a check (never shown as they are). */
const PAROLE_DI_POSTGRES = /^(new row|permission denied|null value|duplicate key|insert or update|update or delete)|violates|constraint/i

function messaggio(error: ErroreDb, fallback: string): string {
  const nostro = error.code === '22023' || error.code === '42501'
  return nostro && !PAROLE_DI_POSTGRES.test(error.message) ? error.message : fallback
}

function primo(parsed: { error: z.ZodError }): string {
  return parsed.error.issues[0]?.message ?? E.nonFatto
}

/** Any active person of the team reaches the function: it is the function that says who may. */
async function nega(ctx: Contesto): Promise<string | null> {
  return negaPer(await ctx.chi(), TUTTI_I_RUOLI, E.sessione)
}

/**
 * The onboarding's pages, the projects' tasks the functions complete or date, and the bell
 * (the functions tell the people in charge): the whole app, once.
 */
function aggiorna() {
  revalidatePath('/', 'layout')
}

type Risposta = { client_id?: unknown; avviso?: unknown; avvisa_cliente_email?: unknown }

function oggetto(data: unknown): Risposta {
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Risposta) : {}
}

/** After a write: the notice to the client when the function says his turn is back. */
async function dopo(data: unknown, riferimento: string): Promise<EsitoTeam> {
  aggiorna()
  const r = oggetto(data)
  if (typeof r.avviso !== 'string' || typeof r.client_id !== 'string') return { ok: true }
  const avviso = await avvisaCliente({
    clientId: r.client_id,
    motivo: r.avviso,
    riferimento,
    viaEmail: r.avvisa_cliente_email !== false,
  })
  return { ok: true, avviso }
}

/** «Conferma la call»: the call the client booked, with the Meet link; day and hour can be corrected. */
export async function confermaCall(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = confermaCallSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const inizio = istanteRoma(v.giorno, v.ora)
  const { data, error } = await ctx.db.rpc('onboarding_call_conferma', {
    p_client_id: v.client_id,
    p_inizio: inizio,
    p_meet_url: v.meet_url,
  })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  return dopo(data, `conferma/${inizio}`)
}

/** The outcome of a booked call (onboarding or checkpoint): svolta, non presentato, spostata with its new day. */
export async function esitoCall(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = esitoCallSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const nuovo = v.esito === 'svolta' || !v.giorno || !v.ora ? null : istanteRoma(v.giorno, v.ora)
  const { data, error } = await ctx.db.rpc('onboarding_call_esito', {
    p_call_id: v.call_id,
    p_esito: v.esito,
    ...(nuovo ? { p_nuovo_inizio: nuovo } : {}),
  })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  return dopo(data, `esito/${v.call_id}/${v.esito}/${nuovo ?? ''}`)
}

/** «Test ricevuti»: the test week done, the programme to prepare, the reviewer told. */
export async function testRicevuti(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = clienteTeamSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_test_ricevuti', { p_client_id: parsed.data.client_id })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  return dopo(data, 'test')
}

/** «Segna obiettivo impostato»: the goal set on Coach Plus after the call; the client is told («Tocca a te»). */
export async function obiettivoImpostato(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = clienteTeamSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('onboarding_obiettivo_impostato', { p_client_id: parsed.data.client_id })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  return dopo(data, 'obiettivo')
}

/** A delivery for the client: a YouTube video (it can be compulsory), a PDF or a link. */
export async function aggiungiConsegna(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = consegnaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { error } = await ctx.db.rpc('onboarding_consegna_aggiungi', {
    p_client_id: v.client_id,
    p_tipo: v.tipo,
    p_titolo: v.titolo,
    p_url: v.url,
    p_obbligatoria: v.obbligatoria,
  })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  aggiorna()
  return { ok: true }
}

export async function togliConsegna(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = togliConsegnaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { error } = await ctx.db.rpc('onboarding_consegna_togli', { p_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  aggiorna()
  return { ok: true }
}

/** «Programma consegnato», with the first checkpoint: the client watches the compulsory videos and starts. */
export async function consegnaProgramma(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = programmaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db.rpc('onboarding_programma_consegnato', {
    p_client_id: v.client_id,
    p_primo_checkpoint: istanteRoma(v.giorno, v.ora),
  })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  const checkpoint = oggetto(data) as { checkpoint_id?: unknown }
  return dopo(data, `programma/${typeof checkpoint.checkpoint_id === 'string' ? checkpoint.checkpoint_id : ''}`)
}

/** The community: the request to join approved, the presentation checked (also the responsible). */
export async function segnaCommunity(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = communitySchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { error } = await ctx.db.rpc('onboarding_community', {
    p_client_id: parsed.data.client_id,
    p_azione: parsed.data.azione,
  })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  aggiorna()
  return { ok: true }
}

/** «Sblocca step», with its reason (it stays in the log, which only the admin reads). */
export async function sbloccaPasso(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = sbloccaPassoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db.rpc('onboarding_sblocca_passo', {
    p_client_id: v.client_id,
    p_passo: v.passo,
    p_motivo: v.motivo,
  })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  return dopo(data, `sblocca/${v.passo}/${new Date().toISOString().slice(0, 16)}`)
}

/** «Riavvia onboarding», with its reason: every step locked again but rules and questionnaire. */
export async function riavviaOnboarding(ctx: Contesto, input: unknown): Promise<EsitoTeam> {
  const parsed = riavviaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db.rpc('onboarding_riavvia', { p_client_id: v.client_id, p_motivo: v.motivo })
  if (error) return { ok: false, errore: messaggio(error, E.nonFatto) }
  return dopo(data, `riavvia/${new Date().toISOString().slice(0, 16)}`)
}

/**
 * «Apri ai clienti» and «Chiudi ai clienti» (Impostazioni › Onboarding): the functions check
 * what is missing before opening (22023 with the list in words) and give the active links
 * their days. Admin only; never a direct write of aperto_ai_clienti (a trigger refuses it).
 */
export async function cambiaAreaClienti(ctx: Contesto, aprire: boolean): Promise<EsitoArea> {
  const negato = negaPer(await ctx.chi(), ['admin'], E.soloAdminArea)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = aprire
    ? await ctx.db.rpc('onboarding_apri_ai_clienti')
    : await ctx.db.rpc('onboarding_chiudi_ai_clienti')
  if (error) return { ok: false, errore: messaggio(error, E.areaNonCambiata) }
  aggiorna()
  const r = data && typeof data === 'object' && !Array.isArray(data) ? (data as { aperto?: unknown }) : {}
  return { ok: true, aperto: r.aperto === true }
}
