import { z } from 'zod/v4'

import {
  CHIAVI_CATEGORIE,
  CHIAVI_DESIDERI,
  CHIAVI_GIA_PROVATO,
  CHIAVI_MOMENTI,
  CHIAVI_PAIN,
  CHIAVI_SAPEVA,
} from '@/lib/call/analisi/icp-call'
import { formato } from '@/lib/insight/schema'

/**
 * What Claude answers for a held call (1.37.0, CLAUDE.md section 31). Only what structured
 * outputs support: closed objects with every key required, enums, arrays, strings,
 * booleans and nullable values; NO .max(), .min() or .length(): the limits in the comments
 * are applied by lib/call/analisi/verifica.ts, which truncates and never refuses. Every
 * leaf is a fresh instance (a reused one would become a $ref). The bytes of this format are
 * part of the prompt cache key: a change here is a change of the prompt's version too.
 */
const testo = () => z.string()
const testoONull = () => z.union([z.string(), z.null()])
const giudizio = () => z.enum(['si', 'in_parte', 'no', 'non_applicabile'])

export const SchemaAnalisiCall = z.object({
  // ≤ 700, in Italian, no names, no figures, no health
  riassunto: testo(),
  esito_letto: z.enum(['chiusa', 'follow_up', 'persa', 'non_chiaro']),
  lead: z.object({
    in_target: z.enum(['si', 'no', 'da_verificare']),
    // ≤ 5, ≤ 140
    segnali: z.array(z.object({ testo: testo(), verso: z.enum(['in_target', 'non_in_target']) })),
    // ≤ 300, aesthetic and emotional
    punto_a: testo(),
    punto_b: testo(),
    // ≤ 3 each
    pain: z.array(z.enum(CHIAVI_PAIN)),
    desideri: z.array(z.enum(CHIAVI_DESIDERI)),
    gia_provato: z.array(z.enum(CHIAVI_GIA_PROVATO)),
    // ≤ 3, ≤ 20 words: the lead's own words (admin and the call's closer only)
    frasi: z.array(testo()),
    // true only if the lead says an age under 18: the analysis is dropped
    minorenne: z.boolean(),
  }),
  // ≤ 5
  obiezioni: z.array(
    z.object({
      categoria: z.enum(CHIAVI_CATEGORIE),
      // ≤ 200
      sintesi: testo(),
      gestita: z.enum(['si', 'in_parte', 'no']),
      // ≤ 200
      risposta: testoONull(),
      // mm:ss
      minuto: testoONull(),
      momento: z.enum(['subito', 'durante', 'chiusura']),
    }),
  ),
  // ≤ 5, ≤ 120: what the lead asked, rephrased
  domande: z.array(testo()),
  // ≤ 3, ≤ 120: only when the call closed
  convinto_da: z.array(testo()),
  // ≤ 500, only when it went to follow-up or was lost
  motivo_proposto: testoONull(),
  setting: z.object({
    // ≤ 5
    sapeva: z.array(z.enum(CHIAVI_SAPEVA)),
    // ≤ 3, ≤ 160
    sorprese: z.array(testo()),
    // 1-3, ≤ 200: a phrase to say or a question to ask in the DMs, never about the person
    spunti_setter: z.array(testo()),
  }),
  // ≤ 4
  prossimi_passi: z.array(
    z.object({ cosa: testo(), quando: testoONull(), chi: z.enum(['closer', 'lead', 'setter']) }),
  ),
  // ≤ 4
  momenti: z.array(z.object({ minuto: testo(), etichetta: z.enum(CHIAVI_MOMENTI) })),
  performance: z.object({
    criteri: z.object({
      scoperta: giudizio(),
      obiettivo: giudizio(),
      presentazione: giudizio(),
      obiezioni: giudizio(),
      chiusura: giudizio(),
    }),
    // 2-4, ≤ 160
    perche: z.array(testo()),
    // ≤ 3
    funzionato: z.array(testo()),
    da_provare: z.array(testo()),
  }),
  // ≤ 2, ≤ 160
  spunti_contenuto: z.array(z.object({ idea: testo(), perche: testo() })),
})

export type AnalisiCallModello = z.infer<typeof SchemaAnalisiCall>
export const FORMATO_ANALISI_CALL = formato(SchemaAnalisiCall)
