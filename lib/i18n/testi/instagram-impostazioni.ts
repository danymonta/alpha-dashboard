import { aggiungiGiorni, giornoEsteso, oggiRoma } from '@/lib/date'
import { formato, GIORNI_EN, parseDataISO } from '@/lib/format'
import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { AVVISO_STATISTICHE } from '@/lib/insight/stato'
import { ETICHETTA_CANCELLA_MESSAGGI } from '@/lib/validation/insight'

/**
 * Impostazioni › Instagram e Messenger in the two languages: the page, the token and the
 * exclusion forms, «Ricalcola ieri», Messenger, and the two blocks of the Insight and of
 * the reel analysis. The usernames, the names of the Messenger chats and the reasons are
 * the team's own and stay as written.
 */

/** "ieri, mercoledì 07/10/2026" (giornoEsteso); "yesterday, Wednesday 07 Oct 2026". */
export function giornoEstesoIn(iso: string, lingua: Lingua, oggi: string = oggiRoma()): string {
  if (lingua === 'it') return giornoEsteso(iso, oggi)
  const relativo = iso === oggi ? 'today, ' : iso === aggiungiGiorni(oggi, -1) ? 'yesterday, ' : ''
  return `${relativo}${GIORNI_EN[parseDataISO(iso).getDay()]} ${formato('en').formatData(iso)}`
}

const chatLetteIt = (n: number) => (n === 1 ? '1 chat letta' : `${n} chat lette`)
const incerteIt = (n: number) =>
  n === 0 ? '' : `, ${n === 1 ? '1 letta' : `${n} lette`} solo in parte (Instagram dà gli ultimi 20 messaggi di ogni chat)`
const chatLetteEn = (n: number) => (n === 1 ? '1 chat read' : `${n} chats read`)
const incerteEn = (n: number) =>
  n === 0 ? '' : `, ${n === 1 ? '1' : `${n}`} read only in part (Instagram gives the last 20 messages of each chat)`

const ESITI_PASSO_EN: Record<string, string> = {
  ok: 'ok',
  parziale: 'partial',
  fallito: 'failed',
  limite_fornitore: 'provider limit',
}

export const INSTAGRAM_IMPOSTAZIONI = bilingue(
  {
    pagina: {
      errore: 'Impossibile caricare il collegamento di Instagram',
      erroreMessenger: 'Impossibile caricare Messenger e l’Insight',
      erroreDescrizione: 'Non siamo riusciti a caricare il collegamento di Instagram e Messenger. Riprova fra un momento.',
      personaEliminata: 'Persona eliminata',
      titolo: 'Instagram e Messenger',
      descrizione:
        'Ogni notte, dopo mezzanotte, i DM dell’account precompilano il report del giorno prima. Il setter lo conferma o lo corregge in Oggi, e puoi farlo anche tu nella pagina Setter: vale la prima scelta. I DM delle ultime 24 ore di Instagram e Messenger finiscono anche nell’Insight: Claude li analizza e il gestionale li tiene al massimo 30 giorni.',
      vaiAChiavi: 'Vai a Chiavi e collegamenti: il token si incolla lì, con la guida per generarlo.',
      collegamento: 'Collegamento',
      token: 'Token',
      ultimoCalcolo: 'Ultimo calcolo',
      chatLette: chatLetteIt,
      ancoraNessuno: 'Ancora nessuno',
      postEReel: 'Post e reel',
      pubblicati: 'Pubblicati',
      lettiOgniNotte: 'Letti ogni notte per il calendario dei contenuti',
      ultimaLettura: (quando: string, letti: number | null) =>
        `(ultimo: ${quando}${letti !== null ? `, ${letti} post` : ''})`,
      nessunaLettura: ' (ancora nessuna lettura)',
      tokenDescrizione:
        'Il token di Instagram e il token della Pagina di Messenger si incollano, e si rigenerano quando scadono, in',
      chiaviECollegamenti: 'Chiavi e collegamenti',
      conGuida: ', con la guida passo passo.',
      chiLavora: 'Chi lavora i DM',
      chiLavoraDescrizione: 'I numeri calcolati ogni notte vanno a questa persona da confermare.',
      nessunSetter: 'Nel team non c’è un setter attivo: invitalo da',
      team: 'Team',
      poiSceglilo: ', poi sceglilo qui.',
      escluse: 'Chat escluse',
      escluseDescrizione:
        'Le chat Instagram con questi account (personale, team, clienti, amici) non contano mai nella proposta e non entrano mai nell’Insight.',
      nessunaEsclusa: 'Nessuna chat esclusa: contano tutte le chat dell’account.',
      ricalcola: 'Ricalcola ieri',
      ricalcolaDescrizione:
        'Rilegge i DM di ieri e rifà la proposta, per esempio dopo un token nuovo. I numeri qui non compaiono: la proposta la trovi in',
      daApprovare: 'Setter › Tracciamento da approvare',
      eInOggi: (chi: string) => `e ${chi} in Oggi: vale la prima scelta, tua o sua.`,
      ilSetterScelto: 'il setter scelto',
      primaToken: 'Prima salva il token.',
      primaSetter: 'Prima scegli chi lavora i DM.',
      primaSetterAttivo: 'Prima scegli un setter attivo per i DM.',
      messenger: 'Messenger',
      statoMessenger: (collegata: boolean, pagina: string | null) =>
        collegata ? (pagina ? `Collegata: Pagina «${pagina}».` : 'Collegata.') : 'Non collegata.',
      messengerDescrizione:
        'Il token della Pagina Facebook serve solo per leggere le chat Messenger nell’Insight, e non manda mai messaggi: lo incolli in',
      escluseMessenger: 'Chat Messenger escluse',
      escluseMessengerDescrizione:
        'Le chat Messenger con queste persone (clienti, amici, il team) non entrano mai nell’Insight.',
      nessunaEsclusaMessenger: 'Nessuna chat Messenger esclusa.',
    },
    token: {
      incolla: 'Incolla il token copiato dal pannello Meta.',
      salvato: (data: string | null) => (data ? `Token salvato, scade il ${data}` : 'Token salvato'),
      nuovo: 'Token nuovo',
      accesso: 'Token di accesso',
      sostituisci: 'Incolla qui per sostituirlo',
      incollaQui: 'Incolla qui il token',
      salva: 'Salva il token',
      cosa: 'il token di Instagram',
      tolto: 'Token tolto',
      togli: 'Togli il token',
      conseguenze: [
        'La proposta di ogni notte si ferma finché non incolli un token nuovo, e con lei la lettura dei post per il calendario dei contenuti.',
        'Chi lavora i DM e le chat escluse restano come sono.',
      ],
    },
    setter: {
      setter: 'Setter',
      nessuno: 'Nessuno: la proposta si ferma',
      nonAttivo: (nome: string) => `${nome} (non è più un setter attivo)`,
      avviso: (nome: string) =>
        `${nome} non è più un setter attivo: la proposta non parte finché non scegli un altro setter.`,
      salva: 'Salva la scelta',
      lavora: (nome: string) => `I DM di Instagram li lavora ${nome}`,
      nessunoLavora: 'Nessuno lavora i DM: la proposta si ferma',
    },
    esclusione: {
      cosa: (username: string) => `l’esclusione di @${username}`,
      nonPiu: (username: string) => `@${username} non è più esclusa`,
      conseguenza: 'Le sue chat tornano a contare nella proposta, dalla notte dopo, e nell’Insight dal recap dopo.',
      cancellaMessaggi: ETICHETTA_CANCELLA_MESSAGGI,
      cancellati: 'Chat esclusa e messaggi cancellati.',
      esclusa: (username: string) => `@${username} esclusa: le sue chat non contano`,
      form: 'Escludi una chat',
      username: 'Username',
      esempioUsername: 'nome.utente',
      motivo: 'Motivo (facoltativo)',
      esempioMotivo: 'Es. cliente, amico, account del team',
      escludi: 'Escludi la chat',
    },
    ricalcolo: {
      ilSetter: 'il setter',
      bottone: 'Ricalcola ieri',
      leggo: (giorno: string) => `Leggo i DM di ${giorno}: può volerci qualche minuto.`,
      giaDecisa: (giorno: string, lette: number, incerte: number) =>
        `La proposta di ${giorno} era già stata confermata o scartata: resta com’è. ${chatLetteIt(lette)}${incerteIt(incerte)}.`,
      ricalcolata: (giorno: string, chi: string, lette: number, incerte: number) =>
        `Proposta di ${giorno} ricalcolata per ${chi}: ${chatLetteIt(lette)}${incerteIt(incerte)}.`,
    },
    messengerForm: {
      incolla: 'Incolla il token della Pagina copiato da Meta.',
      collegata: (pagina: string | null) =>
        pagina
          ? `Pagina «${pagina}» collegata: le chat Messenger arrivano nell’Insight dal prossimo recap.`
          : 'Pagina collegata: le chat Messenger arrivano nell’Insight dal prossimo recap.',
      tokenPagina: 'Token della Pagina',
      sostituisci: 'Incolla qui per sostituirlo',
      incollaQui: 'Incolla qui il token della Pagina',
      provo: 'Provo il token…',
      collega: 'Collega la Pagina',
      cosa: 'il token della Pagina',
      tolto: 'Token della Pagina tolto',
      togli: 'Togli il token',
      conseguenze: [
        'Le chat Messenger non arrivano più nell’Insight finché non incolli un token nuovo.',
        'Le chat Messenger escluse restano come sono.',
      ],
      cosaEsclusione: (nome: string) => `l’esclusione di ${nome}`,
      nonPiu: (nome: string) => `${nome} non è più esclusa`,
      conseguenzaRiga: 'La sua chat torna nell’Insight dal recap dopo.',
      nessunaDaEscludere:
        'Nessuna chat Messenger da escludere: le chat compaiono qui dopo il primo recap con la Pagina collegata.',
      esclusa: (nome: string) => `${nome} esclusa dall’Insight`,
      form: 'Escludi una chat Messenger',
      chat: 'Chat',
      scegli: 'Scegli una chat',
    },
    insight: {
      titolo: 'Insight ultime 24h',
      descrizione:
        'Il recap dei DM di Instagram e Messenger che Claude prepara ogni giorno. Le chat restano nel gestionale al massimo 30 giorni.',
      spento: 'Insight spento: manca ANTHROPIC_API_KEY su Vercel.',
      avvisoStatistiche: AVVISO_STATISTICHE,
      automazione: 'Automazione',
      attiva: 'Attiva: recap pronto ogni giorno alle',
      disattivata: 'Disattivata.',
      siCambia: 'Si cambia in cima all’Insight.',
      ultimoRecap: 'Ultimo recap',
      nessunRecap: 'Ancora nessun recap',
      inCorso: (quando: string) => `Aggiornamento in corso, avviato ${quando}`,
      nonRiuscito: (quando: string) => `Non riuscito ${quando}`,
      chat: (n: string) => `${n} chat`,
      attribuiti: (n: number, numero: string) => `${numero} ${n === 1 ? 'lead attribuito' : 'lead attribuiti'} a un post`,
      diClaude: (costo: string) => `${costo} di Claude`,
      tokenInCache: 'Token in cache',
      cache: (letti: string, scritti: string) => `${letti} letti, ${scritti} scritti`,
      pianificatore: 'Pianificatore',
      ultimoControllo: (quando: string) => `Ultimo controllo ${quando}`,
      nessunControllo: 'Nessun controllo finora',
      fermo:
        'Il pianificatore non risponde da più di 15 minuti: il recap automatico è fermo. Usa Aggiorna dati e avvisa chi gestisce l’app.',
      apri: 'Apri l’Insight',
    },
    analisi: {
      modo: {
        attive: 'Accese: di notte si trascrive il parlato dei reel nuovi, un reel alla volta, senza Claude.',
        in_pausa_spesa: 'In pausa: il limite di spesa del mese è raggiunto. Le richieste a mano si fermano allo stesso modo.',
        ferme_chiave: 'Ferme: manca la chiave di Claude su Vercel.',
        spente: 'Spente: il parlato si trascrive solo quando qualcuno tocca «Analizza».',
      },
      titolo: 'Analisi dei reel',
      descrizione:
        'Quando tocchi «Analizza» su un reel, Claude lo guarda (fotogrammi e parlato), lo confronta con la mediana dei tuoi e dice cosa spingere, mantenere o cambiare, con qualche idea per il calendario, e gli dà un punteggio con la guida di Dany. Claude non parte mai da solo, su nessun reel. Le statistiche dei post si leggono ogni mattina e il parlato dei reel nuovi si trascrive di notte (senza Claude).',
      spente: 'Analisi spente: manca ANTHROPIC_API_KEY su Vercel.',
      senzaVoce: 'Il parlato dei reel non si trascrive: manca ALFIRE_API_KEY su Vercel. Claude vede solo i fotogrammi.',
      permesso:
        'Instagram non dà ancora le statistiche dei post: genera un nuovo token dal pannello Meta con il permesso «instagram_business_manage_insights» e incollalo qui sopra.',
      trascrizioni: 'Trascrizioni automatiche',
      nonSiLegge: 'Non si legge adesso.',
      spesa: 'Spesa del mese',
      costo: (mese: string, massimo: string) => `${mese} di ${massimo}`,
      inCoda: 'In coda',
      ultimoPasso: 'Ultimo passo',
      esitoPasso: (codice: string) => codice.replace(/_/g, ' '),
      ancoraNessuno: 'Ancora nessuno',
      fermo: 'Il pianificatore non risponde da più di 15 minuti: le analisi sono ferme.',
      apriPubblicati: 'Apri i Pubblicati',
      // the client part: the limit and the two switches
      limiteNonValido: 'Scegli un limite tra 0 e 200 $.',
      limiteSalvato: (limite: string) => `Limite di spesa: ${limite} al mese`,
      limite: 'Limite di spesa al mese ($)',
      salvaLimite: 'Salva il limite',
      interruttore: (titolo: string, acceso: boolean) => `${titolo}: ${acceso ? 'accese' : 'spente'}`,
      automatiche: 'Trascrizioni automatiche (senza Claude)',
      automaticheDescrizione:
        'Ogni notte si trascrive il parlato dei reel nuovi, con Whisper: nessuna chiamata a Claude. Claude lavora solo quando l’admin o il marketing toccano «Analizza» su un reel (analisi e punteggio insieme). Spente, la trascrizione parte con quel tocco.',
      noteTeam: 'Note del team e temi delle call negli spunti e nelle analisi',
      noteTeamDescrizione:
        'Acceso, Claude riceve senza nomi le note di chi risponde ai DM, i motivi di non chiusura, i temi dei DM e, dalle call analizzate, obiezioni, domande e dubbi dei lead. Al video editor e al marketing arrivano solo come temi a parole. Spento, non li vede mai. Non rifà le analisi già pronte.',
    },
  },
  {
    pagina: {
      errore: 'The Instagram connection could not be loaded',
      erroreMessenger: 'Messenger and the Insight could not be loaded',
      erroreDescrizione: 'We could not load the Instagram and Messenger connection. Try again in a moment.',
      personaEliminata: 'Deleted person',
      titolo: 'Instagram and Messenger',
      descrizione:
        'Every night, after midnight, the account’s DMs prefill the report of the day before. The setter confirms or corrects it in Today, and you can do it too on the Setter page: the first choice counts. The DMs of the last 24 hours of Instagram and Messenger also go into the Insight: Claude analyses them and the back office keeps them for at most 30 days.',
      vaiAChiavi: 'Go to Keys and connections: the token is pasted there, with the guide to generate it.',
      collegamento: 'Connection',
      token: 'Token',
      ultimoCalcolo: 'Last calculation',
      chatLette: chatLetteEn,
      ancoraNessuno: 'None yet',
      postEReel: 'Posts and reels',
      pubblicati: 'Published',
      lettiOgniNotte: 'Read every night for the content calendar',
      ultimaLettura: (quando: string, letti: number | null) =>
        `(last: ${quando}${letti !== null ? `, ${letti} ${letti === 1 ? 'post' : 'posts'}` : ''})`,
      nessunaLettura: ' (no reading yet)',
      tokenDescrizione:
        'The Instagram token and the Messenger Page token are pasted, and renewed when they expire, in',
      chiaviECollegamenti: 'Keys and connections',
      conGuida: ', with the step-by-step guide.',
      chiLavora: 'Who works the DMs',
      chiLavoraDescrizione: 'The numbers calculated every night go to this person to confirm.',
      nessunSetter: 'There is no active setter in the team: invite one from',
      team: 'Team',
      poiSceglilo: ', then choose them here.',
      escluse: 'Excluded chats',
      escluseDescrizione:
        'The Instagram chats with these accounts (personal, team, clients, friends) never count in the proposal and never go into the Insight.',
      nessunaEsclusa: 'No excluded chats: every chat of the account counts.',
      ricalcola: 'Recalculate yesterday',
      ricalcolaDescrizione:
        'It reads yesterday’s DMs again and redoes the proposal, for example after a new token. The numbers do not appear here: you find the proposal in',
      daApprovare: 'Setter › Tracking to approve',
      eInOggi: (chi: string) => `and ${chi} in Today: the first choice counts, yours or theirs.`,
      ilSetterScelto: 'the chosen setter',
      primaToken: 'Save the token first.',
      primaSetter: 'Choose who works the DMs first.',
      primaSetterAttivo: 'Choose an active setter for the DMs first.',
      messenger: 'Messenger',
      statoMessenger: (collegata: boolean, pagina: string | null) =>
        collegata ? (pagina ? `Connected: Page «${pagina}».` : 'Connected.') : 'Not connected.',
      messengerDescrizione:
        'The Facebook Page token is only used to read the Messenger chats in the Insight, and it never sends messages: you paste it in',
      escluseMessenger: 'Excluded Messenger chats',
      escluseMessengerDescrizione: 'The Messenger chats with these people (clients, friends, the team) never go into the Insight.',
      nessunaEsclusaMessenger: 'No excluded Messenger chats.',
    },
    token: {
      incolla: 'Paste the token copied from the Meta panel.',
      salvato: (data: string | null) => (data ? `Token saved, expires on ${data}` : 'Token saved'),
      nuovo: 'New token',
      accesso: 'Access token',
      sostituisci: 'Paste here to replace it',
      incollaQui: 'Paste the token here',
      salva: 'Save the token',
      cosa: 'the Instagram token',
      tolto: 'Token removed',
      togli: 'Remove the token',
      conseguenze: [
        'The nightly proposal stops until you paste a new token, and with it the reading of the posts for the content calendar.',
        'Who works the DMs and the excluded chats stay as they are.',
      ],
    },
    setter: {
      setter: 'Setter',
      nessuno: 'Nobody: the proposal stops',
      nonAttivo: (nome: string) => `${nome} (no longer an active setter)`,
      avviso: (nome: string) => `${nome} is no longer an active setter: the proposal does not start until you choose another setter.`,
      salva: 'Save the choice',
      lavora: (nome: string) => `${nome} works the Instagram DMs`,
      nessunoLavora: 'Nobody works the DMs: the proposal stops',
    },
    esclusione: {
      cosa: (username: string) => `the exclusion of @${username}`,
      nonPiu: (username: string) => `@${username} is no longer excluded`,
      conseguenza: 'Their chats count again in the proposal, from the next night, and in the Insight from the next recap.',
      cancellaMessaggi: 'Also delete their messages already saved in the Insight',
      cancellati: 'Chat excluded and messages deleted.',
      esclusa: (username: string) => `@${username} excluded: their chats do not count`,
      form: 'Exclude a chat',
      username: 'Username',
      esempioUsername: 'user.name',
      motivo: 'Reason (optional)',
      esempioMotivo: 'E.g. client, friend, team account',
      escludi: 'Exclude the chat',
    },
    ricalcolo: {
      ilSetter: 'the setter',
      bottone: 'Recalculate yesterday',
      leggo: (giorno: string) => `Reading the DMs of ${giorno}: it may take a few minutes.`,
      giaDecisa: (giorno: string, lette: number, incerte: number) =>
        `The proposal of ${giorno} was already confirmed or discarded: it stays as it is. ${chatLetteEn(lette)}${incerteEn(incerte)}.`,
      ricalcolata: (giorno: string, chi: string, lette: number, incerte: number) =>
        `Proposal of ${giorno} recalculated for ${chi}: ${chatLetteEn(lette)}${incerteEn(incerte)}.`,
    },
    messengerForm: {
      incolla: 'Paste the Page token copied from Meta.',
      collegata: (pagina: string | null) =>
        pagina
          ? `Page «${pagina}» connected: the Messenger chats reach the Insight from the next recap.`
          : 'Page connected: the Messenger chats reach the Insight from the next recap.',
      tokenPagina: 'Page token',
      sostituisci: 'Paste here to replace it',
      incollaQui: 'Paste the Page token here',
      provo: 'Trying the token…',
      collega: 'Connect the Page',
      cosa: 'the Page token',
      tolto: 'Page token removed',
      togli: 'Remove the token',
      conseguenze: [
        'The Messenger chats no longer reach the Insight until you paste a new token.',
        'The excluded Messenger chats stay as they are.',
      ],
      cosaEsclusione: (nome: string) => `the exclusion of ${nome}`,
      nonPiu: (nome: string) => `${nome} is no longer excluded`,
      conseguenzaRiga: 'Their chat goes back into the Insight from the next recap.',
      nessunaDaEscludere: 'No Messenger chats to exclude: chats appear here after the first recap with the Page connected.',
      esclusa: (nome: string) => `${nome} excluded from the Insight`,
      form: 'Exclude a Messenger chat',
      chat: 'Chat',
      scegli: 'Choose a chat',
    },
    insight: {
      titolo: 'Insight last 24h',
      descrizione:
        'The recap of the Instagram and Messenger DMs that Claude prepares every day. The chats stay in the back office for at most 30 days.',
      spento: 'Insight off: ANTHROPIC_API_KEY is missing on Vercel.',
      avvisoStatistiche:
        'Content statistics not available: add the instagram_business_manage_insights permission to the Meta app and paste the token again in Settings › Keys and connections.',
      automazione: 'Automation',
      attiva: 'On: recap ready every day at',
      disattivata: 'Off.',
      siCambia: 'It is changed at the top of the Insight.',
      ultimoRecap: 'Last recap',
      nessunRecap: 'No recap yet',
      inCorso: (quando: string) => `Update in progress, started ${quando}`,
      nonRiuscito: (quando: string) => `Failed ${quando}`,
      chat: (n: string) => `${n} chats`,
      attribuiti: (n: number, numero: string) => `${numero} ${n === 1 ? 'lead' : 'leads'} attributed to a post`,
      diClaude: (costo: string) => `${costo} of Claude`,
      tokenInCache: 'Cached tokens',
      cache: (letti: string, scritti: string) => `${letti} read, ${scritti} written`,
      pianificatore: 'Scheduler',
      ultimoControllo: (quando: string) => `Last check ${quando}`,
      nessunControllo: 'No check so far',
      fermo:
        'The scheduler has not answered for more than 15 minutes: the automatic recap is stopped. Use Refresh data and tell whoever manages the app.',
      apri: 'Open the Insight',
    },
    analisi: {
      modo: {
        attive: 'On: at night the speech of the new reels is transcribed, one reel at a time, without Claude.',
        in_pausa_spesa: 'Paused: the month’s spending limit is reached. Manual requests stop the same way.',
        ferme_chiave: 'Stopped: Claude’s key is missing on Vercel.',
        spente: 'Off: the speech is transcribed only when someone taps «Analizza».',
      },
      titolo: 'Reel analysis',
      descrizione:
        'When you tap «Analizza» on a reel, Claude watches it (frames and speech), compares it with the median of yours and says what to push, keep or change, with a few ideas for the calendar, and scores it with Dany’s guide. Claude never starts on its own, on any reel. The posts’ statistics are read every morning and the speech of the new reels is transcribed at night (without Claude).',
      spente: 'Analyses off: ANTHROPIC_API_KEY is missing on Vercel.',
      senzaVoce: 'The reels’ speech is not transcribed: ALFIRE_API_KEY is missing on Vercel. Claude sees only the frames.',
      permesso:
        'Instagram does not give the posts’ statistics yet: generate a new token from the Meta panel with the «instagram_business_manage_insights» permission and paste it above.',
      trascrizioni: 'Automatic transcripts',
      nonSiLegge: 'Cannot be read right now.',
      spesa: 'Spending this month',
      costo: (mese: string, massimo: string) => `${mese} of ${massimo}`,
      inCoda: 'In the queue',
      ultimoPasso: 'Last step',
      esitoPasso: (codice: string) => ESITI_PASSO_EN[codice] ?? codice.replace(/_/g, ' '),
      ancoraNessuno: 'None yet',
      fermo: 'The scheduler has not answered for more than 15 minutes: the analyses are stopped.',
      apriPubblicati: 'Open Published',
      limiteNonValido: 'Choose a limit between $0 and $200.',
      limiteSalvato: (limite: string) => `Spending limit: ${limite} a month`,
      limite: 'Monthly spending limit ($)',
      salvaLimite: 'Save the limit',
      interruttore: (titolo: string, acceso: boolean) => `${titolo}: ${acceso ? 'on' : 'off'}`,
      automatiche: 'Automatic transcripts (without Claude)',
      automaticheDescrizione:
        'Every night the speech of the new reels is transcribed, with Whisper: no call to Claude. Claude works only when the admin or marketing tap «Analizza» on a reel (analysis and score together). Off, the transcript starts with that tap.',
      noteTeam: 'Team notes and call themes in the ideas and analyses',
      noteTeamDescrizione:
        'On, Claude receives without names the notes of whoever answers the DMs, the reasons for not closing, the DM themes and, from the analysed calls, the leads’ objections, questions and doubts. The video editor and marketing receive them only as themes in words. Off, it never sees them. It does not redo analyses already done.',
    },
  },
)
