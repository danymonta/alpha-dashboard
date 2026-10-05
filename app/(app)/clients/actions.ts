'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { isDataISO, oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { clienteSchema } from '@/lib/validation/anagrafiche'
import { cartellaDriveSchema } from '@/lib/validation/cartella'
import { archivioClienteSchema, chiusuraClienteSchema, togliArchivioSchema } from '@/lib/validation/chiusura'

export type Esito = { ok: true } | { ok: false; errore: string }

export async function aggiornaCliente(input: unknown): Promise<Esito> {
  const parsed = clienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('clients').update(campi).eq('id', id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non aggiornato. Riprova.') }

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { ok: true }
}

const nuovoClienteSchema = clienteSchema.omit({ id: true })

/** A client before any sale ("mai attivato"): today only from Alfire. */
export async function creaCliente(input: unknown): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  const parsed = nuovoClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase.from('clients').insert(parsed.data).select('id').single()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non creato. Riprova.') }

  revalidatePath('/clients')
  return { ok: true, id: data.id }
}

/** With its sales and their instalments: public.elimina_cliente. */
export async function eliminaCliente(input: unknown): Promise<Esito> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_cliente', { p_client_id: parsed.data.id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non eliminato. Riprova.') }

  for (const pagina of ['/clients', '/sales', '/payments', '/commissions', '/']) revalidatePath(pagina)
  // its project stays, without the link to the client
  revalidatePath('/progetti', 'layout')
  return { ok: true }
}

const interruzioneSchema = z.object({
  sale_id: z.string().uuid('Vendita non valida'),
  ultimo_giorno: z.string().refine(isDataISO, 'Scegli l’ultimo giorno'),
  togli_rate: z.boolean(),
})

export type AnteprimaInterruzione = {
  rate_tolte: number
  importo_tolto: number
  valore_prima: number
  valore_dopo: number
}

/** What "Interrompi il percorso" would do, before the confirmation: public.interrompi_percorso without running it. */
export async function anteprimaInterruzione(
  input: unknown,
): Promise<{ ok: true; anteprima: AnteprimaInterruzione } | { ok: false; errore: string }> {
  const parsed = interruzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('interrompi_percorso', {
      p_sale_id: parsed.data.sale_id,
      p_ultimo_giorno: parsed.data.ultimo_giorno,
      p_togli_rate: parsed.data.togli_rate,
      p_esegui: false,
    })
    .single()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Anteprima non disponibile. Riprova.') }
  return { ok: true, anteprima: data }
}

/** A client who stops early: the sale ends on that day, the unpaid instalments after it go if asked. */
export async function interrompiPercorso(input: unknown): Promise<Esito> {
  const parsed = interruzioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('interrompi_percorso', {
    p_sale_id: parsed.data.sale_id,
    p_ultimo_giorno: parsed.data.ultimo_giorno,
    p_togli_rate: parsed.data.togli_rate,
    p_esegui: true,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Percorso non interrotto. Riprova.') }

  revalidatePath('/clients', 'layout')
  revalidatePath('/sales', 'layout')
  revalidatePath('/payments')
  revalidatePath('/rinnovi')
  revalidatePath('/')
  // the client's project ends with the path (02/10/2026)
  revalidatePath('/progetti', 'layout')
  return { ok: true }
}

/**
 * The link to the client's Google Drive folder (04/10/2026): its own table,
 * admin only (RLS). Saving again replaces it.
 */
export async function salvaCartellaDrive(input: unknown): Promise<Esito> {
  const parsed = cartellaDriveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase
    .from('clienti_cartelle')
    .upsert({ client_id: parsed.data.client_id, url: parsed.data.url }, { onConflict: 'client_id' })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Link non salvato. Riprova.') }

  revalidatePath(`/clients/${parsed.data.client_id}`)
  return { ok: true }
}

/** Only the link goes: the folder on Drive stays as it is. */
export async function togliCartellaDrive(input: unknown): Promise<Esito> {
  const parsed = z.object({ client_id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('clienti_cartelle').delete().eq('client_id', parsed.data.client_id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Link non tolto. Riprova.') }

  revalidatePath(`/clients/${parsed.data.client_id}`)
  return { ok: true }
}

/** Every page that lists a client by status: Clienti, Rinnovi, the Panoramica box. */
function rivalidaStatoCliente(clientId: string) {
  revalidatePath('/clients')
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
export async function chiudiCliente(input: unknown): Promise<Esito> {
  const parsed = chiusuraClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { client_id, chiuso_il, motivo } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase
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
export async function archiviaCliente(input: unknown): Promise<EsitoArchivio> {
  const parsed = archivioClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { client_id } = parsed.data
  const supabase = await createClient()
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
export async function togliDallArchivio(input: unknown): Promise<Esito> {
  const parsed = togliArchivioSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { client_id, solo_se_versione } = parsed.data
  const supabase = await createClient()
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

/** "Riapri": the closure goes, the status comes back from the sale dates. */
export async function riapriCliente(input: unknown): Promise<Esito> {
  const parsed = z.object({ client_id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('clienti_chiusure').delete().eq('client_id', parsed.data.client_id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Cliente non riaperto. Riprova.') }

  rivalidaStatoCliente(parsed.data.client_id)
  return { ok: true }
}
