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

/** The board of I miei task (1.75.0): columns, cards, adding a task, moving it. */
export const BACHECA_TASK = bilingue(
  {
    vista: 'Vista dei task',
    viste: { bacheca: 'Bacheca', elenco: 'Elenco' },
    descrizione:
      'I tuoi task per scadenza, con la priorità a colori: in alto in ogni colonna quelli importanti. Aggiungi un task dalla sua colonna, trascina una carta per cambiarne la scadenza.',
    suggerimento:
      'Trascina una carta su un’altra colonna per cambiarne la scadenza, oppure usa i tre puntini della carta.',
    priorita: { alta: 'Alta', media: 'Media', bassa: 'Bassa' },
    prioritaDi: (p: string) => `Priorità ${p}`,
    aggiungi: 'Aggiungi un task',
    aggiungiIn: (colonna: string) => `Aggiungi un task in ${colonna}`,
    vuota: 'Niente qui',
    rilascia: 'Rilascia qui',
    altreAzioni: (titolo: string) => `Altre azioni su ${titolo}`,
    voceApri: 'Apri il task',
    vocePriorita: 'Priorità',
    voceSposta: 'Sposta in',
    voceData: 'Scegli una data…',
    foglio: {
      titolo: 'Nuovo task',
      descrizione: 'È assegnato a te. Il resto (descrizione, persone, sotto-task) lo aggiungi aprendo il task.',
      campoTitolo: 'Titolo',
      segnaposto: 'Cosa devi fare?',
      campoProgetto: 'Progetto',
      scegliProgetto: 'Scegli il progetto',
      campoScadenza: 'Scadenza',
      senzaScadenza: 'Lascia vuoto per nessuna scadenza.',
      campoPriorita: 'Priorità',
      salva: 'Aggiungi il task',
      salvo: 'Aggiungo…',
      nessunProgetto: 'Per aggiungere un task devi far parte di almeno un progetto attivo.',
    },
    data: {
      titolo: 'Scadenza',
      descrizione: (titolo: string) => `La scadenza di «${titolo}».`,
      salva: 'Salva la scadenza',
      togli: 'Togli la scadenza',
    },
    aggiunto: 'Task aggiunto',
    spostato: (colonna: string) => `Spostato in ${colonna}`,
    scadenzaTolta: 'Scadenza tolta',
    scadenzaIl: (data: string) => `Scadenza ${data}`,
    prioritaCambiata: (p: string) => `Priorità: ${p}`,
    annunci: {
      spostato: (titolo: string, colonna: string) => `${titolo}: spostato in ${colonna}.`,
      aggiunto: (titolo: string, colonna: string) => `${titolo}: aggiunto in ${colonna}.`,
    },
    conteggio: (n: number) => (n === 1 ? '1 task' : `${n} task`),
  },
  {
    vista: 'Task view',
    viste: { bacheca: 'Board', elenco: 'List' },
    descrizione:
      'Your tasks by due date, with the priority in colour: the important ones at the top of each column. Add a task from its column, drag a card to change its due date.',
    suggerimento: 'Drag a card onto another column to change its due date, or use the card’s three dots.',
    priorita: { alta: 'High', media: 'Medium', bassa: 'Low' },
    prioritaDi: (p: string) => `${p} priority`,
    aggiungi: 'Add a task',
    aggiungiIn: (colonna: string) => `Add a task in ${colonna}`,
    vuota: 'Nothing here',
    rilascia: 'Drop here',
    altreAzioni: (titolo: string) => `More actions on ${titolo}`,
    voceApri: 'Open the task',
    vocePriorita: 'Priority',
    voceSposta: 'Move to',
    voceData: 'Pick a date…',
    foglio: {
      titolo: 'New task',
      descrizione: 'It is assigned to you. The rest (description, people, sub-tasks) you add by opening the task.',
      campoTitolo: 'Title',
      segnaposto: 'What do you have to do?',
      campoProgetto: 'Project',
      scegliProgetto: 'Pick the project',
      campoScadenza: 'Due date',
      senzaScadenza: 'Leave it empty for no due date.',
      campoPriorita: 'Priority',
      salva: 'Add the task',
      salvo: 'Adding…',
      nessunProgetto: 'To add a task you have to be in at least one active project.',
    },
    data: {
      titolo: 'Due date',
      descrizione: (titolo: string) => `The due date of «${titolo}».`,
      salva: 'Save the due date',
      togli: 'Remove the due date',
    },
    aggiunto: 'Task added',
    spostato: (colonna: string) => `Moved to ${colonna}`,
    scadenzaTolta: 'Due date removed',
    scadenzaIl: (data: string) => `Due ${data}`,
    prioritaCambiata: (p: string) => `Priority: ${p}`,
    annunci: {
      spostato: (titolo: string, colonna: string) => `${titolo}: moved to ${colonna}.`,
      aggiunto: (titolo: string, colonna: string) => `${titolo}: added in ${colonna}.`,
    },
    conteggio: (n: number) => (n === 1 ? '1 task' : `${n} tasks`),
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
  'Task non aggiunto. Riprova.': 'Task not added. Try again.',
  'Non fai parte di questo progetto.': 'You are not in this project.',
  'Scegli il progetto': 'Pick the project',
  'Scrivi il titolo del task': 'Write the task’s title',
  'La scadenza viene dopo l’inizio del task: cambia l’inizio nel task.': 'The due date comes after the task’s start: change the start in the task.',
}

/** An answer of the task actions in the page's language; an unknown one stays as it came. */
export function traduciErroreTask(testo: string, lingua: Lingua): string {
  return lingua === 'it' ? testo : (ERRORI_EN[testo] ?? testo)
}
