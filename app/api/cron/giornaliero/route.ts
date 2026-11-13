import { NextResponse, type NextRequest } from 'next/server'

import { inviaBackup } from '@/lib/backup/invia'
import { sincronizzaCalendario } from '@/lib/calendario/leggi'
import { settimanaDeiContenuti } from '@/lib/email/contenuti-settimana'
import { inviaContenutiSettimana } from '@/lib/email/contenuti-settimana-invio'
import { lunediDellaSettimana, oggiRoma } from '@/lib/date'
import { emailConfigurata } from '@/lib/email/invia'
import { settimanaDelRiepilogo } from '@/lib/email/riepilogo'
import { inviaRiepilogoSettimana, type Destinatario } from '@/lib/email/riepilogo-invio'
import { inviaTempoTeam } from '@/lib/email/tempo-team-invio'
import { publicEnv } from '@/lib/env'
import { creaAvvisiDellaSera } from '@/lib/notifiche/collegamenti'
import { lavoraFoglio } from '@/lib/percorso/foglio-lavoro'
import { pulisciFileQuestionario, pulisciUtentiOrfani } from '@/lib/percorso/pulizia'
import { inviaPromemoriaPercorso } from '@/lib/promemoria/percorso'
import { createAdminClient } from '@/lib/supabase/admin'
import { settimanaPrecedente } from '@/lib/tempo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
/**
 * Every reminder email is over (Resend's answer or its timeout) by this much
 * of the 60 seconds: one is started only if it fits, the rest go tomorrow.
 */
const TEMPO_PROMEMORIA_MS = 50_000

/**
 * The one daily job (vercel.json, every evening), so the plan's cron limits
 * never bite:
 * - every evening, email or not, its first query keeps the Supabase Free
 *   project awake (it pauses after 7 days without requests);
 * - the in-app alerts for the admins (1.42.0, no email): the instalments that
 *   became overdue and the keys that end soon or that Meta/Fathom refused; each
 *   alert has a key, so a second run the same evening writes nothing;
 * - on Fridays (Europe/Rome), the weekly summary by email to the active admins,
 *   for the week from Saturday to Friday (Dany, 07/10/2026: once a week, no
 *   more every evening; settimanaDelRiepilogo, public.riepilogo_settimana);
 * - on Sundays, the week of the contents by email (Dany, 22/10/2026; settimanaDeiContenuti,
 *   public.riepilogo_contenuti_settimana);
 * - on Mondays, the weekly backup and, after it, last week's team time by email
 *   to the same admins (Dany, 21/10/2026; settimanaPrecedente, public.riepilogo_tempo_team);
 * - the users of the clients without an account (1.79.0, lib/percorso/pulizia.ts);
 * - the path reminders ("Call dei 3 mesi", "Call di rinnovo"), one email each,
 *   to the same admins (04/10/2026), last because they can wait a day.
 * Every one of these emails is also saved for the admins in the app
 * (public.notifiche, 1.41.0), whether or not the email could leave: so without
 * RESEND_API_KEY the job still saves the notifications (and the keys make a
 * second run the same evening a no-op).
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
  const { data: destinatari, error } = await admin.from('profiles').select('id, email').eq('ruolo', 'admin').eq('attivo', true)
  if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 })

  const admins: Destinatario[] = (destinatari ?? []).filter((d) => d.email)
  if (admins.length === 0) return NextResponse.json({ ok: true, email: 'nessun admin' })

  const esito: Record<string, unknown> = { ok: true }
  if (!emailConfigurata()) esito.email = 'non configurata'

  // The calendar «Dany Discovery Call» before the counts (1.76.0): the Friday summary says the calls
  // booked up to now. A reading that fails is written for the admin and stops nothing.
  esito.calendario = (await sincronizzaCalendario(admin)).esito

  // The alerts first: they are quick and need no Resend. One that fails is logged and stops nothing.
  try {
    esito.avvisi = await creaAvvisiDellaSera({ db: admin, oggi, destinatari: admins.map((d) => d.id) })
  } catch (e) {
    console.error('[giornaliero] avvisi', e instanceof Error ? e.name : 'errore')
    esito.avvisi = 'non riusciti'
  }

  // The users of deleted clients (1.79.0): Auth is not cleaned from SQL. A failure stops nothing.
  try {
    esito.utenti_clienti = await pulisciUtentiOrfani(admin)
  } catch (e) {
    console.error('[giornaliero] utenti dei clienti', e instanceof Error ? e.name : 'errore')
    esito.utenti_clienti = 'non riuscita'
  }

  // The files of the questionnaire to delete (1.80.0): Storage is not cleaned from SQL. Stops nothing.
  try {
    esito.file_questionario = await pulisciFileQuestionario(admin)
  } catch (e) {
    console.error('[giornaliero] file del questionario', e instanceof Error ? e.name : 'errore')
    esito.file_questionario = 'non riuscita'
  }

  // The rows of the onboarding sheet still to write or clear (1.82.0): the retries of the day. Stops nothing.
  try {
    esito.foglio_onboarding = await lavoraFoglio(admin, { limite: 50 })
  } catch (e) {
    console.error('[giornaliero] foglio dell’onboarding', e instanceof Error ? e.name : 'errore')
    esito.foglio_onboarding = 'non riuscito'
  }

  // Friday in Rome: the week from Saturday to today. A summary that fails is
  // logged and never stops the reminders.
  const settimana = settimanaDelRiepilogo(oggi)
  esito.riepilogo = settimana
    ? await inviaRiepilogoSettimana({ db: admin, settimana, admin: admins, urlApp: publicEnv.appUrl })
    : 'solo il venerdì'

  // Sunday in Rome (Dany, 22/10/2026): how the week of the contents went, Monday to today. A
  // failure is logged and stops nothing.
  const settimanaContenuti = settimanaDeiContenuti(oggi)
  if (settimanaContenuti) {
    try {
      esito.contenuti_settimana = await inviaContenutiSettimana({
        db: admin,
        settimana: settimanaContenuti,
        admin: admins,
        urlApp: publicEnv.appUrl,
      })
    } catch (e) {
      console.error('[giornaliero] contenuti della settimana', e instanceof Error ? e.name : 'errore')
      esito.contenuti_settimana = 'non riuscito'
    }
  } else {
    esito.contenuti_settimana = 'solo la domenica'
  }

  // Monday in Rome: the weekly backup rides along
  if (lunediDellaSettimana(oggi) === oggi) {
    try {
      const backup = await inviaBackup(admin, admins, oggi)
      esito.backup = backup.inviata ? backup.file : 'non inviato'
    } catch (e) {
      console.error('[giornaliero] backup', e)
      esito.backup = 'non riuscito'
    }
    // after the backup: on the Free plan it is the only one, it never waits behind an optional email
    try {
      esito.tempo_team = await inviaTempoTeam({ db: admin, settimana: settimanaPrecedente(oggi), admin: admins, urlApp: publicEnv.appUrl })
    } catch (e) {
      console.error('[giornaliero] tempo del team', e instanceof Error ? e.name : 'errore')
      esito.tempo_team = 'non riuscito'
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
      indirizzi: admins.map((d) => d.email),
      destinatari: admins.map((d) => d.id),
      urlApp: publicEnv.appUrl,
      entro: avvio + TEMPO_PROMEMORIA_MS,
    })
  } catch (e) {
    console.error('[giornaliero] promemoria', e)
    esito.promemoria = 'non riusciti'
  }
  return NextResponse.json(esito)
}
