import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { analizzaCall } from '@/lib/call/analisi/analizza'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { USO_ZERO, type UsoToken } from '@/lib/marketing/analisi/tipi'
import { generaSpunti } from '@/lib/marketing/spunti/genera'

/**
 * One step of the call work (1.37.0, CLAUDE.md section 31), the one the database posted to
 * /api/cron/call with a lease (call_prendi_passo): the analysis of a held call or the weekly
 * brief of the Marketing area. At the end, always, call_passo_finito: the tokens are added to
 * the month's cost in SQL, the lease is freed and the next step is sent if there is more work
 * due (not after a rate limit of the provider: the tick starts again in 5 minutes). Never
 * throws; the job left half-way is brought back by the watchdog of the tick.
 */
export type EsitoPassoCall = {
  esito: 'ok' | 'parziale' | 'fallito' | 'limite_fornitore'
  contatori: { input: number; cache_scritti: number; cache_letti: number; output: number }
}

export function contatoriDa(uso: UsoToken): EsitoPassoCall['contatori'] {
  return { input: uso.input_tokens, cache_scritti: uso.cache_creation_input_tokens, cache_letti: uso.cache_read_input_tokens, output: uso.output_tokens }
}

export async function eseguiPassoCall(op: {
  db: AdminClient
  /** the lease's id (call_prendi_passo) */
  passo: string
  cosa: 'analisi' | 'spunti'
  /** the call id of an analysis, the brief id of a brief */
  rif: string
  /** epoch ms: the step's deadline */
  entro: number
  cliente?: Anthropic
  fetch?: typeof fetch
}): Promise<EsitoPassoCall> {
  const { db } = op
  let esito: EsitoPassoCall['esito'] = 'fallito'
  let uso: UsoToken = { ...USO_ZERO }
  try {
    const r =
      op.cosa === 'analisi'
        ? await analizzaCall({ db, callId: op.rif, passo: op.passo, entro: op.entro, cliente: op.cliente, fetch: op.fetch })
        : await generaSpunti({ db, id: op.rif, passo: op.passo, entro: op.entro, cliente: op.cliente })
    esito = r.esito
    uso = r.uso
  } catch (e) {
    console.error('[call] passo interrotto:', e instanceof Error ? e.name : 'errore')
  }
  const contatori = contatoriDa(uso)
  try {
    const { error } = await db.rpc('call_passo_finito', { p_passo: op.passo, p_esito: esito, p_contatori: contatori })
    if (error) console.error('[call] passo non chiuso:', error.code ?? 'errore')
  } catch (e) {
    console.error('[call] passo non chiuso:', e instanceof Error ? e.name : 'errore')
  }
  return { esito, contatori }
}
