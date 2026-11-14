import {
  CATTIVE_ABITUDINI,
  ESERCIZI_MASSIMALI,
  LIVELLI_ATTIVITA,
  MINUTI_GIORNO,
  NON_LO_SO,
  type CampoAllegato,
  type NumeroSchermata,
  type Risposte,
} from '@/lib/validation/questionario'

/**
 * The questionnaire of the onboarding (release B1b, aligned to the form on 13/11/2026, 1.82.0):
 * the questions of Dany's Google form «Modulo Onboarding Coaching Online», with its words, its
 * options and its examples, in the exact order of the form, shown one at a time and grouped in
 * 4 sections for the progress. One entry per question: key, text of the form, kind, options,
 * section. Typing mistakes of the form corrected: «Sedetario», «abidutini», «Quanto ore». Every
 * question is required except «note», as in the form. The words in brackets of the form that
 * said «mandami … su Telegram» are an upload here. The lines of help under telephone, injuries
 * and maximums are of the interface, not of the form. The keys and the values are the ones of lib/validation and of
 * onboarding_risposte_valide; a word changes here. No rule on the age (Dany, 12/11/2026).
 */

export type Schermata = { numero: NumeroSchermata; titolo: string; sotto: string }

export const SCHERMATE: readonly Schermata[] = [
  { numero: 1, titolo: 'Chi sei', sotto: 'Qualche dato su di te, per conoscerti.' },
  { numero: 2, titolo: 'Allenamento e alimentazione', sotto: 'Da dove parti, come ti alleni e come mangi.' },
  { numero: 3, titolo: 'La tua giornata', sotto: 'Sonno, impegni, infortuni e abitudini.' },
  { numero: 4, titolo: 'Obiettivi e punto di partenza', sotto: 'Dove vuoi arrivare e con cosa parti.' },
]

/** The words at the top of Dany's form (without its emoji, never one in the client's area). */
export const INTRO_QUESTIONARIO = {
  titolo: 'Onboarding Percorso Alpha',
  paragrafi: [
    'Benvenuto! Questo è il Questionario di ONBOARDING per iniziare il Percorso Alpha.',
    'Ti chiedo di rispondere in modo specifico e approfondito senza dare niente per scontato a tutte le domande: questo permette di massimizzare al meglio i risultati nel breve, medio, lungo termine.',
    'Sono sicuro che faremo un ottimo lavoro insieme. Si inizia a fare sul serio.',
  ],
} as const

export type Opzione = { valore: string; etichetta: string; dettaglio?: string }

/** A file that goes with a question, in place of «mandami le foto su Telegram» of the form. */
export type AllegatoDomanda = {
  campo: CampoAllegato
  etichetta: string
  aiuto: string
  /** Only when the question has this answer (the meal plan, with «Sì»). */
  quando?: string
}

type Base = {
  chiave: keyof Risposte
  schermata: NumeroSchermata
  /** The text of the question in the form. */
  testo: string
  /** A line under the question: an example or what to write. */
  aiuto?: string
  facoltativa?: true
  allegato?: AllegatoDomanda
}

export type Domanda =
  | (Base & {
      tipo: 'testo'
      /** A long answer: a textarea. */
      lungo?: true
      autocomplete?: string
      inputMode?: 'text' | 'tel'
      /** The equipment as chips with their «i» under the answer. */
      attrezzi?: true
    })
  | (Base & { tipo: 'email' })
  | (Base & { tipo: 'data' })
  | (Base & { tipo: 'altezza_peso' })
  | (Base & { tipo: 'scelta'; opzioni: readonly Opzione[]; numerica?: true })
  | (Base & { tipo: 'massimali' })
  | (Base & { tipo: 'abitudini'; opzioni: readonly Opzione[]; altro: string })

const ETICHETTE_MINUTI: Record<(typeof MINUTI_GIORNO)[number], string> = {
  '20_30': '20-30 minuti',
  '30_40': '30-40 minuti',
  '40_60': '40-60 minuti',
  '60_90': '60-90 minuti',
  '90_120': '90-120 minuti',
}

// the options of the form as they are: the label, then the words in brackets of the form, lowercase
const ETICHETTE_ATTIVITA: Record<(typeof LIVELLI_ATTIVITA)[number], { etichetta: string; dettaglio: string }> = {
  sedentario: {
    etichetta: 'Sedentario',
    dettaglio: '(meno di 2h a settimana di esercizio fisico e/o meno di 10.000 passi al giorno)',
  },
  attivo: {
    etichetta: 'Attivo',
    dettaglio: '(meno di 5h a settimana di attività fisica e/o circa 10.000 passi al giorno)',
  },
  molto_attivo: {
    etichetta: 'Molto attivo',
    dettaglio: '(più di 5h a settimana di esercizio fisico) ps: escluse le attività lavorative di routine',
  },
}

const ETICHETTE_ABITUDINI: Record<(typeof CATTIVE_ABITUDINI)[number], string> = {
  alcol: 'Bere alcol',
  fumo: 'Fumo',
  altre_sostanze: 'Altre sostanze',
  sonno: 'Dormire meno di 6 ore a notte',
  stimolanti: 'Abuso di stimolanti (caffeina, redbull, monster)',
  motivazione: 'Scarsa motivazione e autostima',
}

export const ETICHETTE_ESERCIZI: Record<(typeof ESERCIZI_MASSIMALI)[number], string> = {
  piegamenti: 'Piegamenti',
  trazioni: 'Trazioni',
  dip: 'Dip',
}

export const DOMANDE: readonly Domanda[] = [
  // 1 · Chi sei
  { chiave: 'email', schermata: 1, tipo: 'email', testo: 'Email' },
  {
    chiave: 'telefono',
    schermata: 1,
    tipo: 'testo',
    testo: 'Numero di telefono (dove ti darò supporto 24/7) (Telegram)',
    aiuto: 'Con il prefisso, per esempio +39 333 123 4567.',
    autocomplete: 'tel',
    inputMode: 'tel',
  },
  { chiave: 'nome_cognome', schermata: 1, tipo: 'testo', testo: 'Nome e Cognome', autocomplete: 'name' },
  { chiave: 'altezza_peso', schermata: 1, tipo: 'altezza_peso', testo: 'Altezza / Peso (a digiuno)' },
  { chiave: 'data_nascita', schermata: 1, tipo: 'data', testo: 'Data di nascita' },
  {
    chiave: 'obiettivo_principale',
    schermata: 1,
    tipo: 'testo',
    lungo: true,
    testo: 'Il tuo obiettivo N°1 (Più specifico sei e meglio è)',
  },
  { chiave: 'occupazione', schermata: 1, tipo: 'testo', testo: 'Occupazione (che lavoro fai, studente etc..)' },

  // 2 · Allenamento e alimentazione
  {
    chiave: 'storia_allenamento',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Da quanto tempo ti alleni (e in quali sport)',
  },
  {
    chiave: 'livello_attivita',
    schermata: 2,
    tipo: 'scelta',
    testo: 'Qual è il tuo livello attuale di attività fisica?',
    opzioni: LIVELLI_ATTIVITA.map((l) => ({ valore: l, ...ETICHETTE_ATTIVITA[l] })),
  },
  {
    chiave: 'importanza_tecnica',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Quanto reputi importante la tecnica nei tuoi allenamenti?',
  },
  {
    chiave: 'seguito_alimentazione',
    schermata: 2,
    tipo: 'scelta',
    testo: 'Sei già seguito da qualcun altro sul piano alimentare?',
    aiuto: 'Che ti segua qualcuno o no, se stai seguendo una dieta, caricala qui sotto.',
    opzioni: [
      { valore: 'si', etichetta: 'Sì, ho un professionista che mi segue' },
      { valore: 'no', etichetta: 'No, mi affido a voi!' },
    ],
    allegato: {
      campo: 'piano_alimentare',
      etichetta: 'La tua dieta',
      aiuto: 'Foto o PDF, anche più file insieme. Se non segui una dieta, lascia vuoto.',
    },
  },
  {
    chiave: 'conoscenza_alimentazione',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Hai idea di come si mangia bene?',
  },
  {
    chiave: 'giorni_settimana',
    schermata: 2,
    tipo: 'scelta',
    numerica: true,
    testo: 'Quanti giorni a settimana puoi dedicare all’allenamento?',
    opzioni: ['1', '2', '3', '4', '5', '6', '7'].map((g) => ({ valore: g, etichetta: g })),
  },
  {
    chiave: 'minuti_giorno',
    schermata: 2,
    tipo: 'scelta',
    testo: 'Quanto tempo puoi dedicare all’allenamento per ogni giorno che hai indicato?',
    opzioni: MINUTI_GIORNO.map((m) => ({ valore: m, etichetta: ETICHETTE_MINUTI[m] })),
  },

  // 3 · La tua giornata
  { chiave: 'ore_sonno', schermata: 3, tipo: 'testo', testo: 'Quante ore dormi al giorno circa?' },
  {
    chiave: 'organizzazione_giornata',
    schermata: 3,
    tipo: 'testo',
    lungo: true,
    testo:
      'Organizzi la tua giornata solitamente? Se sì, come strutturi i tuoi impegni principali (lavoro/studio, pasti, allenamento, sonno)?',
    aiuto: 'Ad esempio: «Mi sveglio alle 7, lavoro 9-18, ceno alle 20, mi alleno dopo cena».',
  },
  {
    chiave: 'infortuni',
    schermata: 3,
    tipo: 'testo',
    lungo: true,
    testo: 'Hai infortuni / problematiche fisiche particolari da indicare?',
    aiuto: 'Se non ne hai, scrivi «Nessuno».',
  },
  {
    chiave: 'cattive_abitudini',
    schermata: 3,
    tipo: 'abitudini',
    testo: 'Quali cattive abitudini hai di quelle elencate qui sotto?',
    aiuto: 'Altrimenti scrivi tu sotto quello che ritieni più rilevante. Tocca tutte quelle che ti riguardano.',
    opzioni: CATTIVE_ABITUDINI.map((a) => ({ valore: a, etichetta: ETICHETTE_ABITUDINI[a] })),
    altro: 'Altro',
  },

  // 4 · Obiettivi e punto di partenza
  {
    chiave: 'successo',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Cosa significherebbe per te avere successo in questo programma?',
    aiuto:
      'Scrivilo con parole tue, come una frase. Ad esempio: «Per me avere successo in questo programma significherebbe finalmente ottenere i risultati su cui ero bloccato da tempo, vedermi più definito allo specchio e sentirmi sicuro quando tolgo la maglietta.»',
  },
  {
    chiave: 'perche_noi',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Cosa ti ha spinto a farti seguire da me?',
  },
  {
    chiave: 'obiettivi_3_6_mesi',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Cosa ti piacerebbe ottenere nei prossimi 3-6 mesi? (obiettivi di forza specifici, risultati estetici specifici, etc)',
  },
  {
    chiave: 'attrezzatura',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Di quale attrezzatura disponi per fare esercizio?',
    aiuto: 'Tocca quella che hai o scrivila tu. Non sai cos’è? Tocca la «i».',
    attrezzi: true,
    allegato: {
      campo: 'attrezzatura',
      etichetta: 'Le foto della tua attrezzatura',
      aiuto: 'Una foto per attrezzo aiuta il tuo coach.',
    },
  },
  {
    chiave: 'massimali',
    schermata: 4,
    tipo: 'massimali',
    testo: 'Massimo numero di ripetizioni nei seguenti esercizi: piegamenti, trazioni, dip',
    aiuto: 'Il numero di ripetizioni di fila, fatte bene. Se non l’hai mai provato, tocca «Non lo so».',
  },
  {
    chiave: 'esercizi_difficolta',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Esercizi su cui hai maggiore difficoltà ed esercizi su cui invece hai minore difficoltà',
    aiuto: 'Se hai già una vecchia scheda che facevi prima, caricala qui sotto.',
    allegato: {
      campo: 'vecchia_scheda',
      etichetta: 'La tua vecchia scheda',
      aiuto: 'Caricala come foto o PDF, anche più file.',
    },
  },
  {
    chiave: 'note',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    facoltativa: true,
    testo:
      'Vuoi aggiungere qualcosa di rilevante sulla tua situazione, sul tuo stile di vita o sulla tua motivazione che pensi possa aiutarmi a seguirti al meglio?',
  },
  {
    chiave: 'pronto',
    schermata: 4,
    tipo: 'scelta',
    testo: 'Ti senti pronto e motivato?',
    opzioni: [
      { valore: 'si', etichetta: 'Sì, sono pronto a spaccare il mondo!' },
      { valore: 'no', etichetta: 'No' },
    ],
  },
]

export function domandeDi(schermata: NumeroSchermata): Domanda[] {
  return DOMANDE.filter((d) => d.schermata === schermata)
}

export function domanda(chiave: string): Domanda | undefined {
  return DOMANDE.find((d) => d.chiave === chiave)
}

/** The screen of the first key in the list (the first missing answer), or null. */
export function schermataDi(chiavi: readonly string[]): NumeroSchermata | null {
  for (const chiave of chiavi) {
    const d = domanda(chiave)
    if (d) return d.schermata
  }
  return null
}

function giornoItaliano(iso: string): string {
  const [a, m, g] = iso.split('-')
  return a && m && g ? `${g}/${m}/${a}` : iso
}

function decimale(n: number): string {
  return String(n).replace('.', ',')
}

/**
 * An answer said in words, as the admin reads it (and the client, before sending): null when it
 * is not answered. Always Italian: they are the client's data.
 */
export function rispostaInParole(d: Domanda, valore: unknown): string | null {
  if (valore === null || valore === undefined) return null
  switch (d.tipo) {
    case 'testo':
    case 'email':
      return typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null
    case 'data':
      return typeof valore === 'string' && valore !== '' ? giornoItaliano(valore) : null
    case 'altezza_peso': {
      const o = valore as { altezza?: number | null; peso?: number | null }
      const parti = [
        typeof o.altezza === 'number' ? `${o.altezza} cm` : null,
        typeof o.peso === 'number' ? `${decimale(o.peso)} kg` : null,
      ].filter(Boolean)
      return parti.length > 0 ? parti.join(' · ') : null
    }
    case 'scelta': {
      const o = d.opzioni.find((x) => x.valore === String(valore))
      return o ? o.etichetta : null
    }
    case 'massimali': {
      const o = valore as Record<string, unknown>
      const parti = ESERCIZI_MASSIMALI.flatMap((e) => {
        const v = o[e]
        if (v === NON_LO_SO) return [`${ETICHETTE_ESERCIZI[e]}: non lo so`]
        if (typeof v === 'number') return [`${ETICHETTE_ESERCIZI[e]}: ${v}`]
        return []
      })
      return parti.length > 0 ? parti.join(' · ') : null
    }
    case 'abitudini': {
      const o = valore as { scelte?: string[] | null; altro?: string | null }
      const scelte = (o.scelte ?? []).map((s) => d.opzioni.find((x) => x.valore === s)?.etichetta ?? s)
      const altro = o.altro?.trim() ? o.altro.trim() : null
      const parti = [...scelte, ...(altro ? [altro] : [])]
      return parti.length > 0 ? parti.join(' · ') : null
    }
  }
}
