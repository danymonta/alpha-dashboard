import { z } from 'zod'

/**
 * The rules of the answers of the onboarding questionnaire (release B1b, from 1.88.0 the
 * questions are editable from the settings and live in onboarding_domande): the shape of the
 * answers (onboarding_risposte_valide), one answer against its question
 * (onboarding_risposta_conforme), what is missing to send (onboarding_risposte_mancanti), in
 * 20261125110000_questionario_modificabile.sql. tests/questionario-schemi.test.ts uses the same
 * examples as supabase/tests/114_questionario.sql and 119_domande.sql. No rule on the age (Dany,
 * 12/11/2026). The words of the questions are in the table (seeded from lib/percorso/questionario.ts).
 */

/** The options of the form, saved by key (the labels are in lib/percorso/questionario.ts). */
export const MINUTI_GIORNO = ['20_30', '30_40', '40_60', '60_90', '90_120'] as const
export const LIVELLI_ATTIVITA = ['sedentario', 'attivo', 'molto_attivo'] as const
export const SI_NO = ['si', 'no'] as const
export const CATTIVE_ABITUDINI = ['alcol', 'fumo', 'altre_sostanze', 'sonno', 'stimolanti', 'motivazione'] as const
export const ESERCIZI_MASSIMALI = ['piegamenti', 'trazioni', 'dip'] as const
export const NON_LO_SO = 'non_lo_so' as const

export const TESTO_MAX = 2000
export const EMAIL_MAX = 320
export const ALTEZZA = { min: 120, max: 230 } as const
export const PESO = { min: 35, max: 250 } as const
export const RIPETIZIONI = { min: 0, max: 200 } as const
export const GIORNI = { min: 1, max: 7 } as const

const ERRORI_QUESTIONARIO_NON_VALIDI = 'Alcune risposte non sono valide: controllale e riprova.'

/** The four screens, in order. */
export const SCHERMATE_QUESTIONARIO = [1, 2, 3, 4] as const
export type NumeroSchermata = (typeof SCHERMATE_QUESTIONARIO)[number]

/** A key of a question and a value of an option: the same slugs as the checks of onboarding_domande. */
export const CHIAVE_DOMANDA = /^[a-z][a-z0-9_]{1,59}$/
export const VALORE_OPZIONE = /^[a-z0-9_]{1,40}$/
export const OPZIONI_MAX = 30
export const NUMERO_MAX = 1_000_000_000

/**
 * The answers as they are saved: the shape of every question (1.88.0, the questions are editable
 * from the settings). The questions of the form with a structured answer keep their own fields.
 */
export type Risposte = {
  email?: string | null
  telefono?: string | null
  nome_cognome?: string | null
  data_nascita?: string | null
  altezza_peso?: { altezza?: number | null; peso?: number | null } | null
  giorni_settimana?: number | null
  minuti_giorno?: string | null
  massimali?: { [E in (typeof ESERCIZI_MASSIMALI)[number]]?: number | typeof NON_LO_SO | null } | null
  livello_attivita?: string | null
  seguito_alimentazione?: string | null
  pronto?: string | null
  cattive_abitudini?: { scelte?: string[] | null; altro?: string | null } | null
} & { [chiave: string]: unknown }

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

function oggetto(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function elencoDiValori(v: unknown): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= OPZIONI_MAX &&
    v.every((x) => typeof x === 'string' && VALORE_OPZIONE.test(x)) &&
    new Set(v).size === v.length
  )
}

function intero(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

/** One value of the shape rule: the check of onboarding_questionari.risposte, key by key. */
function valoreInForma(chiave: string, v: unknown): boolean {
  if (v === null) return true
  switch (chiave) {
    case 'email':
      return typeof v === 'string' && v.length <= EMAIL_MAX && (v.trim() === '' || EMAIL.test(v.trim()))
    case 'data_nascita':
      return typeof v === 'string' && (v === '' || dataValida(v))
    case 'altezza_peso':
      return (
        oggetto(v) &&
        Object.entries(v).every(([k, w]) =>
          w === null
            ? k === 'altezza' || k === 'peso'
            : k === 'altezza'
              ? intero(w, ALTEZZA.min, ALTEZZA.max)
              : k === 'peso'
                ? typeof w === 'number' && w >= PESO.min && w <= PESO.max && unDecimale(w)
                : false,
        )
      )
    case 'massimali':
      return (
        oggetto(v) &&
        Object.entries(v).every(
          ([k, w]) =>
            (ESERCIZI_MASSIMALI as readonly string[]).includes(k) &&
            (w === null || w === NON_LO_SO || intero(w, RIPETIZIONI.min, RIPETIZIONI.max)),
        )
      )
    case 'cattive_abitudini':
      return (
        oggetto(v) &&
        Object.entries(v).every(([k, w]) =>
          w === null
            ? k === 'scelte' || k === 'altro'
            : k === 'scelte'
              ? elencoDiValori(w)
              : k === 'altro'
                ? typeof w === 'string' && w.length <= TESTO_MAX
                : false,
        )
      )
  }
  if (typeof v === 'string') return v.length <= TESTO_MAX
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= NUMERO_MAX
  return elencoDiValori(v)
}

/**
 * onboarding_risposte_valide in TypeScript: the shape of the answers, whatever the questions
 * (at most 300 keys, each a slug; the structured answers with their rules; any other a text of at
 * most 2,000 characters, a number or a list of option values). What a question accepts is
 * rispostaConforme.
 */
export function risposteForma(v: unknown): v is Risposte {
  if (!oggetto(v)) return false
  const voci = Object.entries(v)
  return voci.length <= 300 && voci.every(([k, w]) => CHIAVE_DOMANDA.test(k) && w !== undefined && valoreInForma(k, w))
}

/** What the rules of the answers need of a question (a Domanda of lib/percorso/questionario.ts has it). */
export type RegolaDomanda = {
  chiave: string
  tipo: string
  facoltativa?: boolean
  numerica?: boolean
  opzioni?: readonly { valore: string }[]
  allegato?: { campo: string }
}

function tra(d: RegolaDomanda, valore: string): boolean {
  return (d.opzioni ?? []).some((o) => o.valore === valore)
}

/** onboarding_risposta_conforme in TypeScript: one answer against its question. */
export function rispostaConforme(d: RegolaDomanda, v: unknown): boolean {
  if (v === null || v === undefined) return true
  switch (d.tipo) {
    case 'testo':
    case 'email':
      return typeof v === 'string'
    case 'data':
      return typeof v === 'string' && (v === '' || dataValida(v))
    case 'numero':
      return typeof v === 'number'
    case 'altezza_peso':
    case 'massimali':
      return oggetto(v)
    case 'scelta':
      if (d.numerica ? typeof v !== 'number' : typeof v !== 'string') return false
      return tra(d, String(v))
    case 'scelte':
      return Array.isArray(v) && v.every((x) => typeof x === 'string' && tra(d, x))
    case 'abitudini':
      return oggetto(v) && (!Array.isArray(v.scelte) || v.scelte.every((x) => typeof x === 'string' && tra(d, x)))
    default:
      return false
  }
}

/** One answer that the save keeps: of the right shape and accepted by its question. */
export function rispostaValida(d: RegolaDomanda, v: unknown): boolean {
  return v !== undefined && valoreInForma(d.chiave, v) && rispostaConforme(d, v)
}

/** The answers valid in shape and each accepted by its question (keys of questions not in use: not valid). */
export function risposteValide(v: unknown, domande: readonly RegolaDomanda[]): v is Risposte {
  if (!risposteForma(v)) return false
  const per = new Map(domande.map((d) => [d.chiave, d]))
  return Object.entries(v).every(([k, w]) => w === null || (per.has(k) && rispostaConforme(per.get(k)!, w)))
}

function presente(v: unknown): boolean {
  return (typeof v === 'number' || typeof v === 'string') && String(v) !== ''
}

function risposta(d: RegolaDomanda, v: unknown, conFile: ReadonlySet<string>): boolean {
  if (d.tipo === 'file') return d.allegato ? conFile.has(d.allegato.campo) : false
  if (!rispostaConforme(d, v)) return false
  switch (d.tipo) {
    case 'testo':
    case 'email':
    case 'data':
      return testoScritto(v)
    case 'scelta':
    case 'numero':
      return presente(v)
    case 'scelte':
      return Array.isArray(v) && v.length > 0
    case 'altezza_peso': {
      const o = (v ?? {}) as Record<string, unknown>
      return typeof o.altezza === 'number' && typeof o.peso === 'number'
    }
    case 'massimali': {
      const o = (v ?? {}) as Record<string, unknown>
      return ESERCIZI_MASSIMALI.every((e) => typeof o[e] === 'number' || typeof o[e] === 'string')
    }
    case 'abitudini': {
      const o = (v ?? {}) as Record<string, unknown>
      return (Array.isArray(o.scelte) && o.scelte.length > 0) || testoScritto(o.altro)
    }
    default:
      return false
  }
}

/**
 * onboarding_risposte_mancanti in TypeScript: the required questions not answered, in their
 * order. A question of files is answered by one file uploaded on its field (`conFile`: the fields
 * with at least one file).
 */
export function risposteMancanti(
  risposte: Risposte | Record<string, unknown> | null | undefined,
  domande: readonly RegolaDomanda[],
  conFile: ReadonlySet<string> = new Set(),
): string[] {
  const r = (risposte ?? {}) as Record<string, unknown>
  return domande.filter((d) => !d.facoltativa && !risposta(d, r[d.chiave], conFile)).map((d) => d.chiave)
}

/** onboarding_risposte_complete in TypeScript: valid and nothing required missing. */
export function risposteComplete(
  v: unknown,
  domande: readonly RegolaDomanda[],
  conFile: ReadonlySet<string> = new Set(),
): boolean {
  return risposteValide(v, domande) && risposteMancanti(v, domande, conFile).length === 0
}

/**
 * Only the valid answers, each checked by itself against its question: what the page saves, so
 * that one field still being typed never makes the whole save refused. Unknown keys, answers of
 * questions not in use and invalid values go (as onboarding_risposte_filtra in SQL).
 */
export function soloValide(r: Record<string, unknown>, domande: readonly RegolaDomanda[]): Risposte {
  const per = new Map(domande.map((d) => [d.chiave, d]))
  const fuori: Record<string, unknown> = {}
  for (const [chiave, valore] of Object.entries(r)) {
    const d = per.get(chiave)
    if (!d || valore === undefined || valore === null) continue
    if (rispostaValida(d, valore)) fuori[chiave] = valore
  }
  return fuori as Risposte
}

/** The answers of a valid shape, any question: what the server actions receive. */
export const risposteSchema = z.custom<Risposte>((v) => risposteForma(v), ERRORI_QUESTIONARIO_NON_VALIDI)

// ---------------------------------------------------------------------------
// What the server actions and the routes of the questionnaire receive
// ---------------------------------------------------------------------------

export const ERRORI_QUESTIONARIO = {
  nonValidi: ERRORI_QUESTIONARIO_NON_VALIDI,
  richiesta: 'Qualcosa non torna: ricarica la pagina e riprova.',
  file: 'File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.',
} as const

export const salvaQuestionarioSchema = z.object({
  risposte: risposteSchema,
  schermata: z.number().int().min(1).max(4),
  versione: z.number().int().min(0),
})

export const inviaQuestionarioSchema = z.object({ versione: z.number().int().min(0) })

/**
 * The field of the files of a question (allegato.campo): a slug. The three of the form are
 * attrezzatura, vecchia_scheda and piano_alimentare; a question of files added by the admin has its key.
 */
export type CampoAllegato = string
export const TIPI_ALLEGATO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type TipoAllegato = (typeof TIPI_ALLEGATO)[number]
/** The bucket onboarding-allegati and the check of onboarding_allegati.byte. */
export const BYTE_ALLEGATO_MAX = 10 * 1024 * 1024
export const ALLEGATI_PER_CAMPO = 10
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
  campo: z.string().regex(CHIAVE_DOMANDA, ERRORI_QUESTIONARIO.file),
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
