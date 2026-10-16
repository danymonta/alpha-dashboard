import type { CriterioPerformance, GiudizioCriterio } from '@/lib/call/analisi/icp-call'

/**
 * The level of a call, worked out by the code from the five criteria Claude judged (1.37.0,
 * CLAUDE.md section 31). Claude says sì / in parte / no / non applicabile for each; the level
 * is not its opinion: sì counts 2, in parte 1, no 0, over the applicable criteria. The
 * closer confirms or changes it; it is never written by itself. Pure.
 *
 * ratio >= 0.90 ottima, >= 0.75 buona, >= 0.55 discreta, >= 0.35 media, else scarsa.
 * The thresholds are tuned with Dany after a month, comparing what was proposed with what he
 * chose (both are kept in call_valutazioni).
 */
export type LivelloPerformance = 'ottima' | 'buona' | 'discreta' | 'media' | 'scarsa'

const PUNTI: Record<Exclude<GiudizioCriterio, 'non_applicabile'>, number> = { si: 2, in_parte: 1, no: 0 }

export const SOGLIE_PERFORMANCE: readonly [number, LivelloPerformance][] = [
  [0.9, 'ottima'],
  [0.75, 'buona'],
  [0.55, 'discreta'],
  [0.35, 'media'],
]

export function livelloPerformance(criteri: Record<CriterioPerformance, GiudizioCriterio>): LivelloPerformance | null {
  let punti = 0
  let applicabili = 0
  for (const g of Object.values(criteri)) {
    if (g === 'non_applicabile') continue
    punti += PUNTI[g]
    applicabili++
  }
  if (applicabili === 0) return null
  const rapporto = punti / (2 * applicabili)
  for (const [soglia, livello] of SOGLIE_PERFORMANCE) if (rapporto >= soglia) return livello
  return 'scarsa'
}
