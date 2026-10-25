import { bilingue } from '@/lib/i18n/lingua'
import { FUNZIONE } from '@/lib/tutorial/percorsi'

/**
 * The frame of the guided tour (1.53.0). The tours themselves stay Italian.
 */
export const TUTORIAL = bilingue(
  {
    chiudi: 'Chiudi il tutorial',
    anteprima: 'Anteprima: sul tuo account questo elemento non c’è, chi ha questo ruolo lo vede evidenziato.',
    indietro: 'Indietro',
    tocca: 'Tocca il pulsante evidenziato',
    fine: 'Fine',
    avanti: 'Avanti',
    testa: 'Testa il tutorial',
    tutorialDi: 'Tutorial di…',
    // the function of each role, as the tour calls it
    funzioni: FUNZIONE,
  },
  {
    chiudi: 'Close the tutorial',
    anteprima: 'Preview: this element is not on your account; whoever has this role sees it highlighted.',
    indietro: 'Back',
    tocca: 'Tap the highlighted button',
    fine: 'Done',
    avanti: 'Next',
    testa: 'Try the tutorial',
    tutorialDi: 'Tutorial of…',
    funzioni: {
      admin: 'Admin',
      setter: 'Setter',
      closer: 'Closer',
      coach: 'Fitness coach',
      editor: 'Video editor',
      marketing: 'Marketing',
      nutrizione: 'Nutrition',
      dev: 'Development',
      business_coach: 'Business coach',
    },
  },
)
