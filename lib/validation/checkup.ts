import { z } from 'zod'

/**
 * A check-up of a client with his coach (1.83.0): the same limits as clienti_checkup and
 * checkup_salva, for the coach's form, the server action and the import from Notion.
 */
export const ERRORI_CHECKUP = {
  giorno: 'Scegli il giorno della call.',
  futuro: 'La call non può essere nel futuro.',
  fathom: 'Il link deve essere di Fathom (https://fathom.video/…).',
  argomento: 'L’argomento è al massimo di 200 caratteri.',
  resoconto: 'Il resoconto è al massimo di 8.000 caratteri.',
  appunti: 'Gli appunti sono al massimo di 30.000 caratteri.',
  compiti: 'Al massimo 20 compiti, di al massimo 300 caratteri.',
  nonValidi: 'Dati non validi.',
  nonSalvato: 'Call non salvata. Riprova.',
  nonEliminata: 'Call non eliminata. Riprova.',
} as const

export const FATHOM = /^https:\/\/fathom\.video\//

export const checkupSchema = z.object({
  client_id: z.string().uuid(ERRORI_CHECKUP.nonValidi),
  id: z.string().uuid(ERRORI_CHECKUP.nonValidi).nullable(),
  giorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, ERRORI_CHECKUP.giorno),
  fathom_url: z
    .string()
    .trim()
    .max(500, ERRORI_CHECKUP.fathom)
    .refine((v) => v === '' || FATHOM.test(v), ERRORI_CHECKUP.fathom),
  argomento: z.string().trim().max(200, ERRORI_CHECKUP.argomento),
  resoconto: z.string().max(8000, ERRORI_CHECKUP.resoconto),
  appunti: z.string().max(30000, ERRORI_CHECKUP.appunti),
  compiti: z.array(z.string().trim().min(1).max(300, ERRORI_CHECKUP.compiti)).max(20, ERRORI_CHECKUP.compiti),
  call_id: z.string().uuid(ERRORI_CHECKUP.nonValidi).nullable(),
})
export type CheckupInput = z.infer<typeof checkupSchema>

export const eliminaCheckupSchema = z.object({ id: z.string().uuid(ERRORI_CHECKUP.nonValidi) })
