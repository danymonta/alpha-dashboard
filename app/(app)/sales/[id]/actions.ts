'use server'

import { revalidatePath } from 'next/cache'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { modificaVenditaSchema } from '@/lib/validation/vendita'
import {
  modificaIncassoSchema,
  modificaRataSchema,
  rimborsoSchema,
  segnaIncassataSchema,
  soloRataSchema,
} from '@/lib/validation/incasso'

export type EsitoRata =
  | { ok: true; importo?: number; rata?: number }
  | { ok: false; errore: string }

type Ruolo = 'admin' | 'closer'

async function autorizza(ruoli: Ruolo[]): Promise<string | null> {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) return 'Sessione scaduta. Rientra e riprova.'
  if (!ruoli.includes(profilo.ruolo as Ruolo)) {
    return ruoli.length === 1 ? 'Questa operazione è riservata all’admin.' : 'Operazione non consentita.'
  }
  return null
}

/** Every page that shows cash or instalments, sale details included. */
function aggiornaPagine() {
  for (const percorso of ['/', '/sales', '/payments', '/my-sales', '/clients', '/commissions']) {
    revalidatePath(percorso)
  }
  revalidatePath('/sales/[id]', 'page')
}

function messaggio(error: { code?: string; message: string }, fallback: string) {
  // 22023 / 42501 / 23514: our own rules and checks, already worded for people
  return error.code === '22023' || error.code === '42501' ? error.message : fallback
}

export async function segnaIncassata(input: unknown): Promise<EsitoRata> {
  const parsed = segnaIncassataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('segna_rata_incassata', {
      p_payment_id: v.payment_id,
      p_incassato_il: v.incassato_il ?? undefined,
      p_importo: v.importo ?? undefined,
      p_metodo: v.metodo ?? undefined,
    })
    .single()

  if (error) return { ok: false, errore: messaggio(error, 'Incasso non registrato. Riprova.') }

  aggiornaPagine()
  return { ok: true, importo: data.importo_registrato, rata: data.rata }
}

export async function annullaIncasso(input: unknown): Promise<EsitoRata> {
  const parsed = soloRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Rata non valida.' }
  const negato = await autorizza(['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .update({ stato: 'prevista', incassato_il: null, importo_incassato: null, metodo: null })
    .eq('id', parsed.data.payment_id)
    .in('stato', ['incassata', 'fallita'])
    .select('sale_id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Operazione non riuscita. Riprova.') }
  if (!data) return { ok: false, errore: 'Rata non trovata o già da incassare.' }

  aggiornaPagine()
  return { ok: true }
}

export async function segnaFallita(input: unknown): Promise<EsitoRata> {
  const parsed = soloRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Rata non valida.' }
  const negato = await autorizza(['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .update({ stato: 'fallita' })
    .eq('id', parsed.data.payment_id)
    .eq('stato', 'prevista')
    .select('sale_id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Operazione non riuscita. Riprova.') }
  if (!data) return { ok: false, errore: 'Solo una rata da incassare può fallire.' }

  aggiornaPagine()
  return { ok: true }
}

export async function modificaRata(input: unknown): Promise<EsitoRata> {
  const parsed = modificaRataSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .update({ scadenza: parsed.data.scadenza, importo_previsto: parsed.data.importo_previsto })
    .eq('id', parsed.data.payment_id)
    .eq('stato', 'prevista')
    .select('sale_id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Rata non modificata. Riprova.') }
  if (!data) return { ok: false, errore: 'Si modifica solo una rata ancora da incassare.' }

  aggiornaPagine()
  return { ok: true }
}

export async function registraRimborso(input: unknown): Promise<EsitoRata> {
  const parsed = rimborsoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(['admin'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('registra_rimborso', {
    p_payment_id: v.payment_id,
    p_data: v.data,
    p_importo: v.importo,
    p_note: v.note ?? undefined,
  })

  if (error) return { ok: false, errore: messaggio(error, 'Rimborso non registrato. Riprova.') }

  aggiornaPagine()
  return { ok: true, importo: v.importo }
}

/** The admin corrects a recorded sale. The instalments stay as they are. */
export async function modificaVendita(input: unknown): Promise<EsitoRata> {
  const parsed = modificaVenditaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('sales').update(campi).eq('id', id).select('id').maybeSingle()

  // 23514: the renewal check of the database, already worded for people
  if (error) {
    return {
      ok: false,
      errore: error.code === '23514' ? error.message : messaggio(error, 'Vendita non aggiornata. Riprova.'),
    }
  }
  if (!data) return { ok: false, errore: 'Vendita non trovata.' }

  aggiornaPagine()
  revalidatePath('/clients/[id]', 'page')
  return { ok: true }
}

/**
 * Correct a recorded payment: date, amount, method. The admin on every sale,
 * the closer on their own (RLS and the payments guard decide).
 */
export async function modificaIncasso(input: unknown): Promise<EsitoRata> {
  const parsed = modificaIncassoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await autorizza(['admin', 'closer'])
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .update({ incassato_il: v.incassato_il, importo_incassato: v.importo, metodo: v.metodo ?? null })
    .eq('id', v.payment_id)
    .eq('stato', 'incassata')
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, errore: messaggio(error, 'Incasso non modificato. Riprova.') }
  if (!data) return { ok: false, errore: 'Si corregge solo una rata già incassata.' }

  aggiornaPagine()
  return { ok: true, importo: v.importo }
}
