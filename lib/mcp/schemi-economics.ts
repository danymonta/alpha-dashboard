import { z } from 'zod'

import { isDataISO } from '@/lib/date'
import { CATEGORIE_COSTO } from '@/lib/validation/anagrafiche'
import { METODI } from '@/lib/validation/incasso'
import { TIPI_VENDITA } from '@/lib/validation/vendita'

/**
 * The inputs of the MCP tools on costs, commissions, the month's goals, the
 * Panoramica's economics and the team (Claude a 360 gradi, phase 4,
 * 23/10/2026), zod 3 like the rest of the app. They describe the shapes; the
 * rules stay in lib/validation (anagrafiche, provvigione, team, obiettivi),
 * which the shared core (lib/economics/operazioni.ts) applies again on every
 * write, so the error messages are the app's. Every object is strict; an
 * optional property accepts null, which means "not said" (on a change: leave
 * it as it is). Ids come from the reads: costi, provvigioni, regole_provvigioni,
 * team, persone_del_team. Amounts are euros, as numbers.
 */

const id = (cosa: string, da: string) => z.string().uuid(`Id ${cosa} non valido: usa quello letto con ${da}.`)

const ID_COSTO = id('del costo', 'costi')
const ID_PAGAMENTO = id('del pagamento', 'provvigioni')
const ID_REGOLA = id('della regola', 'regole_provvigioni')
const ID_PERSONA = id('della persona', 'team o persone_del_team')
const ID_VENDITA = id('della vendita', 'elenco_vendite o leggi_vendita')

const data = z.string().refine(isDataISO, 'Data non valida: scrivila come AAAA-MM-GG (giorno di Roma).')
const mese = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mese non valido: scrivilo come AAAA-MM.')
const testo = (max: number) => z.string().max(max, `Al massimo ${max} caratteri.`)
const euro = (descrizione: string) =>
  z
    .number({ invalid_type_error: 'Un importo in euro, come numero: 89 o 89.90.' })
    .positive('Un importo maggiore di zero.')
    .max(1_000_000, 'Importo troppo alto: controlla gli zeri.')
    .describe(descrizione)
const CATEGORIA = z.enum(CATEGORIE_COSTO, {
  errorMap: () => ({ message: `Categoria: una tra ${CATEGORIE_COSTO.join(', ')}.` }),
})
const METODO = z.enum(METODI, { errorMap: () => ({ message: `Metodo: uno tra ${METODI.join(', ')}.` }) })
const TIPO = z.enum(TIPI_VENDITA, { errorMap: () => ({ message: `Tipo di vendita: uno tra ${TIPI_VENDITA.join(', ')}.` }) })

/** A month or a range: the period of the Panoramica (the current month when nothing is said). */
const periodo = {
  mese: mese.nullish().describe('Il mese, AAAA-MM (al posto di da e a). Senza niente: il mese in corso.'),
  da: data.nullish().describe('Dal giorno (compreso), AAAA-MM-GG, insieme ad a.'),
  a: data.nullish().describe('Al giorno (compreso), AAAA-MM-GG, insieme a da. Al massimo 3 anni.'),
}

// ── reads ────────────────────────────────────────────────────────────────────
export const numeriPeriodoSchema = z.object(periodo).strict()

export const cashMensileSchema = z
  .object({
    mesi: z.number().int().min(1).max(24).nullish().describe('Quanti mesi, fino al mese in corso (12 se non dici altro, al massimo 24).'),
    fino: mese.nullish().describe('L’ultimo mese della serie, AAAA-MM (di base il mese in corso).'),
  })
  .strict()

export const previsioneCassaSchema = z
  .object({
    mesi: z.number().int().min(1).max(12).nullish().describe('Il mese in corso e i successivi: quanti (3 se non dici altro, al massimo 12).'),
  })
  .strict()

export const obiettiviSchemaMcp = z
  .object({ mese: mese.nullish().describe('Il mese, AAAA-MM (di base il mese in corso).') })
  .strict()

export const numeriPerFonteSchema = z.object(periodo).strict()

export const costiSchema = z
  .object({
    ...periodo,
    categoria: CATEGORIA.nullish().describe(`Solo questa categoria: ${CATEGORIE_COSTO.join(', ')}.`),
    ricorrenti: z.boolean().nullish().describe('Solo i costi ricorrenti.'),
    limite: z.number().int().min(1).max(100).nullish().describe('Quanti al massimo (50 se non dici altro, al massimo 100).'),
  })
  .strict()

export const provvigioniSchema = z
  .object({
    mesi: z.number().int().min(1).max(24).nullish().describe('Quanti mesi, fino al mese in corso (6 se non dici altro, al massimo 24).'),
    profile_id: ID_PERSONA.nullish().describe('Solo questa persona.'),
  })
  .strict()

export const provvigioniPerVenditaSchema = z
  .object({
    profile_id: ID_PERSONA.nullish().describe('Solo le vendite di questo setter.'),
    sale_id: ID_VENDITA.nullish().describe('Solo questa vendita.'),
  })
  .strict()

export const regoleProvvigioniSchema = z
  .object({ profile_id: ID_PERSONA.nullish().describe('Solo le regole di questa persona.') })
  .strict()

export const teamSchema = z
  .object({ anche_non_attivi: z.boolean().nullish().describe('Anche le persone disattivate (di base solo quelle attive).') })
  .strict()

export const mieProvvigioniSchema = z
  .object({
    mesi: z.number().int().min(1).max(12).nullish().describe('Quanti mesi, fino al mese in corso (6 se non dici altro, al massimo 12).'),
  })
  .strict()

// ── writes ───────────────────────────────────────────────────────────────────
export const registraCostoSchema = z
  .object({
    data: data.nullish().describe('Il giorno del costo, AAAA-MM-GG (mai nel futuro). Senza: oggi.'),
    categoria: CATEGORIA,
    descrizione: testo(160).describe('A cosa si riferisce (da 2 a 160 caratteri).'),
    importo: euro('L’importo in euro.'),
    ricorrente: z.boolean().nullish().describe('Un costo che si ripete ogni mese (di base no).'),
  })
  .strict()

export const modificaCostoSchemaMcp = z
  .object({
    id: ID_COSTO,
    data: data.nullish(),
    categoria: CATEGORIA.nullish(),
    descrizione: testo(160).nullish(),
    importo: euro('L’importo in euro.').nullish(),
    ricorrente: z.boolean().nullish(),
  })
  .strict()

export const copiaRicorrentiSchema = z
  .object({ mese: mese.describe('Il mese in cui copiare i costi ricorrenti del mese prima, AAAA-MM.') })
  .strict()

export const registraPagamentoSchema = z
  .object({
    profile_id: ID_PERSONA.describe('A chi è stata pagata la provvigione (id da provvigioni o team).'),
    mese: mese.describe('Il mese delle provvigioni a cui si riferisce il pagamento, AAAA-MM.'),
    importo: euro('Quanto è stato pagato, in euro.'),
    pagato_il: data.nullish().describe('Il giorno del pagamento, AAAA-MM-GG (mai nel futuro). Senza: oggi.'),
    metodo: METODO.nullish().describe(`Come: ${METODI.join(', ')}.`),
    note: testo(300).nullish(),
  })
  .strict()

export const modificaPagamentoSchemaMcp = z
  .object({
    id: ID_PAGAMENTO,
    mese: mese.nullish(),
    importo: euro('Quanto è stato pagato, in euro.').nullish(),
    pagato_il: data.nullish(),
    metodo: METODO.or(z.literal('')).nullish().describe('Il metodo; "" lo toglie.'),
    note: testo(300).nullish().describe('Le note; "" le toglie.'),
  })
  .strict()

export const AZIONI_REGOLA = ['nuova', 'chiudi', 'modifica'] as const

export const regolaProvvigioneSchema = z
  .object({
    azione: z.enum(AZIONI_REGOLA, { errorMap: () => ({ message: `Azione: una tra ${AZIONI_REGOLA.join(', ')}.` }) }),
    profile_id: ID_PERSONA.nullish().describe('Con nuova: la persona della regola.'),
    rule_id: ID_REGOLA.nullish().describe('Con chiudi o modifica: la regola.'),
    percentuale: z
      .number()
      .positive('Una percentuale maggiore di zero.')
      .max(50, 'Al massimo 50.')
      .nullish()
      .describe('In punti percentuali: 5 vuol dire 5% del cash incassato. Con nuova (obbligatoria) o modifica.'),
    applica_a: z
      .array(TIPO)
      .min(1, 'Almeno un tipo di vendita.')
      .nullish()
      .describe(`Su quali vendite matura: ${TIPI_VENDITA.join(', ')} (di base nuovo).`),
    valida_dal: data.nullish().describe('Con nuova (obbligatorio) o modifica: da quando vale, AAAA-MM-GG.'),
    valida_al: data
      .or(z.literal(''))
      .nullish()
      .describe('Con chiudi (obbligatorio): l’ultimo giorno in cui vale. Con modifica: la fine; "" la toglie.'),
  })
  .strict()

export const impostaObiettiviSchema = z
  .object({
    mese: mese.describe('Il mese degli obiettivi, AAAA-MM.'),
    cash: euro('L’obiettivo di cash incassato del mese, in euro.')
      .or(z.literal(''))
      .nullish()
      .describe('L’obiettivo di cash incassato del mese, in euro; "" lo toglie.'),
    nuovi_clienti: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .or(z.literal(''))
      .nullish()
      .describe('L’obiettivo di nuovi clienti del mese; "" lo toglie.'),
  })
  .strict()

export type NumeriPeriodoInput = z.output<typeof numeriPeriodoSchema>
export type CashMensileInput = z.output<typeof cashMensileSchema>
export type PrevisioneCassaInput = z.output<typeof previsioneCassaSchema>
export type ObiettiviInput = z.output<typeof obiettiviSchemaMcp>
export type NumeriPerFonteInput = z.output<typeof numeriPerFonteSchema>
export type CostiInput = z.output<typeof costiSchema>
export type ProvvigioniInput = z.output<typeof provvigioniSchema>
export type ProvvigioniPerVenditaInput = z.output<typeof provvigioniPerVenditaSchema>
export type RegoleProvvigioniInput = z.output<typeof regoleProvvigioniSchema>
export type TeamInput = z.output<typeof teamSchema>
export type MieProvvigioniInput = z.output<typeof mieProvvigioniSchema>
export type RegistraCostoInput = z.output<typeof registraCostoSchema>
export type ModificaCostoInput = z.output<typeof modificaCostoSchemaMcp>
export type CopiaRicorrentiInput = z.output<typeof copiaRicorrentiSchema>
export type RegistraPagamentoInput = z.output<typeof registraPagamentoSchema>
export type ModificaPagamentoInput = z.output<typeof modificaPagamentoSchemaMcp>
export type RegolaProvvigioneInput = z.output<typeof regolaProvvigioneSchema>
export type ImpostaObiettiviInput = z.output<typeof impostaObiettiviSchema>
