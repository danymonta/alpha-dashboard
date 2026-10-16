import { after, NextResponse, type NextRequest } from 'next/server'

import { eseguiPassoCall } from '@/lib/call/lavori/esegui'
import { TEMPO_PASSO_CALL_MS } from '@/lib/call/lavori/config'
import { autorizzato } from '@/lib/cron/chiave-passo'
import { insightConfigurato } from '@/lib/insight/config'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
/**
 * Vercel Hobby with Fluid compute: 300 seconds at most. The step works for 240
 * (TEMPO_PASSO_CALL_MS) inside after(), which runs within this same budget; its lease is 330
 * seconds, longer than this, so an expired lease always means a dead invocation.
 */
export const maxDuration = 300

const LEASE_SECONDI = 330

/**
 * One step of the call work (1.37.0, CLAUDE.md section 31), posted by the database (pg_net,
 * call_dispatch) with the key of the steps in Vault, or by hand with CRON_SECRET. It takes
 * the next job the database says is due (the analysis of a call, the weekly brief), answers 202
 * at once and works inside after(); the step ends by freeing the lease and dispatching the next
 * one (call_passo_finito). 204 when nothing is due or another step holds the lease. Without
 * ANTHROPIC_API_KEY no step is taken: the outcome says so and the jobs wait in the queue.
 *
 * Under /api/cron, a public path of the proxy: the key is the only door. The answer never says
 * why a key is wrong, and the log has only the kind of job, the seconds and the outcome: never a
 * transcript, a text, a link or a key.
 */
export async function POST(request: NextRequest) {
  const avvio = Date.now()
  const db = createAdminClient()

  if (!(await autorizzato(request, db))) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }
  if (!insightConfigurato()) {
    const { error } = await db.rpc('call_segna_esito', { p_esito: 'senza_chiave', p_errore: 'Analisi spente: manca la chiave di Claude su Vercel.' })
    if (error) console.error('[call] esito non scritto:', error.code ?? 'errore')
    return NextResponse.json({ errore: 'Analisi spente' }, { status: 503 })
  }

  const { data, error } = await db.rpc('call_prendi_passo', { p_secondi: LEASE_SECONDI })
  if (error) {
    console.error('[call] passo non preso:', error.code ?? 'errore')
    return NextResponse.json({ errore: 'Passo non preso' }, { status: 500 })
  }
  const passo = data?.[0]
  if (!passo) return new NextResponse(null, { status: 204 })

  const cosa = passo.cosa === 'spunti' ? 'spunti' : 'analisi'
  after(async () => {
    const esito = await eseguiPassoCall({ db, passo: passo.passo, cosa, rif: passo.rif, entro: avvio + TEMPO_PASSO_CALL_MS })
    console.info('[call] passo', cosa, `${Math.round((Date.now() - avvio) / 1000)}s`, esito.esito)
  })

  return NextResponse.json({ ok: true, cosa }, { status: 202 })
}
