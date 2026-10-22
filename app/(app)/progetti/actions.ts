'use server'

import { contestoApp } from '@/lib/progetti/app'
import * as operazioni from '@/lib/progetti/operazioni'

export type EsitoCreazione = { ok: true; id: string } | { ok: false; errore: string }

/**
 * pm_crea_progetto does it all in one transaction: the project, its members
 * (the creator included) and, from a template, its dated lists and tasks.
 * It also refuses a client link from anybody but the app admin. The body is
 * in lib/progetti/operazioni.ts, shared with Claude (MCP).
 */
export async function creaProgetto(input: unknown): Promise<EsitoCreazione> {
  return operazioni.creaProgetto(await contestoApp(), input)
}
