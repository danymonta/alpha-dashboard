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
 * The questionnaire of the onboarding (release B1b): the questions of Dany's Google form
 * «Modulo Onboarding Coaching Online», with its words and its options, in the order of the
 * form, in 4 screens (docs/onboarding/rilascio-b.md, «Codice»). One entry per question: key,
 * text of the form, kind, options, screen. Typing mistakes of the form corrected: «Sedetario»,
 * «abidutini», «Quanto ore». The examples the form gives for «successo» and «organizzazione
 * della giornata» are not in the contract: none is invented here (to take from the form, with
 * Dany). The lines of help under a few questions (telephone, injuries, maximums) are of the
 * interface, not of the form. The keys and the values are the ones of lib/validation and of
 * onboarding_risposte_valide; a word changes here. No rule on the age (Dany, 12/11/2026).
 */

export type Schermata = { numero: NumeroSchermata; titolo: string; sotto: string }

export const SCHERMATE: readonly Schermata[] = [
  { numero: 1, titolo: 'Chi sei', sotto: 'Qualche dato su di te, per conoscerti.' },
  { numero: 2, titolo: 'Allenamento', sotto: 'Da dove parti, quanto tempo hai e cosa hai a disposizione.' },
  { numero: 3, titolo: 'Stile di vita', sotto: 'Sonno, attività, alimentazione e abitudini.' },
  { numero: 4, titolo: 'Obiettivi', sotto: 'Dove vuoi arrivare e perché.' },
]

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
  fumo: 'Fumo',
  alcol: 'Bere alcol',
  motivazione: 'Scarsa motivazione e autostima',
  stimolanti: 'Abuso di stimolanti (caffeina, redbull, monster)',
  sonno: 'Dormire meno di 6 ore a notte',
}

export const ETICHETTE_ESERCIZI: Record<(typeof ESERCIZI_MASSIMALI)[number], string> = {
  piegamenti: 'Piegamenti',
  trazioni: 'Trazioni',
  dip: 'Dip',
}

const SI_NO_OPZIONI: readonly Opzione[] = [
  { valore: 'si', etichetta: 'Sì' },
  { valore: 'no', etichetta: 'No' },
]

export const DOMANDE: readonly Domanda[] = [
  // 1 · Chi sei
  {
    chiave: 'nome_cognome',
    schermata: 1,
    tipo: 'testo',
    testo: 'Nome e Cognome',
    autocomplete: 'name',
  },
  { chiave: 'email', schermata: 1, tipo: 'email', testo: 'Indirizzo email' },
  {
    chiave: 'telefono',
    schermata: 1,
    tipo: 'testo',
    testo: 'Numero di telefono (dove ti darò supporto 24/7) (Telegram)',
    aiuto: 'Con il prefisso, per esempio +39 333 123 4567.',
    autocomplete: 'tel',
    inputMode: 'tel',
  },
  { chiave: 'altezza_peso', schermata: 1, tipo: 'altezza_peso', testo: 'Altezza / Peso (a digiuno)' },
  { chiave: 'data_nascita', schermata: 1, tipo: 'data', testo: 'Data di nascita' },
  {
    chiave: 'occupazione',
    schermata: 1,
    tipo: 'testo',
    testo: 'Occupazione (che lavoro fai, studente etc..)',
  },

  // 2 · Allenamento
  {
    chiave: 'storia_allenamento',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Da quanto tempo ti alleni (e in quali sport)',
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
  {
    chiave: 'infortuni',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Hai infortuni / problematiche fisiche particolari da indicare?',
    aiuto: 'Se non ne hai, scrivi «Nessuno».',
  },
  {
    chiave: 'attrezzatura',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Di quale attrezzatura disponi per fare esercizio? Esempio: sbarra, elastici, manubri, anelli, parallele etc..',
    allegato: {
      campo: 'attrezzatura',
      etichetta: 'Le foto della tua attrezzatura',
      aiuto: 'Facoltative: una foto per attrezzo aiuta il tuo coach.',
    },
  },
  {
    chiave: 'massimali',
    schermata: 2,
    tipo: 'massimali',
    testo: 'Massimo numero di ripetizioni nei seguenti esercizi: piegamenti, trazioni, dip',
    aiuto: 'Il numero di ripetizioni di fila, fatte bene. Se non l’hai mai provato, tocca «Non lo so».',
  },
  {
    chiave: 'esercizi_difficolta',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Esercizi su cui hai maggiore difficoltà ed esercizi su cui invece hai minore difficoltà',
    allegato: {
      campo: 'vecchia_scheda',
      etichetta: 'La tua vecchia scheda',
      aiuto: 'Facoltativa: se ne hai una, caricala come foto o PDF.',
    },
  },
  {
    chiave: 'importanza_tecnica',
    schermata: 2,
    tipo: 'testo',
    lungo: true,
    testo: 'Quanto reputi importante la tecnica nei tuoi allenamenti?',
  },

  // 3 · Stile di vita
  { chiave: 'ore_sonno', schermata: 3, tipo: 'testo', testo: 'Quante ore dormi al giorno circa?' },
  {
    chiave: 'livello_attivita',
    schermata: 3,
    tipo: 'scelta',
    testo: 'Qual è il tuo livello attuale di attività fisica?',
    opzioni: LIVELLI_ATTIVITA.map((l) => ({ valore: l, ...ETICHETTE_ATTIVITA[l] })),
  },
  {
    chiave: 'organizzazione_giornata',
    schermata: 3,
    tipo: 'testo',
    lungo: true,
    testo:
      'Organizzi la tua giornata solitamente? Se sì, come strutturi i tuoi impegni principali (lavoro/studio, pasti, allenamento, sonno)?',
  },
  {
    chiave: 'seguito_alimentazione',
    schermata: 3,
    tipo: 'scelta',
    testo: 'Sei seguito sul piano alimentare?',
    opzioni: SI_NO_OPZIONI,
    allegato: {
      campo: 'piano_alimentare',
      etichetta: 'Il tuo piano alimentare',
      aiuto: 'Se ce l’hai, caricalo come foto o PDF.',
      quando: 'si',
    },
  },
  {
    chiave: 'conoscenza_alimentazione',
    schermata: 3,
    tipo: 'testo',
    lungo: true,
    testo: 'Hai idea di come si mangia bene?',
  },
  {
    chiave: 'cattive_abitudini',
    schermata: 3,
    tipo: 'abitudini',
    facoltativa: true,
    testo: 'Quali cattive abitudini hai di quelle elencate qui sotto?',
    aiuto: 'Tocca tutte quelle che ti riguardano.',
    opzioni: CATTIVE_ABITUDINI.map((a) => ({ valore: a, etichetta: ETICHETTE_ABITUDINI[a] })),
    altro: 'Altrimenti scrivi tu quello che ritieni più rilevante',
  },

  // 4 · Obiettivi
  {
    chiave: 'obiettivo_principale',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Il tuo obiettivo N°1 (Più specifico sei e meglio è)',
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
    chiave: 'successo',
    schermata: 4,
    tipo: 'testo',
    lungo: true,
    testo: 'Cosa vorrebbe dire per te avere successo con questo programma di allenamento?',
  },
  {
    chiave: 'pronto',
    schermata: 4,
    tipo: 'scelta',
    testo: 'Ti senti pronto e motivato?',
    opzioni: SI_NO_OPZIONI,
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
