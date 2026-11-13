'use server'

import { getProfilo } from '@/lib/auth/session'
import * as onboarding from '@/lib/onboarding/operazioni'
import type { Esito, EsitoAvvio, EsitoLink } from '@/lib/onboarding/operazioni'
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

/** «Cliente di prova» (1.78.0): the link works with the client area closed. */
export async function segnaProva(input: unknown): Promise<EsitoLink> {
  return onboarding.segnaProva(await nucleo(), input)
}

/** «Elimina onboarding» (1.78.0): only before the client registers. */
export async function eliminaOnboarding(input: unknown): Promise<Esito> {
  return onboarding.eliminaOnboarding(await nucleo(), input)
}
