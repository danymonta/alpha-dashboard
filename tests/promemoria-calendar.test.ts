import { describe, expect, it } from 'vitest'

import {
  MASSIMO_DESCRIZIONE,
  PROMEMORIA_CALENDAR,
  codiceRispostaCalendar,
  compattoCalendar,
  corpoEvento,
  descrizionePromemoria,
  erroreEvento,
  fineEvento,
  indirizzoInserimento,
  linkEventoSicuro,
  linkModelloCalendar,
  scorciatoiePromemoria,
  tagliaTesto,
  type EventoPromemoria,
} from '@/lib/call/promemoria-calendar'
import { SCOPE_CALENDAR_EVENTS, configCalendar, inserimentoDiretto } from '@/lib/google/calendar'
import { PROMEMORIA_CALENDAR_TESTI } from '@/lib/i18n/testi/promemoria-calendar'

const ID_FOLLOW_UP = 'abc123def@group.calendar.google.com'

const evento = (altro: Partial<EventoPromemoria> = {}): EventoPromemoria => ({
  titolo: 'Risentire Mario Rossi',
  descrizione: 'Follow-up della call del 29/10.',
  data: '2026-10-31',
  ora: '10:00',
  ...altro,
})

describe('la configurazione del promemoria', () => {
  it('legge il client e il calendario, con o senza NEXT_PUBLIC_', () => {
    expect(configCalendar({ GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', GOOGLE_CALENDAR_FOLLOW_UP: ID_FOLLOW_UP })).toEqual({
      clientId: 'x.apps.googleusercontent.com',
      calendarioId: ID_FOLLOW_UP,
    })
    expect(
      configCalendar({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: ' y ', NEXT_PUBLIC_GOOGLE_CALENDAR_FOLLOW_UP: ` ${ID_FOLLOW_UP} ` }),
    ).toEqual({ clientId: 'y', calendarioId: ID_FOLLOW_UP })
  })

  it('un valore mancante o incollato male è null, e senza tutti e due niente inserimento diretto', () => {
    expect(configCalendar({})).toEqual({ clientId: null, calendarioId: null })
    expect(configCalendar({ GOOGLE_CLIENT_ID: '"x"', GOOGLE_CALENDAR_FOLLOW_UP: 'due parole@x' })).toEqual({
      clientId: null,
      calendarioId: null,
    })
    expect(inserimentoDiretto({ clientId: 'x', calendarioId: null })).toBe(false)
    expect(inserimentoDiretto({ clientId: null, calendarioId: ID_FOLLOW_UP })).toBe(false)
    expect(inserimentoDiretto({ clientId: 'x', calendarioId: ID_FOLLOW_UP })).toBe(true)
    expect(inserimentoDiretto(null)).toBe(false)
  })

  it('chiede solo gli eventi del calendario', () => {
    expect(SCOPE_CALENDAR_EVENTS).toBe('https://www.googleapis.com/auth/calendar.events')
  })
})

describe('i giorni e le ore', () => {
  it('le scorciatoie: domani, tra 3 giorni, tra una settimana, tra un mese', () => {
    expect(scorciatoiePromemoria('2026-10-30').map((s) => s.valore)).toEqual([
      '2026-10-31',
      '2026-11-02',
      '2026-11-06',
      '2026-11-30',
    ])
    // the month clamps to its end, like the instalments
    expect(scorciatoiePromemoria('2027-01-31').at(-1)?.valore).toBe('2027-02-28')
  })

  it('15 minuti dopo, anche a cavallo della mezzanotte e del cambio dell’ora', () => {
    expect(fineEvento('2026-10-31', '10:00')).toEqual({ data: '2026-10-31', ora: '10:15' })
    expect(fineEvento('2026-12-31', '23:50')).toEqual({ data: '2027-01-01', ora: '00:05' })
    // 25/10/2026 and 28/03/2027: the change of hour in Rome; the times stay wall-clock, with ctz
    expect(fineEvento('2026-10-25', '02:50')).toEqual({ data: '2026-10-25', ora: '03:05' })
    expect(fineEvento('2027-03-28', '01:55')).toEqual({ data: '2027-03-28', ora: '02:10' })
    expect(() => fineEvento('2026-10-31', '25:00')).toThrow()
  })

  it('il formato del link di Google', () => {
    expect(compattoCalendar('2026-10-31', '09:05')).toBe('20261031T090500')
  })

  it('un giorno da oggi a un anno, un’ora, un titolo', () => {
    expect(erroreEvento(evento(), '2026-10-30')).toBeNull()
    expect(erroreEvento(evento({ data: '2026-10-30' }), '2026-10-30')).toBeNull()
    expect(erroreEvento(evento({ data: '2026-10-29' }), '2026-10-30')).toBe('giorno')
    expect(erroreEvento(evento({ data: '2027-11-30' }), '2026-10-30')).toBe('giorno')
    expect(erroreEvento(evento({ data: '2026-02-30' }), '2026-01-30')).toBe('giorno')
    expect(erroreEvento(evento({ ora: '' }), '2026-10-30')).toBe('ora')
    expect(erroreEvento(evento({ titolo: '   ' }), '2026-10-30')).toBe('titolo')
  })
})

describe('la nota dell’evento', () => {
  const righe = PROMEMORIA_CALENDAR.righe
  const linkCall = 'https://dashboard.percorsoalpha.com/calls'

  it('il giorno della call, il motivo, la registrazione e dove sta la call', () => {
    expect(
      descrizionePromemoria(
        { giornoCall: '2026-10-29', motivo: ' Deve parlarne con la compagna ', linkFathom: 'https://fathom.video/share/abc', linkCall },
        righe,
      ),
    ).toBe(
      [
        'Follow-up della call del 29/10.',
        'Motivo di non chiusura: Deve parlarne con la compagna',
        'Registrazione: https://fathom.video/share/abc',
        `Nel gestionale: ${linkCall}`,
      ].join('\n'),
    )
  })

  it('senza motivo e senza un link https quelle righe non ci sono', () => {
    expect(descrizionePromemoria({ giornoCall: '2026-10-29', motivo: null, linkFathom: 'fathom.video/x', linkCall }, righe)).toBe(
      `Follow-up della call del 29/10.\nNel gestionale: ${linkCall}`,
    )
  })

  it('in inglese con le parole del dizionario', () => {
    expect(
      descrizionePromemoria({ giornoCall: '2026-10-29', motivo: null, linkFathom: null, linkCall }, PROMEMORIA_CALENDAR_TESTI.en.righe),
    ).toBe(`Follow-up of the call of 29/10.\nIn the app: ${linkCall}`)
  })

  it('al massimo 1.500 caratteri, mai mezzo emoji', () => {
    const lunga = descrizionePromemoria({ giornoCall: '2026-10-29', motivo: 'a'.repeat(3000), linkFathom: null, linkCall }, righe)
    expect(Array.from(lunga)).toHaveLength(MASSIMO_DESCRIZIONE)
    expect(lunga.endsWith('…')).toBe(true)
    const emoji = tagliaTesto('😀'.repeat(10), 5)
    expect(Array.from(emoji)).toEqual(['😀', '😀', '😀', '😀', '…'])
    expect(tagliaTesto('breve', 5)).toBe('breve')
  })
})

describe('il link precompilato di Google Calendar', () => {
  it('titolo, date di 15 minuti, fuso di Roma e nota, codificati', () => {
    const link = linkModelloCalendar(evento({ descrizione: 'Riga 1 & 2\nRiga #3 ?ok' }))
    const u = new URL(link)
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(link).toContain('dates=20261031T100000/20261031T101500')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('text')).toBe('Risentire Mario Rossi')
    expect(u.searchParams.get('ctz')).toBe('Europe/Rome')
    expect(u.searchParams.get('details')).toBe('Riga 1 & 2\nRiga #3 ?ok')
    expect(link).toContain('text=Risentire%20Mario%20Rossi')
    expect(u.searchParams.has('src')).toBe(false)
  })

  it('col calendario Follow up anche src', () => {
    const u = new URL(linkModelloCalendar(evento(), ID_FOLLOW_UP))
    expect(u.searchParams.get('src')).toBe(ID_FOLLOW_UP)
  })

  it('la nota lunga si taglia anche qui', () => {
    const u = new URL(linkModelloCalendar(evento({ descrizione: 'x'.repeat(4000) })))
    expect(Array.from(u.searchParams.get('details') ?? '')).toHaveLength(MASSIMO_DESCRIZIONE)
  })
})

describe('l’evento scritto con le API', () => {
  it('ore col loro fuso, libero, coi promemoria del calendario', () => {
    expect(corpoEvento(evento({ ora: '23:50', titolo: '  Risentire Mario  ' }))).toEqual({
      summary: 'Risentire Mario',
      description: 'Follow-up della call del 29/10.',
      start: { dateTime: '2026-10-31T23:50:00', timeZone: 'Europe/Rome' },
      end: { dateTime: '2026-11-01T00:05:00', timeZone: 'Europe/Rome' },
      transparency: 'transparent',
      reminders: { useDefault: true },
    })
  })

  it('l’indirizzo col calendario codificato', () => {
    expect(indirizzoInserimento(ID_FOLLOW_UP)).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/abc123def%40group.calendar.google.com/events',
    )
  })

  it('le risposte di Google in parole', () => {
    expect(codiceRispostaCalendar(401)).toBe('scaduto')
    expect(codiceRispostaCalendar(404)).toBe('non_trovato')
    expect(codiceRispostaCalendar(403)).toBe('rifiutato')
    expect(codiceRispostaCalendar(400)).toBe('rifiutato')
    expect(codiceRispostaCalendar(503)).toBe('rete')
  })

  it('apre solo la pagina dell’evento su Google Calendar', () => {
    expect(linkEventoSicuro('https://www.google.com/calendar/event?eid=abc')).toBe('https://www.google.com/calendar/event?eid=abc')
    expect(linkEventoSicuro('https://calendar.google.com/calendar/event?eid=abc')).not.toBeNull()
    expect(linkEventoSicuro('https://evil.example/calendar')).toBeNull()
    expect(linkEventoSicuro('javascript:alert(1)')).toBeNull()
    expect(linkEventoSicuro(42)).toBeNull()
  })
})

describe('le parole', () => {
  it('niente trattini lunghi', () => {
    const tutto = JSON.stringify([PROMEMORIA_CALENDAR, PROMEMORIA_CALENDAR_TESTI.en], (_k, v) =>
      typeof v === 'function' ? v('Mario') : v,
    )
    expect(tutto).not.toMatch(/[—–]/)
  })
})
