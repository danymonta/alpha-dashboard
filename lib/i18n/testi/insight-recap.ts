import { CHIAVI_DIVISIONE, DIVISIONI, LIVELLI_VICINANZA, VICINANZA } from '@/lib/insight/divisioni'
import { CHIAVI_FILTRO, FILTRI } from '@/lib/insight/filtri'
import type { Fonte } from '@/lib/insight/canale'
import { etichettaAttesa, etichettaSilenzio } from '@/lib/insight/attesa'
import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import {
  AGENDA,
  AGGIORNA,
  AGGIORNA_SETTER,
  ANNUNCIO_FILTRO_TOLTO,
  ARRIVA_DA,
  CHAT,
  CONTENT,
  COPIA,
  FATTO,
  GESTISCI_ESCLUSE,
  LEADS,
  NUMERI,
  OBIEZIONI,
  PARZIALE_ADMIN,
  RIATTIVARE,
  SOLO_AGGIORNA,
  VERDETTO,
  annuncioFiltro,
  annuncioNonSalvato,
  arrivaDa,
  contaFatte,
  eyebrowAlternativa,
  eyebrowMessaggio,
  fasePasso,
  nomeFatto,
  parzialeSetter,
  periodoContent,
  pillPriorita,
  quantiMessaggi,
  rigaEscluseImpostazioni,
  rigaFallita,
  rigaInCorso,
  rigaPianificatore,
  rigaStorie,
  titoloEscluse,
  titoloNonLead,
  viaOrigine,
} from '@/lib/insight/parole'
import { GRUPPI_PRIORITA, GRUPPI_RIATTIVAZIONE } from '@/lib/insight/priorita'
import type { OrigineRecap } from '@/lib/insight/recap'
import { etichettaTarget } from '@/lib/insight/toni'
import { URL_PASSO_MANCANTE } from '@/lib/validation/insight'

type Origine = Pick<OrigineRecap, 'tipo' | 'parola' | 'tipo_post' | 'data' | 'hook'>
type Passo = 'lettura' | 'analisi' | 'unione'

const filtriIt = Object.fromEntries(CHIAVI_FILTRO.map((k) => [k, { etichetta: FILTRI[k].etichetta, titolo: FILTRI[k].titolo }]))

const TIPO_POST_EN: Record<string, string> = { reel: 'reel', post: 'post', carosello: 'carousel' }

function nomePostEn(origine: Origine): string {
  const tipo = origine.tipo_post ? (TIPO_POST_EN[origine.tipo_post] ?? 'post') : 'post'
  return origine.data ? `${tipo} of ${origine.data}` : tipo
}

/**
 * The frame of the Insight recap (1.53.0): buttons, labels, pills, «Fatto», filters,
 * agenda headings, the run's line and «Automazione». The Italian side is
 * lib/insight/parole.ts word for word. What Claude writes (verdict, situations, pains,
 * stages, statuses, suggested messages, themes, ideas) stays Italian, as the recap
 * document is.
 */
export const INSIGHT_RECAP = bilingue(
  {
    aggiorna: AGGIORNA,
    aggiornaSetter: AGGIORNA_SETTER,
    urlPassoMancante: URL_PASSO_MANCANTE,
    fasePasso: (passo: Passo, fatti: number | null, totali: number | null) => fasePasso(passo, fatti, totali),
    rigaInCorso: (minuti: number, fase: string) => rigaInCorso(minuti, fase),
    rigaFallita: (errore: string | null) => rigaFallita(errore),
    rigaPianificatore: (ora: string | null) => rigaPianificatore(ora),
    verdetto: VERDETTO,
    parzialeAdmin: PARZIALE_ADMIN,
    parzialeSetter: (fonte: Fonte) => parzialeSetter(fonte),
    numeri: NUMERI,
    annuncioFiltro: (titolo: string, n: number) => annuncioFiltro(titolo, n),
    annuncioFiltroTolto: ANNUNCIO_FILTRO_TOLTO,
    titoloNonLead: (n: number) => titoloNonLead(n),
    filtri: filtriIt,
    leads: LEADS,
    priorita: { alta: 'alta', media: 'media', bassa: 'bassa' } as Record<string, string>,
    pillPriorita: (p: string) => pillPriorita(p),
    target: { si: etichettaTarget('si'), no: etichettaTarget('no'), 'da verificare': etichettaTarget('da verificare') },
    attesa: (ore: number) => etichettaAttesa(ore),
    silenzio: (giorni: number) => etichettaSilenzio(giorni),
    eyebrowMessaggio: (conAlternativa: boolean) => eyebrowMessaggio(conAlternativa),
    eyebrowAlternativa: (condizione: string) => eyebrowAlternativa(condizione),
    contaFatte: (fatte: number, totali: number) => contaFatte(fatte, totali),
    gruppi: Object.fromEntries(GRUPPI_PRIORITA.map((g) => [g.chiave, { titolo: g.titolo, descrizione: g.descrizione }])),
    riattivazione: Object.fromEntries(
      GRUPPI_RIATTIVAZIONE.map((g) => [String(g.passo), { titolo: g.titolo, descrizione: g.descrizione }]),
    ),
    divisioni: Object.fromEntries(CHIAVI_DIVISIONE.map((k) => [k, DIVISIONI[k]])) as Record<
      string,
      { etichetta: string; titolo: string; descrizione: string }
    >,
    gruppoDivisioni: 'Dividi le chat',
    suggerimentoDivisioni: 'In ogni divisione prima i lead più vicini alla call, poi chi aspetta da più tempo.',
    annuncioDivisione: (titolo: string, n: number) => `${titolo}: ${n} chat.`,
    nessunaDivisione: 'Nessuna chat qui.',
    cerca: {
      etichetta: 'Cerca una persona',
      segnaposto: 'Nome o @username',
      togli: 'Togli la ricerca',
      titolo: (q: string) => `Risultati per «${q}»`,
      nessuno: (q: string) => `Nessuna chat con «${q}» in questo recap. Prova un altro giorno o l’altra scheda.`,
      annuncio: (n: number) => (n === 1 ? '1 chat trovata.' : `${n} chat trovate.`),
      nonLead: 'Non sono lead',
    },
    vicinanza: Object.fromEntries(LIVELLI_VICINANZA.map((k) => [k, VICINANZA[k]])) as Record<
      string,
      { titolo: string; descrizione: string }
    >,
    fatto: FATTO,
    nomeFatto: (chi: string) => nomeFatto(chi),
    annuncioNonSalvato: (chi: string) => annuncioNonSalvato(chi),
    copia: COPIA,
    copiaMessaggio: (chi: string) => `Copia il messaggio suggerito per ${chi}`,
    copiaAlternativo: (chi: string) => `Copia il messaggio alternativo per ${chi}`,
    copiaRisposta: (chi: string) => `Copia la risposta suggerita per ${chi}`,
    copiaPromemoria: (chi: string) => `Copia il promemoria per ${chi}`,
    copiaMessaggioPer: (chi: string) => `Copia il messaggio per ${chi}`,
    copiaChatCon: (chi: string) => `${COPIA.copiaChat} con ${chi}`,
    chat: CHAT,
    chatCon: (chi: string) => `Chat con ${chi}`,
    quantiMessaggi: (n: number) => quantiMessaggi(n),
    profiloNuovaScheda: ' (profilo Instagram, si apre in una nuova scheda)',
    nuovaScheda: ' (si apre in una nuova scheda)',
    instagramNuovaScheda: ' (si apre Instagram in una nuova scheda)',
    meetNuovaScheda: ', apre Google Meet in una nuova scheda',
    arrivaDa: ARRIVA_DA,
    arrivaDaPost: (origine: Origine) => arrivaDa(origine),
    viaOrigine: (origine: Origine) => viaOrigine(origine),
    riattivare: RIATTIVARE,
    obiezioni: OBIEZIONI,
    content: CONTENT,
    periodoContent: (periodo: string, basatoSu: number) => periodoContent(periodo, basatoSu),
    rigaStorie: (dm: number, target: number) => rigaStorie(dm, target),
    titoloEscluse: (n: number) => titoloEscluse(n),
    rigaEscluseImpostazioni: (n: number) => rigaEscluseImpostazioni(n),
    gestisciEscluse: GESTISCI_ESCLUSE,
    agenda: { ...AGENDA, ilLead: 'il lead' },
    giorniAgenda: { oggi: 'oggi', domani: 'domani', ieri: 'ieri' } as Record<string, string>,
    automazione: {
      titolo: 'Automazione',
      recapAttivo: 'Recap automatico attivo',
      prontoAlle: 'Pronto alle',
      salva: 'Salva automazione',
      salvataggio: 'Salvataggio…',
      salvata: 'Automazione salvata',
      attivaPrima: 'Attiva: recap pronto ogni giorno alle',
      disattivata: 'Disattivata.',
      mancaChiave: 'Manca ANTHROPIC_API_KEY su Vercel: finché non c’è, il recap automatico non parte.',
      pianificatore: (dalle: string) =>
        `Il pianificatore non risponde ${dalle}: il recap automatico è fermo. Usa Aggiorna dati e avvisa chi gestisce l’app.`,
      dalle: (ora: string) => `dalle ${ora}`,
      dal: (data: string, ora: string) => `dal ${data} alle ${ora}`,
      gira: 'Gira sul server dell’app: il Mac può restare spento. Parte circa 15 minuti prima.',
      orarioNonValido: 'Orario non valido.',
      connessione: 'Connessione assente. Riprova.',
    },
  },
  {
    aggiorna: {
      bottone: 'Update data',
      avvio: 'Starting…',
      inCorso: 'Update in progress…',
      fatto: 'Data updated.',
      chiaveMancante: 'Insight off: ANTHROPIC_API_KEY is missing on Vercel.',
      tokenScaduto:
        'Instagram token expired: generate a new one from the Meta panel and paste it in Settings › Keys and connections.',
      apriImpostazioni: 'Open Keys and connections',
      connessione: 'No connection. Try again.',
      nonAvviato: 'Update not started. Try again.',
    },
    aggiornaSetter: {
      inCorso: 'Update started: the recap arrives in a few minutes, you can close the page.',
      nonAttivo: 'The Insight is not active: tell Dany.',
      nonRiuscito: 'Update failed: try again later or tell Dany.',
    },
    urlPassoMancante: 'App address not configured: set APP_URL on Vercel and deploy again.',
    fasePasso: (passo: Passo, fatti: number | null, totali: number | null) => {
      if (passo === 'analisi') return totali ? `Claude is analysing the chats (${fatti ?? 0}/${totali})` : 'Claude is analysing the chats'
      return passo === 'unione' ? 'preparing the recap' : 'reading Instagram and Messenger'
    },
    rigaInCorso: (minuti: number, fase: string) =>
      `Update started ${Math.max(1, minuti)} min ago: ${fase}. The recap arrives by itself, you can close the page.`,
    rigaFallita: (errore: string | null) => {
      const motivo = errore?.trim().replace(/[.\s]+$/, '')
      return `The update failed: ${motivo || 'try again with Update data'}.`
    },
    rigaPianificatore: (ora: string | null) =>
      `The scheduler is not answering${ora ? ` since ${ora}` : ''}: the automatic recap is stopped. Use Update data and tell whoever runs the app.`,
    verdetto: 'Verdict of the day',
    parzialeAdmin: 'Partial recap',
    parzialeSetter: (fonte: Fonte) =>
      fonte === 'messenger'
        ? 'Partial recap: some chats were not analysed, open them from the Messenger inbox.'
        : 'Partial recap: some chats were not analysed, open them from Instagram.',
    numeri: {
      gruppo: 'Filter the chats',
      suggerimento: 'Tap a number to filter the chats',
      suggerimentoAttivo: 'Tap the number again to remove the filter',
      mostraTutto: 'Show all',
      nessunaInCategoria: 'No chats in this category.',
    },
    annuncioFiltro: (titolo: string, n: number) => `Filter: ${titolo}, ${n} ${n === 1 ? 'chat' : 'chats'}.`,
    annuncioFiltroTolto: 'Filter removed: all chats.',
    titoloNonLead: (n: number) => `Not leads (${n})`,
    filtri: {
      tutte: { etichetta: 'Active chats', titolo: 'All active chats' },
      target: { etichetta: 'Leads on target', titolo: 'Leads on target' },
      attesa: { etichetta: 'Waiting for a reply', titolo: 'Waiting for a reply' },
      call: { etichetta: 'Calls booked', titolo: 'Calls booked' },
      persi: { etichetta: 'Closed / lost', titolo: 'Closed / lost' },
    },
    leads: {
      titolo: 'Chats by priority',
      vuoto: 'No chats with leads today.',
      eta: 'Age',
      situazione: 'Situation',
      pain: 'Pain',
      prossimaMossa: 'Next move',
      serveDany: 'Dany needed',
      pillServeDany: 'Dany needed',
      minore: 'minor under 14',
      analisiMancante: 'analysis not available',
      mossaAnalisiMancante: 'Open the chat: this conversation was not analysed.',
      daRicontrollare: 'To check again',
      senzaUsername: '@?',
      lead: 'Lead',
    },
    priorita: { alta: 'high', media: 'medium', bassa: 'low' },
    pillPriorita: (p: string) => `priority ${p}`,
    target: { si: 'on target', no: 'off target', 'da verificare': 'target to check' },
    attesa: (ore: number) => {
      if (ore < 1) return 'waiting for less than 1 hour'
      if (ore < 48) {
        const n = Math.round(ore)
        return `waiting for ${n} ${n === 1 ? 'hour' : 'hours'}`
      }
      return `waiting for ${Math.round(ore / 24)} days`
    },
    silenzio: (giorni: number) => {
      if (!Number.isFinite(giorni) || giorni <= 0) return null
      const n = Math.round(giorni)
      return `silent for ${n} ${n === 1 ? 'day' : 'days'}`
    },
    eyebrowMessaggio: (conAlternativa: boolean) =>
      conAlternativa ? 'Suggested message (if they have seen it)' : 'Suggested message',
    eyebrowAlternativa: (condizione: string) => `Suggested message (${condizione || 'alternative'})`,
    contaFatte: (fatte: number, totali: number) => `${fatte}/${totali} done`,
    gruppi: {
      alta: { titolo: 'High priority', descrizione: 'To handle today' },
      media: { titolo: 'Medium priority', descrizione: 'To move forward' },
      bassa: { titolo: 'Low priority', descrizione: 'Nurturing, off target or closed' },
    },
    riattivazione: {
      '1': { titolo: 'Silent for 2 days', descrizione: 'Pick the conversation up again' },
      '2': { titolo: 'Silent for 5 days', descrizione: 'Bring value' },
      '3': { titolo: 'Silent for 10 days', descrizione: 'Closing message' },
    },
    divisioni: {
      tutte: { etichetta: 'All', titolo: 'Chats by priority', descrizione: 'All the chats, by priority.' },
      rispondere: {
        etichetta: 'To answer',
        titolo: 'To answer',
        descrizione: 'The lead wrote last and is waiting for a reply.',
      },
      follow_up: {
        etichetta: 'Follow-up',
        titolo: 'Follow-up',
        descrizione: 'We wrote last and there is a message to send now, or the chat is to be revived.',
      },
      attesa: {
        etichetta: 'Waiting',
        titolo: 'Waiting',
        descrizione: 'We wrote last: it is the lead’s turn, nothing to send now.',
      },
    },
    gruppoDivisioni: 'Split the chats',
    suggerimentoDivisioni: 'In each group the leads closest to the call come first, then whoever has waited longest.',
    annuncioDivisione: (titolo: string, n: number) => `${titolo}: ${n} ${n === 1 ? 'chat' : 'chats'}.`,
    nessunaDivisione: 'No chats here.',
    cerca: {
      etichetta: 'Search a person',
      segnaposto: 'Name or @username',
      togli: 'Clear search',
      titolo: (q: string) => `Results for “${q}”`,
      nessuno: (q: string) => `No chat with “${q}” in this recap. Try another day or the other tab.`,
      annuncio: (n: number) => (n === 1 ? '1 chat found.' : `${n} chats found.`),
      nonLead: 'Not leads',
    },
    vicinanza: {
      vicina: { titolo: 'One step from the call', descrizione: 'Call proposed or Calendly sent' },
      prenotata: { titolo: 'Call booked', descrizione: 'To bring to the call' },
      qualifica: { titolo: 'Qualifying', descrizione: 'Goals, struggles, routine, urgency' },
      apertura: { titolo: 'First messages', descrizione: 'Hook and value' },
      lontana: { titolo: 'Nurture or off target', descrizione: 'Far from the call' },
    },
    fatto: {
      fatto: 'Done',
      daFare: 'To do',
      nonSalvato: 'Not saved, try again',
      solaLetturaTitolo: 'Read only.',
      solaLettura: 'With your access the Done switches are not saved: ask Dany.',
      realtimeGiu: 'Other people’s switches are not live: reload the page to see them.',
    },
    nomeFatto: (chi: string) => `Done: ${chi}`,
    annuncioNonSalvato: (chi: string) => `Not saved: ${chi}, try again.`,
    copia: {
      copia: 'Copy',
      copiaChat: 'Copy chat',
      copiato: 'Copied',
      nonRiuscita: 'Copy failed',
      annuncioCopiato: 'Copied to the clipboard.',
      annuncioNonRiuscita: 'Copy failed: press and hold the text to copy it.',
    },
    copiaMessaggio: (chi: string) => `Copy the suggested message for ${chi}`,
    copiaAlternativo: (chi: string) => `Copy the alternative message for ${chi}`,
    copiaRisposta: (chi: string) => `Copy the suggested reply for ${chi}`,
    copiaPromemoria: (chi: string) => `Copy the reminder for ${chi}`,
    copiaMessaggioPer: (chi: string) => `Copy the message for ${chi}`,
    copiaChatCon: (chi: string) => `Copy chat with ${chi}`,
    chat: {
      leggi: 'Read the chat',
      apriInstagram: 'Open the chat on Instagram',
      apriMessenger: 'Open the Messenger inbox',
      percorsoAlpha: 'Percorso Alpha',
    },
    chatCon: (chi: string) => `Chat with ${chi}`,
    quantiMessaggi: (n: number) => `(${n} ${n === 1 ? 'message' : 'messages'})`,
    profiloNuovaScheda: ' (Instagram profile, opens in a new tab)',
    nuovaScheda: ' (opens in a new tab)',
    instagramNuovaScheda: ' (opens Instagram in a new tab)',
    meetNuovaScheda: ', opens Google Meet in a new tab',
    arrivaDa: {
      storiaSenzaPost: 'Comes from a reply to a story',
      apriPost: 'Open the post',
      nelCalendario: 'In the calendar',
    },
    arrivaDaPost: (origine: Origine) => {
      const hook = origine.hook?.trim()
      return `Comes from: ${nomePostEn(origine)}${hook ? ` «${hook}»` : ''}`
    },
    viaOrigine: (origine: Origine) => {
      switch (origine.tipo) {
        case 'condivisione':
          return 'shared in DM'
        case 'parola_chiave':
          return origine.parola ? `keyword «${origine.parola}»` : 'keyword of the caption'
        case 'storia':
          return 'reply to a story'
        default:
          return 'from the text of the chat'
      }
    },
    riattivare: 'To reactivate',
    obiezioni: { titolo: 'Open objections', risposta: 'Suggested reply' },
    content: {
      titolo: 'Content',
      periodo: 'Analysis of the last 24 hours',
      tema: 'Theme that emerged in the DMs',
      chat: 'Chats',
      inTarget: 'On target',
      call: 'Calls',
      cosaCiDice: 'What it tells us',
      contenuto: 'Content published',
      contenutoPredefinito: 'Content',
      views: 'Views',
      salvati: 'Saved',
      condivisioniBreve: 'Shares',
      condivisioni: 'Shares',
      dm: 'DMs',
      verdetto: 'Verdict',
      nd: 'n/a',
      mantieni: 'Keep',
      cambia: 'Change',
      potenzia: 'Boost',
      niente: 'Nothing to report.',
      neiDm: 'What works in the DMs',
      idee: 'Content ideas',
    },
    periodoContent: (periodo: string, basatoSu: number) =>
      `${periodo || 'Analysis of the last 24 hours'}${basatoSu ? ` · ${basatoSu} chats analysed` : ''}`,
    rigaStorie: (dm: number, target: number) => `Replies to stories: ${dm} leads, ${target} on target.`,
    titoloEscluse: (n: number) => `Left out of the recap (${n})`,
    rigaEscluseImpostazioni: (n: number) =>
      n === 1 ? '1 chat excluded in the settings was not analysed.' : `${n} chats excluded in the settings were not analysed.`,
    gestisciEscluse: 'Manage the excluded chats',
    agenda: {
      titolo: 'Call agenda',
      nessuna: 'No calls in the calendar for today and tomorrow.',
      ieri: 'Yesterday’s calls',
      ieriDescrizione: 'Who showed up and who did not',
      promemoria: 'Reminder',
      messaggio: 'Message',
      meet: 'Meet',
      daVerificare: 'to check',
      vuotoTitolo: 'No calls',
      vuotoDescrizione: 'There are no calls in the calendar for today and tomorrow in this recap.',
      ilLead: 'the lead',
    },
    giorniAgenda: { oggi: 'today', domani: 'tomorrow', ieri: 'yesterday' },
    automazione: {
      titolo: 'Automation',
      recapAttivo: 'Automatic recap on',
      prontoAlle: 'Ready at',
      salva: 'Save automation',
      salvataggio: 'Saving…',
      salvata: 'Automation saved',
      attivaPrima: 'On: recap ready every day at',
      disattivata: 'Off.',
      mancaChiave: 'ANTHROPIC_API_KEY is missing on Vercel: until it is there, the automatic recap does not start.',
      pianificatore: (dalle: string) =>
        `The scheduler is not answering ${dalle}: the automatic recap is stopped. Use Update data and tell whoever runs the app.`,
      dalle: (ora: string) => `since ${ora}`,
      dal: (data: string, ora: string) => `since ${data} at ${ora}`,
      gira: 'It runs on the app’s server: the Mac can stay off. It starts about 15 minutes earlier.',
      orarioNonValido: 'Invalid time.',
      connessione: 'No connection. Try again.',
    },
  },
)

/** The fixed sentences of the Insight's actions and schemas; a database's sentence or a run's error stays as written. */
const ERRORI_INSIGHT_EN: Record<string, string> = {
  'L’Insight lo vedono l’admin e i setter.': 'The Insight is for the admin and the setters.',
  'Non salvato, riprova.': 'Not saved, try again.',
  'Questo recap non c’è più: ricarica la pagina.': 'This recap is not there any more: reload the page.',
  'Sessione scaduta. Rientra e riprova.': 'Session expired. Sign in again and retry.',
  [SOLO_AGGIORNA]: 'The Insight data are updated by the admin and the setters.',
  [AGGIORNA.chiaveMancante]: 'Insight off: ANTHROPIC_API_KEY is missing on Vercel.',
  [AGGIORNA.nonAvviato]: 'Update not started. Try again.',
  [AGGIORNA.connessione]: 'No connection. Try again.',
  [AGGIORNA_SETTER.nonAttivo]: 'The Insight is not active: tell Dany.',
  [AGGIORNA_SETTER.nonRiuscito]: 'Update failed: try again later or tell Dany.',
  [URL_PASSO_MANCANTE]: 'App address not configured: set APP_URL on Vercel and deploy again.',
  // URL_PASSO_NON_SALVATO of lib/insight/url-passo.ts (server-only)
  'Indirizzo dell’app non salvato. Riprova.': 'App address not saved. Try again.',
  'Solo l’admin imposta l’automazione.': 'Only the admin sets the automation.',
  'Manca ANTHROPIC_API_KEY su Vercel: finché non c’è, il recap automatico non parte.':
    'ANTHROPIC_API_KEY is missing on Vercel: until it is there, the automatic recap does not start.',
  'Automazione non salvata. Riprova.': 'Automation not saved. Try again.',
  'Dati non validi.': 'Invalid data.',
  'Scegli l’orario del recap.': 'Choose the time of the recap.',
  'Orario non valido.': 'Invalid time.',
  'Scegli un orario a passi di 5 minuti, per esempio 19:00 o 19:05.': 'Choose a time in steps of 5 minutes, for example 19:00 or 19:05.',
  'Valore non valido.': 'Invalid value.',
}

export function traduciErroreInsight(testo: string, lingua: Lingua): string
export function traduciErroreInsight(testo: string | null | undefined, lingua: Lingua): string | null | undefined
export function traduciErroreInsight(testo: string | null | undefined, lingua: Lingua): string | null | undefined {
  if (!testo || lingua === 'it') return testo
  return ERRORI_INSIGHT_EN[testo] ?? testo
}
