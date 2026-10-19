import { NextResponse, type NextRequest } from 'next/server'

import { inviaBackup } from '@/lib/backup/invia'
import { emailConfigurata } from '@/lib/email/invia'
import { oggiRoma } from '@/lib/date'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The backup on demand (the Monday one runs inside /api/cron/giornaliero):
 * the whole database, gzipped, by email to the active admins; the notification
 * in the app (no attachment) is saved either way.
 */
export async function GET(request: NextRequest) {
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }
  const admin = createAdminClient()
  const { data: destinatari } = await admin.from('profiles').select('id, email').eq('ruolo', 'admin').eq('attivo', true)
  const admins = (destinatari ?? []).filter((d) => d.email)
  if (admins.length === 0) return NextResponse.json({ errore: 'Nessun admin attivo' }, { status: 500 })
  try {
    // without email configured nothing is built or sent, but the notification in the app is saved (1.41.0)
    const esito = await inviaBackup(admin, admins, oggiRoma())
    if (!emailConfigurata()) {
      return NextResponse.json(
        { errore: 'Email non configurata: RESEND_API_KEY ed EMAIL_MITTENTE' },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: esito.inviata, ...esito }, { status: esito.inviata ? 200 : 502 })
  } catch (e) {
    console.error('[backup]', e)
    return NextResponse.json({ ok: false, errore: 'Backup non riuscito' }, { status: 500 })
  }
}
