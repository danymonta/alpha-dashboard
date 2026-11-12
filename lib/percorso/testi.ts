/**
 * Every word the client reads (release B1a, docs/onboarding/rilascio-b.md): the personal
 * link, the registration, /entra, the emails of the code, the area /percorso and its
 * waiting panel. Italian only (an exception to section 32: the client area is not
 * translated), coach's tone, short sentences, accents, never the long dash, never an emoji:
 * tests/percorso-testi.test.ts checks every string here. A word changes here.
 */

export const TESTI_JOIN = {
  titoloPagina: 'Il tuo Percorso Alpha',
  attivo: {
    saluto: (nome: string) => (nome ? `Ciao ${nome}.` : 'Ciao.'),
    sotto: 'Da qui parte il tuo Percorso Alpha.',
    continua: 'Continua',
  },
  inAttesa: 'Il tuo accesso si attiva appena il pagamento è confermato. Ti avvisiamo noi.',
  usato: 'Hai già il tuo accesso.',
  entra: 'Entra',
  scaduto: 'Questo link è scaduto. Chiedi un nuovo link al tuo coach.',
  nonValido: 'Questo link non è più valido. Chiedi un nuovo link al tuo coach.',
  nonDisponibile: 'Non riusciamo ad aprire il tuo link in questo momento. Riprova tra poco.',
  riprova: 'Riprova',
} as const

export const TESTI_REGISTRAZIONE = {
  titolo: 'Con quale email vuoi entrare?',
  sotto: 'Ti mandiamo un codice di 8 cifre.',
  campoEmail: 'La tua email',
  esempioEmail: 'nome@esempio.it',
  inviami: 'Inviami il codice',
  invioInCorso: 'Invio in corso',
  scaduta: 'È passato troppo tempo: riapri il link che ti abbiamo mandato.',
  sessioneTeam: 'Sei già dentro come membro del team: apri il link in una finestra in incognito.',
  inviato: (email: string) => `Ti abbiamo scritto a ${email}: inserisci il codice.`,
  validita: 'Il codice vale 15 minuti. Controlla anche la cartella dello spam.',
  emailNonAmmessa: 'Questa email non si può usare per il tuo accesso. Scrivine un’altra o chiedi al tuo coach.',
  troppeRichieste: 'Troppi tentativi. Aspetta qualche minuto e riprova.',
  nonPartita: 'Non riusciamo a mandarti il codice adesso. Riprova tra poco o scrivi al tuo coach.',
  campoCodice: 'Il codice',
  conferma: 'Entra nel percorso',
  errato: 'Il codice non è corretto o è scaduto. Controlla le cifre o chiedine uno nuovo.',
  bloccato: 'Hai sbagliato il codice troppe volte: chiedine uno nuovo.',
  pronto: 'Il tuo accesso è pronto: entra con la tua email.',
  nonCompletata: 'Non riusciamo a completare la registrazione. Riapri il link o scrivi al tuo coach.',
  cambiaEmail: 'Cambia email',
  inviaDiNuovo: 'Invia di nuovo',
  attesa: (secondi: number) => `Invia di nuovo tra ${secondi} ${secondi === 1 ? 'secondo' : 'secondi'}`,
  connessione: 'Connessione assente. Riprova.',
} as const

export const TESTI_ENTRA = {
  titolo: 'Entra nel tuo percorso',
  sotto: 'Scrivi l’email con cui ti sei registrato: ti mandiamo un codice di 8 cifre.',
  campoEmail: 'La tua email',
  inviami: 'Inviami il codice',
  invioInCorso: 'Invio in corso',
  /** The same sentence for every address, registered or not. */
  inviata: 'Se l’email è registrata, ti abbiamo scritto un codice di 8 cifre. Vale 60 minuti.',
  troppeRichieste: 'Troppi tentativi. Aspetta qualche minuto e riprova.',
  nonDisponibile: 'Non riusciamo a completare la richiesta in questo momento. Riprova tra poco.',
  campoCodice: 'Il codice',
  entra: 'Entra',
  errato: 'Il codice non è corretto o è scaduto.',
  cambiaEmail: 'Cambia email',
  inviaDiNuovo: 'Invia di nuovo',
  attesa: (secondi: number) => `Invia di nuovo tra ${secondi} ${secondi === 1 ? 'secondo' : 'secondi'}`,
  connessione: 'Connessione assente. Riprova.',
  team: 'Sei del team? Accedi da qui',
} as const

export const TESTI_ACCESSO_NEGATO = {
  titolo: 'Questo account non ha accesso.',
  team: 'Sei del team? Accedi',
  cliente: 'Sei un cliente del Percorso Alpha? Entra da qui',
  concluso: 'Il tuo percorso è concluso: per tornare scrivi al tuo coach.',
} as const

/** The emails of the codes: never a link (lib/email/cliente.ts). */
export const TESTI_EMAIL_CLIENTE = {
  oggettoRegistrazione: 'Il tuo codice per Percorso Alpha',
  oggettoAccesso: 'Il tuo codice per entrare nel Percorso Alpha',
  saluto: (nome: string) => (nome ? `Ciao ${nome},` : 'Ciao,'),
  codice: (codice: string) => `il tuo codice è ${codice}.`,
  codiceIntro: 'il tuo codice è:',
  validitaRegistrazione: 'Vale 15 minuti.',
  validitaAccesso: 'Vale 60 minuti.',
  nonTuRegistrazione: 'Se non hai chiesto tu di entrare nel Percorso Alpha, ignora questa email.',
  nonTuAccesso: 'Se non hai chiesto tu di entrare, ignora questa email: il tuo accesso resta com’è.',
  firma: 'Il team di Percorso Alpha',
} as const

/** The area /percorso: the parts that do not come from the CMS. */
export const TESTI_PERCORSO = {
  titolo: 'Il tuo percorso',
  esci: 'Esci',
  sospeso: 'Il tuo accesso è sospeso. Scrivi nel tuo gruppo Telegram.',
  attesa: 'Il prossimo passo te lo apre il tuo team a breve.',
  rileggi: 'Nel frattempo puoi rileggere:',
  fattoIl: (giorno: string) => `Fatto il ${giorno}`,
  siSbloccaDopo: (nodo: string) => `Si sblocca dopo: ${nodo}`,
  passoCompletato: 'Passo completato',
  salvato: 'Salvato',
  riprova: 'Riprova',
  errore: 'Qualcosa non ha funzionato. Riprova tra poco.',
  accessoNonValido: 'Accesso non valido: entra di nuovo.',
  guardaVideo: 'Guarda il video',
  hoGuardato: 'Ho guardato il video',
  videoVisto: 'Video visto',
  vistoAl: (percentuale: number) => `Visto al ${percentuale}%`,
  videoNonSiApre: 'Il video non si apre. Riprova o aprilo su YouTube.',
  apriSuYoutube: 'Apri su YouTube',
  accettoEVado: 'Accetto e vado avanti',
  consensoVersione: (versione: string) => `Versione del ${versione}`,
  consensiTitolo: 'I tuoi consensi',
  revocaConsenso: (email: string) =>
    `Per revocarlo scrivi al tuo coach${email ? ` o a ${email}` : ''}: cancelliamo le risposte del questionario e i file.`,
  ruoli: {
    coach: 'Coach',
    revisore: 'Revisione video',
    responsabile: 'Personal Success Manager',
  },
} as const
