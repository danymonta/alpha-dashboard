import { z } from 'zod'

/**
 * The questionnaire of the onboarding (release B1b, docs/onboarding/rilascio-b.md): the keys
 * of the questions of Dany's Google form «Modulo Onboarding Coaching Online», each of its
 * type. The same rule as onboarding_risposte_valide and onboarding_risposte_mancanti
 * (20261109100000_questionario.sql): tests/questionario-schemi.test.ts uses the same examples
 * as supabase/tests/114_questionario.sql. No rule on the age (Dany, 12/11/2026). The words of
 * the questions are in lib/percorso/questionario.ts; here only keys and values.
 */

/** The options of the form, saved by key (the labels are in lib/percorso/questionario.ts). */
export const MINUTI_GIORNO = ['20_30', '30_40', '40_60', '60_90', '90_120'] as const
export const LIVELLI_ATTIVITA = ['sedentario', 'attivo', 'molto_attivo'] as const
export const SI_NO = ['si', 'no'] as const
export const CATTIVE_ABITUDINI = ['fumo', 'alcol', 'motivazione', 'stimolanti', 'sonno'] as const
export const ESERCIZI_MASSIMALI = ['piegamenti', 'trazioni', 'dip'] as const
export const NON_LO_SO = 'non_lo_so' as const

export const TESTO_MAX = 2000
export const EMAIL_MAX = 320
export const ALTEZZA = { min: 120, max: 230 } as const
export const PESO = { min: 35, max: 250 } as const
export const RIPETIZIONI = { min: 0, max: 200 } as const
export const GIORNI = { min: 1, max: 7 } as const

/** The four screens, in order. */
export const SCHERMATE_QUESTIONARIO = [1, 2, 3, 4] as const
export type NumeroSchermata = (typeof SCHERMATE_QUESTIONARIO)[number]

/** The keys whose answer is free text (at most 2,000 characters). */
export const CHIAVI_TESTO = [
  'nome_cognome',
  'telefono',
  'occupazione',
  'storia_allenamento',
  'infortuni',
  'attrezzatura',
  'esercizi_difficolta',
  'importanza_tecnica',
  'ore_sonno',
  'organizzazione_giornata',
  'conoscenza_alimentazione',
  'obiettivo_principale',
  'perche_noi',
  'obiettivi_3_6_mesi',
  'successo',
  'note',
] as const

/** How a required question counts as answered (the same kinds as onboarding_risposte_mancanti). */
type ModoRisposta = 'testo' | 'valore' | 'altezza_peso' | 'massimali'

/**
 * The required questions in the order of the questionnaire (cattive_abitudini and note are
 * optional), with how they count as answered: the order the page goes to the first missing.
 */
export const OBBLIGATORIE: readonly (readonly [string, ModoRisposta])[] = [
  ['nome_cognome', 'testo'],
  ['email', 'testo'],
  ['telefono', 'testo'],
  ['altezza_peso', 'altezza_peso'],
  ['data_nascita', 'testo'],
  ['occupazione', 'testo'],
  ['storia_allenamento', 'testo'],
  ['giorni_settimana', 'valore'],
  ['minuti_giorno', 'valore'],
  ['infortuni', 'testo'],
  ['attrezzatura', 'testo'],
  ['massimali', 'massimali'],
  ['esercizi_difficolta', 'testo'],
  ['importanza_tecnica', 'testo'],
  ['ore_sonno', 'testo'],
  ['livello_attivita', 'valore'],
  ['organizzazione_giornata', 'testo'],
  ['seguito_alimentazione', 'valore'],
  ['conoscenza_alimentazione', 'testo'],
  ['obiettivo_principale', 'testo'],
  ['perche_noi', 'testo'],
  ['obiettivi_3_6_mesi', 'testo'],
  ['successo', 'testo'],
  ['pronto', 'valore'],
]

/**
 * The spaces JavaScript's trim() removes and only those: the same list as testo_scritto() in
 * SQL (20261008110000_commento_obbligatorio.sql). A text of only spaces is not an answer.
 */
export function testoScritto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATA = /^\d{4}-\d{2}-\d{2}$/

/** «1996-03-21» and a day that exists (never «2026-02-30»). Any day: no rule on the age. */
export function dataValida(s: string): boolean {
  if (!DATA.test(s)) return false
  const [a, m, g] = s.split('-').map(Number) as [number, number, number]
  const d = new Date(Date.UTC(a, m - 1, g))
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g
}

/** At most one decimal, as the check n * 10 = trunc(n * 10) of the database. */
function unDecimale(n: number): boolean {
  return Math.abs(Math.round(n * 10) - n * 10) < 1e-9
}

const testo = z.string().max(TESTO_MAX)
const ripetizioni = z.union([
  z.literal(NON_LO_SO),
  z.number().int().min(RIPETIZIONI.min).max(RIPETIZIONI.max),
])

/**
 * The answers while they are filled in: every key optional, null = not answered, only the keys
 * of the form (strict), each of its type. What questionario_salva accepts.
 */
export const risposteSchema = z
  .object({
    ...Object.fromEntries(CHIAVI_TESTO.map((k) => [k, testo.nullish()])),
    email: z
      .string()
      .max(EMAIL_MAX)
      .refine((s) => s.trim() === '' || EMAIL.test(s.trim()))
      .nullish(),
    data_nascita: z
      .string()
      .refine((s) => s === '' || dataValida(s))
      .nullish(),
    altezza_peso: z
      .object({
        altezza: z.number().int().min(ALTEZZA.min).max(ALTEZZA.max).nullish(),
        peso: z.number().min(PESO.min).max(PESO.max).refine(unDecimale).nullish(),
      })
      .strict()
      .nullish(),
    giorni_settimana: z.number().int().min(GIORNI.min).max(GIORNI.max).nullish(),
    minuti_giorno: z.enum(MINUTI_GIORNO).nullish(),
    massimali: z
      .object({ piegamenti: ripetizioni.nullish(), trazioni: ripetizioni.nullish(), dip: ripetizioni.nullish() })
      .strict()
      .nullish(),
    livello_attivita: z.enum(LIVELLI_ATTIVITA).nullish(),
    seguito_alimentazione: z.enum(SI_NO).nullish(),
    pronto: z.enum(SI_NO).nullish(),
    cattive_abitudini: z
      .object({
        scelte: z
          .array(z.enum(CATTIVE_ABITUDINI))
          .max(CATTIVE_ABITUDINI.length)
          .refine((a) => new Set(a).size === a.length)
          .nullish(),
        altro: testo.nullish(),
      })
      .strict()
      .nullish(),
  })
  .strict()

export type Risposte = {
  [K in (typeof CHIAVI_TESTO)[number]]?: string | null
} & {
  email?: string | null
  data_nascita?: string | null
  altezza_peso?: { altezza?: number | null; peso?: number | null } | null
  giorni_settimana?: number | null
  minuti_giorno?: (typeof MINUTI_GIORNO)[number] | null
  massimali?: { [E in (typeof ESERCIZI_MASSIMALI)[number]]?: number | typeof NON_LO_SO | null } | null
  livello_attivita?: (typeof LIVELLI_ATTIVITA)[number] | null
  seguito_alimentazione?: 'si' | 'no' | null
  pronto?: 'si' | 'no' | null
  cattive_abitudini?: { scelte?: (typeof CATTIVE_ABITUDINI)[number][] | null; altro?: string | null } | null
}

/** onboarding_risposte_valide in TypeScript. */
export function risposteValide(v: unknown): v is Risposte {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && risposteSchema.safeParse(v).success
}

function presente(v: unknown): boolean {
  return typeof v === 'number' || typeof v === 'string'
}

/** onboarding_risposte_mancanti in TypeScript: the required keys not answered, in order. */
export function risposteMancanti(risposte: Risposte | Record<string, unknown> | null | undefined): string[] {
  const r = (risposte ?? {}) as Record<string, unknown>
  return OBBLIGATORIE.filter(([chiave, modo]) => {
    const v = r[chiave]
    switch (modo) {
      case 'testo':
        return !testoScritto(v)
      case 'valore':
        return !(presente(v) && String(v) !== '')
      case 'altezza_peso': {
        const o = (v ?? {}) as Record<string, unknown>
        return !(typeof o.altezza === 'number' && typeof o.peso === 'number')
      }
      case 'massimali': {
        const o = (v ?? {}) as Record<string, unknown>
        return !ESERCIZI_MASSIMALI.every((e) => presente(o[e]))
      }
    }
  }).map(([chiave]) => chiave)
}

/** onboarding_risposte_complete in TypeScript: valid and nothing required missing. */
export function risposteComplete(v: unknown): boolean {
  return risposteValide(v) && risposteMancanti(v).length === 0
}

// ---------------------------------------------------------------------------
// What the server actions and the routes of the questionnaire receive
// ---------------------------------------------------------------------------

export const ERRORI_QUESTIONARIO = {
  nonValidi: 'Alcune risposte non sono valide: controllale e riprova.',
  richiesta: 'Qualcosa non torna: ricarica la pagina e riprova.',
  file: 'File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.',
} as const

export const salvaQuestionarioSchema = z.object({
  risposte: risposteSchema,
  schermata: z.number().int().min(1).max(4),
  versione: z.number().int().min(0),
})

export const inviaQuestionarioSchema = z.object({ versione: z.number().int().min(0) })

/** The fields of the files: the photos of the equipment, the old programme, the meal plan. */
export const CAMPI_ALLEGATO = ['attrezzatura', 'vecchia_scheda', 'piano_alimentare'] as const
export type CampoAllegato = (typeof CAMPI_ALLEGATO)[number]
export const TIPI_ALLEGATO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type TipoAllegato = (typeof TIPI_ALLEGATO)[number]
/** The bucket onboarding-allegati and the check of onboarding_allegati.byte. */
export const BYTE_ALLEGATO_MAX = 10 * 1024 * 1024
export const ALLEGATI_PER_CAMPO = 3
export const NOME_FILE_MAX = 120

/** A file's name as the row keeps it: no slash, backslash or control character, at most 120. */
export function nomeFilePulito(nome: string): string {
  const pulito = nome.replace(/[/\\\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (pulito.length <= NOME_FILE_MAX) return pulito || 'file'
  const punto = pulito.lastIndexOf('.')
  const estensione = punto > 0 && pulito.length - punto <= 6 ? pulito.slice(punto) : ''
  return pulito.slice(0, NOME_FILE_MAX - estensione.length).trimEnd() + estensione
}

export const preparaAllegatoSchema = z.object({
  campo: z.enum(CAMPI_ALLEGATO, { message: ERRORI_QUESTIONARIO.file }),
  nome: z
    .string()
    .min(1, ERRORI_QUESTIONARIO.file)
    .max(NOME_FILE_MAX, ERRORI_QUESTIONARIO.file)
    .refine((s) => s.trim() !== '' && !/[/\\\u0000-\u001f\u007f-\u009f]/.test(s), ERRORI_QUESTIONARIO.file),
  tipo: z.enum(TIPI_ALLEGATO, { message: ERRORI_QUESTIONARIO.file }),
  byte: z.number().int().min(1, ERRORI_QUESTIONARIO.file).max(BYTE_ALLEGATO_MAX, ERRORI_QUESTIONARIO.file),
})
export type PreparaAllegato = z.infer<typeof preparaAllegatoSchema>

export const allegatoIdSchema = z.object({ id: z.string().uuid(ERRORI_QUESTIONARIO.richiesta) })

/**
 * Only the valid answers, each checked by itself: what the page saves, so that one field still
 * being typed never makes the whole save refused. Unknown keys and invalid values go.
 */
export function soloValide(r: Record<string, unknown>): Risposte {
  const forma = risposteSchema.shape as Record<string, z.ZodTypeAny>
  const fuori: Record<string, unknown> = {}
  for (const [chiave, valore] of Object.entries(r)) {
    const schema = forma[chiave]
    if (!schema || valore === undefined) continue
    if (schema.safeParse(valore).success) fuori[chiave] = valore
  }
  return fuori as Risposte
}
