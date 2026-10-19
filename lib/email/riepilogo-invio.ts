import 'server-only'

import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { emailRiepilogo, type Riepilogo } from '@/lib/email/riepilogo'
import { registraNotifica } from '@/lib/notifiche/registra'
import type { createAdminClient } from '@/lib/supabase/admin'

/** An active admin of the app: the email goes to the address, the notification to the profile. */
export type Destinatario = { id: string; email: string }

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

/** The weekly summary waits at most this long for Resend: the reminders come after it. */
export const TEMPO_RIEPILOGO_MS = 10_000

/**
 * The week's numbers from SQL (service role), then one email to the admins and,
 * whether or not it could leave, the same summary in their notifications
 * (1.41.0). Resend's Idempotency-Key is the week: a second run of the cron the
 * same evening (Vercel may deliver the event twice) never sends it twice, and
 * the notification has the same key, so it is saved once.
 */
export async function inviaRiepilogoSettimana({
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
  const { data, error } = await db.rpc('riepilogo_settimana', { p_da: settimana.da, p_a: settimana.a })
  if (error || !data) {
    console.error('[giornaliero] riepilogo', error?.message ?? 'nessun dato')
    return 'non riuscito'
  }
  const email = emailRiepilogo(data as unknown as Riepilogo, urlApp)
  const chiave = `riepilogo-settimana/${settimana.da}/${settimana.a}`
  let inviata = false
  if (emailConfigurata() && admin.length > 0) {
    const invio = await invia({
      a: admin.map((d) => d.email).filter(Boolean),
      ...email,
      idempotenza: chiave,
      timeoutMs: TEMPO_RIEPILOGO_MS,
    })
    inviata = invio.inviata
  }
  await registraNotifica({
    db: db as Parameters<typeof registraNotifica>[0]['db'],
    destinatari: admin.map((d) => d.id),
    notifica: {
      tipo: 'riepilogo_settimana',
      titolo: email.oggetto,
      testo: email.testo,
      corpoHtml: email.html,
      link: '/',
      emailInviata: inviata,
      chiave,
    },
  })
  return inviata ? 'inviato' : 'non inviato'
}
