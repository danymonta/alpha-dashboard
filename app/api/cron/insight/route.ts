import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { autorizzato } from '@/lib/cron/chiave-passo'
import { insightConfigurato } from '@/lib/insight/config'
import { eseguiPasso, TEMPO_PASSO_MS } from '@/lib/insight/esecuzione'
import { FRASI_INSIGHT } from '@/lib/insight/frasi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
/**
 * Vercel Hobby with Fluid compute: 300 seconds at most. The step works for
 * 240 (TEMPO_PASSO_MS) inside after(), which runs within this same budget
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md);
 * its lease is 330 seconds, longer than this, so an expired lease always
 * means a dead invocation (C2).
 */
export const maxDuration = 300

/** The step's lease, in seconds (insight_prendi_passo). */
const LEASE_SECONDI = 330
const corpoSchema = z.object({ esecuzione: z.string().uuid() })

/**
 * One step of a run of the Insight (1.35.0, CLAUDE.md section 29), sent by
 * the database (pg_net, insight_dispatch) with the key of the steps
 * (insight_chiave in Vault), or by hand with CRON_SECRET. It answers 202 at
 * once and works inside after(): the reading, the analysis with Claude or the
 * recap (lib/insight/esecuzione.ts), which ends by dispatching the next step
 * (insight_passo_finito) or failing the run with a sentence for the admin.
 *
 * Under /api/cron, a public path of the proxy: the key is the only door. The
 * answer never says why a key is wrong, and the log says the run's prefix,
 * the step, the seconds and the counters: never a text, a username or a key.
 */
export async function POST(request: NextRequest) {
  const avvio = Date.now()
  const db = createAdminClient()

  if (!(await autorizzato(request, db))) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    corpo = null
  }
  const letto = corpoSchema.safeParse(corpo)
  if (!letto.success) return NextResponse.json({ errore: 'Richiesta non valida' }, { status: 400 })
  const esecuzione = letto.data.esecuzione

  if (!insightConfigurato()) {
    const { error } = await db.rpc('insight_fallita', { p_esecuzione: esecuzione, p_errore: FRASI_INSIGHT.nonConfigurato })
    if (error) console.error('[insight] esecuzione non chiusa:', error.code ?? 'errore')
    return NextResponse.json({ errore: 'Insight non configurato' }, { status: 503 })
  }

  const { data, error } = await db.rpc('insight_prendi_passo', { p_esecuzione: esecuzione, p_secondi: LEASE_SECONDI })
  if (error) {
    console.error('[insight] passo non preso:', error.code ?? 'errore')
    return NextResponse.json({ errore: 'Passo non preso' }, { status: 500 })
  }
  const passo = data?.[0]
  if (!passo) return NextResponse.json({ errore: 'Passo già in corso o esecuzione finita' }, { status: 409 })

  after(async () => {
    const esito = await eseguiPasso({
      db,
      esecuzione,
      passo: passo.passo,
      giorno: passo.giorno,
      motivo: passo.motivo,
      progresso: passo.progresso !== null && typeof passo.progresso === 'object' && !Array.isArray(passo.progresso) ? passo.progresso : {},
      entro: avvio + TEMPO_PASSO_MS,
    })
    const secondi = Math.round((Date.now() - avvio) / 1000)
    if (esito.ok) {
      console.info('[insight] passo', esecuzione.slice(0, 8), passo.passo, `${secondi}s`, esito.prossimo ?? 'pronta', JSON.stringify(esito.contatori))
    } else {
      console.info('[insight] passo', esecuzione.slice(0, 8), passo.passo, `${secondi}s`, 'fallita')
    }
  })

  return NextResponse.json({ ok: true, passo: passo.passo }, { status: 202 })
}
