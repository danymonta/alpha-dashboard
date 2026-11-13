import 'server-only'

import { createHash } from 'node:crypto'

import { emailToccaATe, messaggioToccaATe } from '@/lib/email/cliente'
import { inviaEmail } from '@/lib/email/invia'
import { publicEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * «Tocca a te» (release B2, docs/onboarding/rilascio-b.md, «Codice»): after a function of
 * the team gave the turn back to the client, the server action tells him. His address is
 * read here with the service role, from his account (the address he signs in with), and
 * never leaves the server: the coach's browser receives at most the message to copy for
 * Telegram, with the first name and the area's address. The service role only reads the
 * name, the account and the user of the client the function of the team has just allowed
 * (its client_id, from the database's answer). Never throws, never logs an address.
 */

export type AvvisoCliente =
  /** The email left (Resend, or Mailpit in the e2e). */
  | { inviata: true }
  /** Off in the settings, not configured or refused: the message to copy for Telegram. */
  | { inviata: false; messaggio: string; spento: boolean }

function base(): string {
  return publicEnv.appUrl.replace(/\/+$/, '')
}

export function urlPercorso(): string {
  return `${base()}/percorso`
}

/** A key that names neither the client nor the address: the same notice twice within a day leaves once. */
export function chiaveToccaATe(clientId: string, motivo: string, riferimento: string): string {
  const impronta = createHash('sha256').update(`${clientId}|${motivo}|${riferimento}`, 'utf8').digest('hex').slice(0, 40)
  return `tocca-a-te-${impronta}`
}

export async function avvisaCliente(m: {
  clientId: string
  motivo: string
  /** What makes this notice different from the one before (the call's new day, the checkpoint…). */
  riferimento: string
  /** onboarding_impostazioni.avvisa_cliente_email, as the function returned it. */
  viaEmail: boolean
}): Promise<AvvisoCliente> {
  let nome = ''
  let email: string | null = null
  try {
    const admin = createAdminClient()
    const [cliente, account] = await Promise.all([
      admin.from('clients').select('nome').eq('id', m.clientId).maybeSingle(),
      admin.from('clienti_account').select('user_id, stato').eq('client_id', m.clientId).maybeSingle(),
    ])
    nome = cliente.data?.nome?.trim() ?? ''
    if (m.viaEmail && account.data && account.data.stato === 'attivo') {
      const { data } = await admin.auth.admin.getUserById(account.data.user_id)
      email = data.user?.email ?? null
    }
  } catch {
    console.error('[onboarding] avviso al cliente: lettura non riuscita')
  }

  const messaggio = messaggioToccaATe({ nome, motivo: m.motivo, urlPercorso: urlPercorso() })
  if (!m.viaEmail || !email) return { inviata: false, messaggio, spento: !m.viaEmail }

  const contenuto = emailToccaATe({
    nome,
    motivo: m.motivo,
    urlPercorso: urlPercorso(),
    urlLogo: `${base()}/brand/percorso-alpha-email.png`,
  })
  try {
    const esito = await inviaEmail({
      a: email,
      ...contenuto,
      idempotenza: chiaveToccaATe(m.clientId, m.motivo, m.riferimento),
      timeoutMs: 8000,
    })
    if (esito.inviata) return { inviata: true }
  } catch {
    // inviaEmail never throws; a broken import would: the coach still has the message
  }
  console.error('[onboarding] avviso al cliente: email non partita')
  return { inviata: false, messaggio, spento: false }
}
