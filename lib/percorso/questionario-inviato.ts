import 'server-only'

import { createHash } from 'node:crypto'
import { after } from 'next/server'

import { emailQuestionarioInviato } from '@/lib/email/cliente'
import { inviaEmail } from '@/lib/email/invia'
import { publicEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The email «<Nome> ha compilato il questionario» (1.84.0) to the addresses of Impostazioni › Onboarding, after the
 * client sent it. The service role reads only the addresses and the client's name, for the client whose sending the
 * database has just accepted. Never an answer, never throws, never logs an address; the client never waits for it.
 */

function base(): string {
  return publicEnv.appUrl.replace(/\/+$/, '')
}

/** One email per client and day: a retry after a lost answer never doubles it. */
export function chiaveQuestionarioInviato(clientId: string): string {
  return `questionario-inviato-${createHash('sha256').update(clientId, 'utf8').digest('hex').slice(0, 40)}`
}

export async function avvisaQuestionarioInviato(clientId: string): Promise<'inviata' | 'nessuno' | 'non_partita'> {
  try {
    const admin = createAdminClient()
    const [imp, cliente] = await Promise.all([
      admin.from('onboarding_impostazioni').select('email_questionario').maybeSingle(),
      admin.from('clients').select('nome, cognome').eq('id', clientId).maybeSingle(),
    ])
    const destinatari = imp.data?.email_questionario ?? []
    if (destinatari.length === 0) return 'nessuno'
    const nomeCliente = [cliente.data?.nome, cliente.data?.cognome].filter(Boolean).join(' ')
    const contenuto = emailQuestionarioInviato({
      nomeCliente,
      urlScheda: `${base()}/onboarding/${clientId}`,
      urlLogo: `${base()}/brand/percorso-alpha-email.png`,
    })
    const esito = await inviaEmail({ a: destinatari, ...contenuto, idempotenza: chiaveQuestionarioInviato(clientId), timeoutMs: 8000 })
    if (esito.inviata) return 'inviata'
  } catch {
    // never stops the sending of the questionnaire
  }
  console.error('[onboarding] email del questionario inviato: non partita')
  return 'non_partita'
}

/** After the answer to the client: the email goes in the background. */
export function avvisaQuestionarioInviatoDopo(clientId: string): void {
  after(async () => {
    await avvisaQuestionarioInviato(clientId)
  })
}
