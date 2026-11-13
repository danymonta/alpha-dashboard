import { describe, expect, it } from 'vitest'

import {
  handleConfrontabile,
  nomeConfrontabile,
  prenotateDaAggiungere,
  type CallDelGestionale,
} from '@/lib/calendario/confronto'
import {
  eventiDaIcal,
  handleDaRisposta,
  istanteDa,
  nomeDaTitolo,
  prenotazioniDaIcal,
  type PrenotazioneCalendario,
} from '@/lib/calendario/ical'

// Inventato: la forma degli eventi di Calendly nel calendario «Dany Discovery Call» (mai dati veri)
function evento(campi: Record<string, string>): string {
  return ['BEGIN:VEVENT', ...Object.entries(campi).map(([k, v]) => `${k}:${v}`), 'END:VEVENT'].join('\r\n')
}

const DESCRIZIONE =
  'Quanti anni hai?: 27\\n\\nNome su Instagram? (dove essere ricontat\r\n tato): Mario_Prova_\\n\\nHai almeno 150-300€ al mese da investire nella tua salute?: Sì\\, sono disposto'

const FILE = [
  'BEGIN:VCALENDAR',
  evento({
    'DTSTART;TZID=Europe/Rome': '20261120T183000',
    CREATED: '20261110T101500Z',
    UID: 'uno@calendly.com',
    SUMMARY: 'Mario Prova and Daniele Montagnolo',
    DESCRIPTION: DESCRIZIONE,
  }),
  evento({
    DTSTART: '20261121T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'due@calendly.com',
    SUMMARY: 'Samuele and Daniele Montagnolo',
    DESCRIPTION: 'Nome su Instagram? (dove essere ricontattato): non ce l\'ho\\nQuanti anni hai?: 31',
  }),
  evento({
    DTSTART: '20261122T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'tre@calendly.com',
    SUMMARY: 'Antonio Di Prova & Dany Discovery Call',
    DESCRIPTION: 'Nome su Instagram? (dove essere ricontattato): https://www.instagram.com/antonio.prova/?hl=it',
  }),
  evento({
    DTSTART: '20261123T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'quattro@calendly.com',
    SUMMARY: 'Canceled: Luca Prova and Daniele Montagnolo',
  }),
  evento({
    DTSTART: '20261124T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'cinque@google.com',
    SUMMARY: 'Giuseppe & Dany | ONBOARDING',
  }),
  evento({
    DTSTART: '20261125T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'sei@google.com',
    SUMMARY: 'Check settimanale',
    RRULE: 'FREQ=WEEKLY',
  }),
  evento({
    DTSTART: '20261126T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'sette@google.com',
    SUMMARY: 'Pietro Prova & Dany - follow-up',
  }),
  // lo stesso UID due volte: una prenotazione sola
  evento({
    DTSTART: '20261121T170000Z',
    CREATED: '20261110T101500Z',
    UID: 'due@calendly.com',
    SUMMARY: 'Samuele and Daniele Montagnolo',
  }),
  'END:VCALENDAR',
].join('\r\n')

describe('le prenotazioni del calendario con nome e Instagram', () => {
  const prenotazioni = prenotazioniDaIcal(FILE)

  it('solo le call di vendita non cancellate, una per UID, mai una serie ricorrente', () => {
    expect(prenotazioni.map((p) => p.uid)).toEqual(['uno@calendly.com', 'due@calendly.com', 'tre@calendly.com'])
  })

  it('nome dal titolo, Instagram dalla risposta, età e budget come i conteggi', () => {
    expect(prenotazioni[0]).toEqual({
      uid: 'uno@calendly.com',
      inizio: '2026-11-20T18:30:00',
      tz: 'Europe/Rome',
      nome: 'Mario Prova',
      handle: 'mario_prova_',
      eta: 27,
      budget_si: true,
    })
    expect(prenotazioni[1]).toMatchObject({ nome: 'Samuele', handle: null, eta: 31, budget_si: null })
    expect(prenotazioni[2]).toMatchObject({ nome: 'Antonio Di Prova', handle: 'antonio.prova' })
  })

  it('eventiDaIcal resta senza nomi né Instagram', () => {
    const tutto = JSON.stringify(eventiDaIcal(FILE))
    for (const parola of ['Mario', 'mario_prova', 'Samuele', 'Antonio', 'antonio.prova']) expect(tutto).not.toContain(parola)
  })

  it('i titoli di Calendly perdono la parte di Dany; un titolo diverso resta intero', () => {
    expect(nomeDaTitolo('Francesco Prova and Daniele Montagnolo')).toBe('Francesco Prova')
    expect(nomeDaTitolo('Samuel and Daniele Montagnolo')).toBe('Samuel')
    expect(nomeDaTitolo('Antonio Di Bella & Dany Discovery Call')).toBe('Antonio Di Bella')
    expect(nomeDaTitolo('Luigi Prova & Dany - Discovery Call')).toBe('Luigi Prova')
    expect(nomeDaTitolo('Luigi Prova and Dany')).toBe('Luigi Prova')
    expect(nomeDaTitolo('Daniele Montagnolo')).toBe('Daniele Montagnolo')
    expect(nomeDaTitolo('Call con Marco')).toBe('Call con Marco')
    expect(nomeDaTitolo('Danilo Prova')).toBe('Danilo Prova')
    expect(nomeDaTitolo('  ')).toBeNull()
    expect(nomeDaTitolo('x'.repeat(200))).toHaveLength(120)
  })

  it('Instagram: minuscolo, senza @ né indirizzo; una risposta che non è un handle non vale', () => {
    expect(handleDaRisposta('Chicco_codenotti_')).toBe('chicco_codenotti_')
    expect(handleDaRisposta('@mario.prova')).toBe('mario.prova')
    expect(handleDaRisposta('instagram.com/mario.prova/')).toBe('mario.prova')
    expect(handleDaRisposta('mario prova')).toBeNull()
    expect(handleDaRisposta('a'.repeat(31))).toBeNull()
    expect(handleDaRisposta(null)).toBeNull()
  })

  it('l’istante come lo legge il database, cambi d’ora compresi', () => {
    expect(istanteDa('2026-11-20T18:30:00', 'Europe/Rome')).toBe('2026-11-20T17:30:00.000Z')
    expect(istanteDa('2026-07-20T18:30:00', 'Europe/Rome')).toBe('2026-07-20T16:30:00.000Z')
    expect(istanteDa('2026-11-21T17:00:00', 'UTC')).toBe('2026-11-21T17:00:00.000Z')
    expect(istanteDa('2026-11-20T09:00:00', 'America/New_York')).toBe('2026-11-20T14:00:00.000Z')
    expect(istanteDa('2026-11-20T09:00:00', 'Fuso/Inventato')).toBe('2026-11-20T09:00:00.000Z')
    expect(istanteDa('20261120', 'UTC')).toBeNull()
  })
})

describe('le prenotazioni che nel gestionale non ci sono', () => {
  const adesso = Date.parse('2026-11-13T10:00:00Z')
  const p = (campi: Partial<PrenotazioneCalendario> & { uid: string; inizio: string }): PrenotazioneCalendario => ({
    tz: 'Europe/Rome',
    nome: null,
    handle: null,
    eta: null,
    budget_si: null,
    ...campi,
  })
  const call = (campi: Partial<CallDelGestionale> & { programmata_il: string }): CallDelGestionale => ({
    nome: null,
    instagram_handle: null,
    ...campi,
  })

  it('una call entro 15 minuti dallo stesso istante la copre; oltre no', () => {
    const prenotazioni = [p({ uid: 'a', inizio: '2026-11-20T18:30:00', nome: 'Mario Prova' })]
    expect(prenotateDaAggiungere(prenotazioni, [call({ programmata_il: '2026-11-20T17:40:00Z' })], adesso)).toEqual([])
    expect(prenotateDaAggiungere(prenotazioni, [call({ programmata_il: '2026-11-20T17:50:00Z' })], adesso)).toHaveLength(1)
  })

  it('lo stesso Instagram o lo stesso nome in un altro giorno la coprono', () => {
    const prenotazioni = [p({ uid: 'a', inizio: '2026-11-20T18:30:00', nome: 'Niccolò  Prova', handle: 'mario_prova' })]
    expect(
      prenotateDaAggiungere(prenotazioni, [call({ programmata_il: '2026-11-25T10:00:00Z', instagram_handle: '@Mario_Prova' })], adesso),
    ).toEqual([])
    expect(
      prenotateDaAggiungere(prenotazioni, [call({ programmata_il: '2026-11-25T10:00:00Z', nome: 'niccolo prova' })], adesso),
    ).toEqual([])
    expect(
      prenotateDaAggiungere(prenotazioni, [call({ programmata_il: '2026-11-25T10:00:00Z', nome: 'Niccolò Rossi' })], adesso),
    ).toHaveLength(1)
  })

  it('solo da adesso a 30 giorni, in ordine, con giorno e ora di Roma', () => {
    const prenotazioni = [
      p({ uid: 'passata', inizio: '2026-11-13T10:30:00' }),
      p({ uid: 'dopo', inizio: '2026-11-22T09:00:00', nome: 'Secondo' }),
      p({ uid: 'prima', inizio: '2026-11-14T18:00:00', nome: 'Primo', eta: 27, budget_si: false }),
      p({ uid: 'lontana', inizio: '2026-12-20T18:00:00' }),
    ]
    const voci = prenotateDaAggiungere(prenotazioni, [], adesso)
    expect(voci.map((v) => v.uid)).toEqual(['prima', 'dopo'])
    expect(voci[0]).toEqual({
      uid: 'prima',
      istante: '2026-11-14T17:00:00.000Z',
      giorno: '2026-11-14',
      ora: '18:00',
      nome: 'Primo',
      handle: null,
      eta: 27,
      budget_si: false,
    })
  })

  it('nomi e Instagram si confrontano senza accenti, maiuscole, @ e spazi in più', () => {
    expect(nomeConfrontabile('  Niccolò   DI  Prova ')).toBe('niccolo di prova')
    expect(nomeConfrontabile('')).toBeNull()
    expect(handleConfrontabile('@@Mario.Prova')).toBe('mario.prova')
    expect(handleConfrontabile(null)).toBeNull()
  })
})
