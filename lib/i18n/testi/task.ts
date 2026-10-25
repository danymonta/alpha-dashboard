import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { GRUPPI, PAROLE_COMPLETATO, type ChiaveGruppo } from '@/lib/miei-task'
import { ETICHETTA_STATO_TASK, elencoNomi } from '@/lib/progetti'

const GRUPPI_IT = Object.fromEntries(GRUPPI.map((g) => [g.chiave, g.titolo])) as Record<ChiaveGruppo, string>

/** «Anna and Marco», «Anna, Marco and Luca»: written out, so server and browser print the same letters. */
export function elencoInglese(nomi: readonly string[]): string {
  if (nomi.length <= 1) return nomi.join('')
  return `${nomi.slice(0, -1).join(', ')} and ${nomi[nomi.length - 1]}`
}

/** A list of names in the page's language: «Marco, Sara e Dany» or «Marco, Sara and Dany». */
export function elencoNomiIn(nomi: readonly string[], lingua: Lingua): string {
  return lingua === 'en' ? elencoInglese(nomi) : elencoNomi(nomi)
}

/** The task states in English, beside ETICHETTA_STATO_TASK (lib/progetti.ts). */
export const ETICHETTA_STATO_TASK_EN: Record<keyof typeof ETICHETTA_STATO_TASK, string> = {
  da_fare: 'To do',
  in_corso: 'In progress',
  in_revisione: 'In review',
  completato: 'Completed',
}

/**
 * I miei task (/task, 1.53.0): the groups by due date, a row, «Completati», the toasts and
 * what a screen reader hears. Task titles and project names are the team's and stay as written.
 */
export const MIEI_TASK = bilingue(
  {
    titolo: 'I miei task',
    descrizione:
      'Quello che ti è stato assegnato in tutti i progetti. Tocca il titolo per aprirlo nel suo progetto, spunta quando è fatto, tocca la sveglia per contare il tempo; sotto, quelli che hai chiuso.',
    errore: 'Impossibile caricare i tuoi task',
    caricamento: 'Caricamento dei tuoi task',
    progetto: 'Progetto',
    gruppi: GRUPPI_IT,
    statiTask: ETICHETTA_STATO_TASK,
    completatoAdesso: 'Completato adesso',
    con: (nomi: readonly string[]) => `con ${elencoNomi(nomi)}`,
    inRitardo: (data: string) => `In ritardo, scadenza ${data}`,
    scadenza: (data: string) => `Scadenza ${data}`,
    completa: (titolo: string) => `Completa ${titolo}`,
    riapriTask: (titolo: string) => `Riapri ${titolo}`,
    riapri: 'Riapri',
    completato: PAROLE_COMPLETATO,
    annunci: {
      completato: (titolo: string) => `${titolo}: completato. Resta qui spuntato, poi lo trovi in Completati.`,
      nonCompletato: (titolo: string) => `${titolo}: non completato.`,
      nonRiaperto: (titolo: string) => `${titolo}: non riaperto.`,
      riaperto: (titolo: string) => `${titolo}: riaperto.`,
      riapertoIn: (titolo: string, gruppo: string) => `${titolo}: riaperto, torna in ${gruppo}.`,
    },
    fatto: 'Fatto',
    annulla: 'Annulla',
    taskRiaperto: 'Task riaperto',
    connessione: 'Connessione assente. Riprova.',
    vuoto: 'Nessun task assegnato a te',
    vuotoDescrizione: 'Quando qualcuno ti assegna un task in un progetto, lo trovi qui con la sua scadenza.',
    vaiProgetti: 'Vai ai progetti',
    nienteDaFare: 'Niente da fare',
    nienteDaFareDescrizione: 'Hai chiuso tutti i task assegnati a te: li trovi qui sotto, in Completati.',
    completati: 'Completati',
    nessunCompletato: 'Nessun task completato. Quando ne spunti uno, lo ritrovi qui con il giorno in cui l’hai chiuso.',
    appenaSpuntato: 'Quello che hai appena spuntato resta qui sopra: lo ritrovi qui quando torni sulla pagina.',
    mostraTutti: 'Mostra tutti',
    recenti: { prima: 'Si vedono i ', dopo: ' più recenti.' },
    soloRecenti: 'Mostra solo i più recenti',
  },
  {
    titolo: 'My tasks',
    descrizione:
      'What has been assigned to you in every project. Tap the title to open it in its project, tick it when it is done, tap the alarm clock to count the time; below, the ones you closed.',
    errore: 'Your tasks could not be loaded',
    caricamento: 'Loading your tasks',
    progetto: 'Project',
    gruppi: {
      ritardo: 'Overdue',
      oggi: 'Today',
      settimana: 'Next 7 days',
      dopo: 'Later',
      senza: 'No due date',
    },
    statiTask: { da_fare: 'To do', in_corso: 'In progress', in_revisione: 'In review', completato: 'Completed' },
    completatoAdesso: 'Completed just now',
    con: (nomi: readonly string[]) => `with ${elencoInglese(nomi)}`,
    inRitardo: (data: string) => `Overdue, due ${data}`,
    scadenza: (data: string) => `Due ${data}`,
    completa: (titolo: string) => `Complete ${titolo}`,
    riapriTask: (titolo: string) => `Reopen ${titolo}`,
    riapri: 'Reopen',
    completato: {
      completato: 'Completed',
      oggi: (ora: string) => `Completed today at ${ora}`,
      ieri: (ora: string) => `Completed yesterday at ${ora}`,
      il: (data: string) => `Completed on ${data}`,
    },
    annunci: {
      completato: (titolo: string) => `${titolo}: completed. It stays here ticked, then you find it in Completed.`,
      nonCompletato: (titolo: string) => `${titolo}: not completed.`,
      nonRiaperto: (titolo: string) => `${titolo}: not reopened.`,
      riaperto: (titolo: string) => `${titolo}: reopened.`,
      riapertoIn: (titolo: string, gruppo: string) => `${titolo}: reopened, back in ${gruppo}.`,
    },
    fatto: 'Done',
    annulla: 'Undo',
    taskRiaperto: 'Task reopened',
    connessione: 'No connection. Try again.',
    vuoto: 'No tasks assigned to you',
    vuotoDescrizione: 'When someone assigns you a task in a project, you find it here with its due date.',
    vaiProgetti: 'Go to the projects',
    nienteDaFare: 'Nothing to do',
    nienteDaFareDescrizione: 'You closed every task assigned to you: you find them below, in Completed.',
    completati: 'Completed',
    nessunCompletato: 'No completed tasks. When you tick one, you find it here with the day you closed it.',
    appenaSpuntato: 'What you just ticked stays up here: you find it here when you come back to the page.',
    mostraTutti: 'Show all',
    recenti: { prima: 'Showing the ', dopo: ' most recent.' },
    soloRecenti: 'Show only the most recent',
  },
)

/** What the task actions answer (lib/progetti/operazioni.ts), in English: the database's own words stay Italian. */
const ERRORI_EN: Record<string, string> = {
  'Connessione assente. Riprova.': 'No connection. Try again.',
  'Dati non validi.': 'Invalid data.',
  'Sessione scaduta. Rientra e riprova.': 'Session expired. Sign in again and retry.',
  'Task non aggiornato. Riprova.': 'Task not updated. Try again.',
  // TASK_NON_TUO of lib/progetti/operazioni.ts (server-only: written out here)
  'Puoi modificare solo i task assegnati a te o creati da te.': 'You can only change the tasks assigned to you or created by you.',
}

/** An answer of the task actions in the page's language; an unknown one stays as it came. */
export function traduciErroreTask(testo: string, lingua: Lingua): string {
  return lingua === 'it' ? testo : (ERRORI_EN[testo] ?? testo)
}
