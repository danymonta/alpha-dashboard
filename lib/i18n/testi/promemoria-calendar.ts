import { PROMEMORIA_CALENDAR } from '@/lib/call/promemoria-calendar'
import { bilingue } from '@/lib/i18n/lingua'

/**
 * «Promemoria su Calendar» (1.67.0): the Italian side is lib/call/promemoria-calendar.ts,
 * so a word is still changed there. The event's title and note follow the page's language:
 * they are prefilled, and the person edits them before saving.
 */
export const PROMEMORIA_CALENDAR_TESTI = bilingue(PROMEMORIA_CALENDAR, {
  bottone: 'Calendar reminder',
  nomeBottone: (lead: string) => `Calendar reminder to follow up with ${lead}`,
  titoloFoglio: (lead: string) => `Reminder to follow up with ${lead}`,
  descrizioneDiretto: 'A 15-minute event in the Follow up calendar, on the day you pick: Google reminds you.',
  descrizioneModello: 'Google Calendar opens with the event already written, 15 minutes long: check it and save.',
  quando: 'When to follow up',
  scorciatoie: {
    domani: 'Tomorrow',
    tre: 'In 3 days',
    settimana: 'In a week',
    mese: 'In a month',
  },
  giorno: 'Day',
  ora: 'Time',
  titolo: 'Title',
  nota: 'Note',
  notaAiuto: 'You find it in the event. No amounts: the note lives in your calendar.',
  titoloEvento: (lead: string) => `Follow up with ${lead}`,
  righe: {
    della: (data: string) => `Follow-up of the call of ${data}.`,
    motivo: 'Reason for not closing',
    registrazione: 'Recording',
    gestionale: 'In the app',
  },
  salva: 'Add to the calendar',
  apri: 'Open Google Calendar',
  oppure: 'Or open Google Calendar with the event already written',
  aperto: 'Google Calendar opens in another tab: check the event and save.',
  fatto: 'Reminder added to the Follow up calendar',
  apriEvento: 'Open',
  pronto: 'Google Calendar is ready: tap «Add to the calendar» again.',
  errori: {
    giorno: 'Pick a day from today on, within a year.',
    ora: 'Pick the reminder’s time.',
    titolo: 'Write the reminder’s title.',
    caricamento: 'I can’t load Google: check the connection and try again.',
    popup_bloccato:
      'The browser blocked Google’s window: try again, and if it happens again allow popup windows for this site.',
    popup_chiuso: 'You closed Google’s window before signing in: try again.',
    accesso_negato: 'Without Google’s permission I can’t write in the calendar: use «Open Google Calendar».',
    non_trovato: 'Google can’t find the Follow up calendar for your account: use «Open Google Calendar».',
    rifiutato: 'Google Calendar did not accept the reminder: use «Open Google Calendar».',
    scaduto: 'The access to Google has expired: tap «Add to the calendar» again.',
    rete: 'Google Calendar is not answering: try again, or use «Open Google Calendar».',
  },
})
