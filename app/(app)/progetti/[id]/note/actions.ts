'use server'

import { contestoApp } from '@/lib/progetti/app'
import * as operazioni from '@/lib/progetti/operazioni'

/**
 * Notes of a project. RLS decides: every member reads and writes, the author
 * (or the admin) edits and deletes. The bodies are in lib/progetti/operazioni.ts.
 */

export type Esito = { ok: true } | { ok: false; errore: string }

export async function aggiungiNota(input: unknown): Promise<Esito> {
  const esito = await operazioni.aggiungiNota(await contestoApp(), input)
  return esito.ok ? { ok: true } : esito
}

export async function modificaNota(input: unknown): Promise<Esito> {
  return operazioni.modificaNota(await contestoApp(), input)
}

export async function eliminaNota(input: unknown): Promise<Esito> {
  return operazioni.eliminaNota(await contestoApp(), input)
}
