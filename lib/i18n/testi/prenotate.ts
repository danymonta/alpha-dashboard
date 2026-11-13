import { bilingue } from '@/lib/i18n/lingua'

/**
 * «Prenotate su Calendly, non ancora nel gestionale» (1.78.0, Dany, 13/11/2026), in «Le mie call» and in
 * Pipeline, admin only. Names and handles come from the calendar as the leads wrote them: they stay as they are.
 */
export const PRENOTATE = bilingue(
  {
    titolo: 'Prenotate su Calendly, non ancora nel gestionale',
    descrizione:
      'Le call di vendita del calendario «Dany Discovery Call» dei prossimi 30 giorni che nel gestionale non ci sono. Aggiungile alla pipeline con un tocco: la fonte la scegli tu.',
    coincidono: 'Il calendario e il gestionale coincidono: ogni call prenotata nei prossimi 30 giorni è qui.',
    errore: 'Il calendario non si è letto adesso.',
    riprova: 'Riprova',
    carico: 'Leggo il calendario…',
    senzaNome: 'Nome non indicato',
    anni: (n: number) => `${n} anni`,
    budgetSi: 'Budget sì',
    budgetNo: 'Budget no',
    budgetNonDetto: 'Budget non detto',
    aggiungi: 'Aggiungi alla pipeline',
    aggiungiChi: (chi: string, quando: string) => `Aggiungi alla pipeline ${chi}, ${quando}`,
    quando: (giorno: string, ora: string) => `${giorno} alle ${ora}`,
    altre: (n: number) => (n === 1 ? 'E un’altra: compare qui quando aggiungi queste.' : `E altre ${n}: compaiono qui quando aggiungi queste.`),
  },
  {
    titolo: 'Booked on Calendly, not in the app yet',
    descrizione:
      'The sales calls of the calendar «Dany Discovery Call» in the next 30 days that the app does not have. Add them to the pipeline with one tap: you choose the source.',
    coincidono: 'The calendar and the app match: every call booked in the next 30 days is here.',
    errore: 'The calendar could not be read right now.',
    riprova: 'Try again',
    carico: 'Reading the calendar…',
    senzaNome: 'Name not given',
    anni: (n: number) => `${n} years old`,
    budgetSi: 'Budget yes',
    budgetNo: 'Budget no',
    budgetNonDetto: 'Budget not said',
    aggiungi: 'Add to the pipeline',
    aggiungiChi: (chi: string, quando: string) => `Add to the pipeline ${chi}, ${quando}`,
    quando: (giorno: string, ora: string) => `${giorno} at ${ora}`,
    altre: (n: number) => (n === 1 ? 'And one more: it shows up here once you add these.' : `And ${n} more: they show up here once you add these.`),
  },
)
