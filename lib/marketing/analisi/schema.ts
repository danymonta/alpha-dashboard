import { z } from 'zod/v4'

import { formato } from '@/lib/insight/schema'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE } from '@/lib/marketing/etichette'

/**
 * What Claude answers in the two passes of the reel analysis (1.36.0, CLAUDE.md
 * section 30): the visual card and the analysis with its ideas. Only what
 * structured outputs support: closed objects with every key required, enums,
 * arrays, strings, booleans and nullable values; no numeric or length
 * constraints (lib/marketing/analisi/verifica.ts slices and checks them),
 * unions as anyOf and never oneOf. Reel Type and Format are Notion's labels
 * («Education», «Raw Talking Head»): the strict layer turns them into the
 * database's values and drops one it does not know. Every leaf is a fresh
 * instance (a reused one would become a $ref). The bytes of these formats are
 * part of the prompt cache key: a change here is a change of the prompt's
 * version too.
 */

const testo = () => z.string()
const testoONull = () => z.union([z.string(), z.null()])
const numeroONull = () => z.union([z.number(), z.null()])
const livello = () => z.enum(['forte', 'medio', 'debole'])
const priorita = () => z.enum(['alta', 'media', 'bassa'])

export const ETICHETTE_REEL_TYPE = Object.values(ETICHETTA_REEL_TYPE) as [string, ...string[]]
export const ETICHETTE_FORMAT = Object.values(ETICHETTA_FORMAT) as [string, ...string[]]

/**
 * The same shape twice: the strict one goes to the API as the output format
 * (Reel Type and Format as enums of Notion's labels), the lenient one reads the
 * answer (the labels as plain strings: the strict layer maps them to values
 * and drops an idea whose label is not Notion's, instead of failing the whole
 * answer on a drift).
 */
function costruisci(stretto: boolean) {
  const reelType = () => (stretto ? z.enum(ETICHETTE_REEL_TYPE) : z.string())
  const format = () => (stretto ? z.enum(ETICHETTE_FORMAT) : z.string())

  const scheda = z.object({
    sintesi_visiva: testo(),
    gancio: z.object({
      livello: livello(),
      cosa_si_vede: testo(),
      parole: testoONull(),
      testo_a_schermo: testoONull(),
      perche: testo(),
      alternativa: testo(),
    }),
    sequenza: z.array(z.object({ da: z.number(), a: z.number(), cosa_si_vede: testo(), testo_a_schermo: testoONull() })),
    ritmo: z.object({
      livello: livello(),
      osservazione: testo(),
      calo: z.union([z.object({ secondo: numeroONull(), cosa: testo() }), z.null()]),
    }),
    testo_a_schermo: z.object({
      leggibile: z.enum(['si', 'in_parte', 'no', 'assente']),
      sopra_il_volto: z.union([z.boolean(), z.null()]),
      osservazione: testo(),
    }),
    cta: z.object({
      presente: z.boolean(),
      testo: testoONull(),
      secondo: numeroONull(),
      osservazione: testo(),
      proposta: testo(),
    }),
    produzione: z.object({
      luce: z.enum(['buona', 'media', 'scarsa']),
      audio: z.enum(['chiaro', 'coperto', 'assente']),
      inquadratura: testo(),
      osservazione: testo(),
    }),
    ambiente: z.array(testo()),
    icp: z.object({
      aderenza: z.enum(['alta', 'media', 'bassa']),
      leve_usate: z.array(testo()),
      leve_mancanti: z.array(testo()),
      frase_del_cliente: testoONull(),
      rischio: testoONull(),
    }),
    script: z.union([z.object({ segue: z.enum(['si', 'in_parte', 'no']), differenze: testo() }), z.null()]),
    classificazione: z.object({
      reel_type: z.union([reelType(), z.null()]),
      format: z.union([format(), z.null()]),
    }),
  })

  const idea = () =>
    z.object({
      tipo: z.enum(['seguito', 'rifacimento', 'nuovo']),
      name: testo(),
      reel_type: reelType(),
      format: z.union([format(), z.null()]),
      gancio: testo(),
      messaggio: testo(),
      script: z.object({ hook: testo(), righe: z.array(testo()), cta: testo() }),
      perche: testo(),
    })

  const analisi = z.object({
    perche_verdetto: testo(),
    sintesi: testo(),
    cosa_ha_funzionato: z.array(testo()),
    da_migliorare: z.array(z.object({ cosa: testo(), come: testo(), priorita: priorita() })),
    dai_lead: testoONull(),
    collegamento: z.union([
      z.object({ ref: testo(), sicurezza: z.enum(['alta', 'media', 'bassa']), perche: testo() }),
      z.null(),
    ]),
    idee: z.array(idea()),
  })
  return { scheda, analisi }
}

const stretto = costruisci(true)
const tollerante = costruisci(false)

/** The schema of the output format (strict). */
export const SchemaSchedaVisiva = stretto.scheda
export const SchemaAnalisiReel = stretto.analisi
/** The schema that reads the answer (labels as strings). */
export const LettoSchedaVisiva = tollerante.scheda
export const LettoAnalisiReel = tollerante.analisi

export type SchedaVisivaModello = z.infer<typeof LettoSchedaVisiva>
export type AnalisiModello = z.infer<typeof LettoAnalisiReel>
export type IdeaModello = AnalisiModello['idee'][number]

export const FORMATO_SCHEDA_VISIVA = formato(SchemaSchedaVisiva)
export const FORMATO_ANALISI_REEL = formato(SchemaAnalisiReel)
export type FormatoAnalisi = typeof FORMATO_ANALISI_REEL
