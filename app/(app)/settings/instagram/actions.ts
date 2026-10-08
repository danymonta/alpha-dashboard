'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { esclusioneSchema, normalizzaUsernameEscluso, setterInstagramSchema } from '@/app/(app)/settings/instagram/schema'
import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { oggiRoma } from '@/lib/date'
import { pulisciToken } from '@/lib/instagram/graph'
import { createClient } from '@/lib/supabase/server'

export type Esito = { ok: true } | { ok: false; errore: string }
/** The token's expiry day in Rome ('YYYY-MM-DD'), never the token. */
export type EsitoToken = { ok: true; scade_il: string | null } | { ok: false; errore: string }

const PAGINA = '/settings/instagram'
/** The same rule as public.instagram_imposta_token. */
const TOKEN = /^[A-Za-z0-9_.|-]{20,2048}$/
/** A pasted test URL is longer than the token: well above it, still bounded. */
const INCOLLATO_MAX = 8192
const TOKEN_NON_VALIDO = 'Il token non sembra valido: copialo di nuovo per intero dal pannello Meta.'

/**
 * The admin connects Instagram (Dany, 08/10/2026): the token pasted from
 * Meta's panel, cleaned here as the DM Reader does ("IG_TOKEN=…", quotes,
 * spaces, the whole test URL), goes to Vault through
 * public.instagram_imposta_token. It never comes back: not in the answer,
 * not in a log, not in an error (ours are fixed words, the database's never
 * echo it). It arrives in a FormData (field `token`), never as a plain
 * argument: `next dev` logs every server function call with its arguments,
 * strings whole, while a FormData is logged as `{}`.
 */
export async function salvaTokenInstagram(dati: unknown): Promise<EsitoToken> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const incollato = dati instanceof FormData ? dati.get('token') : null
  if (typeof incollato !== 'string' || incollato.length > INCOLLATO_MAX) return { ok: false, errore: TOKEN_NON_VALIDO }
  const token = pulisciToken(incollato)
  if (!token) return { ok: false, errore: 'Incolla il token copiato dal pannello Meta.' }
  if (!TOKEN.test(token)) return { ok: false, errore: TOKEN_NON_VALIDO }

  const supabase = await createClient()
  const { error } = await supabase.rpc('instagram_imposta_token', { p_token: token })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Token non salvato. Riprova.') }

  const { data } = await supabase.from('instagram_collegamento').select('token_scade_il').maybeSingle()
  revalidatePath(PAGINA)
  return { ok: true, scade_il: data?.token_scade_il ? oggiRoma(new Date(data.token_scade_il)) : null }
}

/** The token leaves Vault: the nightly proposal stops until a new one is pasted. */
export async function togliTokenInstagram(): Promise<Esito> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('instagram_togli_token')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Token non tolto. Riprova.') }

  revalidatePath(PAGINA)
  return { ok: true }
}

/**
 * Who works the DMs: the nightly proposals are his to confirm. An active
 * setter (public.instagram_collegamento_coerenza says it otherwise), or
 * nobody, and the proposal stops.
 */
export async function scegliSetterInstagram(input: unknown): Promise<Esito> {
  const parsed = setterInstagramSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Scelta non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instagram_collegamento')
    .update({ setter_id: parsed.data.setter_id })
    .eq('id', true)
    .select('setter_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Scelta non salvata. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Il collegamento di Instagram non si trova. Ricarica la pagina.' }

  revalidatePath(PAGINA)
  return { ok: true }
}

/** A chat never counted (personal account, team, clients, friends). */
export async function aggiungiEsclusioneInstagram(input: unknown): Promise<Esito> {
  const parsed = esclusioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { username, motivo } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('instagram_esclusi').insert({ username, motivo })
  if (error) {
    if (error.code === '23505') return { ok: false, errore: `@${username} è già tra le chat escluse.` }
    return { ok: false, errore: messaggioErrore(error, 'Chat non esclusa. Riprova.') }
  }

  revalidatePath(PAGINA)
  return { ok: true }
}

const eliminaEsclusioneSchema = z.object({ username: z.string().transform(normalizzaUsernameEscluso) })

/** Its chats count again from the next night. */
export async function eliminaEsclusioneInstagram(input: unknown): Promise<Esito> {
  const parsed = eliminaEsclusioneSchema.safeParse(input)
  if (!parsed.success || !parsed.data.username) return { ok: false, errore: 'Chat non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instagram_esclusi')
    .delete()
    .eq('username', parsed.data.username)
    .select('username')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Esclusione non tolta. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Questa chat non era più tra le escluse. Ricarica la pagina.' }

  revalidatePath(PAGINA)
  return { ok: true }
}
