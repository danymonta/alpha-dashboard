import { NextResponse, type NextRequest } from 'next/server'

import { inviaBackup } from '@/lib/backup/invia'
import { oggiRoma } from '@/lib/date'
import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { emailRiepilogo, type Riepilogo } from '@/lib/email/riepilogo'
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

/**
 * The one daily job (vercel.json, every evening), so the plan's cron limits
 * never bite:
 * - its queries keep the Supabase Free project awake;
 * - the evening summary by email to the active admins;
 * - on Mondays, the weekly backup too;
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
  const { data: riepilogo, error } = await admin.rpc('riepilogo_serale', { p_giorno: oggi })
  if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 })
  if (!emailConfigurata()) return NextResponse.json({ ok: true, email: 'non configurata' })

  const { data: destinatari } = await admin.from('profiles').select('email').eq('ruolo', 'admin').eq('attivo', true)
  const indirizzi = (destinatari ?? []).map((d) => d.email).filter(Boolean)
  if (indirizzi.length === 0) return NextResponse.json({ ok: true, email: 'nessun admin' })

  const esito: Record<string, unknown> = { ok: true }
  const serale = await inviaEmail({ a: indirizzi, ...emailRiepilogo(riepilogo as Riepilogo, publicEnv.appUrl) })
  esito.riepilogo = serale.inviata ? 'inviato' : 'non inviato'

  // Monday in Rome: the weekly backup rides along
  if (new Date(`${oggi}T12:00:00Z`).getUTCDay() === 1) {
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
