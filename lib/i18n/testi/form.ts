import { bilingue } from '@/lib/i18n/lingua'

/**
 * The words of the shared form pieces: the default «Salva» of an edit sheet (components/form)
 * and the accessible names of the report's counters (components/numeri/stepper.tsx).
 */
export const FORM = bilingue(
  {
    salva: 'Salva',
    meno1: (etichetta: string) => `${etichetta}: meno 1`,
    piu1: (etichetta: string) => `${etichetta}: più 1`,
    piu5: (etichetta: string) => `${etichetta}: più 5`,
  },
  {
    salva: 'Save',
    meno1: (etichetta: string) => `${etichetta}: minus 1`,
    piu1: (etichetta: string) => `${etichetta}: plus 1`,
    piu5: (etichetta: string) => `${etichetta}: plus 5`,
  },
)
