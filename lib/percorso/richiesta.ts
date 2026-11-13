import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'

import { destinazioneUtente } from '@/lib/auth/destinazione'
import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { createClient } from '@/lib/supabase/server'

/**
 * The guard of the client's routes of the questionnaire (release B1b): the same origin, a
 * session of a client with an active account (a suspended one does not write), and his
 * client from clienti_account read with that session, never from the browser. A JSON answer
 * with no-store otherwise, in the client's words.
 */
export const SENZA_CACHE = { 'Cache-Control': 'no-store' }

export function rifiuto(errore: string, status: number) {
  return NextResponse.json({ errore }, { status, headers: SENZA_CACHE })
}

export type ClienteRichiesta =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clientId: string }
  | { ok: false; risposta: NextResponse }

export async function clienteDellaRichiesta(request: NextRequest): Promise<ClienteRichiesta> {
  if (!stessaOrigine(request)) return { ok: false, risposta: rifiuto('Origine non valida.', 403) }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, risposta: rifiuto('Accesso non valido: entra di nuovo.', 401) }
  const destinazione = await destinazioneUtente(supabase, user)
  if (destinazione.esito === 'errore') return { ok: false, risposta: rifiuto('Qualcosa non ha funzionato. Riprova tra poco.', 503) }
  if (destinazione.esito !== 'cliente' || destinazione.stato !== 'attivo') {
    return { ok: false, risposta: rifiuto('Questa parte non è del tuo percorso.', 403) }
  }
  return { ok: true, supabase, clientId: destinazione.clientId }
}
