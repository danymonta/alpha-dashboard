import { NextResponse, type NextRequest } from 'next/server'

import { inviaBackup } from '@/lib/backup/invia'
import { emailConfigurata } from '@/lib/email/invia'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The backup on demand (the Monday one runs inside /api/cron/giornaliero):
 * the whole database, gzipped, by email to the active admins.
 */
export async function GET(request: NextRequest) {
  const atteso = process.env.CRON_SECRET
  if (!atteso) return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }
  if (!emailConfigurata()) {
    return NextResponse.json({ errore: 'Email non configurata: RESEND_API_KEY ed EMAIL_MITTENTE' }, { status: 500 })
  }
  const admin = createAdminClient()
  const { data: destinatari } = await admin.from('profiles').select('email').eq('ruolo', 'admin').eq('attivo', true)
  const indirizzi = (destinatari ?? []).map((d) => d.email).filter(Boolean)
  if (indirizzi.length === 0) return NextResponse.json({ errore: 'Nessun admin attivo' }, { status: 500 })
  try {
    const esito = await inviaBackup(admin, indirizzi)
    return NextResponse.json({ ok: esito.inviata, ...esito }, { status: esito.inviata ? 200 : 502 })
  } catch (e) {
    console.error('[backup]', e)
    return NextResponse.json({ ok: false, errore: 'Backup non riuscito' }, { status: 500 })
  }
}
