import { bilingue } from '@/lib/i18n/lingua'

/**
 * The sales recap (1.58.0, by month and by day from 1.59.0): the business coach's one page,
 * which the admin opens too. Only team totals of the sales funnel: never a name, a client,
 * an amount of one client, costs, margin or commissions. Every number comes from
 * recap_mese() in SQL.
 */

const MESI_IT = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const
const GIORNI_IT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'] as const
const MESI_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
const GIORNI_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** Year, month (0-11), day and weekday (0 = Sunday) of 'YYYY-MM-DD', with no time zone. */
function parti(iso: string): { anno: number; mese: number; giorno: number; settimana: number } {
  const [anno, mese, giorno] = iso.split('-').map(Number)
  return { anno, mese: mese - 1, giorno, settimana: new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay() }
}

/** «1 chiusa», «2 chiuse»: the count is formatted by the caller, the plural follows the number. */
function plurale(n: number, testo: string, uno: string, molti: string): string {
  return `${testo} ${n === 1 ? uno : molti}`
}

export const RECAP = bilingue(
  {
    titolo: 'Recap vendite',
    descrizione: 'Il mese del team giorno per giorno: setting, call, chiusure e cash dai nuovi clienti.',
    marchio: 'Alpha Management',
    esci: 'Esci',
    tornaAllApp: 'Torna all’app',
    errore: 'Impossibile caricare il recap vendite',
    caricamento: 'Caricamento del recap vendite',
    vuotoTitolo: (mese: string) => `Nessuna attività a ${mese}`,
    vuotoDescrizione: 'In questo mese non ci sono DM, call né incassi dai nuovi clienti. Prova un altro mese.',
    vuotoAzione: 'Mese corrente',
    confronto: (mese: string) => `vs ${mese}`,
    // the tiles
    cash: 'Cash incassato dai nuovi clienti',
    cashNota:
      'Gli incassi del mese delle vendite ai nuovi clienti firmate nel mese: il cash che arriva dalle call. Rate di clienti entrati prima, rinnovi e upsell esclusi.',
    revenue: 'Revenue nuovi clienti',
    revenueNota: 'Il valore dei contratti firmati nel mese dai nuovi clienti.',
    dm: 'DM totali',
    dmNota: 'DM outbound, inbound e follow up dal report giornaliero dei setter.',
    dmParti: (outbound: string, inbound: string, followUp: string) =>
      `${outbound} outbound · ${inbound} inbound · ${followUp} follow up`,
    conversazioni: 'Conversazioni',
    conversazioniNota: 'Le conversazioni attive del mese, dal report dei setter.',
    prenotate: 'Call prenotate',
    prenotateNota: 'Le call fissate dai setter nel mese, dal loro report.',
    svolte: 'Call svolte',
    svolteNota: 'Le call che si sono tenute nel mese, registrate nell’app.',
    showRate: (valore: string) => `show rate ${valore}`,
    chiuse: 'Call chiuse',
    chiuseNota: 'Le call svolte chiuse con una vendita.',
    closeRate: (valore: string) => `close rate ${valore}`,
    // the view
    vista: 'Vista',
    viste: { calendario: 'Calendario', tabella: 'Tabella' },
    // the calendar
    calendarioTitolo: 'Il mese giorno per giorno',
    calendarioDescrizione: 'Tocca un giorno per il dettaglio: il setting e il closing, come una riga del foglio.',
    giorniSettimana: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
    legenda: 'Legenda',
    legendaDm: 'DM totali',
    legendaConv: 'Conversazioni',
    legendaPrenotate: 'Call prenotate',
    legendaSvolte: 'Call svolte',
    legendaChiuse: 'Call chiuse',
    legendaCash: 'Cash (prima rata dei nuovi clienti)',
    legendaColore: 'Più colore, più DM in quel giorno',
    cellaDm: (n: number, testo: string) => `${testo} DM`,
    cellaConv: (n: number, testo: string) => `${testo} conv.`,
    cellaPrenotate: (n: number, testo: string) => plurale(n, testo, 'prenotata', 'prenotate'),
    cellaSvolte: (n: number, testo: string) => plurale(n, testo, 'svolta', 'svolte'),
    cellaChiuse: (n: number, testo: string) => plurale(n, testo, 'chiusa', 'chiuse'),
    nessunaAttivita: 'Nessuna attività',
    oggi: 'Oggi',
    futuro: 'ancora da venire',
    giorniVuoti: (n: number) => (n === 1 ? '1 giorno senza attività' : `${n} giorni senza attività`),
    agendaVuota: 'Nessun giorno con attività finora.',
    apriGiorno: 'apri il dettaglio',
    dataLunga: (iso: string) => {
      const p = parti(iso)
      return `${GIORNI_IT[p.settimana]} ${p.giorno} ${MESI_IT[p.mese]} ${p.anno}`
    },
    dataCorta: (iso: string) => {
      const p = parti(iso)
      return `${GIORNI_IT[p.settimana].slice(0, 3)} ${String(p.giorno).padStart(2, '0')}/${String(p.mese + 1).padStart(2, '0')}`
    },
    // the day sheet
    dettaglioDescrizione: 'I numeri del team in questo giorno, come una riga del foglio.',
    giornoPrima: 'Giorno prima',
    giornoDopo: 'Giorno dopo',
    giornoSenzaAttivita: 'Nessuna attività registrata in questo giorno: tutto a zero.',
    sezioneSetting: 'Setting',
    sezioneSettingNota: 'Dal report giornaliero dei setter. Le call fissate da inbound e da outbound vengono dalle call fissate nell’app.',
    sezioneClosing: 'Closing',
    sezioneClosingNota: 'Dalle call registrate nell’app, nel giorno della call. Cash e revenue: i nuovi clienti, nel giorno della vendita.',
    rapportiGiorno: 'Rapporti del giorno',
    voci: {
      dm_outbound: 'DM outbound',
      dm_inbound: 'DM inbound',
      follow_up: 'Follow up dei DM',
      dm_totali: 'DM totali',
      conversazioni: 'Conversazioni',
      call_proposte: 'Call proposte',
      call_prenotate: 'Call prenotate',
      prenotate_inbound: 'Fissate nell’app da inbound',
      prenotate_outbound: 'Fissate nell’app da outbound',
      call_svolte: 'Call svolte',
      qualificate: 'Call qualificate',
      no_show: 'No show',
      call_follow_up: 'Call finite in follow up',
      cancellate: 'Call cancellate',
      in_attesa: 'In attesa di conferma',
      chiuse: 'Call chiuse',
      cash: 'Cash (prima rata dei nuovi clienti)',
      revenue: 'Revenue nuovi clienti',
    },
    showRateEtichetta: 'Show rate',
    closeRateEtichetta: 'Close rate',
    // the table
    tabellaTitolo: 'Il mese come il foglio',
    tabellaDescrizione: 'Un giorno per riga, il setting a sinistra e il closing a destra, il totale in fondo.',
    tabellaGiorno: 'Giorno',
    tabellaTotale: 'Totale del mese',
    colonne: {
      dm_outbound: 'Outbound',
      dm_inbound: 'Inbound',
      follow_up: 'Follow up',
      dm_totali: 'DM totali',
      conversazioni: 'Conv.',
      call_proposte: 'Proposte',
      call_prenotate: 'Prenotate',
      prenotate_inbound: 'Da inbound',
      prenotate_outbound: 'Da outbound',
      call_svolte: 'Svolte',
      qualificate: 'Qualificate',
      no_show: 'No show',
      call_follow_up: 'Follow up',
      cancellate: 'Cancellate',
      in_attesa: 'In attesa',
      chiuse: 'Chiuse',
      cash: 'Cash 1ª rata',
      revenue: 'Revenue',
    },
    notaCash:
      'Il cash di un giorno è la prima rata dei clienti nuovi, nel giorno della vendita, come nella pagina Closer. Il cash in alto conta tutti gli incassi del mese delle vendite nuove del mese.',
    // the summary
    riepilogoTitolo: 'Riepilogo del mese',
    riepilogoDescrizione: 'I rapporti del foglio, con le definizioni dell’app. Sotto ogni numero, il mese prima.',
    gruppi: { setting: 'Setting', closing: 'Closing', soldi: 'Soldi' },
    mesePrima: (mese: string, valore: string) => `${mese}: ${valore}`,
    riepilogo: {
      tasso_conversazione: {
        etichetta: 'DM → conversazioni',
        spiegazione: 'Le conversazioni sul totale dei DM del mese (tasso di conversazione).',
      },
      tasso_prenotazione: {
        etichetta: 'Call proposte → prenotate',
        spiegazione: 'Le call prenotate sulle call proposte nei DM (tasso di prenotazione), dal report dei setter.',
      },
      tasso_dm_qualificate: {
        etichetta: 'DM → call qualificate',
        spiegazione: 'Le call svolte e qualificate sul totale dei DM del mese.',
      },
      dm_per_call: {
        etichetta: 'DM per call prenotata',
        spiegazione: 'Quanti DM servono per una call prenotata: i DM totali divisi per le call prenotate.',
      },
      show_rate: {
        etichetta: 'Show rate',
        spiegazione: 'Le call svolte su svolte più no show. Cancellate e in attesa di conferma escluse.',
      },
      tasso_qualificazione: {
        etichetta: 'Tasso di qualificazione',
        spiegazione: 'Le call qualificate sulle call svolte.',
      },
      close_rate: { etichetta: 'Close rate', spiegazione: 'Le call chiuse sulle call svolte.' },
      close_rate_qualificate: {
        etichetta: 'Close rate su qualificate',
        spiegazione: 'Le call chiuse sulle call svolte e qualificate.',
      },
      chiuse: { etichetta: 'Call chiuse', spiegazione: 'Le call svolte chiuse con una vendita.' },
      cash_nuovi_clienti: {
        etichetta: 'Cash dai nuovi clienti',
        spiegazione:
          'Gli incassi del mese delle vendite ai nuovi clienti firmate nel mese. Rate di clienti entrati prima, rinnovi e upsell esclusi.',
      },
      revenue_nuovi: {
        etichetta: 'Revenue nuovi clienti',
        spiegazione: 'Il valore dei contratti firmati nel mese dai nuovi clienti.',
      },
      cash_per_dm: { etichetta: 'Cash per DM', spiegazione: 'Il cash dai nuovi clienti diviso per i DM totali.' },
      revenue_per_dm: {
        etichetta: 'Revenue per DM',
        spiegazione: 'La revenue dei nuovi clienti divisa per i DM totali.',
      },
      cash_per_call_svolta: {
        etichetta: 'Cash per call svolta',
        spiegazione: 'Il cash dai nuovi clienti diviso per le call svolte.',
      },
      valore_medio_nuovo: {
        etichetta: 'Valore medio di un cliente nuovo',
        spiegazione:
          'La revenue dei nuovi clienti divisa per le vendite ai nuovi clienti del mese: il valore medio di un contratto nuovo (average deal value).',
      },
      cash_medio_chiusura: {
        etichetta: 'Cash medio per chiusura',
        spiegazione: 'Il cash dai nuovi clienti diviso per le call chiuse (average order value).',
      },
    },
  },
  {
    titolo: 'Sales recap',
    descrizione: 'The team’s month day by day: setting, calls, closes and cash from new clients.',
    marchio: 'Alpha Management',
    esci: 'Sign out',
    tornaAllApp: 'Back to the app',
    errore: 'The sales recap could not be loaded',
    caricamento: 'Loading the sales recap',
    vuotoTitolo: (mese: string) => `No activity in ${mese}`,
    vuotoDescrizione: 'This month has no DMs, calls or payments from new clients. Try another month.',
    vuotoAzione: 'Current month',
    confronto: (mese: string) => `vs ${mese}`,
    cash: 'Cash collected from new clients',
    cashNota:
      'Payments of the month on the sales to new clients signed in the month: the cash that comes from the calls. Instalments of earlier clients, renewals and upsells excluded.',
    revenue: 'Revenue from new clients',
    revenueNota: 'The value of the contracts signed in the month by new clients.',
    dm: 'Total DMs',
    dmNota: 'Outbound, inbound and follow-up DMs from the setters’ daily report.',
    dmParti: (outbound: string, inbound: string, followUp: string) =>
      `${outbound} outbound · ${inbound} inbound · ${followUp} follow up`,
    conversazioni: 'Conversations',
    conversazioniNota: 'The active conversations of the month, from the setters’ report.',
    prenotate: 'Calls booked',
    prenotateNota: 'The calls the setters booked in the month, from their report.',
    svolte: 'Calls held',
    svolteNota: 'The calls held in the month, recorded in the app.',
    showRate: (valore: string) => `show rate ${valore}`,
    chiuse: 'Calls closed',
    chiuseNota: 'The calls held that closed with a sale.',
    closeRate: (valore: string) => `close rate ${valore}`,
    vista: 'View',
    viste: { calendario: 'Calendar', tabella: 'Table' },
    calendarioTitolo: 'The month day by day',
    calendarioDescrizione: 'Tap a day for the detail: setting and closing, like a row of the sheet.',
    giorniSettimana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    legenda: 'Legend',
    legendaDm: 'Total DMs',
    legendaConv: 'Conversations',
    legendaPrenotate: 'Calls booked',
    legendaSvolte: 'Calls held',
    legendaChiuse: 'Calls closed',
    legendaCash: 'Cash (first instalment of new clients)',
    legendaColore: 'More colour, more DMs that day',
    cellaDm: (n: number, testo: string) => `${testo} DM${n === 1 ? '' : 's'}`,
    cellaConv: (n: number, testo: string) => `${testo} conv.`,
    cellaPrenotate: (n: number, testo: string) => `${testo} booked`,
    cellaSvolte: (n: number, testo: string) => `${testo} held`,
    cellaChiuse: (n: number, testo: string) => `${testo} closed`,
    nessunaAttivita: 'No activity',
    oggi: 'Today',
    futuro: 'still to come',
    giorniVuoti: (n: number) => (n === 1 ? '1 day with no activity' : `${n} days with no activity`),
    agendaVuota: 'No day with activity so far.',
    apriGiorno: 'open the detail',
    dataLunga: (iso: string) => {
      const p = parti(iso)
      return `${GIORNI_EN[p.settimana]} ${p.giorno} ${MESI_EN[p.mese]} ${p.anno}`
    },
    dataCorta: (iso: string) => {
      const p = parti(iso)
      return `${GIORNI_EN[p.settimana].slice(0, 3)} ${p.giorno} ${MESI_EN[p.mese].slice(0, 3)}`
    },
    dettaglioDescrizione: 'The team’s numbers on this day, like a row of the sheet.',
    giornoPrima: 'Day before',
    giornoDopo: 'Day after',
    giornoSenzaAttivita: 'No activity recorded on this day: everything at zero.',
    sezioneSetting: 'Setting',
    sezioneSettingNota: 'From the setters’ daily report. The calls booked from inbound and outbound come from the calls booked in the app.',
    sezioneClosing: 'Closing',
    sezioneClosingNota: 'From the calls recorded in the app, on the day of the call. Cash and revenue: the new clients, on the day of the sale.',
    rapportiGiorno: 'Ratios of the day',
    voci: {
      dm_outbound: 'Outbound DMs',
      dm_inbound: 'Inbound DMs',
      follow_up: 'DM follow ups',
      dm_totali: 'Total DMs',
      conversazioni: 'Conversations',
      call_proposte: 'Calls pitched',
      call_prenotate: 'Calls booked',
      prenotate_inbound: 'Booked in the app from inbound',
      prenotate_outbound: 'Booked in the app from outbound',
      call_svolte: 'Calls held',
      qualificate: 'Qualified calls',
      no_show: 'No shows',
      call_follow_up: 'Calls ending in a follow up',
      cancellate: 'Cancelled calls',
      in_attesa: 'Waiting for confirmation',
      chiuse: 'Calls closed',
      cash: 'Cash (first instalment of new clients)',
      revenue: 'Revenue from new clients',
    },
    showRateEtichetta: 'Show rate',
    closeRateEtichetta: 'Close rate',
    tabellaTitolo: 'The month like the sheet',
    tabellaDescrizione: 'One day per row, setting on the left and closing on the right, the total at the bottom.',
    tabellaGiorno: 'Day',
    tabellaTotale: 'Month total',
    colonne: {
      dm_outbound: 'Outbound',
      dm_inbound: 'Inbound',
      follow_up: 'Follow up',
      dm_totali: 'Total DMs',
      conversazioni: 'Conv.',
      call_proposte: 'Pitched',
      call_prenotate: 'Booked',
      prenotate_inbound: 'From inbound',
      prenotate_outbound: 'From outbound',
      call_svolte: 'Held',
      qualificate: 'Qualified',
      no_show: 'No show',
      call_follow_up: 'Follow up',
      cancellate: 'Cancelled',
      in_attesa: 'Waiting',
      chiuse: 'Closed',
      cash: 'Cash 1st inst.',
      revenue: 'Revenue',
    },
    notaCash:
      'The cash of a day is the first instalment of the new clients, on the day of the sale, as on the Closer page. The cash at the top counts every payment of the month on the new sales of the month.',
    riepilogoTitolo: 'Month summary',
    riepilogoDescrizione: 'The ratios of the sheet, with the app’s definitions. Under each number, the month before.',
    gruppi: { setting: 'Setting', closing: 'Closing', soldi: 'Money' },
    mesePrima: (mese: string, valore: string) => `${mese}: ${valore}`,
    riepilogo: {
      tasso_conversazione: {
        etichetta: 'DMs → conversations',
        spiegazione: 'Conversations over the total DMs of the month (conversation rate).',
      },
      tasso_prenotazione: {
        etichetta: 'Calls pitched → booked',
        spiegazione: 'Calls booked over calls pitched in the DMs (booking rate), from the setters’ report.',
      },
      tasso_dm_qualificate: {
        etichetta: 'DMs → qualified calls',
        spiegazione: 'Calls held and qualified over the total DMs of the month.',
      },
      dm_per_call: {
        etichetta: 'DMs per call booked',
        spiegazione: 'How many DMs a booked call takes: total DMs divided by calls booked.',
      },
      show_rate: {
        etichetta: 'Show rate',
        spiegazione: 'Calls held over held plus no-shows. Cancelled and waiting for confirmation excluded.',
      },
      tasso_qualificazione: { etichetta: 'Qualification rate', spiegazione: 'Qualified calls over calls held.' },
      close_rate: { etichetta: 'Close rate', spiegazione: 'Calls closed over calls held.' },
      close_rate_qualificate: {
        etichetta: 'Close rate on qualified',
        spiegazione: 'Calls closed over calls held and qualified.',
      },
      chiuse: { etichetta: 'Calls closed', spiegazione: 'The calls held that closed with a sale.' },
      cash_nuovi_clienti: {
        etichetta: 'Cash from new clients',
        spiegazione:
          'Payments of the month on the sales to new clients signed in the month. Instalments of earlier clients, renewals and upsells excluded.',
      },
      revenue_nuovi: {
        etichetta: 'Revenue from new clients',
        spiegazione: 'The value of the contracts signed in the month by new clients.',
      },
      cash_per_dm: { etichetta: 'Cash per DM', spiegazione: 'The cash from new clients divided by the total DMs.' },
      revenue_per_dm: {
        etichetta: 'Revenue per DM',
        spiegazione: 'The revenue from new clients divided by the total DMs.',
      },
      cash_per_call_svolta: {
        etichetta: 'Cash per call held',
        spiegazione: 'The cash from new clients divided by the calls held.',
      },
      valore_medio_nuovo: {
        etichetta: 'Average value of a new client',
        spiegazione:
          'The revenue from new clients divided by the sales to new clients of the month: the average value of a new contract (average deal value).',
      },
      cash_medio_chiusura: {
        etichetta: 'Average cash per close',
        spiegazione: 'The cash from new clients divided by the calls closed (average order value).',
      },
    },
  },
)
