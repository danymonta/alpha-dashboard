'use server'

import { revalidatePath } from 'next/cache'

import { z } from 'zod'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { ETICHETTA_RUOLO } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { inviaEmail } from '@/lib/email/invia'
import { emailInvito } from '@/lib/email/invito'
import { publicEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import {
  attivoSchema,
  cambioLivelloPmSchema,
  cambioRuoloSchema,
  invitoSchema,
  revocaInvitoSchema,
} from '@/lib/validation/team'

export type Esito = { ok: true } | { ok: false; errore: string }

/** How the invite reached the person: by email, or the link is to be sent by hand. */
export type EsitoInvito = { ok: true; email: 'inviata' | 'non_configurata' | 'errore' } | { ok: false; errore: string }

async function mandaEmailInvito(email: string, ruolo: keyof typeof ETICHETTA_RUOLO): Promise<'inviata' | 'non_configurata' | 'errore'> {
  const profilo = await getProfilo()
  const base = publicEnv.appUrl.replace(/\/$/, '')
  const messaggio = emailInvito({
    email,
    ruolo: ETICHETTA_RUOLO[ruolo],
    invitatoDa: profilo?.nome ?? 'Dany',
    urlLogin: `${base}/login`,
    urlLogo: `${base}/brand/percorso-alpha-email.png`,
  })
  const esito = await inviaEmail({ a: email, ...messaggio })
  return esito.inviata ? 'inviata' : esito.motivo
}

function aggiorna() {
  revalidatePath('/settings/team')
  revalidatePath('/settings/commissions')
  revalidatePath('/progetti', 'layout')
}

/**
 * An invite is a line in `invites`: the gate in handle_new_user lets that
 * address in on its first Google sign-in, with this role. When email is set up
 * (Resend) the person also gets a branded invite; otherwise the link is shared by hand.
 */
export async function invita(input: unknown): Promise<EsitoInvito> {
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

  const email = await mandaEmailInvito(parsed.data.email, parsed.data.ruolo)
  aggiorna()
  return { ok: true, email }
}

/** Sends the invite email again, for an invite still waiting. */
export async function reinviaInvito(input: unknown): Promise<EsitoInvito> {
  const parsed = revocaInvitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Invito non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data: invito } = await supabase
    .from('invites')
    .select('email, ruolo')
    .eq('email', parsed.data.email)
    .is('usato_at', null)
    .eq('revocato', false)
    .maybeSingle()
  if (!invito) return { ok: false, errore: 'Invito non trovato o già usato.' }

  return { ok: true, email: await mandaEmailInvito(invito.email, invito.ruolo) }
}

/** An invite still waiting is deleted: that address can no longer sign in. */
export async function revocaInvito(input: unknown): Promise<Esito> {
  const parsed = revocaInvitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Invito non valido.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.from('invites').delete().eq('email', parsed.data.email).is('usato_at', null)
  if (error) return { ok: false, errore: messaggioErrore(error, 'Invito non eliminato. Riprova.') }

  aggiorna()
  return { ok: true }
}

const idPersona = z.object({ profile_id: z.string().uuid() })

/** A person leaves for good (public.elimina_persona says what goes with them). */
export async function eliminaPersona(input: unknown): Promise<Esito> {
  const parsed = idPersona.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Persona non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('elimina_persona', { p_profile_id: parsed.data.profile_id })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Persona non eliminata. Riprova.') }

  aggiorna()
  revalidatePath('/', 'layout')
  return { ok: true }
}

const unione = z.object({ da: z.string().uuid(), a: z.string().uuid('Scegli il profilo in cui unire') })

/** Two profiles of the same person become one: typically a placeholder and the real account. */
export async function unisciProfili(input: unknown): Promise<Esito> {
  const parsed = unione.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('unisci_profili', { p_da: parsed.data.da, p_a: parsed.data.a })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Profili non uniti. Riprova.') }

  aggiorna()
  revalidatePath('/', 'layout')
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

/**
 * Projects level (admin, manager, employee), separate from the role. The app
 * admin is PM admin whatever this says: the select is locked on their rows.
 */
export async function cambiaLivelloPm(input: unknown): Promise<Esito> {
  const parsed = cambioLivelloPmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ livello_pm: parsed.data.livello_pm })
    .eq('id', parsed.data.profile_id)
    .select('id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Livello non aggiornato. Riprova.') }
  if (data.length === 0) return { ok: false, errore: 'Persona non trovata.' }

  aggiorna()
  return { ok: true }
}
