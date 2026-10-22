import 'server-only'

import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { emailContenutiSettimana, type RiepilogoContenutiSettimana } from '@/lib/email/contenuti-settimana'
import type { Destinatario } from '@/lib/email/riepilogo-invio'
import { registraNotifica } from '@/lib/notifiche/registra'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

/** The contents email waits at most this long for Resend: the reminders come after it. */
export const TEMPO_CONTENUTI_SETTIMANA_MS = 10_000

/**
 * The week of the contents (Dany, 22/10/2026: every weekend, how the contents
 * went): the numbers from SQL (service role), one email to the admins and,
 * whether or not it could leave, the same text in their notifications (1.41.0).
 * The week is the idempotency key, so a second run of the cron the same evening
 * never sends or saves it twice. Never throws: a failure is one log line.
 */
export async function inviaContenutiSettimana({
  db,
  settimana,
  admin,
  urlApp,
  invia = inviaEmail,
}: {
  db: Db
  settimana: { da: string; a: string }
  admin: Destinatario[]
  urlApp: string
  invia?: typeof inviaEmail
}): Promise<'inviato' | 'non inviato' | 'non riuscito'> {
  const { data, error } = await db.rpc('riepilogo_contenuti_settimana', { p_da: settimana.da, p_a: settimana.a })
  if (error || !data) {
    console.error('[giornaliero] contenuti della settimana', error?.message ?? 'nessun dato')
    return 'non riuscito'
  }
  const email = emailContenutiSettimana(data as unknown as RiepilogoContenutiSettimana, urlApp)
  const chiave = `contenuti-settimana/${settimana.da}/${settimana.a}`
  let inviata = false
  if (emailConfigurata() && admin.length > 0) {
    const invio = await invia({
      a: admin.map((d) => d.email).filter(Boolean),
      ...email,
      idempotenza: chiave,
      timeoutMs: TEMPO_CONTENUTI_SETTIMANA_MS,
    })
    inviata = invio.inviata
  }
  await registraNotifica({
    db: db as Parameters<typeof registraNotifica>[0]['db'],
    destinatari: admin.map((d) => d.id),
    notifica: {
      tipo: 'contenuti_settimana',
      titolo: email.oggetto,
      testo: email.testo,
      corpoHtml: email.html,
      link: '/marketing/pubblicati',
      emailInviata: inviata,
      chiave,
    },
  })
  return inviata ? 'inviato' : 'non inviato'
}
