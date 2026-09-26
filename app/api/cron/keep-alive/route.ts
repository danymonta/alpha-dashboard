import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Supabase Free pauses a project after 7 days without traffic.
 * Vercel Cron calls this once a day with the CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const atteso = process.env.CRON_SECRET

  if (!atteso) {
    return NextResponse.json({ errore: 'CRON_SECRET non configurato' }, { status: 500 })
  }

  const autorizzazione = request.headers.get('authorization')

  if (autorizzazione !== `Bearer ${atteso}`) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json({ ok: false, errore: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, quando: new Date().toISOString() })
}
