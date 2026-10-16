import { z } from 'zod/v4'

import { formato } from '@/lib/insight/schema'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE } from '@/lib/marketing/etichette'

/**
 * What Claude answers for the weekly brief (1.37.0, CLAUDE.md section 31). Closed objects, every
 * key required, enums, arrays, strings, nullable values; NO length or count constraints (the
 * strict layer, verifica.ts, applies them). Reel Type and Format as the labels of Notion in the
 * strict form that goes to the API, as plain strings in the lenient one that reads the answer:
 * the strict layer maps them to values and drops an idea whose label is not Notion's.
 */
const testo = () => z.string()
const rif = () => z.array(z.string())

/** The four groups of «voci»: what the brief says about the contents. */
export const GRUPPI_VOCI = ['cosa_funziona', 'mantieni', 'cambia', 'potenzia'] as const

/*
 * The shape Claude answers is the SMALLEST one that says everything (1.37.1): the four lists of the same
 * entry (cosa_funziona, mantieni, cambia, potenzia) are one list with a `gruppo`, and the script of an
 * idea is flat (hook, righe, cta). Fewer objects and arrays in the schema that goes to the API, a smaller
 * grammar to compile; the brief the page shows keeps its shape (SpuntiModello), made by comeSpuntiModello.
 */
function costruisci(stretto: boolean) {
  const reelType = () => (stretto ? z.enum(Object.values(ETICHETTA_REEL_TYPE) as [string, ...string[]]) : z.string())
  const format = () => (stretto ? z.enum(Object.values(ETICHETTA_FORMAT) as [string, ...string[]]) : z.string())
  const voce = () => z.object({ gruppo: z.enum(GRUPPI_VOCI), testo: testo(), perche: testo(), rif: rif() })
  const idea = () =>
    z.object({
      modello: z.enum(['reel', 'carousel']),
      nasce_da: z.enum(['reel', 'tema', 'obiezione', 'domanda']),
      fase: z.enum(['attrazione', 'consapevolezza', 'vendita']),
      name: testo(),
      reel_type: reelType(),
      format: z.union([format(), z.null()]),
      gancio: testo(),
      messaggio: testo(),
      hook: testo(),
      righe: z.array(testo()),
      cta: testo(),
      perche: testo(),
      rif: rif(),
    })
  return z.object({
    in_breve: testo(),
    voci: z.array(voce()),
    temi: z.array(
      z.object({
        tema: testo(),
        cosa_dicono: testo(),
        fonti: z.array(z.enum(['contenuti', 'dm', 'setting', 'call'])),
        tendenza: z.enum(['nuovo', 'in_aumento', 'stabile', 'in_calo']),
        rif: rif(),
      }),
    ),
    obiezioni: z.array(
      z.object({
        obiezione: testo(),
        dove_pesa: z.enum(['dm', 'prima_della_call', 'in_call']),
        contenuto_che_la_scioglie: testo(),
        perche: testo(),
        rif: rif(),
      }),
    ),
    domande: z.array(z.object({ domanda: testo(), risposta_in_breve: testo(), rif: rif() })),
    idee: z.array(idea()),
  })
}

export const SchemaSpunti = costruisci(true)
export const LettoSpunti = costruisci(false)
export type RispostaSpunti = z.infer<typeof LettoSpunti>
export const FORMATO_SPUNTI = formato(SchemaSpunti)

/** The brief in the shape the strict layer and the page know (the four lists, the script inside the idea). */
export type SpuntiModello = Omit<RispostaSpunti, 'voci' | 'idee'> & {
  cosa_funziona: VoceModello[]
  mantieni: VoceModello[]
  cambia: VoceModello[]
  potenzia: VoceModello[]
  idee: IdeaSpuntiModello[]
}
type VoceModello = { testo: string; perche: string; rif: string[] }
export type IdeaSpuntiModello = Omit<RispostaSpunti['idee'][number], 'hook' | 'righe' | 'cta'> & {
  script: { hook: string; righe: string[]; cta: string }
}

/** From what Claude answered to the shape of SpuntiModello; the order inside each group is kept. */
export function comeSpuntiModello(r: RispostaSpunti): SpuntiModello {
  const gruppo = (g: (typeof GRUPPI_VOCI)[number]): VoceModello[] =>
    r.voci.filter((v) => v.gruppo === g).map(({ testo, perche, rif }) => ({ testo, perche, rif }))
  return {
    in_breve: r.in_breve,
    cosa_funziona: gruppo('cosa_funziona'),
    temi: r.temi,
    obiezioni: r.obiezioni,
    domande: r.domande,
    mantieni: gruppo('mantieni'),
    cambia: gruppo('cambia'),
    potenzia: gruppo('potenzia'),
    idee: r.idee.map(({ hook, righe, cta, ...resto }) => ({ ...resto, script: { hook, righe, cta } })),
  }
}
