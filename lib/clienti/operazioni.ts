import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import { oggiRoma } from '@/lib/date'
import { clienteSchema } from '@/lib/validation/anagrafiche'
import { archivioClienteSchema, chiusuraClienteSchema, togliArchivioSchema } from '@/lib/validation/chiusura'
import {
  ERRORE_SOSPENDI_CHIUSO,
  ERRORE_SOSPENDI_SENZA_PERCORSO,
  riattivaClienteSchema,
  sospensioneClienteSchema,
} from '@/lib/validation/sospensione'

/**
 * The only way clients and their status (closure, archive, hold) are written
 * (Claude a 360 gradi, phase 3, 23/10/2026): from the app (the server actions
 * of /clients, with the cookie session, and Alfire, which calls those actions)
 * and from Claude (the MCP tools, with the OAuth token of whoever connected
 * it). Same Zod schemas, same SQL, same messages; the client is always the
 * caller's, never the service role. The admin only (the business coach reads
 * and never writes). Deleting a client stays in the actions: never from Claude.
 */

export type { Contesto } from '@/lib/call/operazioni'

export type Esito = { ok: true } | { ok: false; errore: string }

async function nega(ctx: Contesto): Promise<string | null> {
  return negaPer(await ctx.chi(), ['admin'])
}

export async function aggiornaCliente(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = clienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const { error } = await ctx.db.from('clients').update(campi).eq('id', id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non aggiornato. Riprova.') }

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { ok: true }
}

export const nuovoClienteSchema = clienteSchema.omit({ id: true })

/** A client before any sale ("mai attivato"): from Alfire and Claude. */
export async function creaCliente(ctx: Contesto, input: unknown): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  const parsed = nuovoClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('clients').insert(parsed.data).select('id').single()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non creato. Riprova.') }

  revalidatePath('/clients')
  return { ok: true, id: data.id }
}

/** Every page that lists a client by status: Clienti, Rinnovi, the Panoramica box. */
function rivalidaStatoCliente(clientId: string) {
  revalidatePath('/clients', 'layout')
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/rinnovi')
  revalidatePath('/')
}

/**
 * "Non rinnova" (04/10/2026): the client is closed from that day, with an
 * optional reason. Its own table, admin only (RLS); the database refuses a day
 * in the future or before the client's latest path was signed. Closing again
 * replaces the day and the reason.
 */
export async function chiudiCliente(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = chiusuraClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { client_id, chiuso_il, motivo } = parsed.data
  const { error } = await ctx.db
    .from('clienti_chiusure')
    .upsert({ client_id, chiuso_il, motivo }, { onConflict: 'client_id' })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non chiuso. Riprova.') }

  rivalidaStatoCliente(client_id)
  return { ok: true }
}

/**
 * The archive: the day it holds, and whether this tap wrote it or found it
 * already there. Written by this tap, `versione` is the closure's updated_at
 * right after the write: the toast's "Annulla" undoes the archive only while
 * the closure is still at that version.
 */
export type EsitoArchivio =
  | { ok: true; archiviato_il: string; gia: false; versione: string }
  | { ok: true; archiviato_il: string; gia: true }
  | { ok: false; errore: string }

/**
 * "Archivia come ex cliente" (05/10/2026): a closed client who did not buy
 * again goes into the archive, ex cliente, from today. Only a closure in
 * force (v_clienti_chiusi): a client who is not closed has nothing to archive.
 * One archived meanwhile (another tab, Alfire) keeps his day and says so
 * (`gia`): the toast then offers no "Annulla" that would undo it. Archived by
 * this tap, the answer carries the closure's version (`versione`) for that
 * "Annulla": the day alone is not enough, it is always today.
 */
export async function archiviaCliente(ctx: Contesto, input: unknown): Promise<EsitoArchivio> {
  const parsed = archivioClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { client_id } = parsed.data
  const supabase = ctx.db
  const { data: chiusura, error: errLettura } = await supabase
    .from('v_clienti_chiusi')
    .select('archiviato_il')
    .eq('client_id', client_id)
    .maybeSingle()
  if (errLettura) return { ok: false, errore: messaggioErrore(errLettura, 'Cliente non archiviato. Riprova.') }
  if (!chiusura) return { ok: false, errore: 'Il cliente non è chiuso: prima «Non rinnova», poi l’archivio.' }
  if (chiusura.archiviato_il) {
    rivalidaStatoCliente(client_id)
    return { ok: true, archiviato_il: chiusura.archiviato_il, gia: true }
  }

  const giorno = oggiRoma()
  const { data, error } = await supabase
    .from('clienti_chiusure')
    .update({ archiviato_il: giorno })
    .eq('client_id', client_id)
    .is('archiviato_il', null)
    .select('updated_at')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non archiviato. Riprova.') }
  if (data.length === 0) {
    // archived, or reopened, between the read and the write
    const { data: ora } = await supabase
      .from('v_clienti_chiusi')
      .select('archiviato_il')
      .eq('client_id', client_id)
      .maybeSingle()
    rivalidaStatoCliente(client_id)
    if (ora?.archiviato_il) return { ok: true, archiviato_il: ora.archiviato_il, gia: true }
    return { ok: false, errore: 'Il cliente non è più chiuso: ricarica la pagina.' }
  }

  rivalidaStatoCliente(client_id)
  return { ok: true, archiviato_il: giorno, gia: false, versione: data[0].updated_at }
}

/**
 * "Togli dall'archivio": back to "Chiuso", the closure stays as it was. Only
 * on a closure in force. From the toast's "Annulla" (`solo_se_versione`): only
 * the archive that tap wrote, i.e. the closure still at the updated_at
 * archiviaCliente returned. Any write since (an archive undone and written
 * again elsewhere, even the same day; the day or the reason corrected; a
 * reopening and a new closure) moves updated_at, and the archive stays.
 */
export async function togliDallArchivio(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = togliArchivioSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { client_id, solo_se_versione } = parsed.data
  const supabase = ctx.db
  const { data: chiusura, error: errLettura } = await supabase
    .from('v_clienti_chiusi')
    .select('archiviato_il')
    .eq('client_id', client_id)
    .maybeSingle()
  if (errLettura) return { ok: false, errore: messaggioErrore(errLettura, 'Cliente non tolto dall’archivio. Riprova.') }
  if (!chiusura) return { ok: false, errore: 'Il cliente non è chiuso: non c’è niente da togliere dall’archivio.' }

  let modifica = supabase.from('clienti_chiusure').update({ archiviato_il: null }).eq('client_id', client_id)
  if (solo_se_versione) modifica = modifica.eq('updated_at', solo_se_versione)
  const { data, error } = await modifica.select('client_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non tolto dall’archivio. Riprova.') }
  if (data.length === 0) {
    rivalidaStatoCliente(client_id)
    return solo_se_versione
      ? { ok: false, errore: 'Nel frattempo la chiusura è cambiata: l’archivio resta com’è. Ricarica la pagina.' }
      : { ok: false, errore: 'Il cliente non è chiuso: non c’è niente da togliere dall’archivio.' }
  }

  rivalidaStatoCliente(client_id)
  return { ok: true }
}

const riapriSchema = z.object({ client_id: z.string().uuid() })

/**
 * "Riapri": the closure goes, the status comes back from the sale dates
 * (public.riapri_cliente, the only way a deletion of a closure passes for
 * Claude's token; 20261030090000).
 */
export async function riapriCliente(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = riapriSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { error } = await ctx.db.rpc('riapri_cliente', { p_client_id: parsed.data.client_id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non riaperto. Riprova.') }

  rivalidaStatoCliente(parsed.data.client_id)
  return { ok: true }
}

/**
 * "Sospendi" (21/10/2026): the client goes on hold from that day, with an
 * optional reason. Its own table, admin only (RLS); the path and the
 * instalments do not change. A closed client has nothing to put on hold (the
 * closure wins), and neither has one without a path. Suspending again replaces
 * the day and the reason. The database ends the hold by itself when the client
 * is closed or buys again: the pages refresh the same way.
 */
export async function sospendiCliente(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = sospensioneClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  const { client_id, sospeso_il, motivo } = parsed.data
  const supabase = ctx.db
  const [chiusura, cliente] = await Promise.all([
    supabase.from('v_clienti_chiusi').select('client_id').eq('client_id', client_id).maybeSingle(),
    supabase.from('v_clienti').select('numero_vendite').eq('client_id', client_id).maybeSingle(),
  ])
  if (chiusura.error || cliente.error) return { ok: false, errore: 'Cliente non sospeso. Riprova.' }
  if (!cliente.data) return { ok: false, errore: 'Cliente non trovato: ricarica la pagina.' }
  if (chiusura.data) return { ok: false, errore: ERRORE_SOSPENDI_CHIUSO }
  if ((cliente.data.numero_vendite ?? 0) === 0) return { ok: false, errore: ERRORE_SOSPENDI_SENZA_PERCORSO }

  const { error } = await supabase
    .from('clienti_sospensioni')
    .upsert({ client_id, sospeso_il, motivo }, { onConflict: 'client_id' })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non sospeso. Riprova.') }

  rivalidaStatoCliente(client_id)
  return { ok: true }
}

/**
 * "Riattiva": the hold goes, the status comes back from the sale dates
 * (public.riattiva_cliente, the only way a deletion of a hold passes for
 * Claude's token; 20261030090000).
 */
export async function riattivaCliente(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = riattivaClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await nega(ctx)
  if (negato) return { ok: false, errore: negato }

  // it says whether a hold was there: a delete that finds nothing raises nothing
  const { data, error } = await ctx.db.rpc('riattiva_cliente', { p_client_id: parsed.data.client_id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non riattivato. Riprova.') }

  rivalidaStatoCliente(parsed.data.client_id)
  return data
    ? { ok: true }
    : { ok: false, errore: 'Il cliente non è sospeso (forse l’hai già riattivato): ricarica la pagina.' }
}
