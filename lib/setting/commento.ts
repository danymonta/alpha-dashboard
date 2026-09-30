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

/** The free texts, all optional. "Altre note" is the note the report always had. */
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
  filtroSetterSpiegazione: 'Con un setter scelto: i suoi report e le call che ha fissato lui.',
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
