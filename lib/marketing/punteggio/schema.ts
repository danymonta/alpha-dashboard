import { z } from 'zod/v4'

import { formato } from '@/lib/insight/schema'
import { FLAG_DI_CLAUDE, NOME_TIPO, SEGNALAZIONI_DI_CLAUDE, TUTTI_I_CRITERI } from '@/lib/marketing/punteggio/tabelle'
import { CATEGORIE_HOOK } from '@/lib/marketing/punteggio/tipi'

/**
 * What Claude answers in the content scoring (1.39.0, CLAUDE.md section 30):
 * only votes, passages, reasons, corrections, flags and the redo. No total, no
 * weighted score, no band: the code computes them (tabelle.ts). Only what
 * structured outputs support: closed objects with every key required, enums,
 * arrays, strings, booleans and nullable values; no numeric or length
 * constraints (verifica.ts rounds, clamps and cuts), unions as anyOf. Every
 * leaf is a fresh instance. The bytes of this format are part of the prompt
 * cache key: a change here is a change of VERSIONE_PROMPT_PUNTEGGIO too.
 *
 * The same shape twice: the strict one goes to the API as the output format,
 * the lenient one reads the answer (the enums as plain strings, so a drift
 * drops one entry instead of the whole answer).
 */

const testo = () => z.string()

function costruisci(stretto: boolean) {
  const nomiTipo = Object.values(NOME_TIPO) as [string, ...string[]]
  const tipo = () => (stretto ? z.enum(nomiTipo) : z.string())
  const idCriterio = () => (stretto ? z.enum(TUTTI_I_CRITERI) : z.string())
  const flag = () => (stretto ? z.enum(FLAG_DI_CLAUDE as unknown as [string, ...string[]]) : z.string())
  const segnalazione = () => (stretto ? z.enum(SEGNALAZIONI_DI_CLAUDE) : z.string())
  const categoria = () => (stretto ? z.enum(CATEGORIE_HOOK) : z.string())

  return z.object({
    tipo: tipo(),
    motivo_classificazione: testo(),
    hook: z.object({ testo: testo(), cita_icp: z.boolean(), categoria: categoria() }),
    criteri: z.array(
      z.object({
        id: idCriterio(),
        voto: z.number(),
        citazione: testo(),
        motivazione: testo(),
        correzione: testo(),
      }),
    ),
    penalita: z.array(z.object({ flag: flag(), riga: testo() })),
    violazioni_formali: z.array(z.object({ descrizione: testo(), riga: testo() })),
    segnalazioni: z.array(z.object({ tipo: segnalazione(), nota: testo() })),
    punti_di_forza: z.array(testo()),
    problemi_prioritari: z.array(z.object({ criterio: idCriterio(), problema: testo() })),
    confronto_benchmark: z.union([z.string(), z.null()]),
    rifacimento: z.object({
      istruzioni: z.array(testo()),
      hook_alternativi: z.array(z.object({ testo: testo(), categoria: categoria(), perche_funziona: testo() })),
      script_riscritto: testo(),
      caption_riscritta: testo(),
      punteggio_atteso: z.number(),
    }),
  })
}

/** The schema of the output format (strict). */
export const SchemaPunteggio = costruisci(true)
/** The schema that reads the answer (enums as strings). */
export const LettoPunteggio = costruisci(false)

export type PunteggioModello = z.infer<typeof LettoPunteggio>

export const FORMATO_PUNTEGGIO = formato(SchemaPunteggio)
