import { bilingue } from '@/lib/i18n/lingua'
import {
  COMMENTO,
  COMMENTO_OBBLIGATORIO,
  MASSIMO_TESTO_COMMENTO,
  SCALA_IN_TARGET,
  SCALA_QUALITA,
  TESTI_COMMENTO,
} from '@/lib/setting/commento'

/**
 * «Com’è andata la giornata» in the two languages (1.53.0): the two scales, the three
 * texts and the words around them, in "Oggi", in the step of the Instagram card and in
 * the admin's sheets. The Italian side is lib/setting/commento.ts word for word (a word
 * still changes there); the values of the scales are the database's enums, the same in
 * both languages. Alfire's line stays Italian (Alfire answers in Italian).
 */
export const COMMENTO_GIORNATA = bilingue(
  {
    scale: [SCALA_IN_TARGET, SCALA_QUALITA],
    testi: TESTI_COMMENTO,
    commento: COMMENTO,
    obbligatorio: {
      descrizione: COMMENTO_OBBLIGATORIO.descrizione,
      obbligatoria: COMMENTO_OBBLIGATORIO.obbligatoria,
      manca: COMMENTO_OBBLIGATORIO.manca,
      mancaSpiegazione: COMMENTO_OBBLIGATORIO.mancaSpiegazione,
      errore: COMMENTO_OBBLIGATORIO.errore,
      giorni: COMMENTO_OBBLIGATORIO.giorni,
      altri: COMMENTO_OBBLIGATORIO.altri,
      passo: COMMENTO_OBBLIGATORIO.passo,
    },
  },
  {
    scale: [
      {
        campo: 'lead_in_target',
        titolo: 'Leads on target',
        domanda: 'How many of the day’s leads were on target?',
        spiegazione:
          'On target: a man aged 25 or over who wants to change his body and can train at home, with bodyweight. Everyone written to during the day counts, not only who booked the call.',
        opzioni: [
          { valore: 'quasi_tutti', etichetta: 'Almost all', definizione: '3 in 4 or more' },
          { valore: 'circa_meta', etichetta: 'About half', definizione: 'roughly 1 in 2' },
          { valore: 'pochi', etichetta: 'Few', definizione: '1 in 4 or less' },
        ],
        affiancate: true,
      },
      {
        campo: 'qualita_conversazioni',
        titolo: 'Quality of the conversations',
        domanda: 'How were the day’s conversations?',
        opzioni: [
          {
            valore: 'buone',
            etichetta: 'Good',
            definizione:
              'They answer with real sentences, tell their situation, ask questions: it gets to proposing the call.',
          },
          {
            valore: 'medie',
            etichetta: 'Average',
            definizione: 'They answer, but in single words or stop after 2 or 3 messages: they need pulling along.',
          },
          {
            valore: 'scarse',
            etichetta: 'Poor',
            definizione: 'Cold answers or curious people with no intention: they disappear soon.',
          },
        ],
        affiancate: false,
      },
    ],
    testi: [
      {
        campo: 'cosa_frenava',
        titolo: 'What held the leads back',
        domanda: 'What held the leads back from booking the call?',
        placeholder:
          'E.g. «I’m just curious», «I have no time for a call», «I need to think about it», «I want to see more content first», «I already train at the gym»',
        massimo: MASSIMO_TESTO_COMMENTO,
      },
      {
        campo: 'domande_contenuti',
        titolo: 'Questions and content',
        domanda: 'What did the leads ask, and which content made them write?',
        placeholder: 'E.g. «they ask whether a gym is needed», «they wrote after the reel on belly fat»',
        massimo: MASSIMO_TESTO_COMMENTO,
      },
      {
        campo: 'note',
        titolo: 'Other notes',
        domanda: 'Anything else to report?',
        placeholder: 'What the questions above do not cover',
        massimo: 2000,
      },
    ],
    commento: {
      titolo: 'How the day went',
      descrizione:
        'Marketing uses it to adapt the content. If the day has DMs or conversations, answer the first two questions (one tap each); the rest is optional.',
      descrizioneAdmin: 'The setter’s answers about the day, for marketing. All optional.',
      facoltativo: 'optional',
      daCompletare: 'To complete',
      daCompletareSpiegazione:
        'The day has DMs or conversations: answer the first two questions of «How the day went», one tap each.',
    },
    obbligatorio: {
      descrizione:
        'Marketing uses it to adapt the content. If the day has DMs or conversations, the first three questions are required: the numbers save all the same, but the day stays to complete until you answer.',
      obbligatoria: 'required',
      manca: 'The comment of the day is missing',
      mancaSpiegazione:
        'The day has DMs or conversations: answer leads on target, quality of the conversations and what held the leads back.',
      errore: {
        lead_in_target: 'Choose how many leads were on target',
        qualita_conversazioni: 'Choose how the conversations were',
        cosa_frenava: 'Write what held the leads back',
      },
      giorni: 'The comment is missing for:',
      altri: (n: number) => (n === 1 ? 'and 1 more day' : `and ${n} more days`),
      passo: {
        titolo: 'How the day went',
        descrizione: (giorno: string) =>
          `Before deciding, the comment for ${giorno}: leads on target, quality of the conversations and what held the leads back. It saves into your report with your choice.`,
        indietro: 'Back to the numbers',
        salvato: 'Your comment of the day is saved in that day’s report.',
        nonSalvato: 'The comment of the day did not save: write it in that day’s report, in Today.',
      },
    },
  },
)
