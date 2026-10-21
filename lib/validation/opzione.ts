import { z } from 'zod'

import { CAMPI_OPZIONE, COLORI_ETICHETTA, NOME_OPZIONE_MAX } from '@/lib/marketing/opzioni'

/**
 * The labels of Reel Type and Format (marketing_opzioni, 21/10/2026): the same
 * schemas validate the menu's «Crea» and «Rinomina», the colours and the
 * server actions. The rules are the table's checks: a name of 1 to 60
 * characters with single spaces, one of Notion's ten colours.
 */

export const ERRORE_NOME_OPZIONE = 'Scrivi il nome dell’etichetta.'
export const ERRORE_NOME_LUNGO = `Il nome è lungo al massimo ${NOME_OPZIONE_MAX} caratteri.`
export const ERRORE_COLORE = 'Scegli uno dei colori della lista.'

/** The name as the database stores it: single spaces, none at the edges. */
export function normalizzaNomeOpzione(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim()
}

/** Characters as Postgres counts them (char_length). */
function lunghezza(testo: string): number {
  return [...testo].length
}

export const nomeOpzioneSchema = z
  .string({ required_error: ERRORE_NOME_OPZIONE, invalid_type_error: ERRORE_NOME_OPZIONE })
  .transform(normalizzaNomeOpzione)
  .refine((v) => v !== '', ERRORE_NOME_OPZIONE)
  .refine((v) => lunghezza(v) <= NOME_OPZIONE_MAX, ERRORE_NOME_LUNGO)

const campoSchema = z.enum(CAMPI_OPZIONE, { errorMap: () => ({ message: 'Campo non valido.' }) })
const coloreSchema = z.enum(COLORI_ETICHETTA, { errorMap: () => ({ message: ERRORE_COLORE }) })
const idOpzione = z.string().uuid('Etichetta non valida.')

export const creaOpzioneSchema = z.object({
  campo: campoSchema,
  nome: nomeOpzioneSchema,
  colore: coloreSchema.optional(),
})
export type CreaOpzioneInput = z.input<typeof creaOpzioneSchema>

/** Rename and/or recolour; at least one of the two. */
export const modificaOpzioneSchema = z
  .object({
    id: idOpzione,
    nome: nomeOpzioneSchema.optional(),
    colore: coloreSchema.optional(),
  })
  .refine((v) => v.nome !== undefined || v.colore !== undefined, 'Dimmi cosa cambiare: il nome o il colore.')
export type ModificaOpzioneInput = z.input<typeof modificaOpzioneSchema>

export const eliminaOpzioneSchema = z.object({ id: idOpzione })
