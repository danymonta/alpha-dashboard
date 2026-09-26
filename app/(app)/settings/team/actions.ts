'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { getProfilo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import {
  attivoSchema,
  cambioRuoloSchema,
  invitoSchema,
  revocaInvitoSchema,
} from '@/lib/validation/team'

export type Esito = { ok: true } | { ok: false; errore: string }

function aggiorna() {
  revalidatePath('/settings/team')
  revalidatePath('/settings/commissions')
}

/**
 * An invite is only a line in `invites`: the gate in handle_new_user lets that
 * address in on its first Google sign-in, with this role. No email is sent.
 */
export async function invita(input: unknown): Promise<Esito> {
  const parsed = invitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data: esistente } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .maybeSingle()
  if (esistente) return { ok: false, errore: 'Questa persona è già nel team: cambia il suo ruolo dall’elenco.' }

  const profilo = await getProfilo()
  const { error } = await supabase.from('invites').upsert(
    { email: parsed.data.email, ruolo: parsed.data.ruolo, invitato_da: profilo!.id, revocato: false, usato_at: null },
    { onConflict: 'email' },
  )
  if (error) return { ok: false, errore: messaggioErrore(error, 'Invito non salvato. Riprova.') }

  aggiorna()
  return { ok: true }
}

export async function revocaInvito(input: unknown): Promise<Esito> {
  const parsed = revocaInvitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Invito non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invites')
    .update({ revocato: true })
    .eq('email', parsed.data.email)
    .is('usato_at', null)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Revoca non riuscita. Riprova.') }

  aggiorna()
  return { ok: true }
}

export async function cambiaRuolo(input: unknown): Promise<Esito> {
  const parsed = cambioRuoloSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  // the self-change guard lives in the database (guard_profile_self_change)
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ ruolo: parsed.data.ruolo }).eq('id', parsed.data.profile_id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Ruolo non aggiornato. Riprova.') }

  aggiorna()
  return { ok: true }
}

export async function cambiaAttivo(input: unknown): Promise<Esito> {
  const parsed = attivoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ attivo: parsed.data.attivo }).eq('id', parsed.data.profile_id)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Operazione non riuscita. Riprova.') }

  aggiorna()
  return { ok: true }
}
