'use server'

import { revalidatePath } from 'next/cache'

import { messaggioErrore, negaSeNon } from '@/lib/auth/azioni'
import { insightConfigurato, urlPasso } from '@/lib/insight/config'
import { salvaUrlPasso, URL_PASSO_NON_SALVATO } from '@/lib/insight/url-passo'
import { createClient } from '@/lib/supabase/server'
import { argomentiAutomazioneSchema, automazioneSchema, URL_PASSO_MANCANTE } from '@/lib/validation/insight'

/** `avviso`: saved, but something outside the app still keeps the recap from starting (the key). */
export type EsitoAutomazione = { ok: true; avviso: string | null } | { ok: false; errore: string }

/** The same words as public.insight_imposta_automazione. */
const SOLO_ADMIN = 'Solo l’admin imposta l’automazione.'

/** Turned on without ANTHROPIC_API_KEY: it saves, and the toast says why nothing will start (C38). */
const AVVISO_SENZA_CHIAVE = 'Manca ANTHROPIC_API_KEY su Vercel: finché non c’è, il recap automatico non parte.'

/**
 * Only outside production (urlPasso() is never null there): the local dev
 * server runs with INSIGHT_URL_PASSO=manuale, so no step would ever be sent.
 */
const PASSI_MANUALI =
  'I passi dell’Insight sono manuali (INSIGHT_URL_PASSO=manuale): in locale il recap automatico non si accende. Per provarlo usa http://host.docker.internal:<porta del dev server>/api/cron/insight.'

/**
 * «Automazione» of the Insight (1.35.0, D1, D4, CLAUDE.md section 29): the
 * admin turns the daily recap on or off and chooses when it is ready, in
 * steps of 5 minutes; pg_cron starts it about 15 minutes before and pg_net
 * sends each step. The address of the steps is built here, on the server
 * (urlPasso, D18), and written with the service role (salvaUrlPasso): never
 * from the form, never from the request's Host, never by the session. Without
 * a valid address the recap is not turned on and nothing is saved; turning it
 * off needs none. A fast RPC: a server action is fine (CLAUDE.md section 10).
 */
export async function salvaAutomazione(input: unknown): Promise<EsitoAutomazione> {
  const parsed = automazioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const negato = await negaSeNon(['admin'], SOLO_ADMIN)
  if (negato) return { ok: false, errore: negato }
  const { attiva, ora } = parsed.data

  let url: string | null
  try {
    url = urlPasso()
  } catch {
    // UrlPassoNonValido: APP_URL missing or not https in production
    if (attiva) return { ok: false, errore: URL_PASSO_MANCANTE }
    url = null
  }
  if (attiva && url === null) return { ok: false, errore: PASSI_MANUALI }

  const argomenti = argomentiAutomazioneSchema.safeParse({ p_attivo: attiva, p_ora: ora, p_url: url })
  if (!argomenti.success) return { ok: false, errore: argomenti.error.issues[0]?.message ?? 'Dati non validi.' }

  // the address is written by the server (service role) before the session turns the automation on:
  // the RPC takes no address, so the session cannot choose where the key of the steps is sent
  if (attiva && url !== null && !(await salvaUrlPasso(url))) return { ok: false, errore: URL_PASSO_NON_SALVATO }

  const supabase = await createClient()
  const { error } = await supabase.rpc('insight_imposta_automazione', {
    p_attivo: argomenti.data.p_attivo,
    p_ora: argomenti.data.p_ora,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Automazione non salvata. Riprova.') }

  // the page's Automazione and meta line, and the Insight block of the settings
  revalidatePath('/insight')
  revalidatePath('/settings/instagram')
  return { ok: true, avviso: attiva && !insightConfigurato() ? AVVISO_SENZA_CHIAVE : null }
}
