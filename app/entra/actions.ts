'use server'

import { cookies } from 'next/headers'
import { after } from 'next/server'

import { esitoVerificaCodice } from '@/lib/auth/accesso'
import { indirizzoRifiuto, sessioneVecchia, togliSessioneVecchia, verificaDopoLogin } from '@/lib/auth/dopo-login'
import {
  TEMPO_ENTRA_MS,
  attendiFinoA,
  contaAccesso,
  contaIp,
  ipRichiesta,
  richiestaCodiceCliente,
} from '@/lib/percorso/accesso'
import { destinazioneCliente } from '@/lib/auth/destinazione'
import { TESTI_ENTRA as T } from '@/lib/percorso/testi'
import { createClient } from '@/lib/supabase/server'
import { chiediCodiceClienteSchema, verificaCodiceClienteSchema } from '@/lib/validation/registrazione-cliente'

/**
 * The return of a client through /entra (release B1a, docs/onboarding/rilascio-b.md,
 * «/entra»). The answer never says whether the address has an account: the same sentence
 * after a fixed 1.2 seconds for a client, a stranger, a person of the team, a closed
 * account. The limits are counted before the answer, the code is generated and sent after
 * it (after()). No address, code or token in a log.
 */
export type EsitoChiediCodice = { ok: true } | { ok: false; errore: string }
export type EsitoEntra = { ok: true; vai: string } | { ok: false; errore: string }

export async function chiediCodiceCliente(input: unknown): Promise<EsitoChiediCodice> {
  const inizio = Date.now()
  const parsed = chiediCodiceClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? T.nonDisponibile }

  try {
    // the limit per IP comes before every road: it does not depend on the address
    if (!(await contaIp(await ipRichiesta(), 'richiesta'))) {
      await attendiFinoA(inizio, TEMPO_ENTRA_MS)
      return { ok: false, errore: T.troppeRichieste }
    }
    await richiestaCodiceCliente(parsed.data.email, (lavoro) => after(lavoro))
  } catch {
    console.error('[entra] richiesta del codice non riuscita')
    await attendiFinoA(inizio, TEMPO_ENTRA_MS)
    return { ok: false, errore: T.nonDisponibile }
  }
  await attendiFinoA(inizio, TEMPO_ENTRA_MS)
  return { ok: true }
}

/**
 * The code: Supabase is asked only for an address that received a code in the last hour,
 * with fewer than 5 errors (and fewer than 100 for everybody): otherwise the answer of a
 * wrong code, without calling Supabase (its limit of verifications per IP is one for the
 * whole server). A person of the team never passes here (no code was sent to her by /entra).
 */
export async function verificaCodiceCliente(input: unknown): Promise<EsitoEntra> {
  const inizio = Date.now()
  const parsed = verificaCodiceClienteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: parsed.error.issues[0]?.message ?? T.errato }
  const { email, codice, da } = parsed.data

  let ammessa: boolean
  try {
    if (!(await contaIp(await ipRichiesta(), 'verifica'))) {
      await attendiFinoA(inizio, TEMPO_ENTRA_MS)
      return { ok: false, errore: T.troppeRichieste }
    }
    ammessa = await contaAccesso(email, 'verifica')
  } catch {
    await attendiFinoA(inizio, TEMPO_ENTRA_MS)
    return { ok: false, errore: T.nonDisponibile }
  }
  // stopped before Supabase: nothing is counted (only the codes Supabase refuses count, on the
  // address and on everybody; a code typed for an address that received none must never block the others)
  if (!ammessa) {
    await attendiFinoA(inizio, TEMPO_ENTRA_MS)
    return { ok: false, errore: T.errato }
  }

  const cookieStore = await cookies()
  const vecchia = sessioneVecchia(cookieStore)
  const supabase = await createClient({ ignoraSessione: true })
  let errore: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['error']
  try {
    ;({ error: errore } = await supabase.auth.verifyOtp({ email, token: codice, type: 'email' }))
  } catch {
    await attendiFinoA(inizio, TEMPO_ENTRA_MS)
    return { ok: false, errore: T.connessione }
  }
  if (errore) {
    console.error('[entra] codice non verificato:', errore.code, errore.status)
    const esito = esitoVerificaCodice(errore)
    if (esito === 'errato') await contaAccesso(email, 'errore').catch(() => undefined)
    await attendiFinoA(inizio, TEMPO_ENTRA_MS)
    return {
      ok: false,
      errore: esito === 'troppe-richieste' ? T.troppeRichieste : esito === 'non-disponibile' ? T.nonDisponibile : T.errato,
    }
  }

  togliSessioneVecchia(cookieStore, vecchia)
  // back where the client was going (the proxy's ?da=), only inside /percorso
  const dopo = await verificaDopoLogin(supabase, cookieStore, destinazioneCliente(da))
  if (!dopo.ok) return { ok: true, vai: indirizzoRifiuto(dopo.motivo) }
  return { ok: true, vai: dopo.vai }
}
