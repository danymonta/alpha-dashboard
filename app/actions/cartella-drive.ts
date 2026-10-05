'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import {
  CARTELLA_NON_TOLTA,
  CARTELLA_NON_TUA,
  cartellaClienteSchema,
  cartellaDriveSchema,
} from '@/lib/validation/cartella'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * The link to the client's Google Drive folder, from the client sheet (admin)
 * and from the client's project (admin and the project's coach, 05/10/2026).
 * Who may is decided by RLS on clienti_cartelle (is_admin or
 * pm_coach_del_cliente), never by the caller's role here nor by anything the
 * browser says: the actions take the client only, and the project to refresh
 * is read from the database with the same session.
 */

function errore(error: { code?: string; message: string }, fallback: string): string {
  // an insert or upsert refused by a policy: the raw Postgres text is not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return CARTELLA_NON_TUA
  return messaggioErrore(error, fallback)
}

async function sessioneAttiva(): Promise<string | null> {
  const profilo = await getProfilo()
  return profilo?.attivo ? null : 'Sessione scaduta. Rientra e riprova.'
}

/** The client sheet and the client's project (the one RLS lets the caller read), both show the link. */
async function aggiorna(clientId: string) {
  const supabase = await createClient()
  const { data: progetto } = await supabase.from('pm_progetti').select('id').eq('client_id', clientId).maybeSingle()
  revalidatePath(`/clients/${clientId}`)
  if (progetto) revalidatePath(`/progetti/${progetto.id}`, 'layout')
}

/** Saving again replaces it. */
export async function salvaCartellaDrive(input: unknown): Promise<Esito> {
  const parsed = cartellaDriveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await sessioneAttiva()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase
    .from('clienti_cartelle')
    .upsert({ client_id: parsed.data.client_id, url: parsed.data.url }, { onConflict: 'client_id' })
  if (error) return { ok: false, errore: errore(error, 'Link non salvato. Riprova.') }

  await aggiorna(parsed.data.client_id)
  return { ok: true }
}

/** Only the link goes: the folder on Drive stays as it is. */
export async function togliCartellaDrive(input: unknown): Promise<Esito> {
  const parsed = cartellaClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Cliente non valido.' }
  const negato = await sessioneAttiva()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  // a delete RLS filters out raises nothing: read back what went
  const { data, error } = await supabase
    .from('clienti_cartelle')
    .delete()
    .eq('client_id', parsed.data.client_id)
    .select('client_id')
  if (error) return { ok: false, errore: errore(error, 'Link non tolto. Riprova.') }

  await aggiorna(parsed.data.client_id)
  return data.length > 0 ? { ok: true } : { ok: false, errore: CARTELLA_NON_TOLTA }
}
