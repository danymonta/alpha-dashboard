'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true } | { ok: false; errore: string }

/**
 * The notification center (1.41.0). Only the recipient's own: the session's
 * client, RLS does the rest (no service_role here), and a row that is not the
 * caller's is simply not found. The count on the bell is read by the layout:
 * every action revalidates the whole app so it follows.
 */
const idSchema = z.string().uuid()

async function sessioneAttiva(): Promise<string | null> {
  const profilo = await getProfilo()
  return profilo?.attivo ? null : 'Sessione scaduta. Rientra e riprova.'
}

function aggiorna() {
  revalidatePath('/', 'layout')
}

/** Opening a notification marks it read; a second call changes nothing. */
export async function segnaLetta(id: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, errore: 'Notifica non valida.' }
  const negato = await sessioneAttiva()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase
    .from('notifiche')
    .update({ letta_il: new Date().toISOString() })
    .eq('id', parsed.data)
    .is('letta_il', null)
  if (error) return { ok: false, errore: 'Non riesco a segnarla come letta. Riprova.' }
  aggiorna()
  return { ok: true }
}

export async function segnaTutteLette(): Promise<Esito> {
  const negato = await sessioneAttiva()
  if (negato) return { ok: false, errore: negato }
  const supabase = await createClient()
  const { error } = await supabase.from('notifiche').update({ letta_il: new Date().toISOString() }).is('letta_il', null)
  if (error) return { ok: false, errore: 'Non riesco a segnarle come lette. Riprova.' }
  aggiorna()
  return { ok: true }
}

export async function eliminaNotifica(id: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, errore: 'Notifica non valida.' }
  const negato = await sessioneAttiva()
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  // a delete that RLS filters out raises nothing: read back what went
  const { data, error } = await supabase.from('notifiche').delete().eq('id', parsed.data).select('id')
  if (error) return { ok: false, errore: 'Notifica non eliminata. Riprova.' }
  aggiorna()
  return data.length > 0 ? { ok: true } : { ok: false, errore: 'Questa notifica non c’è più.' }
}
