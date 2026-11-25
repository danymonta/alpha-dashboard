import { z } from 'zod'

import { CHIAVE_DOMANDA, OPZIONI_MAX, VALORE_OPZIONE } from '@/lib/validation/questionario'

/**
 * The questions of the questionnaire as the admin writes them in Impostazioni › Questionario
 * (1.88.0, Dany, 25/11/2026: «modificare tutto anche domande eventuali così non devo farlo da
 * codice»). The same limits as the checks of onboarding_domande
 * (20261125110000_questionario_modificabile.sql). The same schema in the browser and in the action.
 */

/** The kinds a question added by the admin can have (the 26 of the form keep theirs). */
export const TIPI_NUOVI = ['testo', 'scelta', 'scelte', 'numero', 'data', 'file'] as const
export type TipoNuovo = (typeof TIPI_NUOVI)[number]

export const SEZIONI = [1, 2, 3, 4] as const

export const ERRORI_DOMANDE = {
  nonValidi: 'Controlla i campi segnati.',
  testo: 'Scrivi la domanda.',
  testoLungo: 'Al massimo 500 caratteri.',
  aiutoLungo: 'Al massimo 1.000 caratteri.',
  opzioni: 'Scrivi almeno una risposta possibile.',
  opzioniTroppe: 'Al massimo 30 risposte possibili.',
  opzioneVuota: 'Scrivi il testo di ogni risposta, o togli quella vuota.',
  opzioneLunga: 'Al massimo 200 caratteri per risposta.',
  opzioniUguali: 'Due risposte hanno lo stesso testo.',
  fileEtichetta: 'Scrivi cosa caricare.',
  altro: 'Scrivi l’etichetta del campo libero.',
  soloAdmin: 'Le domande del questionario le modifica solo l’admin.',
  nonSalvata: 'La domanda non si è salvata. Riprova.',
  nonTrovata: 'Questa domanda non c’è più: ricarica la pagina.',
  tipo: 'Il tipo di una domanda non si cambia: toglila e creane una nuova.',
  numeriche: 'Le opzioni di questa domanda si rinominano, non si aggiungono né si tolgono.',
  spostamento: 'La domanda non si è spostata. Riprova.',
  stato: 'La domanda non è cambiata. Riprova.',
} as const

const testoOpzionale = (max: number, messaggio: string) =>
  z
    .string()
    .max(max, messaggio)
    .transform((s) => (s.trim() === '' ? null : s.trim()))
    .nullish()

const opzioneSchema = z.object({
  /** The value of an option already saved; a new option has none (the server makes it from the words). */
  valore: z.string().regex(VALORE_OPZIONE).nullish(),
  etichetta: z.string().trim().min(1, ERRORI_DOMANDE.opzioneVuota).max(200, ERRORI_DOMANDE.opzioneLunga),
  dettaglio: testoOpzionale(300, ERRORI_DOMANDE.opzioneLunga),
})

export const domandaSchema = z
  .object({
    /** The question to change; none for a new one. */
    chiave: z.string().regex(CHIAVE_DOMANDA).nullish(),
    /** The kind of a new question (the one of a question already saved never changes). */
    tipo: z.enum(TIPI_NUOVI).nullish(),
    testo: z.string().trim().min(1, ERRORI_DOMANDE.testo).max(500, ERRORI_DOMANDE.testoLungo),
    aiuto: testoOpzionale(1000, ERRORI_DOMANDE.aiutoLungo),
    sezione: z.coerce.number().int().min(1).max(4),
    obbligatoria: z.boolean(),
    lungo: z.boolean().default(false),
    opzioni: z.array(opzioneSchema).max(OPZIONI_MAX, ERRORI_DOMANDE.opzioniTroppe).nullish(),
    /** The label of the free text under the choices (the bad habits of the form). */
    altro: testoOpzionale(120, ERRORI_DOMANDE.altro),
    /** The files that go with the question (always for a question of files); null: none. */
    file: z
      .object({
        etichetta: z.string().trim().min(1, ERRORI_DOMANDE.fileEtichetta).max(120, ERRORI_DOMANDE.fileEtichetta),
        aiuto: testoOpzionale(300, ERRORI_DOMANDE.aiutoLungo),
      })
      .nullish(),
  })
  .superRefine((v, ctx) => {
    const etichette = (v.opzioni ?? []).map((o) => o.etichetta.trim().toLowerCase())
    if (new Set(etichette).size !== etichette.length) {
      ctx.addIssue({ code: 'custom', path: ['opzioni'], message: ERRORI_DOMANDE.opzioniUguali })
    }
    if (!v.chiave) {
      if (!v.tipo) ctx.addIssue({ code: 'custom', path: ['tipo'], message: ERRORI_DOMANDE.nonValidi })
      if ((v.tipo === 'scelta' || v.tipo === 'scelte') && (v.opzioni ?? []).length === 0) {
        ctx.addIssue({ code: 'custom', path: ['opzioni'], message: ERRORI_DOMANDE.opzioni })
      }
      if (v.tipo === 'file' && !v.file) ctx.addIssue({ code: 'custom', path: ['file'], message: ERRORI_DOMANDE.fileEtichetta })
    }
  })
export type DomandaInput = z.input<typeof domandaSchema>

export const spostaDomandaSchema = z.object({
  chiave: z.string().regex(CHIAVE_DOMANDA),
  verso: z.enum(['su', 'giu']),
})

export const attivaDomandaSchema = z.object({
  chiave: z.string().regex(CHIAVE_DOMANDA),
  attiva: z.boolean(),
})

/** «Quanti anni hai?» → «quanti_anni_hai»: the beginning of a key or of the value of an option, from its words. */
export function slug(testo: string, max = 30): string {
  const s = testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/g, '')
  return s
}

/** A value of an option not used yet by the others of the question. */
export function valoreNuovo(etichetta: string, usati: ReadonlySet<string>): string {
  const base = slug(etichetta, 34) || 'opzione'
  if (!usati.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const v = `${base}_${i}`
    if (!usati.has(v)) return v
  }
  return `${base}_${Date.now() % 100000}`
}

/** A key for a new question: its words and a short random tail, so two questions never share it. */
export function chiaveNuova(testo: string, coda: string): string {
  const base = slug(testo, 40)
  const inizio = /^[a-z]/.test(base) ? base : `d_${base}`.replace(/_+$/g, '')
  return `${inizio}_${coda}`.slice(0, 60)
}
