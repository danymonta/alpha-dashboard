import { describe, expect, it } from 'vitest'

import { budgetDaRisposta, etaDaRisposta, eventiDaIcal } from '@/lib/calendario/ical'

// Inventato: la forma di un evento di Calendly nel calendario «Dany Discovery Call» (mai dati veri)
function evento(campi: Record<string, string>): string {
  return ['BEGIN:VEVENT', ...Object.entries(campi).map(([k, v]) => `${k}:${v}`), 'END:VEVENT'].join('\r\n')
}

const DESCRIZIONE =
  'Event Name\\nConsulenza Gratuita - Percorso Alpha\\n\\nQuanti anni hai?: 34\\n\\nNome su Instagram? (dove essere ricontat\r\n tato): mario_prova\\n\\nQuali sono le tue entrate mensili? (Questa informazione è utile)\\, davvero.: Guadagno €1000 - 2000/mese\\n\\nHai almeno 150-300€ al mese da investire nella tua salute per raggiungere il tuo obiettivo?: Sì\\, sono disposto ad investire per la mia salute'

const FILE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  evento({
    'DTSTART;TZID=Europe/Rome': '20261103T193000',
    'DTEND;TZID=Europe/Rome': '20261103T200000',
    CREATED: '20261028T101500Z',
    UID: 'uno@calendly.com',
    SUMMARY: 'Mario Prova and Daniele Montagnolo',
    DESCRIPTION: DESCRIZIONE,
  }),
  evento({
    DTSTART: '20261105T180000Z',
    CREATED: '20261029T090000Z',
    UID: 'due@calendly.com',
    SUMMARY: 'Canceled: Luca Prova and Daniele Montagnolo',
    DESCRIPTION: 'Quanti anni hai?: 19\\nHai almeno 150-300€ al mese da investire?: No\\, non sono disposto',
  }),
  evento({
    DTSTART: '20261016T130000Z',
    CREATED: '20261015T090000Z',
    UID: 'tre@google.com',
    SUMMARY: 'Giuseppe & Dany | ONBOARDING',
  }),
  evento({
    DTSTART: '20261102T180000Z',
    DTSTAMP: '20261026T090000Z',
    UID: 'quattro@google.com',
    SUMMARY: 'Luigi Prova & Dany - Discovery Call',
    STATUS: 'CANCELLED',
  }),
  evento({ DTSTART: '20261102T180000Z', SUMMARY: 'Senza UID' }),
  'END:VCALENDAR',
].join('\r\n')

describe('il calendario «Dany Discovery Call» (1.76.0)', () => {
  const eventi = eventiDaIcal(FILE)

  it('legge un evento per UID, con le righe ripiegate e il fuso', () => {
    expect(eventi.map((e) => e.uid)).toEqual(['uno@calendly.com', 'due@calendly.com', 'tre@google.com', 'quattro@google.com'])
    expect(eventi[0]).toMatchObject({
      creata_il: '2026-10-28T10:15:00Z',
      inizio: '2026-11-03T19:30:00',
      tz: 'Europe/Rome',
      cancellata: false,
      di_vendita: true,
      eta: 34,
      budget_si: true,
    })
    expect(eventi[1]).toMatchObject({ inizio: '2026-11-05T18:00:00', tz: 'UTC', cancellata: true, eta: 19, budget_si: false })
  })

  it('onboarding e simili non sono call di vendita; STATUS:CANCELLED è cancellata; DTSTAMP se manca CREATED', () => {
    expect(eventi[2]).toMatchObject({ di_vendita: false, eta: null, budget_si: null })
    expect(eventi[3]).toMatchObject({ di_vendita: true, cancellata: true, creata_il: '2026-10-26T09:00:00Z' })
  })

  it('non tiene mai nomi, Instagram, entrate o risposte scritte', () => {
    const tutto = JSON.stringify(eventi)
    for (const parola of ['Mario', 'mario_prova', 'Guadagno', 'Luca', 'Giuseppe', 'Luigi', 'disposto']) {
      expect(tutto).not.toContain(parola)
    }
    expect(Object.keys(eventi[0]).sort()).toEqual(['budget_si', 'cancellata', 'creata_il', 'di_vendita', 'eta', 'inizio', 'tz', 'uid'])
  })

  it('età e budget dalle risposte del modulo', () => {
    expect(etaDaRisposta('45')).toBe(45)
    expect(etaDaRisposta('ho 28 anni')).toBe(28)
    expect(etaDaRisposta('non lo dico')).toBeNull()
    expect(etaDaRisposta('999')).toBeNull()
    expect(budgetDaRisposta('Sì, sono disposto ad investire per la mia salute')).toBe(true)
    expect(budgetDaRisposta('Si, certo')).toBe(true)
    expect(budgetDaRisposta('No, non sono disposto')).toBe(false)
    expect(budgetDaRisposta('Forse')).toBeNull()
    expect(budgetDaRisposta(null)).toBeNull()
  })

  it('un file senza eventi dà un elenco vuoto', () => {
    expect(eventiDaIcal('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toEqual([])
  })
})
