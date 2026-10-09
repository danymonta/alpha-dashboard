/**
 * What the leads say, for marketing (Dany, 30/09/2026).
 *
 * The setter's comment on his day: "nel report giornaliero è fondamentale che
 * integri anche un commento insieme ai dati, ma bisogna guidarlo". And the
 * closer's side: "il closer deve inserire motivo di non chiusura sempre" (the
 * price objection is his, not the setter's). Marketing reads both to adapt
 * the content.
 *
 * Every word about it lives here, so a word changes in one place: the "Oggi"
 * form, the admin's forms in Setting, the closer's outcome sheet, the
 * marketing section, the legend and Alfire all read these texts. The values
 * (quasi_tutti, buone, …) are the database enums: change the words freely,
 * never the values.
 */

import { oggiRoma } from '@/lib/date'

export const LIVELLI_IN_TARGET = ['quasi_tutti', 'circa_meta', 'pochi'] as const
export type LivelloInTarget = (typeof LIVELLI_IN_TARGET)[number]

export const LIVELLI_QUALITA = ['buone', 'medie', 'scarse'] as const
export type LivelloQualita = (typeof LIVELLI_QUALITA)[number]

export type CampoScala = 'lead_in_target' | 'qualita_conversazioni'
export type CampoTesto = 'cosa_frenava' | 'domande_contenuti' | 'note'

export type OpzioneScala<L extends string = string> = {
  valore: L
  /** One or two words, on the button */
  etichetta: string
  /** What it means, under the words, always visible */
  definizione: string
}

export type Scala<L extends string = string> = {
  campo: CampoScala
  /** Short name: tables, legend, Alfire's card */
  titolo: string
  domanda: string
  /** A line under the question, when the options alone do not say it all */
  spiegazione?: string
  opzioni: readonly OpzioneScala<L>[]
  /** Short definitions: the three options side by side on a phone; else one per row */
  affiancate: boolean
}

export const SCALA_IN_TARGET: Scala<LivelloInTarget> = {
  campo: 'lead_in_target',
  titolo: 'Lead in target',
  domanda: 'Quanti lead della giornata erano in target?',
  spiegazione:
    'In target: uomo dai 25 anni in su che vuole cambiare il suo fisico e può allenarsi a casa, a corpo libero. Contano tutte le persone con cui si è scritto nella giornata, non solo chi ha fissato la call.',
  opzioni: [
    { valore: 'quasi_tutti', etichetta: 'Quasi tutti', definizione: '3 su 4 o più' },
    { valore: 'circa_meta', etichetta: 'Circa metà', definizione: 'più o meno 1\u00a0su\u00a02' },
    { valore: 'pochi', etichetta: 'Pochi', definizione: '1 su 4 o meno' },
  ],
  affiancate: true,
}

export const SCALA_QUALITA: Scala<LivelloQualita> = {
  campo: 'qualita_conversazioni',
  titolo: 'Qualità delle conversazioni',
  domanda: 'Com’erano le conversazioni della giornata?',
  opzioni: [
    {
      valore: 'buone',
      etichetta: 'Buone',
      definizione:
        'Rispondono con frasi vere, raccontano la loro situazione, fanno domande: si arriva a proporre la call.',
    },
    {
      valore: 'medie',
      etichetta: 'Medie',
      definizione: 'Rispondono, ma a monosillabi o si fermano dopo 2 o 3 messaggi: bisogna tirarle avanti.',
    },
    {
      valore: 'scarse',
      etichetta: 'Scarse',
      definizione: 'Risposte fredde o curiosi senza intenzione: spariscono presto.',
    },
  ],
  affiancate: false,
}

/** The two scales, in the order the form asks them. */
export const SCALE_COMMENTO = [SCALA_IN_TARGET, SCALA_QUALITA] as const

/** Sanity ceiling of cosa_frenava and domande_contenuti (the database checks it too). */
export const MASSIMO_TESTO_COMMENTO = 1000

export type TestoCommento = {
  campo: CampoTesto
  /** Short name: tables, marketing list, Alfire's card */
  titolo: string
  domanda: string
  placeholder: string
  massimo: number
}

/**
 * The free texts. "Altre note" is the note the report always had. From
 * COMMENTO_OBBLIGATORIO_DAL "Cosa frenava i lead" is required of the setter
 * on a day with activity (CAMPI_OBBLIGATORI); the other two stay optional.
 */
export const TESTI_COMMENTO: readonly TestoCommento[] = [
  {
    campo: 'cosa_frenava',
    titolo: 'Cosa frenava i lead',
    domanda: 'Cosa frenava i lead dal fissare la call?',
    placeholder:
      'Es. «sono solo curioso», «non ho tempo per una call», «ci devo pensare», «prima voglio vedere altri contenuti», «mi alleno già in palestra»',
    massimo: MASSIMO_TESTO_COMMENTO,
  },
  {
    campo: 'domande_contenuti',
    titolo: 'Domande e contenuti',
    // "a scrivere", not "a scriverti": the admin fills a setter's day with the same words
    domanda: 'Cosa chiedevano i lead, e quale contenuto li ha portati a scrivere?',
    placeholder: 'Es. «chiedono se serve la palestra», «hanno scritto dopo il reel sulla pancia»',
    massimo: MASSIMO_TESTO_COMMENTO,
  },
  {
    campo: 'note',
    titolo: 'Altre note',
    domanda: 'Altro da segnalare?',
    placeholder: 'Quello che non sta nelle domande sopra',
    // the report's note, as it always was
    massimo: 2000,
  },
]

export const COMMENTO = {
  titolo: 'Com’è andata la giornata',
  descrizione:
    'Serve al marketing per adattare i contenuti. Se nella giornata ci sono DM o conversazioni, rispondi alle prime due domande (un tocco ciascuna); il resto è facoltativo.',
  /** The admin's forms in Setting: nothing is required there */
  descrizioneAdmin: 'Le risposte del setter sulla giornata, per il marketing. Tutte facoltative.',
  facoltativo: 'facoltativo',
  /** Shown to the setter only, on his own report: never a list, never to the admin */
  daCompletare: 'Da completare',
  daCompletareSpiegazione:
    'Nella giornata ci sono DM o conversazioni: rispondi alle prime due domande di «Com’è andata la giornata», un tocco ciascuna.',
} as const

/**
 * The required comment (Dany, 08/10/2026: "il commento che lascia il setter
 * quando compila e carica i volumi di chat deve essere obbligatorio, che sia
 * lui o Instagram poi a caricare deve lui sempre lasciare un commento della
 * giornata"). Every word of it: "Oggi", the Instagram card's step, Alfire.
 * Shown to the setter only, on his own days: never to the admin, never a list
 * or a count of his (CLAUDE.md section 17).
 */
export const COMMENTO_OBBLIGATORIO = {
  /** "Oggi", from COMMENTO_OBBLIGATORIO_DAL */
  descrizione:
    'Serve al marketing per adattare i contenuti. Se nella giornata ci sono DM o conversazioni, le prime tre domande sono obbligatorie: i numeri si salvano lo stesso, ma la giornata resta da completare finché non rispondi.',
  obbligatoria: 'obbligatoria',
  /** The day's reminder, in the save bar and on the section */
  manca: 'Manca il commento della giornata',
  mancaSpiegazione:
    'Nella giornata ci sono DM o conversazioni: rispondi a lead in target, qualità delle conversazioni e cosa frenava i lead.',
  /** Under a question still to answer, on a day to complete */
  errore: {
    lead_in_target: 'Scegli quanti lead erano in target',
    qualita_conversazioni: 'Scegli com’erano le conversazioni',
    cosa_frenava: 'Scrivi cosa frenava i lead',
  } satisfies Record<CampoObbligatorio, string>,
  /** On top of "Oggi": his other days from COMMENTO_OBBLIGATORIO_DAL without it */
  giorni: 'Ti manca il commento di:',
  altri: (n: number) => (n === 1 ? 'e 1 altro giorno' : `e altri ${n} giorni`),
  /** The Instagram card's step, before a decision */
  passo: {
    titolo: 'Com’è andata la giornata',
    descrizione: (giorno: string) =>
      `Prima di decidere, il commento di ${giorno}: lead in target, qualità delle conversazioni e cosa frenava i lead. Si salva nel tuo report con la tua scelta.`,
    indietro: 'Torna ai numeri',
    /**
     * The proposal was decided elsewhere (the admin, another device) while
     * he wrote the answers in the step: they go into his report all the same
     */
    salvato: 'Il tuo commento della giornata è salvato nel report di quel giorno.',
    nonSalvato: 'Il commento della giornata non si è salvato: scrivilo nel report di quel giorno, in Oggi.',
  },
  /** Alfire's card, on a setter's day without it */
  alfire: (mancanti: string[]) =>
    `Manca il commento della giornata: ${mancanti.join(', ')}. Il report si salva lo stesso, ma la giornata resta da completare.`,
} as const

/**
 * Where "Da completare" and "Manca il commento della giornata" lead: the
 * section of the setter's own report in "Oggi" (an id, and a URL hash).
 */
export const ANCORA_COMMENTO = 'commento-giornata'

/** The three answers required from COMMENTO_OBBLIGATORIO_DAL, in the form's order. */
export const CAMPI_OBBLIGATORI = ['lead_in_target', 'qualita_conversazioni', 'cosa_frenava'] as const
export type CampoObbligatorio = (typeof CAMPI_OBBLIGATORI)[number]

/**
 * The first day the comment is required (Dany, 08/10/2026: from that day on;
 * a day before keeps the rule it had, "Da completare" on the two scales).
 * By the day reported, not by when it was saved. The database has the same
 * date in commento_da_scrivere (20261008110000_commento_obbligatorio.sql):
 * they change together.
 */
export const COMMENTO_OBBLIGATORIO_DAL = '2026-10-08'

/**
 * PostgREST filters of a report missing its required comment, the same rule
 * as commento_da_scrivere: from COMMENTO_OBBLIGATORIO_DAL (gte on data), with
 * activity, without one of the three answers. A blank text is never saved:
 * the forms send null, and the trigger setter_daily_reports_testi_vuoti turns
 * the blanks of any other write into null, so null is "not written" here as
 * in testo_scritto (a test of 65_commento_obbligatorio.sql checks that the
 * two count the same days). Two `or` filters on one query are both applied (AND).
 */
export const FILTRO_ATTIVITA = 'dm_outbound.gt.0,dm_inbound.gt.0,follow_up.gt.0,conversazioni.gt.0'
export const FILTRO_COMMENTO_MANCANTE = 'lead_in_target.is.null,qualita_conversazioni.is.null,cosa_frenava.is.null'

/**
 * The first day the two answers are asked (Dany, 30/09/2026): a report
 * created before it was filled when the questions did not exist, so it never
 * says "Da completare". The setter can still answer on it.
 */
export const COMMENTO_CHIESTO_DAL = '2026-09-30'

// ---------------------------------------------------------------------------
// The closer's side: why a held call did not close
// ---------------------------------------------------------------------------

/** Ceiling of the reason (calls.obiezione_principale). */
export const MASSIMO_MOTIVO = 500
/** Ceiling of the closer's notes (calls.note_closer): the database checks it too. */
export const MASSIMO_NOTE_CLOSER = 2000
/** Ceiling of the setter's notes (calls.note), in "Modifica la call". */
export const MASSIMO_NOTE_SETTER = 1000

/**
 * "Motivo di non chiusura" (calls.obiezione_principale): required for a held
 * call ending in Follow-up or Persa, in the outcome sheet and in Alfire. The
 * price objections live here, on the closer's side.
 */
export const MOTIVO_NON_CHIUSURA = {
  titolo: 'Motivo di non chiusura',
  domanda: 'Perché non ha chiuso?',
  placeholder: 'Es. «fuori budget», «vuole provare da solo», «deve parlarne con la compagna», «non è il momento»',
  obbligatorio: 'obbligatorio',
  /**
   * Under both texts of the sheet. The setter who booked the call can read
   * them (RLS on calls), never the amount pitched (call_pitch): no amounts here.
   */
  senzaImporti: 'Niente importi qui: l’importo proposto va nel suo campo, con la matita della call.',
  /** The schema's message, and the line under the save buttons while it is empty */
  manca: 'Scrivi il motivo di non chiusura',
  perSalvare: 'Per salvare scrivi il motivo di non chiusura, poi tocca Sì o No.',
  /** The same line once the reason is there */
  salva: 'Un tocco su Sì o No salva l’esito.',
  /** Alfire's card, when another outcome clears a saved reason */
  tolto: 'tolto',
  troppoLungo: `Al massimo ${MASSIMO_MOTIVO} caratteri`,
} as const

// ---------------------------------------------------------------------------
// The two notes of a call (Dany, 30/09/2026): "Solo il closer registra
// l'esito, e le note del closer non le può modificare il setter."
// ---------------------------------------------------------------------------

/**
 * "Note aggiuntive" (calls.note_closer): the closer's, like the column of his
 * prospect sheet. Written by the closer of the call (outcome sheet, call
 * sheet) and by the admin; the setter who booked the call reads them and never
 * writes them (a trigger refuses it).
 */
export const NOTE_CLOSER = {
  titolo: 'Note aggiuntive',
  /** Where someone other than the closer reads them: the setter's card, Alfire */
  diChi: 'Note aggiuntive del closer',
  facoltative: 'facoltative',
  placeholder: 'Quello che vuoi ricordare della call',
  troppoLungo: `Al massimo ${MASSIMO_NOTE_CLOSER} caratteri`,
} as const

/**
 * "Note del setter" (calls.note): written by the setter with the call's pencil
 * ("Nuova call" has no notes field) and by the admin; the closer reads them
 * (his sheet shows them read only). The notes saved before 30/09/2026 stay
 * here, whoever wrote them.
 */
export const NOTE_SETTER = {
  titolo: 'Note del setter',
  placeholder: 'Quello che il closer deve sapere prima della call',
  /** The closer's sheet, under the setter's note he cannot change */
  soloLettura: 'Le scrive il setter con la matita della call.',
  troppoLungo: `Al massimo ${MASSIMO_NOTE_SETTER} caratteri`,
} as const

/** The setter's call sheet: what stays the closer's. */
export const ESITO_DEL_CLOSER = 'L’esito, il motivo di non chiusura e le note aggiuntive li scrive il closer.'

// ---------------------------------------------------------------------------
// The admin's section in Setting (and Alfire's read of it)
// ---------------------------------------------------------------------------

/** Days and calls with something written that the section lists: the most recent ones. */
export const LIMITE_MARKETING = 200

export const MARKETING = {
  titolo: 'Per il marketing: cosa dicono i lead',
  descrizione:
    'Quello che setter e closer scrivono sui lead del periodo: il report giornaliero del setter, il motivo di non chiusura e le note aggiuntive del closer sulle call.',
  filtroSetter: 'Setter',
  filtroSetterSpiegazione: 'Con un setter scelto: i suoi report e le call col suo nome (quelle che ha fissato e le loro call di follow-up).',
  tutti: 'Tutti',
  setting: {
    titolo: 'Dal setting',
    descrizione: 'Le risposte dei setter nel report: quanti giorni per ogni livello, poi i giorni con qualcosa di scritto, dal più recente.',
    giorni: 'Giorni con un commento scritto',
    vuoto: 'Nessun commento dei setter nel periodo',
    vuotoDescrizione: 'Le risposte arrivano dal report giornaliero del setter, sotto le conversazioni.',
    nessunTesto: 'Nel periodo ci sono solo le risposte a un tocco: nessun commento scritto.',
    suGiorno: 'giorno con una risposta',
    suGiorni: 'giorni con una risposta',
  },
  /** When a list reaches LIMITE_MARKETING: the older ones are left out, and it says so */
  piuRecenti: `i ${LIMITE_MARKETING} più recenti`,
  troncati: 'Si vedono i più recenti: per leggere gli altri scegli un periodo più corto.',
  call: {
    titolo: 'Dalle call',
    descrizione:
      'Le call svolte e non chiuse (Follow-up o Persa), con il motivo di non chiusura e le note aggiuntive scritti dal closer, dalla più recente.',
    vuoto: 'Nessun motivo di non chiusura nel periodo',
    vuotoDescrizione: 'Il closer lo scrive quando registra l’esito Follow-up o Persa di una call.',
  },
} as const

// ---------------------------------------------------------------------------
// Words for a stored value
// ---------------------------------------------------------------------------

const PER_CAMPO: Record<CampoScala, Scala> = {
  lead_in_target: SCALA_IN_TARGET,
  qualita_conversazioni: SCALA_QUALITA,
}

export function scalaDi(campo: CampoScala): Scala {
  return PER_CAMPO[campo]
}

/** "Circa metà" for circa_meta; null for no answer or an unknown value. */
export function etichettaLivello(campo: CampoScala, valore: string | null | undefined): string | null {
  if (!valore) return null
  return PER_CAMPO[campo].opzioni.find((o) => o.valore === valore)?.etichetta ?? null
}

// ---------------------------------------------------------------------------
// "Da completare": the setter's own reminder on his own day
// ---------------------------------------------------------------------------

export type GiornataDaCommentare = {
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  conversazioni: number
  lead_in_target?: string | null
  qualita_conversazioni?: string | null
  cosa_frenava?: string | null
}

/**
 * A day with activity: DM totali > 0 or conversazioni > 0. Every counter is
 * >= 0, so DM totali (outbound + inbound + follow up, a database column) is
 * above zero exactly when one of its parts is: nothing is added up here.
 */
export function giornataConAttivita(v: GiornataDaCommentare): boolean {
  return [v.dm_outbound, v.dm_inbound, v.follow_up, v.conversazioni].some((n) => Number(n) > 0)
}

/**
 * The two scales are asked on every day with activity. The report still saves
 * without them (never a blocked save): the day just says "Da completare" to
 * the setter until both are set. The texts are always optional.
 * `creatoIl` is the report's created_at (null: not saved yet). A report
 * created before COMMENTO_CHIESTO_DAL (Europe/Rome day) is never asked.
 */
export function commentoDaCompletare(v: GiornataDaCommentare, creatoIl: string | null = null): boolean {
  if (creatoIl && oggiRoma(new Date(creatoIl)) < COMMENTO_CHIESTO_DAL) return false
  return giornataConAttivita(v) && (!v.lead_in_target || !v.qualita_conversazioni)
}

/** Some text, blanks aside: a blank answer is no answer (the forms save it as null). */
export function testoScritto(testo: string | null | undefined): boolean {
  return typeof testo === 'string' && testo.trim() !== ''
}

type RisposteObbligatorie = Pick<GiornataDaCommentare, CampoObbligatorio>

/** The required answers still missing, in the form's order. */
export function risposteMancanti(v: RisposteObbligatorie): CampoObbligatorio[] {
  return CAMPI_OBBLIGATORI.filter((campo) => (campo === 'cosa_frenava' ? !testoScritto(v[campo]) : !v[campo]))
}

/** The day is one the comment is required on: from COMMENTO_OBBLIGATORIO_DAL. */
export function commentoObbligatorio(data: string): boolean {
  return data >= COMMENTO_OBBLIGATORIO_DAL
}

/**
 * The required comment is missing (the database's commento_da_scrivere): a
 * day from COMMENTO_OBBLIGATORIO_DAL, with activity, without one of the
 * three answers. Never blocks a save: the day stays to complete for the
 * setter, and his decisions on an Instagram proposal ask for it first.
 */
export function commentoMancante(v: GiornataDaCommentare, data: string): boolean {
  return commentoObbligatorio(data) && giornataConAttivita(v) && risposteMancanti(v).length > 0
}

/**
 * What the setter's own day says of its comment: 'manca' from
 * COMMENTO_OBBLIGATORIO_DAL (the three answers, required), 'da_completare'
 * on a day before (the rule it had: the two scales, asked, never required),
 * null when nothing is missing.
 */
export function statoCommento(
  v: GiornataDaCommentare,
  data: string,
  creatoIl: string | null = null,
): 'manca' | 'da_completare' | null {
  if (commentoObbligatorio(data)) return commentoMancante(v, data) ? 'manca' : null
  return commentoDaCompletare(v, creatoIl) ? 'da_completare' : null
}

/** "lead in target, cosa frenava i lead": the missing answers in words (Alfire's card). */
export function paroleMancanti(mancanti: readonly CampoObbligatorio[]): string[] {
  return mancanti.map((campo) =>
    campo === 'cosa_frenava' ? TESTI_COMMENTO[0].titolo.toLowerCase() : PER_CAMPO[campo].titolo.toLowerCase(),
  )
}
