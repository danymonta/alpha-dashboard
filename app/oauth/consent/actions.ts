'use server'

import { RedirectType, redirect } from 'next/navigation'

import {
  CONSENSO,
  MESSAGGI_AUTORIZZAZIONE,
  erroreVersoClaude,
  hostDi,
  leggiDestinazione,
  tipoErroreAutorizzazione,
  type ErroreAutorizzazione,
} from '@/lib/mcp/consenso'
import { createClient } from '@/lib/supabase/server'
import { NON_VALIDA, consensoSchema, type ConsensoInput } from '@/lib/validation/mcp'

/**
 * null before the first tap; an error otherwise (a success leaves the page).
 * finale: another tap would get the same answer (expired, already used, not
 * from Claude), so the card shows the way out instead of the buttons.
 */
export type EsitoConsenso = { errore: string; finale: boolean } | null

type Passo = { url: string; rifiuto: boolean } | { errore: string; finale: boolean }

function erroreAuth(errore: { name?: string; status?: number; code?: string } | null): Passo {
  const tipo: ErroreAutorizzazione = tipoErroreAutorizzazione(errore)
  return { errore: MESSAGGI_AUTORIZZAZIONE[tipo], finale: tipo !== 'temporaneo' }
}

/** What Supabase answers for this decision: the URL to send the browser to, or why not. */
async function decidi(dati: ConsensoInput): Promise<Passo> {
  const supabase = await createClient()
  const oauth = supabase.auth.oauth
  let decisione = dati.decisione

  if (decisione === 'consenti' || decisione === 'continua') {
    // checked again at the tap: who was demoted or deactivated after the page was
    // drawn refuses instead. Refusing needs no check: whoever may not connect
    // Claude must still be able to send it away.
    const { data: puo, error } = await supabase.rpc('puo_usare_mcp')
    if (error) return { errore: MESSAGGI_AUTORIZZAZIONE.temporaneo, finale: false }
    if (puo !== true) decisione = decisione === 'consenti' ? 'rifiuta' : 'annulla'
  }

  switch (decisione) {
    case 'consenti': {
      const { data, error } = await oauth.approveAuthorization(dati.authorization_id, { skipBrowserRedirect: true })
      if (error || !data?.redirect_url) return erroreAuth(error)
      return { url: data.redirect_url, rifiuto: false }
    }
    case 'continua':
      // Supabase had already approved a repeat consent: the code is in this URL
      return { url: dati.redirect_url ?? '', rifiuto: false }
    case 'annulla':
      // already approved, it can no longer be denied: Claude gets access_denied and never the code
      return { url: erroreVersoClaude(dati.redirect_url) ?? dati.redirect_url ?? '', rifiuto: true }
    case 'rifiuta': {
      // Supabase binds an authorization to its person only when its details are read
      // (approve and deny answer 404 before that), and the page of who may not
      // connect Claude never reads them. A pending authorization of the same person
      // just gives its details again; only the binding read can auto-approve an old
      // consent, and then the code is dropped, never forwarded.
      const { data, error } = await oauth.getAuthorizationDetails(dati.authorization_id)
      if (error || !data) return erroreAuth(error)
      if (!('authorization_id' in data)) {
        return { url: erroreVersoClaude(data.redirect_url) ?? data.redirect_url, rifiuto: true }
      }
      const negata = await oauth.denyAuthorization(dati.authorization_id, { skipBrowserRedirect: true })
      if (negata.error || !negata.data?.redirect_url) return erroreAuth(negata.error)
      return { url: negata.data.redirect_url, rifiuto: true }
    }
  }
}

/**
 * The consent page's taps (Claude connected to Alpha Management, 09/10/2026).
 * The browser goes only where destinazioneClaude allows, re-checked here even
 * for the URLs Supabase itself returns; anything else is logged with its host
 * only and the page says why.
 */
export async function decidiCollegamento(_prima: EsitoConsenso, formData: FormData): Promise<EsitoConsenso> {
  const dati = consensoSchema.safeParse({
    authorization_id: formData.get('authorization_id'),
    decisione: formData.get('decisione'),
    redirect_url: formData.get('redirect_url') ?? undefined,
  })
  if (!dati.success) return { errore: NON_VALIDA, finale: true }

  let passo: Passo
  try {
    passo = await decidi(dati.data)
  } catch {
    passo = { errore: MESSAGGI_AUTORIZZAZIONE.temporaneo, finale: false }
  }
  if ('errore' in passo) return passo

  const destinazione = leggiDestinazione(passo.url)
  if (!destinazione) {
    console.warn(`[mcp] consenso destinazione rifiutata host=${hostDi(passo.url)}`)
    return { errore: passo.rifiuto ? CONSENSO.rifiutataNonDaClaude : CONSENSO.nonDaClaude, finale: true }
  }
  // outside any try/catch: Next implements redirect by throwing. With JavaScript it is a
  // navigation to Claude, without it a 303; replace, so Back does not land on a used page.
  redirect(destinazione.href, RedirectType.replace)
}
