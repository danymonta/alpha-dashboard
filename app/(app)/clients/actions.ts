'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import * as clienti from '@/lib/clienti/operazioni'
import type { Esito, EsitoArchivio } from '@/lib/clienti/operazioni'
import { togliUtenteCliente } from '@/lib/percorso/pulizia'
import { createClient } from '@/lib/supabase/server'
import * as vendite from '@/lib/vendite/operazioni'
import type { AnteprimaInterruzione } from '@/lib/vendite/operazioni'

export type { AnteprimaInterruzione } from '@/lib/vendite/operazioni'
export type { Esito, EsitoArchivio } from '@/lib/clienti/operazioni'

/**
 * The writes of clients and of a path's interruption live in the shared cores
 * (lib/clienti/operazioni.ts, lib/vendite/operazioni.ts), the same ones
 * Claude's tools use (Claude a 360 gradi, phase 3): these actions add only the
 * cookie session. Deleting a client stays here: never from Claude.
 */
async function nucleo(): Promise<clienti.Contesto> {
  return { db: await createClient(), chi: getProfilo }
}

export async function aggiornaCliente(input: unknown): Promise<Esito> {
  return clienti.aggiornaCliente(await nucleo(), input)
}

/** A client before any sale ("mai attivato"): today only from Alfire. */
export async function creaCliente(input: unknown): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  return clienti.creaCliente(await nucleo(), input)
}

/** With its sales and their instalments: public.elimina_cliente. */
export async function eliminaCliente(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  // the client's access to the path (1.78.0): its user, read before the account goes with the client
  const { data: account } = await supabase
    .from('clienti_account')
    .select('user_id')
    .eq('client_id', parsed.data.id)
    .maybeSingle()
  const { error } = await supabase.rpc('elimina_cliente', { p_client_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non eliminato. Riprova.') }
  // the user of the access goes too; never stops the deletion: the evening's cleanup finds the rest
  if (account?.user_id) await togliUtenteCliente(account.user_id)

  for (const pagina of ['/clients', '/sales', '/payments', '/commissions', '/']) revalidatePath(pagina)
  // its project stays, without the link to the client
  revalidatePath('/progetti', 'layout')
  return { ok: true }
}

/** What "Interrompi il percorso" would do, before the confirmation: public.interrompi_percorso without running it. */
export async function anteprimaInterruzione(
  input: unknown,
): Promise<{ ok: true; anteprima: AnteprimaInterruzione } | { ok: false; errore: string }> {
  return vendite.anteprimaInterruzione(await nucleo(), input)
}

/** A client who stops early: the sale ends on that day, the unpaid instalments after it go if asked. */
export async function interrompiPercorso(input: unknown): Promise<Esito> {
  return vendite.interrompiPercorso(await nucleo(), input)
}

/** "Non rinnova" (04/10/2026): the client is closed from that day, with an optional reason. */
export async function chiudiCliente(input: unknown): Promise<Esito> {
  return clienti.chiudiCliente(await nucleo(), input)
}

/** "Archivia come ex cliente" (05/10/2026): a closed client goes into the archive from today. */
export async function archiviaCliente(input: unknown): Promise<EsitoArchivio> {
  return clienti.archiviaCliente(await nucleo(), input)
}

/** "Togli dall'archivio": back to "Chiuso"; from the toast's "Annulla" only the archive that tap wrote. */
export async function togliDallArchivio(input: unknown): Promise<Esito> {
  return clienti.togliDallArchivio(await nucleo(), input)
}

/** "Riapri": the closure goes, the status comes back from the sale dates. */
export async function riapriCliente(input: unknown): Promise<Esito> {
  return clienti.riapriCliente(await nucleo(), input)
}

/** "Sospendi" (21/10/2026): the client goes on hold from that day, with an optional reason. */
export async function sospendiCliente(input: unknown): Promise<Esito> {
  return clienti.sospendiCliente(await nucleo(), input)
}

/** "Riattiva": the hold goes, the status comes back from the sale dates. */
export async function riattivaCliente(input: unknown): Promise<Esito> {
  return clienti.riattivaCliente(await nucleo(), input)
}
