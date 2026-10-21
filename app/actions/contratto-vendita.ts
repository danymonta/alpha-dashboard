'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { createClient } from '@/lib/supabase/server'
import {
  CONTRATTO_NON_TOLTO,
  CONTRATTO_NON_TUO,
  contrattoVenditaSchema,
  salvaContrattoSchema,
} from '@/lib/validation/contratto'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * The link to the contract of a sale (21/10/2026), from the sale page, the
 * client's path history and the client list: admin only. Who may is decided by
 * RLS on vendite_contratti (is_admin) as well; the closer of the sale, the
 * setter and the coach never read or write it.
 */

function errore(error: { code?: string; message: string }, fallback: string): string {
  // an insert or upsert refused by a policy: the raw Postgres text is not for people
  if (error.code === '42501' && error.message.includes('row-level security')) return CONTRATTO_NON_TUO
  return messaggioErrore(error, fallback)
}

/** The sale page, the client's sheet and the client list all show the link. */
async function aggiorna(saleId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('sales').select('client_id').eq('id', saleId).maybeSingle()
  revalidatePath(`/sales/${saleId}`)
  revalidatePath('/clients', 'layout')
  if (data) revalidatePath(`/clients/${data.client_id}`)
}

/** Saving again replaces it. */
export async function salvaContrattoVendita(input: unknown): Promise<Esito> {
  const parsed = salvaContrattoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'], CONTRATTO_NON_TUO)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vendite_contratti')
    .upsert({ sale_id: parsed.data.sale_id, url: parsed.data.url }, { onConflict: 'sale_id' })
  if (error) return { ok: false, errore: errore(error, 'Link non salvato. Riprova.') }

  await aggiorna(parsed.data.sale_id)
  return { ok: true }
}

/** Only the link goes: the file on Drive stays as it is. */
export async function togliContrattoVendita(input: unknown): Promise<Esito> {
  const parsed = contrattoVenditaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Vendita non valida.' }
  const negato = await negaSeNon(['admin'], CONTRATTO_NON_TUO)
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  // a delete RLS filters out raises nothing: read back what went
  const { data, error } = await supabase
    .from('vendite_contratti')
    .delete()
    .eq('sale_id', parsed.data.sale_id)
    .select('sale_id')
  if (error) return { ok: false, errore: errore(error, 'Link non tolto. Riprova.') }

  await aggiorna(parsed.data.sale_id)
  return data.length > 0 ? { ok: true } : { ok: false, errore: CONTRATTO_NON_TOLTO }
}
