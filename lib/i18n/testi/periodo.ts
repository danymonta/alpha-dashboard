import { bilingue, type Lingua } from '@/lib/i18n/lingua'

/** The period and month selectors of every page with numbers (1.53.0). */
export const PERIODO = bilingue(
  {
    scegliPeriodo: 'Scegli il periodo',
    scegliMese: 'Scegli il mese',
    mesePrecedente: 'Mese precedente',
    meseSuccessivo: 'Mese successivo',
    periodoPrecedente: 'Periodo precedente',
    periodoSuccessivo: 'Periodo successivo',
    periodo: (etichetta: string) => `Periodo: ${etichetta}`,
    titolo: 'Periodo',
    descrizioneConfronto:
      'Scegli un periodo pronto o due date. I numeri si confrontano con il periodo precedente di pari durata.',
    descrizione: 'Scegli un periodo pronto o due date.',
    inUso: 'In uso',
    confronto: 'Confronto',
    rapide: 'Scelte rapide',
    personalizzato: 'Personalizzato',
    da: 'Da',
    a: 'A',
    mostra: 'Mostra il periodo',
    notaConfronto:
      'Mesi interi si confrontano con gli stessi mesi prima (luglio–settembre con aprile–giugno); le altre date con lo stesso numero di giorni subito prima. Massimo 3 anni.',
    nota: 'Un periodo copre al massimo 3 anni.',
  },
  {
    scegliPeriodo: 'Choose the period',
    scegliMese: 'Choose the month',
    mesePrecedente: 'Previous month',
    meseSuccessivo: 'Next month',
    periodoPrecedente: 'Previous period',
    periodoSuccessivo: 'Next period',
    periodo: (etichetta: string) => `Period: ${etichetta}`,
    titolo: 'Period',
    descrizioneConfronto:
      'Choose a ready period or two dates. The numbers are compared with the previous period of the same length.',
    descrizione: 'Choose a ready period or two dates.',
    inUso: 'In use',
    confronto: 'Compared with',
    rapide: 'Quick choices',
    personalizzato: 'Custom',
    da: 'From',
    a: 'To',
    mostra: 'Show the period',
    notaConfronto:
      'Whole months are compared with the same months before (July–September with April–June); other dates with the same number of days right before. 3 years at most.',
    nota: 'A period covers 3 years at most.',
  },
)

const ERRORI_EN: Record<string, string> = {
  'Inserisci due date valide.': 'Enter two valid dates.',
  'La data di inizio non può venire dopo la fine.': 'The start date cannot come after the end.',
  'La fine può essere al massimo tra un anno.': 'The end can be one year away at most.',
  'Il periodo può durare al massimo 3 anni.': 'The period can last 3 years at most.',
  'Inserisci una data valida.': 'Enter a valid date.',
}

/** The checks of the range (lib/periodo.ts) in the page's language. */
export function traduciErrorePeriodo(testo: string | undefined, lingua: Lingua): string | undefined {
  if (!testo || lingua === 'it') return testo
  return ERRORI_EN[testo] ?? testo
}
