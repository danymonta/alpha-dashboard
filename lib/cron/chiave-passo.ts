import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import type { NextRequest } from 'next/server'

import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Who may post a step to /api/cron/insight and /api/cron/marketing (1.35.0,
 * 1.36.0): the database (pg_net, insight_dispatch / marketing_dispatch) with
 * the key of the steps in Vault (insight_chiave), or a person by hand with
 * CRON_SECRET (a manual call, the e2e tests). The key is read from Vault
 * through the service role, kept 5 minutes in memory and read again before
 * refusing, so a key the admin has just rotated (insight_ruota_chiave) works
 * at once. The comparison is in constant time. The route answers 401 without
 * saying why.
 */

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

/** The key of the steps is read again from Vault after this long. */
const CHIAVE_IN_CACHE_MS = 5 * 60_000

let chiaveInCache: { valore: string; letta: number } | null = null

/** Compares two secrets in constant time (their digests have the same length). */
function uguali(a: string, b: string): boolean {
  const x = createHash('sha256').update(a, 'utf8').digest()
  const y = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(x, y)
}

async function leggiChiave(db: Db): Promise<string | null> {
  const { data, error } = await db.rpc('insight_chiave')
  if (error) {
    console.error('[cron] chiave non letta:', error.code ?? 'errore')
    return null
  }
  const valore = typeof data === 'string' ? data.trim() : ''
  if (!valore) return null
  chiaveInCache = { valore, letta: Date.now() }
  return valore
}

/** The Bearer of the request: the key of the steps, or CRON_SECRET. */
export async function autorizzato(request: NextRequest | Request, db: Db): Promise<boolean> {
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
