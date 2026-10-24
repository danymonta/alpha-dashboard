import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { CAMPI, CAMPO_MODELLO } from '@/lib/marketing/etichette'
import { RICERCA_MAX } from '@/lib/marketing/filtri'
import {
  AUDIO_MAX,
  ERRORE_VIEW_COUNT,
  LINK_MAX,
  VIEW_COUNT_MAX,
  contenutoSchema,
  lunghezza,
  sezioneContenutoSchema,
} from '@/lib/validation/contenuto'

import { NOME_OPZIONE_MAX } from '@/lib/marketing/opzioni'

import { ETICHETTE, elencoEtichette } from './etichette'
import { LIMITI_MCP } from './limiti'

/**
 * The inputs of the MCP tools (09/10/2026), zod 3 like the rest of the app
 * (lib/mcp/schema.ts turns them into what the SDK wants). They describe the
 * shapes and the Notion labels; the rules of a content stay in
 * lib/validation/contenuto.ts, and the shared core validates every write
 * again with those schemas, so the error messages are the app's. Where a rule
 * also reaches the JSON Schema Claude reads, it is 1.32.0's own piece: the
 * Name (contenutoSchema) and the text of a section (sezioneContenutoSchema,
 * code points after normalisation, as Postgres counts). Never `.max(n)` on a
 * text of ours: zod counts UTF-16 units and would refuse what the app accepts.
 *
 * Every object is strict: an unknown key is an error Claude reads, never
 * silently dropped. Optional properties accept null, which means "no value".
 */

function scelta(valori: [string, ...string[]], nome: string) {
  return z.enum(valori, { errorMap: () => ({ message: `${nome}: uno tra ${elencoEtichette(valori)}.` }) })
}

const MODELLO = scelta(ETICHETTE.modello, CAMPO_MODELLO)
/**
 * Reel Type and Format are the labels people create in the app (21/10/2026), so
 * they are not a fixed list in the JSON Schema: a name (or code) of a label that
 * exists, which the tool resolves against the database and answers with the
 * valid ones when it is not there.
 */
function etichettaEsistente(nome: string) {
  return z
    .string({ invalid_type_error: `${nome}: scrivi il nome di un’etichetta che c’è.` })
    .trim()
    .min(1, `${nome}: scrivi il nome di un’etichetta che c’è (etichette_contenuti le elenca).`)
    .refine((v) => lunghezza(v) <= NOME_OPZIONE_MAX + 20, `${nome}: il nome di un’etichetta è al massimo ${NOME_OPZIONE_MAX} caratteri.`)
}
const REEL_TYPE = etichettaEsistente(CAMPI.reel_type)
const FORMAT = etichettaEsistente(CAMPI.formato)
const DESCRIZIONE_ETICHETTA = (nome: string) =>
  `${nome}: il nome (o il codice) di un’etichetta che c’è già nell’app, quelle valide le dà etichette_contenuti. Non ne crei: le crea la persona.`
const STATUS = scelta(ETICHETTE.status, CAMPI.stato)
const GRUPPO = scelta(ETICHETTE.gruppo, 'Gruppo di Status')

const SEZIONE = z.enum(['messaggio', 'bozza', 'commenti', 'finale'], {
  errorMap: () => ({ message: 'Sezione: messaggio, bozza, commenti o finale.' }),
})

const idContenuto = z
  .string({ required_error: 'Manca l’id del contenuto.', invalid_type_error: 'Id del contenuto non valido.' })
  .uuid('Id del contenuto non valido: usa quello letto con elenco_contenuti o leggi_contenuto.')
  .describe('L’id del contenuto, come lo danno elenco_contenuti e leggi_contenuto.')

// Claude fills these two from their JSON Schema descriptions: they say what the tool
// descriptions and the server instructions say, the most recent one it has, including the
// answer of its own last write (every write changes them). A test reads them there.
const versione = z
  .string({ required_error: 'Manca la versione.', invalid_type_error: 'Versione non valida.' })
  .regex(
    /^[0-9a-f]{16}$/,
    'Versione non valida: ricopia così com’è la più recente che hai di questo contenuto, da leggi_contenuto, elenco_contenuti o dalla risposta dell’ultima scrittura su quel contenuto.',
  )
  .describe(
    'La versione più recente che hai di questo contenuto: da leggi_contenuto, elenco_contenuti o dalla risposta dell’ultima scrittura su quel contenuto, ricopiata così com’è.',
  )

const impronta = z
  .string({ required_error: 'Manca l’impronta.', invalid_type_error: 'Impronta non valida.' })
  .regex(
    /^[0-9a-f]{32}$/,
    'Impronta non valida: ricopia così com’è la più recente che hai di questa sezione, da leggi_contenuto o dalla risposta dell’ultimo scrivi_sezione su quella sezione.',
  )
  .describe(
    'L’impronta più recente di questa sezione: da leggi_contenuto o dalla risposta dell’ultimo scrivi_sezione su quella sezione («salvata» o «cambiata»), ricopiata così com’è.',
  )

const data = z
  .string({ invalid_type_error: 'Data non valida: scrivila AAAA-MM-GG.' })
  .refine(isDataISO, 'Data non valida: scrivila AAAA-MM-GG.')

/** The Name: the 1.32.0 rule (1 to 300 characters, trimmed). */
const nome = contenutoSchema.shape.nome.describe('Name: il titolo del contenuto, da 1 a 300 caratteri.')

/** A section's text: the 1.32.0 rule (at most 30,000 characters once normalised). */
const testoSezione = sezioneContenutoSchema.shape.testo.describe(
  'Testo in Markdown, al massimo 30.000 caratteri; righe vuote in cima e spazi in fondo si tolgono.',
)

const testoBreve = (descrizione: string) =>
  z.string({ invalid_type_error: 'Scrivi un testo.' }).nullish().describe(descrizione)

/** The properties of a content, with Notion's names in snake case; each one checked again by the shared core. */
const proprieta = {
  reel_type: REEL_TYPE.nullish().describe(DESCRIZIONE_ETICHETTA(CAMPI.reel_type)),
  format: FORMAT.nullish().describe(DESCRIZIONE_ETICHETTA(CAMPI.formato)),
  post_date: data.nullish().describe('Post Date, AAAA-MM-GG (giorno di Roma), anche nel futuro.'),
  inspiration: testoBreve(`Inspiration: un link intero (https://…), al massimo ${LINK_MAX} caratteri.`),
  audio: testoBreve(`Audio, al massimo ${AUDIO_MAX} caratteri.`),
  url: testoBreve(
    'URL: il link del post pubblicato (instagram.com/reel/… o instagram.com/p/…), mai un link di condivisione (instagram.com/share/…).',
  ),
  view_count: z
    .number({ invalid_type_error: ERRORE_VIEW_COUNT })
    .int(ERRORE_VIEW_COUNT)
    .min(0, ERRORE_VIEW_COUNT)
    .max(VIEW_COUNT_MAX, 'View Count: al massimo 2.000.000.000.')
    .nullish()
    .describe('View Count: un numero intero, da 0 a 2.000.000.000.'),
}

const sezioniNuove = z
  .object({
    messaggio: testoSezione.nullish(),
    bozza: testoSezione.nullish(),
    commenti: testoSezione.nullish(),
    finale: testoSezione.nullish(),
  })
  .strict()
  .nullish()
  .describe(
    'I testi delle sezioni, in Markdown: messaggio, bozza, commenti, finale (i titoli dipendono dal modello, vedi etichette_contenuti).',
  )

const contenutoNuovo = z
  .object({
    modello: MODELLO.nullish().describe('Modello della pagina: Reel Topic (predefinito), Carousel Topic o YouTube Video (un video di YouTube, nella sua scheda del Piano editoriale).'),
    name: nome,
    status: STATUS.nullish().describe(`Status: ${elencoEtichette(ETICHETTE.status)}. Predefinito Not started.`),
    ...proprieta,
    sezioni: sezioniNuove,
  })
  .strict()

export const etichetteContenutiSchema = z.object({}).strict()

export const icpSchema = z.object({}).strict()

export const guidaContenutiSchema = z
  .object({
    parte: z
      .enum(['linee_guida', 'punteggio', 'tutta'])
      .nullish()
      .describe(
        'linee_guida (predefinita): il contesto del brand e le linee guida di Dany per i contenuti (tono di voce, formato degli script, funnel, hook, CTA, caption, stories, template, proof). punteggio: come si valuta un reel (pesi per fase, criteri, penalità, fasce, protocollo di rifacimento). tutta: entrambe.',
      ),
  })
  .strict()

export const spuntiSchema = z
  .object({
    settimana: data
      .nullish()
      .describe('Un giorno della settimana degli spunti, AAAA-MM-GG; senza, gli spunti più recenti.'),
  })
  .strict()

export const elencoContenutiSchema = z
  .object({
    mese: z
      .string({ invalid_type_error: 'Mese non valido: scrivilo AAAA-MM.' })
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mese non valido: scrivilo AAAA-MM.')
      .nullish()
      .describe('Un mese della Post Date, AAAA-MM.'),
    da: data.nullish().describe('Dalla Post Date (compresa), AAAA-MM-GG.'),
    a: data.nullish().describe('Fino alla Post Date (compresa), AAAA-MM-GG.'),
    senza_data: z.boolean().nullish().describe('Solo i contenuti senza Post Date.'),
    status: STATUS.nullish().describe(`Uno Status: ${elencoEtichette(ETICHETTE.status)}.`),
    gruppo: GRUPPO.nullish().describe(`Un gruppo di Status: ${elencoEtichette(ETICHETTE.gruppo)}.`),
    reel_type: REEL_TYPE.nullish().describe(DESCRIZIONE_ETICHETTA(CAMPI.reel_type)),
    format: FORMAT.nullish().describe(DESCRIZIONE_ETICHETTA(CAMPI.formato)),
    modello: MODELLO.nullish().describe('Modello: Reel Topic, Carousel Topic o YouTube Video.'),
    cerca: z
      .string({ invalid_type_error: 'Cerca: scrivi un pezzo del Name.' })
      .nullish()
      .refine((v) => v == null || lunghezza(v.trim()) <= RICERCA_MAX, `Cerca: al massimo ${RICERCA_MAX} caratteri.`)
      .describe(
        `Un pezzo del Name, cercato così com’è (maiuscole e minuscole non contano): con una parola sola trovi di più; più parole devono essere di seguito nel Name. Al massimo ${RICERCA_MAX} caratteri.`,
      ),
    limite: z
      .number({ invalid_type_error: 'Limite: un numero da 1 a 100.' })
      .int('Limite: un numero da 1 a 100.')
      .min(1, 'Limite: un numero da 1 a 100.')
      .max(LIMITI_MCP.righeElenco, 'Limite: un numero da 1 a 100.')
      .nullish()
      .describe('Quanti contenuti al massimo, da 1 a 100 (predefinito 50).'),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.mese && (f.da || f.a)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Usa mese oppure da e a, non insieme.', path: ['mese'] })
    }
    if (f.da && f.a && f.da > f.a) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La data da viene prima di a.', path: ['da'] })
    }
    if (f.senza_data && (f.mese || f.da || f.a)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Senza data esclude le date.', path: ['senza_data'] })
    }
  })

export const leggiContenutoSchema = z
  .object({
    id: idContenuto,
    sezioni: z
      .array(SEZIONE)
      .min(1, 'Sezioni: da 1 a 4, tra messaggio, bozza, commenti e finale.')
      .max(4, 'Sezioni: da 1 a 4, tra messaggio, bozza, commenti e finale.')
      .nullish()
      .describe('Solo queste sezioni (messaggio, bozza, commenti, finale); senza, quelle del modello.'),
  })
  .strict()

/** The section text of a whole creation, in code points, as the database will store it at most. */
export function testoDellaCreazione(contenuti: readonly { sezioni?: Record<string, string | null | undefined> | null }[]) {
  let totale = 0
  for (const c of contenuti) {
    for (const testo of Object.values(c.sezioni ?? {})) if (typeof testo === 'string') totale += lunghezza(testo)
  }
  return totale
}

export const creaContenutiSchema = z
  .object({
    contenuti: z
      .array(contenutoNuovo)
      .min(1, `Da 1 a ${LIMITI_MCP.contenutiPerCreazione} contenuti per volta.`)
      .max(
        LIMITI_MCP.contenutiPerCreazione,
        `Da 1 a ${LIMITI_MCP.contenutiPerCreazione} contenuti per volta: dividi in più chiamate.`,
      )
      .describe(`Da 1 a ${LIMITI_MCP.contenutiPerCreazione} contenuti, ognuno con le sue proprietà e, se vuoi, i testi.`),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (testoDellaCreazione(input.contenuti) > LIMITI_MCP.testoPerCreazione) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Troppo testo in una volta: dividi in più chiamate.',
        path: ['contenuti'],
      })
    }
  })

const CAMPI_MODIFICA = [
  'modello',
  'name',
  'reel_type',
  'format',
  'status',
  'post_date',
  'inspiration',
  'audio',
  'url',
  'view_count',
] as const

export const modificaContenutoSchema = z
  .object({
    id: idContenuto,
    versione,
    campi: z
      .object({
        // Modello, Name and Status always have a value: never null
        modello: MODELLO.optional().describe('Modello: Reel Topic, Carousel Topic o YouTube Video.'),
        name: nome.optional(),
        status: STATUS.optional().describe(`Status: ${elencoEtichette(ETICHETTE.status)}.`),
        ...proprieta,
      })
      .strict()
      .refine((c) => CAMPI_MODIFICA.some((k) => c[k] !== undefined), 'Dimmi almeno una proprietà da cambiare.')
      .describe('Solo le proprietà da cambiare; null svuota un campo (Name, Modello e Status non si svuotano).'),
  })
  .strict()

export const cambiaStatusSchema = z
  .object({
    id: idContenuto,
    status: STATUS.describe(`Status: ${elencoEtichette(ETICHETTE.status)}.`),
  })
  .strict()

export const scriviSezioneSchema = z
  .object({
    id: idContenuto,
    sezione: SEZIONE.describe('La sezione: messaggio, bozza, commenti o finale.'),
    testo: testoSezione,
    impronta,
  })
  .strict()

export const eliminaContenutoSchema = z
  .object({
    id: idContenuto,
    name: z
      .string({ required_error: 'Scrivi il Name del contenuto.', invalid_type_error: 'Scrivi il Name del contenuto.' })
      .min(1, 'Scrivi il Name del contenuto.')
      .describe('Il Name esatto del contenuto, letto con leggi_contenuto.'),
  })
  .strict()

export type SpuntiInput = z.output<typeof spuntiSchema>
export type ElencoContenutiInput = z.output<typeof elencoContenutiSchema>
export type LeggiContenutoInput = z.output<typeof leggiContenutoSchema>
export type CreaContenutiInput = z.output<typeof creaContenutiSchema>
export type ModificaContenutoInput = z.output<typeof modificaContenutoSchema>
export type CambiaStatusInput = z.output<typeof cambiaStatusSchema>
export type ScriviSezioneInput = z.output<typeof scriviSezioneSchema>
export type EliminaContenutoInput = z.output<typeof eliminaContenutoSchema>
