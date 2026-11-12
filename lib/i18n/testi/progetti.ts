import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { traduciErroreTempo } from '@/lib/i18n/testi/tempo'
import {
  ETICHETTA_STATO_PROGETTO,
  ETICHETTA_STATO_TASK,
  FILTRI_STATO_PROGETTO,
  type FiltroStatoProgetto,
} from '@/lib/progetti'

const STATO_IT: Record<FiltroStatoProgetto, string> = {
  attivi: ' attivo',
  in_pausa: ' in pausa',
  completati: ' completato',
  archiviati: ' archiviato',
  tutti: '',
}
const STATO_EN: Record<FiltroStatoProgetto, string> = {
  attivi: ' active',
  in_pausa: ' paused',
  completati: ' completed',
  archiviati: ' archived',
  tutti: '',
}

/**
 * Progetti (1.53.0): the list, a project's header, tabs and overview. Departments, projects,
 * lists and tasks are named by the team and stay as written. The sheets that write stay
 * Italian for now.
 */
export const PROGETTI = bilingue(
  {
    titolo: 'Progetti',
    errore: 'Impossibile caricare i progetti',
    caricamento: 'Caricamento dei progetti',
    descrizione: {
      admin: 'Tutti i progetti, divisi per reparto.',
      manager: 'I progetti di cui fai parte. Puoi aprirne di nuovi.',
      employee: 'I progetti di cui fai parte.',
    },
    repartiModelli: 'Reparti e modelli',
    filtra: 'Filtra i progetti',
    stato: 'Stato',
    filtriStato: FILTRI_STATO_PROGETTO,
    reparto: 'Reparto',
    tuttiReparti: 'Tutti i reparti',
    disattivato: 'disattivato',
    repartoDisattivato: (nome: string) => `${nome} (disattivato)`,
    soloMiei: 'Solo i miei',
    vista: 'Vista dei progetti',
    viste: { elenco: 'Elenco', timeline: 'Timeline' },
    // "Nessun progetto attivo", "Nessun progetto in pausa"
    nessuno: (filtro: FiltroStatoProgetto) => `Nessun progetto${STATO_IT[filtro]}`,
    nessunoPunto: (filtro: FiltroStatoProgetto) => `Nessun progetto${STATO_IT[filtro]}.`,
    cambiaFiltriOApri: 'Cambia i filtri per vedere gli altri progetti, o aprine uno nuovo.',
    apriPrimo: 'Apri il primo progetto con «Nuovo progetto»: il reparto lo scegli nel foglio.',
    mostraTutti: 'Mostra tutti i progetti',
    nonFaiParte: 'Non fai ancora parte di un progetto',
    quandoAggiunto: 'Quando qualcuno ti aggiunge a un progetto, lo trovi qui con i tuoi task.',
    cambiaFiltri: 'Cambia i filtri per vedere gli altri progetti.',
    // the card and the shared badges
    statoProgetto: ETICHETTA_STATO_PROGETTO,
    cliente: (nome: string) => `Cliente: ${nome}`,
    percorsoFinito: (data: string) => `Percorso finito il ${data}`,
    dovevaFinire: (data: string) => `Doveva finire il ${data}`,
    fine: (data: string) => `Fine ${data}`,
    senzaFine: 'Senza data di fine',
    taskInRitardo: (n: number) => (n === 1 ? '1 task in ritardo' : `${n} task in ritardo`),
    nessunTask: 'Nessun task',
    taskDi: (fatti: number, totali: number, percento: number) => `${fatti} di ${totali} task · ${percento}%`,
    inRitardoN: (n: number) => `${n} in ritardo`,
    inRitardo: 'In ritardo',
    senzaCoach: 'Senza coach',
    membri: 'Membri',
    coach: 'Coach:',
    // a project
    progetto: 'Progetto',
    nonTrovato: 'Progetto non trovato',
    nonTrovatoDescrizione: 'Il progetto non esiste o non fai parte del suo team.',
    torna: 'Torna ai progetti',
    inCorso: 'in corso',
    responsabile: (nome: string) => `Responsabile: ${nome}`,
    schedaCliente: 'Scheda del cliente',
    schede: { aria: 'Sezioni del progetto', panoramica: 'Panoramica', attivita: 'Attività', gantt: 'Gantt', tempo: 'Tempo', note: 'Note', membri: 'Membri' },
    // the error of a tab
    errori: {
      panoramica: 'Non siamo riusciti a caricare la panoramica del progetto. Riprova fra un momento.',
      gantt: 'Non siamo riusciti a caricare il Gantt del progetto. Riprova fra un momento.',
      note: 'Non siamo riusciti a caricare le note del progetto. Riprova fra un momento.',
      tempo: 'Non siamo riusciti a caricare il tempo del progetto. Riprova fra un momento.',
      tempoTeam: 'Non siamo riusciti a caricare il tempo del team. Riprova fra un momento.',
      task: 'Non siamo riusciti a caricare i tuoi task. Riprova fra un momento.',
    },
    caricamentoTimeline: 'Caricamento della timeline',
    membri_: {
      errore: 'Impossibile caricare i membri',
      errorePersone: 'Impossibile caricare le persone',
      titolo: (n: number) => `Membri (${n})`,
      vuoto: 'Nessun membro',
      vuotoGestisce: 'Aggiungi le persone che lavorano al progetto: vedranno le liste e i loro task.',
      vuotoAltri: 'Chi gestisce il progetto aggiunge le persone.',
      seiTu: 'sei tu',
      responsabile: 'Responsabile',
      progetti: (ruolo: string, livello: string) => `${ruolo} · Progetti: ${livello}`,
      disattivato: ' · account disattivato',
      livelli: 'Manager: gestisce liste, task e persone del progetto. Employee: aggiunge task e lavora quelli assegnati a lui.',
    },
    note: {
      errore: 'Impossibile caricare le note',
      vuoto: 'Ancora nessuna nota',
      vuotoDescrizione:
        'Scrivi qui sopra cosa è successo oggi: una decisione, un feedback, una cosa da ricordare. Il team la ritrova sotto la sua data.',
      tu: 'Tu',
      collaboratore: 'Collaboratore',
      modificata: ' · modificata',
      limite: (n: number) => `Sono mostrate le ${n} note più recenti.`,
    },
    // the overview
    panoramica: {
      errore: 'Impossibile caricare la panoramica del progetto',
      vuoto: 'Nessun task ancora',
      vuotoDescrizione: 'Quando il progetto ha liste e task, qui trovi avanzamento, scadenze e tempo speso.',
      vaiAttivita: 'Vai alle attività',
      statiTask: { ...ETICHETTA_STATO_TASK, completato: 'Fatti' },
      avanzamento: 'Avanzamento',
      taskDi: (fatti: number | null, totali: number | null) => `${fatti} di ${totali} task`,
      inRitardo: 'In ritardo',
      oltreScadenza: 'task oltre la scadenza',
      nessunoOltre: 'nessun task oltre la scadenza',
      tempoSpeso: 'Tempo speso',
      ultimi7: (durata: string) => `${durata} negli ultimi 7 giorni`,
      fine: 'Fine',
      senzaFine: 'senza data di fine',
      finitoDa: (n: number) => `finito da ${n} ${n === 1 ? 'giorno' : 'giorni'}`,
      oggi: 'oggi',
      tra: (n: number) => `tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`,
      perStato: 'Task per stato',
      senzaAssegnatario: (n: number) =>
        n === 1 ? '1 task aperto senza assegnatario' : `${n} task aperti senza assegnatario`,
      tappe: 'Tappe',
      nessunaLista: 'Nessuna lista: i task sono tutti insieme.',
      prossime: 'Prossime scadenze · 14 giorni',
      nienteInScadenza: 'Niente in scadenza nelle prossime due settimane.',
      nessunRitardo: 'Nessun task in ritardo.',
      assegnato: 'Assegnato',
      senzaAssegnato: 'Senza assegnatario',
      tutte: 'Tutte le attività del progetto',
    },
  },
  {
    titolo: 'Projects',
    errore: 'The projects could not be loaded',
    caricamento: 'Loading the projects',
    descrizione: {
      admin: 'Every project, by department.',
      manager: 'The projects you are part of. You can open new ones.',
      employee: 'The projects you are part of.',
    },
    repartiModelli: 'Departments and templates',
    filtra: 'Filter the projects',
    stato: 'Status',
    filtriStato: { attivi: 'Active', in_pausa: 'Paused', completati: 'Completed', archiviati: 'Archived', tutti: 'All' },
    reparto: 'Department',
    tuttiReparti: 'All departments',
    disattivato: 'disabled',
    repartoDisattivato: (nome: string) => `${nome} (disabled)`,
    soloMiei: 'Only mine',
    vista: 'Projects view',
    viste: { elenco: 'List', timeline: 'Timeline' },
    nessuno: (filtro: FiltroStatoProgetto) => `No${STATO_EN[filtro]} projects`,
    nessunoPunto: (filtro: FiltroStatoProgetto) => `No${STATO_EN[filtro]} projects.`,
    cambiaFiltriOApri: 'Change the filters to see the other projects, or open a new one.',
    apriPrimo: 'Open the first project with «New project»: the department is chosen in the sheet.',
    mostraTutti: 'Show every project',
    nonFaiParte: 'You are not part of a project yet',
    quandoAggiunto: 'When someone adds you to a project, you find it here with your tasks.',
    cambiaFiltri: 'Change the filters to see the other projects.',
    statoProgetto: { attivo: 'Active', in_pausa: 'Paused', completato: 'Completed', archiviato: 'Archived' },
    cliente: (nome: string) => `Client: ${nome}`,
    percorsoFinito: (data: string) => `Programme ended on ${data}`,
    dovevaFinire: (data: string) => `Was due to end on ${data}`,
    fine: (data: string) => `Ends ${data}`,
    senzaFine: 'No end date',
    taskInRitardo: (n: number) => (n === 1 ? '1 task overdue' : `${n} tasks overdue`),
    nessunTask: 'No tasks',
    taskDi: (fatti: number, totali: number, percento: number) => `${fatti} of ${totali} tasks · ${percento}%`,
    inRitardoN: (n: number) => `${n} overdue`,
    inRitardo: 'Overdue',
    senzaCoach: 'No coach',
    membri: 'Members',
    coach: 'Coach:',
    progetto: 'Project',
    nonTrovato: 'Project not found',
    nonTrovatoDescrizione: 'The project does not exist or you are not part of its team.',
    torna: 'Back to projects',
    inCorso: 'ongoing',
    responsabile: (nome: string) => `Owner: ${nome}`,
    schedaCliente: 'Client card',
    schede: { aria: 'Project sections', panoramica: 'Overview', attivita: 'Tasks', gantt: 'Gantt', tempo: 'Time', note: 'Notes', membri: 'Members' },
    errori: {
      panoramica: 'We could not load the project overview. Try again in a moment.',
      gantt: 'We could not load the project’s Gantt. Try again in a moment.',
      note: 'We could not load the project’s notes. Try again in a moment.',
      tempo: 'We could not load the project’s time. Try again in a moment.',
      tempoTeam: 'We could not load the team’s time. Try again in a moment.',
      task: 'We could not load your tasks. Try again in a moment.',
    },
    caricamentoTimeline: 'Loading the timeline',
    membri_: {
      errore: 'The members could not be loaded',
      errorePersone: 'The people could not be loaded',
      titolo: (n: number) => `Members (${n})`,
      vuoto: 'No members',
      vuotoGestisce: 'Add the people who work on the project: they will see the lists and their tasks.',
      vuotoAltri: 'Whoever manages the project adds the people.',
      seiTu: 'you',
      responsabile: 'Owner',
      progetti: (ruolo: string, livello: string) => `${ruolo} · Projects: ${livello}`,
      disattivato: ' · account disabled',
      livelli: 'Manager: manages the project’s lists, tasks and people. Employee: adds tasks and works those assigned to them.',
    },
    note: {
      errore: 'The notes could not be loaded',
      vuoto: 'No notes yet',
      vuotoDescrizione:
        'Write above what happened today: a decision, feedback, something to remember. The team finds it under its date.',
      tu: 'You',
      collaboratore: 'Team member',
      modificata: ' · edited',
      limite: (n: number) => `The ${n} most recent notes are shown.`,
    },
    panoramica: {
      errore: 'The project overview could not be loaded',
      vuoto: 'No tasks yet',
      vuotoDescrizione: 'When the project has lists and tasks, here you find progress, deadlines and time spent.',
      vaiAttivita: 'Go to the tasks',
      statiTask: { da_fare: 'To do', in_corso: 'In progress', in_revisione: 'In review', completato: 'Done' },
      avanzamento: 'Progress',
      taskDi: (fatti: number | null, totali: number | null) => `${fatti} of ${totali} tasks`,
      inRitardo: 'Overdue',
      oltreScadenza: 'tasks past their deadline',
      nessunoOltre: 'no task past its deadline',
      tempoSpeso: 'Time spent',
      ultimi7: (durata: string) => `${durata} in the last 7 days`,
      fine: 'End',
      senzaFine: 'no end date',
      finitoDa: (n: number) => `ended ${n} ${n === 1 ? 'day' : 'days'} ago`,
      oggi: 'today',
      tra: (n: number) => `in ${n} ${n === 1 ? 'day' : 'days'}`,
      perStato: 'Tasks by status',
      senzaAssegnatario: (n: number) => (n === 1 ? '1 open task without an assignee' : `${n} open tasks without an assignee`),
      tappe: 'Milestones',
      nessunaLista: 'No lists: the tasks are all together.',
      prossime: 'Next deadlines · 14 days',
      nienteInScadenza: 'Nothing due in the next two weeks.',
      nessunRitardo: 'No overdue tasks.',
      assegnato: 'Assigned',
      senzaAssegnato: 'No assignee',
      tutte: 'All the project’s tasks',
    },
  },
)

/**
 * The checks of the project schemas (lib/validation/progetti.ts, note.ts) and the answers of the
 * project actions (lib/progetti/operazioni.ts, app/(app)/settings/progetti/actions.ts), in English,
 * as traduciErroreTempo does for the time: the schemas and the actions stay as they are (Claude and
 * Alfire read them in Italian). The database's own words stay Italian.
 */
const ERRORI_PROGETTI_EN: Record<string, string> = {
  'Connessione assente. Riprova.': 'No connection. Try again.',
  'Dati non validi.': 'Invalid data.',
  'Sessione scaduta. Rientra e riprova.': 'Session expired. Sign in again and retry.',
  'Operazione non riuscita. Riprova.': 'It did not work. Try again.',
  'Operazione riservata a chi gestisce i progetti.': 'Only whoever manages the projects can do this.',
  'Operazione riservata all’admin dei progetti.': 'Only the projects admin can do this.',
  'Solo chi gestisce il progetto può farlo.': 'Only whoever manages the project can do this.',
  'Non fai parte di questo progetto.': 'You are not part of this project.',
  'C’è già.': 'It is already there.',
  'Data non valida': 'Invalid date',
  'Scegli il giorno': 'Choose the day',
  'Scegli il reparto': 'Choose the department',
  'Scegli la persona': 'Choose the person',
  'Scegli lo stato': 'Choose the status',
  'Scegli la priorità': 'Choose the priority',
  'Scrivi il nome del progetto': 'Write the project’s name',
  'Scrivi il nome della lista': 'Write the list’s name',
  'Scrivi il titolo del task': 'Write the task’s title',
  'Scrivi il titolo': 'Write the title',
  'Scrivi il nome del reparto': 'Write the department’s name',
  'Scrivi il nome del modello': 'Write the template’s name',
  'Scrivi la nota': 'Write the note',
  'Scrivi un numero': 'Write a number',
  'Solo numeri interi': 'Whole numbers only',
  'Solo giorni interi': 'Whole days only',
  'Da 0 in su': 'From 0 up',
  'Da 0 in su: 0 è il giorno di inizio del progetto': 'From 0 up: 0 is the project’s start day',
  'Almeno un giorno': 'At least one day',
  'Al massimo 3650 giorni': '3650 days at most',
  'Al massimo 50 persone': '50 people at most',
  'La fine viene dopo l’inizio': 'The end comes after the start',
  'La scadenza viene dopo l’inizio': 'The due date comes after the start',
  'Scrivi la stima come 45 min, 2 h o 1 h 30 min': 'Write the estimate as 45 min, 2 h or 1 h 30 min',
  'Scrivi sia da che giorno sia quanti giorni, o togli le date': 'Write both from which day and how many days, or remove the dates',
  'Un task non è sotto-task di sé stesso': 'A task is not a sub-task of itself',
  'Progetto non valido': 'Invalid project',
  'Progetto non valido.': 'Invalid project.',
  'Task non valido': 'Invalid task',
  'Task non valido.': 'Invalid task.',
  'Lista non valida.': 'Invalid list.',
  'Nota non valida': 'Invalid note',
  'Reparto non valido.': 'Invalid department.',
  'Modello non valido.': 'Invalid template.',
  'Attività non valida.': 'Invalid task.',
  'Progetto non creato. Riprova.': 'Project not created. Try again.',
  'Progetto non salvato. Riprova.': 'Project not saved. Try again.',
  'Progetto non eliminato. Riprova.': 'Project not deleted. Try again.',
  'Task non aggiunto. Riprova.': 'Task not added. Try again.',
  'Task non salvato. Riprova.': 'Task not saved. Try again.',
  'Task non aggiornato. Riprova.': 'Task not updated. Try again.',
  'Task non eliminato. Riprova.': 'Task not deleted. Try again.',
  'Task non trovato: forse è stato eliminato.': 'Task not found: perhaps it was deleted.',
  'Persone assegnate non salvate. Riprova.': 'Assignees not saved. Try again.',
  'Puoi modificare solo i task assegnati a te o creati da te.': 'You can only edit the tasks assigned to you or created by you.',
  'Puoi eliminare solo i task creati da te.': 'You can only delete the tasks you created.',
  'Lista non creata. Riprova.': 'List not created. Try again.',
  'Lista non salvata. Riprova.': 'List not saved. Try again.',
  'Lista non eliminata. Riprova.': 'List not deleted. Try again.',
  'Lista non trovata.': 'List not found.',
  'Ordine non salvato. Riprova.': 'Order not saved. Try again.',
  'Fa già parte del progetto.': 'Already part of the project.',
  'Persona non aggiunta. Riprova.': 'Person not added. Try again.',
  'Persona non tolta. Riprova.': 'Person not removed. Try again.',
  'Coach non salvato. Riprova.': 'Coach not saved. Try again.',
  'Questo cliente ha già il suo progetto: lo apri dalla scheda del cliente.':
    'This client already has a project: open it from the client card.',
  'Solo l’admin dei progetti elimina un progetto.': 'Only the projects admin deletes a project.',
  'Nota non salvata. Riprova.': 'Note not saved. Try again.',
  'Nota non aggiornata. Riprova.': 'Note not updated. Try again.',
  'Nota non eliminata. Riprova.': 'Note not deleted. Try again.',
  'Puoi modificare solo le tue note.': 'You can only edit your own notes.',
  'Puoi eliminare solo le tue note.': 'You can only delete your own notes.',
  'Solo chi fa parte del progetto scrive le note.': 'Only the project’s members write notes.',
  'Esiste già un reparto con questo nome.': 'A department with this name already exists.',
  'Il reparto ha ancora dei progetti: spostali in un altro reparto o eliminali prima.':
    'The department still has projects: move them to another department or delete them first.',
  'Reparto non creato. Riprova.': 'Department not created. Try again.',
  'Reparto non salvato. Riprova.': 'Department not saved. Try again.',
  'Reparto non eliminato. Riprova.': 'Department not deleted. Try again.',
  'Modello non creato. Riprova.': 'Template not created. Try again.',
  'Modello non salvato. Riprova.': 'Template not saved. Try again.',
  'Modello non eliminato. Riprova.': 'Template not deleted. Try again.',
  'Attività non salvata. Riprova.': 'Task not saved. Try again.',
  'Attività non eliminata. Riprova.': 'Task not deleted. Try again.',
  // the template of the onboarding (1.77.0): renamed, never deleted
  'Il modello dell’onboarding non si elimina: il wizard «Nuovo cliente» apre la sua lista nel progetto di ogni cliente.':
    'The onboarding template cannot be deleted: the «New client» wizard opens its list in every client’s project.',
  'Le attività dell’onboarding non si eliminano: il percorso le riconosce dalla loro chiave. Puoi cambiarne il titolo.':
    'The onboarding tasks cannot be deleted: the path recognises them by their key. You can change their title.',
  'Il modello dell’onboarding è chiuso: non si aggiungono attività, non si spegne e non è quello dei nuovi clienti. Puoi cambiare il titolo delle sue attività.':
    'The onboarding template is closed: no tasks are added, it is not switched off and it is not the one for new clients. You can change the title of its tasks.',
  'Il modello «Onboarding cliente» si apre da solo con l’onboarding di un cliente.':
    'The «Onboarding cliente» template opens by itself with the onboarding of a client.',
}

const SENZA_PERSONE = ' Il task è stato creato senza persone assegnate: assegnale modificandolo.'
const AL_MASSIMO = /^Al massimo (\d+) caratteri$/
const USCITO = /^(.+) non fa più parte del progetto: non è tra le persone assegnate\.$/
const USCITI = /^(.+) non fanno più parte del progetto: non sono tra le persone assegnate\.$/

/** A message of the project schemas or actions in the page's language; an unknown one stays as it came. */
export function traduciErroreProgetti(testo: string | null | undefined, lingua: Lingua): string | undefined {
  if (!testo) return undefined
  if (lingua === 'it') return testo
  const noto = ERRORI_PROGETTI_EN[testo]
  if (noto) return noto
  if (testo.endsWith(SENZA_PERSONE)) {
    const prima = testo.slice(0, -SENZA_PERSONE.length)
    return `${traduciErroreProgetti(prima, lingua) ?? prima} The task was created without assignees: assign them by editing it.`
  }
  const massimo = AL_MASSIMO.exec(testo)
  if (massimo) return `${massimo[1]} characters at most`
  const uno = USCITO.exec(testo)
  if (uno) return `${uno[1] === 'Una persona scelta' ? 'One chosen person' : uno[1]} is no longer part of the project: not among the assignees.`
  const piu = USCITI.exec(testo)
  if (piu) {
    const chi = piu[1]!.replace(/^(\d+) persone scelte$/, '$1 chosen people')
    return `${chi} are no longer part of the project: not among the assignees.`
  }
  return traduciErroreTempo(testo, lingua)
}
