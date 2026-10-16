import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'

import { chiediAClaude } from '@/lib/marketing/analisi/claude'
import { effortAnalisi, MINIMO_ANALISI_MS } from '@/lib/marketing/analisi/config'
import type { OpzioniVerifica } from '@/lib/marketing/analisi/verifica'
import { contenutoPunteggio, sistemaPunteggio } from '@/lib/marketing/punteggio/prompt'
import { FORMATO_PUNTEGGIO, LettoPunteggio } from '@/lib/marketing/punteggio/schema'
import type { CodiceErroreClaude, SchedaVisiva, UsoToken } from '@/lib/marketing/analisi/tipi'
import type { PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'
import { contaParole, verificaPunteggio, type ContestoPunteggio, type FontiPunteggio } from '@/lib/marketing/punteggio/verifica'
import type { ConteggiControllo } from '@/lib/marketing/analisi/oscura'

/**
 * The content scoring of a reel (1.39.0, CLAUDE.md section 30): one request to
 * Claude with Dany's guide and the ideal client in the system, the reel in the
 * user's turn, and the strict layer that turns the answer into a score. It runs
 * only inside a click (the analysis of a reel, «Analizza»), next to the analysis
 * text, never alone and never by itself. Never throws.
 */

/** The least time that must remain for the request to start (the same as the analysis'). */
export const MINIMO_PUNTEGGIO_MS = MINIMO_ANALISI_MS

/** Spoken Italian: about two and a half words a second (section 22, RL). */
export const PAROLE_AL_SECONDO = 2.5

/** The on-screen texts of the visual card: the hook's, the sequence's and the CTA's. */
export function testiASchermo(s: SchedaVisiva | null | undefined): string[] {
  if (!s) return []
  const t = [s.gancio.testo_a_schermo, ...s.sequenza.map((x) => x.testo_a_schermo), s.cta.testo]
  return [...new Set(t.filter((x): x is string => typeof x === 'string' && x.trim() !== ''))]
}

/** The reel's duration: the one Instagram gave, else the estimate from the words spoken. */
export function durataDelReel(durataMs: number | null | undefined, parlato: string): number | null {
  if (typeof durataMs === 'number' && durataMs > 0) return Math.round(durataMs / 100) / 10
  const parole = contaParole(parlato)
  return parole > 0 ? Math.round(parole / PAROLE_AL_SECONDO) : null
}

export type EsitoPunteggio =
  | { ok: true; dati: PunteggioContenuto; uso: UsoToken; modello: string; conteggi: ConteggiControllo; scartate: number }
  | { ok: false; codice: CodiceErroreClaude | 'illeggibile'; uso: UsoToken }

export async function valutaContenuto(op: {
  /** what goes to Claude in <reel>, already cleaned of the names */
  reel: Record<string, unknown>
  /** the same published texts, for the checks */
  fonti: FontiPunteggio
  contesto: ContestoPunteggio
  opzioni: OpzioniVerifica
  /** epoch ms: the step's deadline */
  entro: number
  segnale?: AbortSignal
  cliente?: Anthropic
}): Promise<EsitoPunteggio> {
  const risposta = await chiediAClaude({
    passo: 'punteggio',
    sistema: sistemaPunteggio(),
    contenuto: contenutoPunteggio(op.reel),
    formato: FORMATO_PUNTEGGIO,
    schema: LettoPunteggio,
    effort: effortAnalisi(),
    minimo: MINIMO_PUNTEGGIO_MS,
    entro: op.entro,
    segnale: op.segnale,
    cliente: op.cliente,
  })
  if (!risposta.ok) return { ok: false, codice: risposta.codice, uso: risposta.uso }
  const verificato = verificaPunteggio(risposta.dati, op.fonti, op.contesto, op.opzioni)
  if (!verificato) return { ok: false, codice: 'illeggibile', uso: risposta.uso }
  return { ok: true, dati: verificato.dati, uso: risposta.uso, modello: risposta.modello, conteggi: verificato.conteggi, scartate: verificato.scartate }
}
