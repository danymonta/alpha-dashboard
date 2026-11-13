'use server'

import { getProfilo } from '@/lib/auth/session'
import * as onboarding from '@/lib/onboarding/operazioni'
import * as team from '@/lib/onboarding/operazioni-team'
import type { Esito, EsitoAvvio, EsitoLink } from '@/lib/onboarding/operazioni'
import { lavoraFoglioDopo } from '@/lib/percorso/foglio-lavoro'
import { createClient } from '@/lib/supabase/server'

export type { Esito, EsitoAvvio, EsitoLink } from '@/lib/onboarding/operazioni'

/**
 * The guided onboarding, release A (1.77.0): the writes live in the core
 * (lib/onboarding/operazioni.ts); these actions add only the cookie session of whoever
 * taps, never the service role, so RLS and the functions in SQL decide (admin only).
 * Every action revalidates /onboarding, the client's card and the sale's page (the core
 * does it). Not in Alfire, not in Claude.
 */
async function nucleo(): Promise<onboarding.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

/** The wizard «Nuovo cliente»: client, sale, project, people in charge and link, in one transaction. */
export async function nuovoCliente(input: unknown): Promise<EsitoAvvio> {
  return onboarding.nuovoCliente(await nucleo(), input)
}

/** «Avvia onboarding» on a «nuovo» sale that exists. */
export async function avviaOnboarding(input: unknown): Promise<EsitoAvvio> {
  return onboarding.avviaOnboarding(await nucleo(), input)
}

/** «Conferma pagamento»: the link turns active by hand; no cash-in is registered. */
export async function confermaPagamento(input: unknown): Promise<EsitoLink> {
  return onboarding.confermaPagamento(await nucleo(), input)
}

/** «Registra il consenso del genitore», for a minor. */
export async function registraConsensoGenitore(input: unknown): Promise<EsitoLink> {
  return onboarding.registraConsensoGenitore(await nucleo(), input)
}

/** «Revoca», with its reason. */
export async function revocaLink(input: unknown): Promise<EsitoLink> {
  return onboarding.revocaLink(await nucleo(), input)
}

/** «Riattiva» a revoked link. */
export async function riattivaLink(input: unknown): Promise<EsitoLink> {
  return onboarding.riattivaLink(await nucleo(), input)
}

/** «Rigenera link»: a new token, the one of before stops working. */
export async function rigeneraLink(input: unknown): Promise<EsitoLink> {
  return onboarding.rigeneraLink(await nucleo(), input)
}

/** Coach, reviewer and responsible of a client in onboarding. */
export async function impostaIncarichi(input: unknown): Promise<Esito> {
  return onboarding.impostaIncarichi(await nucleo(), input)
}

/** The client on Telegram: username and private group. */
export async function salvaTelegram(input: unknown): Promise<Esito> {
  return onboarding.salvaTelegram(await nucleo(), input)
}

/** Impostazioni › Onboarding. */
export async function salvaImpostazioni(input: unknown): Promise<Esito> {
  return onboarding.salvaImpostazioni(await nucleo(), input)
}

/** «Cliente di prova» (1.79.0): the link works with the client area closed. */
export async function segnaProva(input: unknown): Promise<EsitoLink> {
  return onboarding.segnaProva(await nucleo(), input)
}

/** «Elimina onboarding» (1.79.0): only before the client registers. */
export async function eliminaOnboarding(input: unknown): Promise<Esito> {
  return onboarding.eliminaOnboarding(await nucleo(), input)
}

/**
 * «Registra la revoca» of the consent on health data (1.80.0): answers and files deleted. From
 * 1.82.0 the row on the Google sheet is cleared too, after the answer, with the service role
 * (the queue retries a failure).
 */
export async function revocaConsenso(input: unknown): Promise<Esito> {
  const esito = await onboarding.revocaConsenso(await nucleo(), input)
  if (esito.ok) {
    lavoraFoglioDopo()
  }
  return esito
}

// ---------------------------------------------------------------------------
// Release B2 (1.81.0): the team's work, the coach in charge, the responsible and the admin
// (lib/onboarding/operazioni-team.ts). The functions in SQL decide who may.
// ---------------------------------------------------------------------------
export type { EsitoArea, EsitoTeam } from '@/lib/onboarding/operazioni-team'

/** «Conferma la call»: day, hour and the Meet link. */
export async function confermaCall(input: unknown): Promise<team.EsitoTeam> {
  return team.confermaCall(await nucleo(), input)
}

/** The outcome of a booked call: svolta, non presentato, spostata. */
export async function esitoCall(input: unknown): Promise<team.EsitoTeam> {
  return team.esitoCall(await nucleo(), input)
}

/** «Test ricevuti». */
export async function testRicevuti(input: unknown): Promise<team.EsitoTeam> {
  return team.testRicevuti(await nucleo(), input)
}

/** «Segna obiettivo impostato». */
export async function obiettivoImpostato(input: unknown): Promise<team.EsitoTeam> {
  return team.obiettivoImpostato(await nucleo(), input)
}

/** A delivery for the client: video, PDF or link. */
export async function aggiungiConsegna(input: unknown): Promise<team.EsitoTeam> {
  return team.aggiungiConsegna(await nucleo(), input)
}

export async function togliConsegna(input: unknown): Promise<team.EsitoTeam> {
  return team.togliConsegna(await nucleo(), input)
}

/** «Programma consegnato», with the first checkpoint. */
export async function consegnaProgramma(input: unknown): Promise<team.EsitoTeam> {
  return team.consegnaProgramma(await nucleo(), input)
}

/** The community: request approved, presentation checked. */
export async function segnaCommunity(input: unknown): Promise<team.EsitoTeam> {
  return team.segnaCommunity(await nucleo(), input)
}

/** «Sblocca step», with its reason. */
export async function sbloccaPasso(input: unknown): Promise<team.EsitoTeam> {
  return team.sbloccaPasso(await nucleo(), input)
}

/** «Riavvia onboarding», with its reason. */
export async function riavviaOnboarding(input: unknown): Promise<team.EsitoTeam> {
  return team.riavviaOnboarding(await nucleo(), input)
}

/** Impostazioni › Onboarding › «Area clienti»: open or close, with the database's checks. */
export async function apriAreaClienti(): Promise<team.EsitoArea> {
  return team.cambiaAreaClienti(await nucleo(), true)
}

export async function chiudiAreaClienti(): Promise<team.EsitoArea> {
  return team.cambiaAreaClienti(await nucleo(), false)
}
