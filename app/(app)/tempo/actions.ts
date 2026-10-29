'use server'

import { contestoApp } from '@/lib/progetti/app'
import * as operazioni from '@/lib/progetti/operazioni'

/**
 * Self-declared time (CLAUDE.md section 17: a statement of one's own work,
 * never monitoring). RLS decides: everyone writes only their own time, on the
 * projects they can see. Minutes of a timer or of a range are computed by the
 * database. The bodies are in lib/progetti/operazioni.ts, shared with Claude (MCP).
 */

export type Esito = { ok: true } | { ok: false; errore: string }
/** The entry a timer or a save created: Alfire corrects "the one just registered" by it. */
export type EsitoVoce = operazioni.EsitoVoce
export type EsitoFermo = operazioni.EsitoFermo

export async function avviaTimer(input: unknown): Promise<EsitoVoce> {
  return operazioni.avviaTimer(await contestoApp(), input)
}

export async function fermaTimer(input: unknown): Promise<EsitoFermo> {
  return operazioni.fermaTimer(await contestoApp(), input)
}

/** Pause and resume the running timer (1.66.0): its minutes leave out the pauses. */
export async function pausaTimer(): Promise<EsitoVoce> {
  return operazioni.pausaTimer(await contestoApp())
}

export async function riprendiTimer(): Promise<EsitoVoce> {
  return operazioni.riprendiTimer(await contestoApp())
}

/** Time typed afterwards: minutes, or "Dalle"–"Alle" on its day (pm_registra_tempo). */
export async function registraTempo(input: unknown): Promise<EsitoVoce> {
  return operazioni.registraTempo(await contestoApp(), input)
}

/** Correcting an entry (pm_modifica_tempo). */
export async function modificaTempo(input: unknown): Promise<Esito> {
  return operazioni.modificaTempo(await contestoApp(), input)
}

export async function eliminaTempo(input: unknown): Promise<Esito> {
  return operazioni.eliminaTempo(await contestoApp(), input)
}
