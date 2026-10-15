import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { chiediAClaude } from '@/lib/marketing/analisi/claude'
import { effortVisione, MINIMO_VISIONE_MS } from '@/lib/marketing/analisi/config'
import { FORMATO_SCHEDA_VISIVA, LettoSchedaVisiva, type SchedaVisivaModello } from '@/lib/marketing/analisi/schema'
import { contenutoVisione, sistemaVisione, type ImmagineDaMandare } from '@/lib/marketing/analisi/prompt'
import type { RispostaClaude } from '@/lib/marketing/analisi/tipi'

/**
 * The first pass (1.36.0): Claude looks at the cover and the frames of a reel,
 * each next to what is said at that moment, and writes its visual card.
 * Without the numbers: they come in the second pass. Once for a reel, and again
 * when the prompt changes or somebody asks.
 */
export async function vediReel(op: {
  immagini: readonly ImmagineDaMandare[]
  /** the reel's data for the <reel> block (caption, length, audio, calendar content), already cleaned of names */
  reel: unknown
  entro: number
  segnale?: AbortSignal
  cliente?: Anthropic
}): Promise<RispostaClaude<SchedaVisivaModello>> {
  return chiediAClaude<SchedaVisivaModello>({
    passo: 'visione',
    sistema: sistemaVisione(),
    contenuto: contenutoVisione(op.immagini, op.reel),
    formato: FORMATO_SCHEDA_VISIVA,
    schema: LettoSchedaVisiva,
    effort: effortVisione(),
    minimo: MINIMO_VISIONE_MS,
    entro: op.entro,
    segnale: op.segnale,
    cliente: op.cliente,
  })
}
