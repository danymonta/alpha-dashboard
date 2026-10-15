import { createHash, timingSafeEqual } from 'node:crypto'

import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

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
/** The key of the steps is read again from Vault after this long (a rotated key works at once anyway). */
const CHIAVE_IN_CACHE_MS = 5 * 60_000

const corpoSchema = z.object({ esecuzione: z.string().uuid() })

let chiaveInCache: { valore: string; letta: number } | null = null

/** Compares two secrets in constant time (their digests have the same length). */
function uguali(a: string, b: string): boolean {
  const x = createHash('sha256').update(a, 'utf8').digest()
  const y = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(x, y)
}

async function leggiChiave(db: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data, error } = await db.rpc('insight_chiave')
  if (error) {
    console.error('[insight] chiave non letta:', error.code ?? 'errore')
    return null
  }
  const valore = typeof data === 'string' ? data.trim() : ''
  if (!valore) return null
  chiaveInCache = { valore, letta: Date.now() }
  return valore
}

/** The Bearer of the request: the key of the steps (pg_net), or CRON_SECRET (a manual call, the e2e test). */
async function autorizzato(request: NextRequest, db: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const intestazione = request.headers.get('authorization') ?? ''
  const fornita = intestazione.startsWith('Bearer ') ? intestazione.slice('Bearer '.length).trim() : ''
  if (!fornita) return false
  const cron = process.env.CRON_SECRET?.trim()
  if (cron && uguali(fornita, cron)) return true
  const fresca = chiaveInCache && Date.now() - chiaveInCache.letta < CHIAVE_IN_CACHE_MS ? chiaveInCache.valore : null
  if (fresca && uguali(fornita, fresca)) return true
  // a mismatch, or no key in cache: read once more before refusing (a rotated key works at once)
  const chiave = await leggiChiave(db)
  return chiave !== null && uguali(fornita, chiave)
}

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
