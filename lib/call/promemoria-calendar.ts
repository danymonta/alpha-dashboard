import { aggiungiGiorni, isDataISO, stessoGiornoTraMesi } from '@/lib/date'

/**
 * «Promemoria su Calendar» (Dany, 29/10/2026: «tutti i follow up da inviare mi
 * devi aggiungere a calendar una nota di risentire tizio… tra i miei calendari
 * ne ho uno che si chiama proprio follow-up»). On a held call that ended in
 * follow-up by chat (no follow-up call booked), the call's closer and the admin
 * put a 15-minute «Risentire …» event in Google Calendar: straight into the
 * «Follow up» calendar when it is configured (lib/google/calendar.ts), otherwise
 * through Google's own «new event» page, already filled in. Nothing is saved in
 * our database: the reminder is the person's, in the person's calendar.
 *
 * The words and the pure parts live here (the event's text, its times, the
 * prefilled link, the API's body); the English side is in
 * lib/i18n/testi/promemoria-calendar.ts.
 */
export const PROMEMORIA_CALENDAR = {
  bottone: 'Promemoria su Calendar',
  /** Starts with the visible words (WCAG 2.5.3). */
  nomeBottone: (lead: string) => `Promemoria su Calendar per risentire ${lead}`,
  titoloFoglio: (lead: string) => `Promemoria per risentire ${lead}`,
  descrizioneDiretto: 'Un evento di 15 minuti nel calendario Follow up, nel giorno che scegli: Google te lo ricorda.',
  descrizioneModello: 'Si apre Google Calendar con l’evento già scritto, di 15 minuti: controllalo e salva.',
  quando: 'Quando risentirlo',
  scorciatoie: {
    domani: 'Domani',
    tre: 'Tra 3 giorni',
    settimana: 'Tra una settimana',
    mese: 'Tra un mese',
  },
  giorno: 'Giorno',
  ora: 'Ora',
  titolo: 'Titolo',
  nota: 'Nota',
  notaAiuto: 'La trovi nell’evento. Niente importi: la nota sta nel tuo calendario.',
  /** The event's title. */
  titoloEvento: (lead: string) => `Risentire ${lead}`,
  /** The lines of the event's note. */
  righe: {
    della: (data: string) => `Follow-up della call del ${data}.`,
    motivo: 'Motivo di non chiusura',
    registrazione: 'Registrazione',
    gestionale: 'Nel gestionale',
  },
  salva: 'Aggiungi al calendario',
  apri: 'Apri Google Calendar',
  oppure: 'Oppure apri Google Calendar con l’evento già scritto',
  aperto: 'Google Calendar si apre in un’altra scheda: controlla l’evento e salva.',
  fatto: 'Promemoria aggiunto al calendario Follow up',
  apriEvento: 'Apri',
  /** Not an error: Google's library was still loading at the tap, the next tap opens its window. */
  pronto: 'Google Calendar è pronto: tocca di nuovo «Aggiungi al calendario».',
  errori: {
    giorno: 'Scegli un giorno da oggi in avanti, entro un anno.',
    ora: 'Scegli l’ora del promemoria.',
    titolo: 'Scrivi il titolo del promemoria.',
    caricamento: 'Non riesco a caricare Google: controlla la connessione e riprova.',
    popup_bloccato:
      'Il browser ha bloccato la finestra di Google: riprova, e se succede di nuovo consenti le finestre popup per questo sito.',
    popup_chiuso: 'Hai chiuso la finestra di Google prima di collegarti: riprova.',
    accesso_negato: 'Senza il permesso di Google non posso scrivere nel calendario: usa «Apri Google Calendar».',
    non_trovato: 'Google non trova il calendario Follow up per il tuo account: usa «Apri Google Calendar».',
    rifiutato: 'Google Calendar non ha accettato il promemoria: usa «Apri Google Calendar».',
    scaduto: 'L’accesso a Google è scaduto: tocca di nuovo «Aggiungi al calendario».',
    rete: 'Google Calendar non risponde: riprova, o usa «Apri Google Calendar».',
  },
} as const

/** Why the direct insert did not happen: the component turns it into words. */
export type CodiceErroreCalendar = keyof Omit<(typeof PROMEMORIA_CALENDAR)['errori'], 'giorno' | 'ora' | 'titolo'>

/** The errors after which Google's prefilled page is the way: Google refused, not the person or the network. */
export const ERRORI_CON_RIPIEGO: readonly CodiceErroreCalendar[] = ['accesso_negato', 'non_trovato', 'rifiutato']

export const DURATA_PROMEMORIA_MINUTI = 15
export const ORA_PROMEMORIA = '10:00'
/** The note's length: Google's prefilled link stays well inside what every browser opens. */
export const MASSIMO_DESCRIZIONE = 1500
export const MASSIMO_TITOLO = 200
export const GIORNI_AVANTI_PROMEMORIA = 366
export const FUSO_PROMEMORIA = 'Europe/Rome'

export type ChiaveScorciatoia = keyof (typeof PROMEMORIA_CALENDAR)['scorciatoie']

/** Domani, tra 3 giorni, tra una settimana, tra un mese (the same day of next month, clamped to its end). */
export function scorciatoiePromemoria(oggi: string): { chiave: ChiaveScorciatoia; valore: string }[] {
  return [
    { chiave: 'domani', valore: aggiungiGiorni(oggi, 1) },
    { chiave: 'tre', valore: aggiungiGiorni(oggi, 3) },
    { chiave: 'settimana', valore: aggiungiGiorni(oggi, 7) },
    { chiave: 'mese', valore: stessoGiornoTraMesi(oggi, 1) },
  ]
}

const ORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * The end of the event, in wall-clock time of Rome: the event carries its time
 * zone (ctz, timeZone), so Google places both ends on the right instant, also on
 * the night of the change of hour. 23:50 + 15 minutes is 00:05 of the next day.
 */
export function fineEvento(data: string, ora: string, minuti: number = DURATA_PROMEMORIA_MINUTI): { data: string; ora: string } {
  const m = ORA.exec(ora)
  if (!m) throw new Error('ora non valida')
  const totale = Number(m[1]) * 60 + Number(m[2]) + minuti
  const giorni = Math.floor(totale / 1440)
  const resto = totale - giorni * 1440
  return {
    data: aggiungiGiorni(data, giorni),
    ora: `${String(Math.floor(resto / 60)).padStart(2, '0')}:${String(resto % 60).padStart(2, '0')}`,
  }
}

/** «20261030T100000»: the form of Google's prefilled link, local to ctz. */
export function compattoCalendar(data: string, ora: string): string {
  return `${data.replaceAll('-', '')}T${ora.replace(':', '')}00`
}

type RighePromemoria = {
  della: (data: string) => string
  motivo: string
  registrazione: string
  gestionale: string
}

/**
 * The event's note, prefilled and editable: the call's day, the reason for not
 * closing (it already never holds an amount, lib/validation/esito.ts), the
 * Fathom link when the call has one, and where the call is in the app.
 */
export function descrizionePromemoria(
  dati: { giornoCall: string; motivo: string | null; linkFathom: string | null; linkCall: string },
  righe: RighePromemoria,
): string {
  const [, mese, giorno] = dati.giornoCall.split('-')
  const linee = [righe.della(`${giorno}/${mese}`)]
  const motivo = dati.motivo?.trim()
  if (motivo) linee.push(`${righe.motivo}: ${motivo}`)
  if (dati.linkFathom && /^https:\/\//.test(dati.linkFathom)) linee.push(`${righe.registrazione}: ${dati.linkFathom}`)
  linee.push(`${righe.gestionale}: ${dati.linkCall}`)
  return tagliaTesto(linee.join('\n'), MASSIMO_DESCRIZIONE)
}

/** At most `massimo` characters (code points, never half an emoji), with «…» when cut. */
export function tagliaTesto(testo: string, massimo: number): string {
  const caratteri = Array.from(testo)
  return caratteri.length <= massimo ? testo : `${caratteri.slice(0, massimo - 1).join('')}…`
}

export type EventoPromemoria = { titolo: string; descrizione: string; data: string; ora: string }

/** What is wrong with the sheet, or null: the day from today to a year ahead, a time, a title. */
export function erroreEvento(
  evento: EventoPromemoria,
  oggi: string,
): 'giorno' | 'ora' | 'titolo' | null {
  if (!isDataISO(evento.data) || evento.data < oggi || evento.data > aggiungiGiorni(oggi, GIORNI_AVANTI_PROMEMORIA)) {
    return 'giorno'
  }
  if (!ORA.test(evento.ora)) return 'ora'
  if (!evento.titolo.trim()) return 'titolo'
  return null
}

function pulito(evento: EventoPromemoria): EventoPromemoria {
  return {
    ...evento,
    titolo: tagliaTesto(evento.titolo.trim(), MASSIMO_TITOLO),
    descrizione: tagliaTesto(evento.descrizione.trim(), MASSIMO_DESCRIZIONE),
  }
}

/**
 * Google Calendar's own «new event» page, filled in: works for everybody with
 * no setup. `src` adds the «Follow up» calendar to the page when it is known.
 * The dates' slash stays as it is; every other value is encoded.
 */
export function linkModelloCalendar(evento: EventoPromemoria, calendarioId: string | null = null): string {
  const e = pulito(evento)
  const fine = fineEvento(e.data, e.ora)
  const parti = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(e.titolo)}`,
    `dates=${compattoCalendar(e.data, e.ora)}/${compattoCalendar(fine.data, fine.ora)}`,
    `ctz=${encodeURIComponent(FUSO_PROMEMORIA)}`,
  ]
  if (e.descrizione) parti.push(`details=${encodeURIComponent(e.descrizione)}`)
  if (calendarioId) parti.push(`src=${encodeURIComponent(calendarioId)}`)
  return `https://calendar.google.com/calendar/render?${parti.join('&')}`
}

/** The body of events.insert: wall-clock times with their zone, «free» (a reminder never blocks the agenda). */
export function corpoEvento(evento: EventoPromemoria) {
  const e = pulito(evento)
  const fine = fineEvento(e.data, e.ora)
  return {
    summary: e.titolo,
    description: e.descrizione,
    start: { dateTime: `${e.data}T${e.ora}:00`, timeZone: FUSO_PROMEMORIA },
    end: { dateTime: `${fine.data}T${fine.ora}:00`, timeZone: FUSO_PROMEMORIA },
    transparency: 'transparent',
    reminders: { useDefault: true },
  }
}

/** The insert's address, the calendar's id encoded. */
export function indirizzoInserimento(calendarioId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarioId)}/events`
}

/** What Google answered, as the person reads it. */
export function codiceRispostaCalendar(stato: number): CodiceErroreCalendar {
  if (stato === 401) return 'scaduto'
  if (stato === 404) return 'non_trovato'
  if (stato >= 500) return 'rete'
  return 'rifiutato'
}

/** The event's own page, only when it leads to Google Calendar: never another address from a response. */
export function linkEventoSicuro(link: unknown): string | null {
  if (typeof link !== 'string') return null
  try {
    const u = new URL(link)
    return u.protocol === 'https:' && (u.hostname === 'www.google.com' || u.hostname === 'calendar.google.com') ? u.toString() : null
  } catch {
    return null
  }
}
