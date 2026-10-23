import { bilingue } from '@/lib/i18n/lingua'
import { LIMITE_MARKETING } from '@/lib/setting/commento'

/**
 * The admin's «Setter» page (1.53.0), its tabs and «Per il marketing: cosa dicono i lead».
 * What the setters and the closers write stays as written (Italian).
 */
export const SETTER = bilingue(
  {
    titolo: 'Setter',
    descrizione: 'Per ogni setter: i numeri del suo report giornaliero e quelli delle call registrate nell’app.',
    errore: 'Impossibile caricare il setting',
    caricamento: 'Caricamento del setting',
    schede: { aria: 'Sezioni di Setter', numeri: 'Numeri', insight: 'Insight 24h', ariaSetter: 'Sezioni di Oggi', mioGiorno: 'Il mio giorno' },
    tassoConv: 'Tasso conv.',
    tassoPren: 'Tasso pren.',
    dmPerCall: 'DM per call',
    diCuiStrategy: (n: string) => `di cui ${n} strategy dallo storico`,
    dalReport: 'Dal report',
    dalReportFonte: 'Quello che il setter scrive ogni giorno nel report.',
    dalleCall: 'Dalle call',
    dalleCallFonte:
      'Le call registrate nell’app. Le prenotate da DM inbound e outbound contano il giorno in cui la call è stata fissata; svolte, show rate e close rate il giorno della call.',
    nessunReport: (frase: string) => `Nessun report ${frase}`,
    nessunReportAdmin: 'I numeri arrivano dalla schermata Oggi del setter, oppure da «Aggiungi giornata».',
    reportGiornalieri: (n: number) => `Report giornalieri (${n})`,
    dmTotali: (n: string) => `DM totali ${n}`,
    conv: 'conv.',
    prenotate: 'prenotate',
    strategy: 'strategy',
    caption: (mese: boolean) => `Report giornalieri del ${mese ? 'mese' : 'periodo'}`,
    giorno: 'Giorno',
    setter: 'Setter',
    contenuto: 'Contenuto',
    correggi: 'Correggi',
    si: 'Sì',
    totale: 'Totale',
    tutti: 'Tutti',
    // «Per il marketing»
    marketing: {
      titolo: 'Per il marketing: cosa dicono i lead',
      descrizione:
        'Quello che setter e closer scrivono sui lead del periodo: il report giornaliero del setter, il motivo di non chiusura e le note aggiuntive del closer sulle call.',
      inItaliano: 'Scritto in italiano da setter e closer.',
      filtroSetter: 'Setter',
      filtroSetterSpiegazione:
        'Con un setter scelto: i suoi report e le call col suo nome (quelle che ha fissato e le loro call di follow-up).',
      tutti: 'Tutti',
      setting: {
        titolo: 'Dal setting',
        descrizione:
          'Le risposte dei setter nel report: quanti giorni per ogni livello, poi i giorni con qualcosa di scritto, dal più recente.',
        giorni: 'Giorni con un commento scritto',
        vuoto: 'Nessun commento dei setter nel periodo',
        vuotoDescrizione: 'Le risposte arrivano dal report giornaliero del setter, sotto le conversazioni.',
        nessunTesto: 'Nel periodo ci sono solo le risposte a un tocco: nessun commento scritto.',
        suGiorno: 'giorno con una risposta',
        suGiorni: 'giorni con una risposta',
      },
      piuRecenti: `i ${LIMITE_MARKETING} più recenti`,
      troncati: 'Si vedono i più recenti: per leggere gli altri scegli un periodo più corto.',
      call: {
        titolo: 'Dalle call',
        descrizione:
          'Le call svolte e non chiuse (Follow-up o Persa), con il motivo di non chiusura e le note aggiuntive scritti dal closer, dalla più recente.',
        vuoto: 'Nessun motivo di non chiusura nel periodo',
        vuotoDescrizione: 'Il closer lo scrive quando registra l’esito Follow-up o Persa di una call.',
      },
      periodo: (p: string) => `Periodo: ${p}.`,
      leadSenzaNome: 'Lead senza nome',
      esito: 'Esito:',
      closer: 'Closer:',
      motivo: 'Motivo di non chiusura',
      noteCloser: 'Note aggiuntive',
      livello: 'Livello',
      giorniCol: 'Giorni',
      quota: 'Quota',
      testi: { cosa_frenava: 'Cosa frenava i lead', domande_contenuti: 'Domande e contenuti', note: 'Altre note' },
      scale: {
        lead_in_target: {
          titolo: 'Lead in target',
          opzioni: {
            quasi_tutti: ['Quasi tutti', '3 su 4 o più'],
            circa_meta: ['Circa metà', 'più o meno 1 su 2'],
            pochi: ['Pochi', '1 su 4 o meno'],
          },
        },
        qualita_conversazioni: {
          titolo: 'Qualità delle conversazioni',
          opzioni: {
            buone: [
              'Buone',
              'Rispondono con frasi vere, raccontano la loro situazione, fanno domande: si arriva a proporre la call.',
            ],
            medie: ['Medie', 'Rispondono, ma a monosillabi o si fermano dopo 2 o 3 messaggi: bisogna tirarle avanti.'],
            scarse: ['Scarse', 'Risposte fredde o curiosi senza intenzione: spariscono presto.'],
          },
        },
      },
    },
  },
  {
    titolo: 'Setter',
    descrizione: 'For each setter: the numbers of their daily report and those of the calls recorded in the app.',
    errore: 'The setting numbers could not be loaded',
    caricamento: 'Loading the setting numbers',
    schede: { aria: 'Setter sections', numeri: 'Numbers', insight: 'Insight 24h', ariaSetter: 'Today sections', mioGiorno: 'My day' },
    tassoConv: 'Conv. rate',
    tassoPren: 'Booking rate',
    dmPerCall: 'DMs per call',
    diCuiStrategy: (n: string) => `of which ${n} strategy from the history`,
    dalReport: 'From the report',
    dalReportFonte: 'What the setter writes every day in the report.',
    dalleCall: 'From the calls',
    dalleCallFonte:
      'The calls recorded in the app. The calls booked from inbound and outbound DMs count on the day the call was booked; held calls, show rate and close rate on the day of the call.',
    nessunReport: (frase: string) => `No reports ${frase}`,
    nessunReportAdmin: 'The numbers come from the setter’s Today screen, or from «Add day».',
    reportGiornalieri: (n: number) => `Daily reports (${n})`,
    dmTotali: (n: string) => `Total DMs ${n}`,
    conv: 'conv.',
    prenotate: 'booked',
    strategy: 'strategy',
    caption: (mese: boolean) => `Daily reports of the ${mese ? 'month' : 'period'}`,
    giorno: 'Day',
    setter: 'Setter',
    contenuto: 'Content',
    correggi: 'Correct',
    si: 'Yes',
    totale: 'Total',
    tutti: 'All',
    marketing: {
      titolo: 'For marketing: what the leads say',
      descrizione:
        'What setters and closers write about the period’s leads: the setter’s daily report, the closer’s reason for not closing and extra notes on the calls.',
      inItaliano: 'Written in Italian by the setters and the closers.',
      filtroSetter: 'Setter',
      filtroSetterSpiegazione:
        'With a setter chosen: their reports and the calls with their name (the ones they booked and their follow-up calls).',
      tutti: 'All',
      setting: {
        titolo: 'From the setting',
        descrizione:
          'The setters’ answers in the report: how many days for each level, then the days with something written, newest first.',
        giorni: 'Days with a written comment',
        vuoto: 'No comments from the setters in the period',
        vuotoDescrizione: 'The answers come from the setter’s daily report, under the conversations.',
        nessunTesto: 'The period has only one-tap answers: no written comment.',
        suGiorno: 'day with an answer',
        suGiorni: 'days with an answer',
      },
      piuRecenti: `the ${LIMITE_MARKETING} most recent`,
      troncati: 'Only the most recent are shown: choose a shorter period to read the others.',
      call: {
        titolo: 'From the calls',
        descrizione:
          'The calls held and not closed (Follow-up or Lost), with the reason for not closing and the extra notes written by the closer, newest first.',
        vuoto: 'No reasons for not closing in the period',
        vuotoDescrizione: 'The closer writes it when recording the Follow-up or Lost outcome of a call.',
      },
      periodo: (p: string) => `Period: ${p}.`,
      leadSenzaNome: 'Unnamed lead',
      esito: 'Outcome:',
      closer: 'Closer:',
      motivo: 'Reason for not closing',
      noteCloser: 'Extra notes',
      livello: 'Level',
      giorniCol: 'Days',
      quota: 'Share',
      testi: { cosa_frenava: 'What held the leads back', domande_contenuti: 'Questions and content', note: 'Other notes' },
      scale: {
        lead_in_target: {
          titolo: 'Leads on target',
          opzioni: {
            quasi_tutti: ['Almost all', '3 in 4 or more'],
            circa_meta: ['About half', 'roughly 1 in 2'],
            pochi: ['Few', '1 in 4 or less'],
          },
        },
        qualita_conversazioni: {
          titolo: 'Quality of the conversations',
          opzioni: {
            buone: [
              'Good',
              'They answer with real sentences, tell their situation, ask questions: it gets to proposing the call.',
            ],
            medie: ['Average', 'They answer, but in single words or stop after 2 or 3 messages: they need pulling along.'],
            scarse: ['Poor', 'Cold answers or curious people with no intention: they disappear soon.'],
          },
        },
      },
    },
  },
)
