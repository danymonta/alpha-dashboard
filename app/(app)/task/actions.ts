'use server'

import { contestoApp } from '@/lib/progetti/app'
import * as operazioni from '@/lib/progetti/operazioni'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * The board of I miei task (1.75.0): a task of mine added from a column, and
 * a card moved to another column or given another priority. The bodies are in
 * lib/progetti/operazioni.ts, under the session's RLS like every task write.
 */
export async function aggiungiMioTask(input: unknown): Promise<Esito> {
  const esito = await operazioni.aggiungiMioTask(await contestoApp(), input)
  return esito.ok ? { ok: true } : esito
}

export async function aggiornaTaskRapido(input: unknown): Promise<Esito> {
  return operazioni.aggiornaTaskRapido(await contestoApp(), input)
}
