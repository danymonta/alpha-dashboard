import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { analizzaReel } from '@/lib/marketing/analisi/analizza'
import { USO_ZERO, type UsoToken } from '@/lib/marketing/analisi/tipi'
import { leggiReel } from '@/lib/marketing/video/leggi'

/**
 * One step of the reel work (1.36.0, CLAUDE.md section 30), the one the
 * database posted to /api/cron/marketing with a lease (marketing_prendi_passo):
 * the reading of a reel (video, speech, frames, Claude's visual card) or the
 * analysis of one (numbers, leads, calendar, Claude's text). At the end,
 * always, marketing_passo_finito: the tokens and the audio seconds are added
 * to the month's cost in SQL, the lease is freed and the next step is sent if
 * there is more work due (not after a rate limit of a provider: the tick
 * starts again in 5 minutes). Never throws: whatever happens inside the step
 * is its own outcome, and the job left half-way is brought back by the
 * watchdog of the tick.
 */

export type EsitoPassoMarketing = {
  esito: 'ok' | 'parziale' | 'fallito' | 'limite_fornitore'
  contatori: { input: number; cache_scritti: number; cache_letti: number; output: number; secondi_audio: number }
}

export function contatoriDa(uso: UsoToken, secondiAudio: number): EsitoPassoMarketing['contatori'] {
  return {
    input: uso.input_tokens,
    cache_scritti: uso.cache_creation_input_tokens,
    cache_letti: uso.cache_read_input_tokens,
    output: uso.output_tokens,
    secondi_audio: Math.max(0, Math.round(secondiAudio)),
  }
}

export async function eseguiPassoMarketing(op: {
  db: AdminClient
  /** the lease's id (marketing_prendi_passo) */
  passo: string
  cosa: 'lettura' | 'analisi'
  /** the media id of a reading, the analysis id of an analysis */
  rif: string
  /** epoch ms: the step's deadline */
  entro: number
  cliente?: Anthropic
  fetch?: typeof fetch
}): Promise<EsitoPassoMarketing> {
  const { db } = op
  let esito: EsitoPassoMarketing['esito'] = 'fallito'
  let uso: UsoToken = { ...USO_ZERO }
  let secondiAudio = 0
  try {
    if (op.cosa === 'lettura') {
      const r = await leggiReel({ db, media_id: op.rif, entro: op.entro, cliente: op.cliente, fetch: op.fetch })
      esito = r.esito
      uso = r.uso
      secondiAudio = r.secondiAudio
    } else {
      const r = await analizzaReel({ db, id: op.rif, entro: op.entro, cliente: op.cliente })
      esito = r.esito
      uso = r.uso
    }
  } catch (e) {
    console.error('[analisi] passo interrotto:', e instanceof Error ? e.name : 'errore')
  }

  const contatori = contatoriDa(uso, secondiAudio)
  try {
    const { error } = await db.rpc('marketing_passo_finito', { p_passo: op.passo, p_esito: esito, p_contatori: contatori })
    if (error) console.error('[analisi] passo non chiuso:', error.code ?? 'errore')
  } catch (e) {
    console.error('[analisi] passo non chiuso:', e instanceof Error ? e.name : 'errore')
  }
  return { esito, contatori }
}
