import { z } from 'zod'

import { isDataISO } from '@/lib/date'

export const MAX_NOTA = 5000

const testo = z
  .string({ required_error: 'Scrivi la nota' })
  .trim()
  .min(1, 'Scrivi la nota')
  .max(MAX_NOTA, `Al massimo ${MAX_NOTA} caratteri`)

// A note belongs to a day (default today): any day, a note may be about tomorrow's call
const data = z.string({ required_error: 'Scegli il giorno' }).refine(isDataISO, 'Data non valida')

export const notaSchema = z.object({
  progetto_id: z.string().uuid('Progetto non valido'),
  data,
  testo,
})

export const modificaNotaSchema = z.object({
  id: z.string().uuid('Nota non valida'),
  data,
  testo,
})

export const eliminaNotaSchema = z.object({ id: z.string().uuid('Nota non valida') })

export type NotaInput = z.input<typeof notaSchema>
export type ModificaNotaInput = z.input<typeof modificaNotaSchema>
