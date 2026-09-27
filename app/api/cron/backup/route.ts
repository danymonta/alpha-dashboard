import { NextResponse, type NextRequest } from 'next/server'

import { creaBackup, fileBackup } from '@/lib/backup/crea'
import { emailBackup } from '@/lib/email/backup'
import { emailConfigurata, inviaEmail } from '@/lib/email/invia'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Every Monday (vercel.json): the whole database, gzipped, by email to the
 * active admins. Supabase Free keeps no backups (CLAUDE.md section 15).
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
    const backup = await creaBackup(admin)
    const file = fileBackup(backup)
    const esito = await inviaEmail({ a: indirizzi, ...emailBackup(backup, file.nome), allegati: [file] })
    if (!esito.inviata) return NextResponse.json({ ok: false, errore: 'Email non inviata' }, { status: 502 })
    return NextResponse.json({ ok: true, file: file.nome, byte: file.contenuto.length, a: indirizzi.length })
  } catch (e) {
    console.error('[backup]', e)
    return NextResponse.json({ ok: false, errore: 'Backup non riuscito' }, { status: 500 })
  }
}
