'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { esclusioneSchema, normalizzaUsernameEscluso, setterInstagramSchema } from '@/app/(app)/settings/instagram/schema'
import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { oggiRoma } from '@/lib/date'
import { pulisciToken } from '@/lib/instagram/graph'
import { ErroreInstagram } from '@/lib/instagram/richieste'
import { creaGraphMessenger, pulisciTokenPagina } from '@/lib/messenger/graph'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import {
  dimenticaChatSchema,
  esclusioneMessengerSchema,
  NOME_CHAT_MAX,
  RE_TOKEN_PAGINA,
  TOKEN_PAGINA_NON_VALIDO,
  togliEsclusioneMessengerSchema,
  tokenPaginaSchema,
  type DimenticaChat,
} from '@/lib/validation/insight'

export type Esito = { ok: true } | { ok: false; errore: string }
/** The token's expiry day in Rome ('YYYY-MM-DD'), never the token. */
export type EsitoToken = { ok: true; scade_il: string | null } | { ok: false; errore: string }
/**
 * An exclusion saved. `cancellati`: its messages saved in the Insight were
 * deleted too (insight_dimentica); `avviso`: asked, and they were not.
 */
export type EsitoEsclusione = { ok: true; cancellati: boolean; avviso: string | null } | { ok: false; errore: string }
/** The Page the token belongs to, as Meta names it; never the token. */
export type EsitoTokenMessenger = { ok: true; pagina: string | null } | { ok: false; errore: string }

const PAGINA = '/settings/instagram'
const INSIGHT = '/insight'

const NON_CANCELLATI =
  'Chat esclusa, ma i suoi messaggi già salvati nell’Insight non si sono cancellati: togli l’esclusione e rifalla per riprovare.'

/**
 * «Cancella anche i suoi messaggi già salvati nell’Insight» (D16): the chat's
 * rows, cards and Fatto, and its items inside every recap, go now instead of
 * after 30 days. The admin's own session: the function checks him.
 */
async function dimenticaChat(db: SupabaseClient<Database>, chat: DimenticaChat): Promise<boolean> {
  const parsed = dimenticaChatSchema.safeParse(chat)
  if (!parsed.success) return false
  const { error } = await db.rpc('insight_dimentica', { p_canale: parsed.data.canale, p_chiave: parsed.data.chiave })
  if (error) console.warn('[insight] messaggi della chat esclusa non cancellati', { canale: parsed.data.canale, codice: error.code })
  return !error
}

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

/**
 * A chat never counted (personal account, team, clients, friends) and, from
 * 1.35.0, never read by the Insight (D5); with the box checked its messages
 * already saved in the Insight go too.
 */
export async function aggiungiEsclusioneInstagram(input: unknown): Promise<EsitoEsclusione> {
  const parsed = esclusioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { username, motivo, cancella_messaggi } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('instagram_esclusi').insert({ username, motivo })
  if (error) {
    if (error.code === '23505') return { ok: false, errore: `@${username} è già tra le chat escluse.` }
    return { ok: false, errore: messaggioErrore(error, 'Chat non esclusa. Riprova.') }
  }

  const cancellati = cancella_messaggi
    ? await dimenticaChat(supabase, { canale: 'instagram', chiave: username })
    : false
  revalidatePath(PAGINA)
  if (cancella_messaggi) revalidatePath(INSIGHT)
  return { ok: true, cancellati, avviso: cancella_messaggi && !cancellati ? NON_CANCELLATI : null }
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

// ---------- Messenger (1.35.0, CLAUDE.md section 29) ----------

/** Meta's answer when the token is checked: never longer than this (the action waits for it). */
const PROVA_TOKEN_MS = 20_000
const META_NON_RISPONDE = 'Meta non ha risposto: riprova tra qualche minuto.'
const RE_PAGINA_ID = /^[0-9]{1,30}$/

/**
 * The Page token for the Messenger chats of the Insight. Pasted as it comes
 * (`FB_PAGE_TOKEN=…`, quotes, spaces, the whole URL), cleaned with
 * pulisciTokenPagina, then proved on Meta before it is saved: the Page it
 * belongs to (GET /me) and one conversation (GET /me/conversations), so a
 * token without access to the messages is never saved. Then to Vault through
 * public.messenger_imposta_token, with the admin's session. Like the Instagram
 * token it arrives in a FormData and never comes back: not in the answer, not
 * in a log (only the error's kind and code), not in an error.
 */
export async function salvaTokenMessenger(dati: unknown): Promise<EsitoTokenMessenger> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const incollato = tokenPaginaSchema.safeParse(dati)
  if (!incollato.success) return { ok: false, errore: incollato.error.issues[0]?.message ?? TOKEN_PAGINA_NON_VALIDO }
  const token = pulisciTokenPagina(incollato.data)
  if (!token) return { ok: false, errore: 'Incolla il token della Pagina copiato da Meta.' }
  if (!RE_TOKEN_PAGINA.test(token)) return { ok: false, errore: TOKEN_PAGINA_NON_VALIDO }

  let pagina: { id: string; nome: string | null }
  try {
    const graph = creaGraphMessenger({ token, entro: Date.now() + PROVA_TOKEN_MS })
    pagina = await graph.pagina()
    // the Page's token must read the messages, not only the Page
    await graph.conversazioniRecenti(1)
  } catch (e) {
    if (e instanceof ErroreInstagram && (e.tipo === 'rete' || e.tipo === 'tempo' || e.tipo === 'limite')) {
      return { ok: false, errore: META_NON_RISPONDE }
    }
    console.warn('[messenger] token della Pagina non accettato', e instanceof ErroreInstagram ? { tipo: e.tipo, codice: e.code } : {})
    return { ok: false, errore: TOKEN_PAGINA_NON_VALIDO }
  }
  if (!RE_PAGINA_ID.test(pagina.id)) return { ok: false, errore: TOKEN_PAGINA_NON_VALIDO }
  const nome = pagina.nome?.trim().slice(0, NOME_CHAT_MAX) || null

  const supabase = await createClient()
  const { error } = await supabase.rpc('messenger_imposta_token', {
    p_token: token,
    p_pagina_id: pagina.id,
    // null when Meta gives no name: the generated types never mark a function argument nullable
    p_pagina_nome: nome as string,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Token della Pagina non salvato. Riprova.') }

  revalidatePath(PAGINA)
  revalidatePath(INSIGHT)
  return { ok: true, pagina: nome }
}

/** The Page token leaves Vault: the Messenger chats stop reaching the Insight. */
export async function togliTokenMessenger(): Promise<Esito> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { error } = await supabase.rpc('messenger_togli_token')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Token della Pagina non tolto. Riprova.') }

  revalidatePath(PAGINA)
  revalidatePath(INSIGHT)
  return { ok: true }
}

/**
 * A Messenger chat the Insight never reads again (D5), picked from the latest
 * chats with a name (insight_chat_messenger, C14): its PSID and the name it
 * had; with the box checked, its messages already saved go too (D16).
 */
export async function escludiChatMessenger(input: unknown): Promise<EsitoEsclusione> {
  const parsed = esclusioneMessengerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const { utente_id, nome, motivo, cancella_messaggi } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('messenger_esclusi').insert({ utente_id, nome, motivo })
  if (error) {
    if (error.code === '23505') return { ok: false, errore: `${nome} è già tra le chat Messenger escluse.` }
    return { ok: false, errore: messaggioErrore(error, 'Chat non esclusa. Riprova.') }
  }

  const cancellati = cancella_messaggi ? await dimenticaChat(supabase, { canale: 'messenger', chiave: utente_id }) : false
  revalidatePath(PAGINA)
  if (cancella_messaggi) revalidatePath(INSIGHT)
  return { ok: true, cancellati, avviso: cancella_messaggi && !cancellati ? NON_CANCELLATI : null }
}

/** The chat reaches the Insight again from the next recap. */
export async function togliEsclusioneMessenger(input: unknown): Promise<Esito> {
  const parsed = togliEsclusioneMessengerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Chat non valida.' }
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messenger_esclusi')
    .delete()
    .eq('utente_id', parsed.data.utente_id)
    .select('utente_id')
  if (error) return { ok: false, errore: messaggioErrore(error, 'Esclusione non tolta. Riprova.') }
  if (!data || data.length === 0) return { ok: false, errore: 'Questa chat non era più tra le escluse. Ricarica la pagina.' }

  revalidatePath(PAGINA)
  return { ok: true }
}
