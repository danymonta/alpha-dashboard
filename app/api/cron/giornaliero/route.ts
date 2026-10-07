import { NextResponse, type NextRequest } from 'next/server'

import { inviaBackup } from '@/lib/backup/invia'
import { lunediDellaSettimana, oggiRoma } from '@/lib/date'
import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { emailRiepilogo, settimanaDelRiepilogo, type Riepilogo } from '@/lib/email/riepilogo'
import { publicEnv } from '@/lib/env'
import { inviaPromemoriaPercorso } from '@/lib/promemoria/percorso'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
/**
 * Every reminder email is over (Resend's answer or its timeout) by this much
 * of the 60 seconds: one is started only if it fits, the rest go tomorrow.
 */
const TEMPO_PROMEMORIA_MS = 50_000
/** The weekly summary waits at most this long for Resend: the reminders come after it. */
const TEMPO_RIEPILOGO_MS = 10_000

/**
 * The one daily job (vercel.json, every evening), so the plan's cron limits
 * never bite:
 * - every evening, email or not, its first query keeps the Supabase Free
 *   project awake (it pauses after 7 days without requests);
 * - on Fridays (Europe/Rome), the weekly summary by email to the active admins,
 *   for the week from Saturday to Friday (Dany, 07/10/2026: once a week, no
 *   more every evening; settimanaDelRiepilogo, public.riepilogo_settimana);
 * - on Mondays, the weekly backup;
 * - the path reminders ("Call dei 3 mesi", "Call di rinnovo"), one email each,
 *   to the same admins (04/10/2026), last because they can wait a day.
 */
export async function GET(request: NextRequest) {
  const avvio = Date.now()
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const admin = createAdminClient()
  const oggi = oggiRoma()

  // every evening, Friday or not, email configured or not: the keep-alive query
  const { data: destinatari, error } = await admin.from('profiles').select('email').eq('ruolo', 'admin').eq('attivo', true)
  if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 })
  if (!emailConfigurata()) return NextResponse.json({ ok: true, email: 'non configurata' })

  const indirizzi = (destinatari ?? []).map((d) => d.email).filter(Boolean)
  if (indirizzi.length === 0) return NextResponse.json({ ok: true, email: 'nessun admin' })

  const esito: Record<string, unknown> = { ok: true }

  // Friday in Rome: the week from Saturday to today. A summary that fails is
  // logged and never stops the reminders.
  const settimana = settimanaDelRiepilogo(oggi)
  esito.riepilogo = settimana ? await inviaRiepilogo(admin, settimana, indirizzi) : 'solo il venerdì'

  // Monday in Rome: the weekly backup rides along
  if (lunediDellaSettimana(oggi) === oggi) {
    try {
      const backup = await inviaBackup(admin, indirizzi)
      esito.backup = backup.inviata ? backup.file : 'non inviato'
    } catch (e) {
      console.error('[giornaliero] backup', e)
      esito.backup = 'non riuscito'
    }
  }

  // Last, as they can wait: each one booked before its email (a second run of
  // the cron the same evening never doubles it) and recorded as sent only once
  // Resend took it, so a failed one, or one past the time limit, goes again
  // tomorrow evening.
  try {
    esito.promemoria = await inviaPromemoriaPercorso({
      db: admin,
      oggi,
      indirizzi,
      urlApp: publicEnv.appUrl,
      entro: avvio + TEMPO_PROMEMORIA_MS,
    })
  } catch (e) {
    console.error('[giornaliero] promemoria', e)
    esito.promemoria = 'non riusciti'
  }
  return NextResponse.json(esito)
}

/**
 * The week's numbers from SQL (service role), then one email to the admins.
 * Resend's Idempotency-Key is the week: a second run of the cron the same
 * evening (Vercel may deliver the event twice) never sends it twice.
 */
async function inviaRiepilogo(
  admin: ReturnType<typeof createAdminClient>,
  settimana: { da: string; a: string },
  indirizzi: string[],
): Promise<'inviato' | 'non inviato' | 'non riuscito'> {
  const { data, error } = await admin.rpc('riepilogo_settimana', { p_da: settimana.da, p_a: settimana.a })
  if (error || !data) {
    console.error('[giornaliero] riepilogo', error?.message ?? 'nessun dato')
    return 'non riuscito'
  }
  const invio = await inviaEmail({
    a: indirizzi,
    ...emailRiepilogo(data as unknown as Riepilogo, publicEnv.appUrl),
    idempotenza: `riepilogo-settimana/${settimana.da}/${settimana.a}`,
    timeoutMs: TEMPO_RIEPILOGO_MS,
  })
  return invio.inviata ? 'inviato' : 'non inviato'
}
