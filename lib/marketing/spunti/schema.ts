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

function costruisci(stretto: boolean) {
  const reelType = () => (stretto ? z.enum(Object.values(ETICHETTA_REEL_TYPE) as [string, ...string[]]) : z.string())
  const format = () => (stretto ? z.enum(Object.values(ETICHETTA_FORMAT) as [string, ...string[]]) : z.string())
  const voce = () => z.object({ testo: testo(), perche: testo(), rif: rif() })
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
      script: z.object({ hook: testo(), righe: z.array(testo()), cta: testo() }),
      perche: testo(),
      rif: rif(),
    })
  return z.object({
    in_breve: testo(),
    cosa_funziona: z.array(voce()),
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
    mantieni: z.array(voce()),
    cambia: z.array(voce()),
    potenzia: z.array(voce()),
    idee: z.array(idea()),
  })
}

export const SchemaSpunti = costruisci(true)
export const LettoSpunti = costruisci(false)
export type SpuntiModello = z.infer<typeof LettoSpunti>
export type IdeaSpuntiModello = SpuntiModello['idee'][number]
export const FORMATO_SPUNTI = formato(SchemaSpunti)
