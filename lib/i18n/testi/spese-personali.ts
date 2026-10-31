import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ERRORI_SPESA_PERSONALE, type CategoriaSpesaPersonale } from '@/lib/validation/spese-personali'

/**
 * Spese personali (1.68.0, Dany 31/10/2026): the admin's own expenses, apart from the business
 * costs. The page, the forms, the categories and the fixed messages of the schema and the actions.
 */
export const SPESE_PERSONALI = bilingue(
  {
    titolo: 'Spese personali',
    descrizione:
      'Le tue spese personali: casa, spesa, bollette, trasporti, abbonamenti. Restano separate dall’azienda e non entrano mai nel margine operativo né in nessun numero di Economics.',
    errore: 'Impossibile caricare le spese personali',
    totaleMese: (mese: string) => `Totale spese personali di ${mese}`,
    totale: (frase: string) => `Totale spese personali ${frase}`,
    perCategoria: 'Per categoria',
    fuoriDaiConti: 'Fuori dai conti dell’azienda: Costi e Panoramica non le vedono.',
    aggiungiTitolo: 'Aggiungi',
    elenco: (mese: boolean, n: number) => `Spese del ${mese ? 'mese' : 'periodo'} (${n})`,
    vuoto: (frase: string) => `Nessuna spesa personale ${frase}`,
    vuotoMese: 'Registrala con il modulo qui sopra, oppure copia le ricorrenti del mese precedente.',
    vuotoPeriodo: 'Registrala con il modulo qui sopra, oppure cambia periodo.',
    vaiAlModulo: 'Registra una spesa',
    ricorrenteRiga: ' · ricorrente',
    // the forms
    nuova: 'Nuova spesa personale',
    aggiunta: 'Spesa aggiunta',
    categoria: 'Categoria',
    descrizioneCampo: 'Descrizione',
    placeholder: 'Affitto, supermercato, bolletta della luce…',
    data: 'Data',
    importo: 'Importo',
    ricorrente: 'Ricorrente',
    ricorrenteAiuto: 'Si potrà copiare nel mese successivo con un tocco.',
    aggiungi: 'Aggiungi spesa',
    nienteDaCopiare: 'Nessuna spesa da copiare: le ricorrenti ci sono già.',
    copiate: (n: number) => (n === 1 ? '1 spesa ricorrente copiata' : `${n} spese ricorrenti copiate`),
    copia: (mese: string) => `Copia le ricorrenti di ${mese}`,
    elimina: 'Elimina',
    eliminaNome: (descrizione: string) => `Elimina ${descrizione}`,
    eliminaCosa: (descrizione: string) => `la spesa personale «${descrizione}»`,
    eliminaConseguenza: 'Il totale delle spese personali si ricalcola subito. I conti dell’azienda non cambiano.',
    eliminata: 'Spesa eliminata',
    aggiornata: 'Spesa aggiornata',
    modificaNome: (descrizione: string) => `Modifica la spesa ${descrizione}`,
    modificaTitolo: 'Modifica la spesa',
    modificaDescrizione: 'Il totale delle spese personali si ricalcola subito.',
    salva: 'Salva la spesa',
    connessione: 'Connessione assente. Riprova.',
    categorie: {
      casa: 'Casa e bollette',
      spesa: 'Spesa',
      cibo_fuori: 'Mangiare fuori',
      trasporti: 'Trasporti',
      salute: 'Salute',
      cura_persona: 'Cura della persona',
      abbonamenti: 'Abbonamenti',
      altro: 'Altro',
    } satisfies Record<CategoriaSpesaPersonale, string>,
  },
  {
    titolo: 'Personal expenses',
    descrizione:
      'Your personal expenses: home, groceries, bills, transport, subscriptions. They stay apart from the business and never count in the operating margin or in any Economics number.',
    errore: 'The personal expenses could not be loaded',
    totaleMese: (mese: string) => `Total personal expenses of ${mese}`,
    totale: (frase: string) => `Total personal expenses ${frase}`,
    perCategoria: 'By category',
    fuoriDaiConti: 'Outside the business accounts: Expenses and the Overview never see them.',
    aggiungiTitolo: 'Add',
    elenco: (mese: boolean, n: number) => `Expenses of the ${mese ? 'month' : 'period'} (${n})`,
    vuoto: (frase: string) => `No personal expenses ${frase}`,
    vuotoMese: 'Record one with the form above, or copy the recurring ones of the previous month.',
    vuotoPeriodo: 'Record one with the form above, or change the period.',
    vaiAlModulo: 'Record an expense',
    ricorrenteRiga: ' · recurring',
    nuova: 'New personal expense',
    aggiunta: 'Expense added',
    categoria: 'Category',
    descrizioneCampo: 'Description',
    placeholder: 'Rent, supermarket, electricity bill…',
    data: 'Date',
    importo: 'Amount',
    ricorrente: 'Recurring',
    ricorrenteAiuto: 'It can be copied into the next month with a tap.',
    aggiungi: 'Add expense',
    nienteDaCopiare: 'No expense to copy: the recurring ones are already there.',
    copiate: (n: number) => (n === 1 ? '1 recurring expense copied' : `${n} recurring expenses copied`),
    copia: (mese: string) => `Copy the recurring expenses of ${mese}`,
    elimina: 'Delete',
    eliminaNome: (descrizione: string) => `Delete ${descrizione}`,
    eliminaCosa: (descrizione: string) => `the personal expense “${descrizione}”`,
    eliminaConseguenza: 'The personal expenses total is recalculated straight away. The business accounts do not change.',
    eliminata: 'Expense deleted',
    aggiornata: 'Expense updated',
    modificaNome: (descrizione: string) => `Edit the expense ${descrizione}`,
    modificaTitolo: 'Edit the expense',
    modificaDescrizione: 'The personal expenses total is recalculated straight away.',
    salva: 'Save the expense',
    connessione: 'No connection. Try again.',
    categorie: {
      casa: 'Home and bills',
      spesa: 'Groceries',
      cibo_fuori: 'Eating out',
      trasporti: 'Transport',
      salute: 'Health',
      cura_persona: 'Personal care',
      abbonamenti: 'Subscriptions',
      altro: 'Other',
    },
  },
)

const ERRORI_EN: Record<string, string> = {
  [ERRORI_SPESA_PERSONALE.data]: 'Invalid date',
  [ERRORI_SPESA_PERSONALE.futuro]: 'An expense cannot be in the future',
  [ERRORI_SPESA_PERSONALE.categoria]: 'Choose the category',
  [ERRORI_SPESA_PERSONALE.descrizione]: 'Write what it refers to',
  [ERRORI_SPESA_PERSONALE.importo]: 'Write the amount, for example 45',
  [ERRORI_SPESA_PERSONALE.positivo]: 'The amount must be positive',
  [ERRORI_SPESA_PERSONALE.troppo]: 'Amount too high: check the zeros',
  [ERRORI_SPESA_PERSONALE.nonValida]: 'Invalid expense.',
  [ERRORI_SPESA_PERSONALE.nonTrovata]: 'Expense not found.',
  [ERRORI_SPESA_PERSONALE.nonSalvata]: 'Expense not saved. Try again.',
  [ERRORI_SPESA_PERSONALE.nonAggiornata]: 'Expense not updated. Try again.',
  [ERRORI_SPESA_PERSONALE.nonEliminata]: 'Expense not deleted. Try again.',
  [ERRORI_SPESA_PERSONALE.soloAdmin]: 'Only the admin manages the personal expenses.',
  // the database's own words (20261106090000), with the straight apostrophe of SQL
  "Le spese personali le vede solo l'admin": 'Only the admin sees the personal expenses',
  "Le spese personali le gestisce solo l'admin": 'Only the admin manages the personal expenses',
}

/** The fixed messages of personal expenses in the page's language; anything else as Costi does. */
export function traduciErroreSpese(testo: string | null | undefined, lingua: Lingua): string | undefined {
  if (!testo) return testo ?? undefined
  if (lingua === 'it') return testo
  return ERRORI_EN[testo] ?? traduciErrore(testo, lingua)
}
