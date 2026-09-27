import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import {
  formatCronometro,
  formatDurata,
  formatDurataInput,
  intestazioneGiorno,
  lunediDi,
  perGiorno,
  periodoTempo,
} from '@/lib/tempo'
import { modificaNotaSchema, notaSchema } from '@/lib/validation/note'
import {
  avviaTimerSchema,
  fermaTimerSchema,
  modificaTempoSchema,
  parseDurata,
  tempoManualeSchema,
} from '@/lib/validation/tempo'

const PROGETTO = '0b6d2c1e-7d3a-4f7e-9a51-3c1d2b4e5f60'
const TASK = '1c7e3d2f-8e4b-4a8f-8b62-4d2e3c5f6a71'
const oggi = oggiRoma()

/** The client sends the schema's output; the server parses it again with the same schema. */
function rilegge(schema: ZodTypeAny, input: unknown) {
  const primo = schema.parse(input)
  expect(schema.parse(primo)).toEqual(primo)
  return primo
}

function errore(schema: ZodTypeAny, input: unknown) {
  const esito = schema.safeParse(input)
  expect(esito.success).toBe(false)
  return esito.success ? '' : esito.error.issues[0].message
}

describe('durata scritta a mano', () => {
  it.each([
    ['1:30', 90],
    ['0:45', 45],
    ['90', 90],
    ['1h30', 90],
    ['1h 30m', 90],
    ['1h30min', 90],
    ['2h', 120],
    ['2 ore', 120],
    ['45m', 45],
    ['45 min', 45],
    ['1,5h', 90],
    ['1.5 ore', 90],
    [' 1H30 ', 90],
    [75, 75],
  ])('%s → %i minuti', (input, minuti) => {
    expect(parseDurata(input)).toBe(minuti)
  })

  it.each(['', 'un’ora', '1:75', '1h75', '1:3', '-30', '1.5'])('"%s" non si legge', (input) => {
    expect(parseDurata(input)).toBeNull()
  })

  it('formatDurataInput si rilegge uguale', () => {
    for (const minuti of [1, 45, 60, 90, 125, 1440]) {
      expect(parseDurata(formatDurataInput(minuti))).toBe(minuti)
    }
  })
})

describe('tempo caricato dopo', () => {
  const base = { progetto_id: PROGETTO, task_id: '', data: oggi, durata: '1:30', nota: '  ' }

  it('trasforma la durata in minuti, svuota task e nota, e rilegge il proprio output', () => {
    expect(rilegge(tempoManualeSchema, base)).toEqual({
      progetto_id: PROGETTO,
      task_id: null,
      data: oggi,
      durata: 90,
      nota: null,
    })
    expect(rilegge(tempoManualeSchema, { ...base, task_id: TASK, durata: '2h', nota: ' montaggio ' })).toMatchObject({
      task_id: TASK,
      durata: 120,
      nota: 'montaggio',
    })
  })

  it('il futuro non esiste, il passato sì', () => {
    expect(errore(tempoManualeSchema, { ...base, data: aggiungiGiorni(oggi, 1) })).toMatch(/oggi o per un giorno passato/)
    expect(rilegge(tempoManualeSchema, { ...base, data: aggiungiGiorni(oggi, -40) }).data).toBe(aggiungiGiorni(oggi, -40))
  })

  it('la durata va da un minuto a 24 ore', () => {
    expect(errore(tempoManualeSchema, { ...base, durata: '0' })).toMatch(/almeno un minuto/)
    expect(errore(tempoManualeSchema, { ...base, durata: '25h' })).toMatch(/24 ore/)
    expect(errore(tempoManualeSchema, { ...base, durata: 'tanto' })).toMatch(/1:30/)
  })

  it('senza progetto non si salva', () => {
    expect(errore(tempoManualeSchema, { ...base, progetto_id: '' })).toBe('Scegli il progetto')
  })

  it('la modifica vuole anche la voce', () => {
    expect(rilegge(modificaTempoSchema, { ...base, id: TASK }).id).toBe(TASK)
    expect(errore(modificaTempoSchema, base)).toBeTruthy()
  })
})

describe('timer', () => {
  it('avvio: progetto obbligatorio, task e nota facoltativi', () => {
    expect(rilegge(avviaTimerSchema, { progetto_id: PROGETTO, task_id: '', nota: '' })).toEqual({
      progetto_id: PROGETTO,
      task_id: null,
      nota: null,
    })
    expect(errore(avviaTimerSchema, { progetto_id: 'x' })).toBe('Scegli il progetto')
  })

  it('stop con o senza nota', () => {
    expect(rilegge(fermaTimerSchema, {})).toEqual({ nota: null })
    expect(rilegge(fermaTimerSchema, { nota: ' fatto ' })).toEqual({ nota: 'fatto' })
  })
})

describe('note del progetto', () => {
  it('testo ripulito, data valida, e rilegge il proprio output', () => {
    expect(rilegge(notaSchema, { progetto_id: PROGETTO, data: oggi, testo: '  Brief approvato \n' })).toEqual({
      progetto_id: PROGETTO,
      data: oggi,
      testo: 'Brief approvato',
    })
    expect(rilegge(modificaNotaSchema, { id: TASK, data: '2026-09-01', testo: 'ok' }).data).toBe('2026-09-01')
  })

  it('una nota vuota o con una data impossibile non passa', () => {
    expect(errore(notaSchema, { progetto_id: PROGETTO, data: oggi, testo: '   ' })).toBe('Scrivi la nota')
    expect(errore(notaSchema, { progetto_id: PROGETTO, data: '2026-02-30', testo: 'x' })).toBe('Data non valida')
  })
})

describe('formattazione', () => {
  it('durate leggibili', () => {
    expect(formatDurata(0)).toBe('0 min')
    expect(formatDurata(45)).toBe('45 min')
    expect(formatDurata(60)).toBe('1 h')
    expect(formatDurata(90)).toBe('1 h 30 min')
    expect(formatDurata(null)).toBe('–')
  })

  it('cronometro a cifre fisse', () => {
    expect(formatCronometro(0)).toBe('00:00:00')
    expect(formatCronometro(3723)).toBe('01:02:03')
    expect(formatCronometro(-5)).toBe('00:00:00')
    expect(formatCronometro(90_000)).toBe('25:00:00')
  })

  it('intestazioni dei giorni', () => {
    expect(intestazioneGiorno('2026-09-28', '2026-09-28')).toBe('Oggi · 28/09/2026')
    expect(intestazioneGiorno('2026-09-27', '2026-09-28')).toBe('Ieri · 27/09/2026')
    expect(intestazioneGiorno('2026-09-29', '2026-09-28')).toBe('Domani · 29/09/2026')
    expect(intestazioneGiorno('2026-09-22', '2026-09-28')).toBe('martedì 22/09/2026')
  })

  it('raggruppa per giorno, il più recente prima', () => {
    const gruppi = perGiorno([
      { data: '2026-09-20', id: 1 },
      { data: '2026-09-22', id: 2 },
      { data: '2026-09-20', id: 3 },
    ])
    expect(gruppi.map((g) => [g.data, g.righe.map((r) => r.id)])).toEqual([
      ['2026-09-22', [2]],
      ['2026-09-20', [1, 3]],
    ])
  })
})

describe('periodo delle pagine del tempo', () => {
  it('il lunedì della settimana', () => {
    expect(lunediDi('2026-09-28')).toBe('2026-09-28') // lunedì
    expect(lunediDi('2026-09-27')).toBe('2026-09-21') // domenica
    expect(lunediDi('2026-10-01')).toBe('2026-09-28')
    expect(lunediDi('2027-01-01')).toBe('2026-12-28')
  })

  it('di default la settimana corrente, senza settimana successiva', () => {
    const p = periodoTempo({}, '2026-09-30')
    expect(p).toMatchObject({ da: '2026-09-28', a: '2026-10-04', tipo: 'settimana', titolo: 'Questa settimana', corrente: true })
    expect(p.precedente).toBe('2026-09-21')
    expect(p.successivo).toBeNull()
    expect(p.etichetta).toBe('28/09/2026 – 04/10/2026')
  })

  it('una settimana passata si naviga, una futura torna a oggi', () => {
    expect(periodoTempo({ settimana: '2026-09-23' }, '2026-09-30')).toMatchObject({
      da: '2026-09-21',
      titolo: 'Settimana scorsa',
      successivo: '2026-09-28',
    })
    expect(periodoTempo({ settimana: '2026-08-05' }, '2026-09-30').titolo).toBe('Settimana del 03/08/2026')
    expect(periodoTempo({ settimana: '2026-12-01' }, '2026-09-30').da).toBe('2026-09-28')
    expect(periodoTempo({ settimana: 'ieri' }, '2026-09-30').da).toBe('2026-09-28')
  })

  it('un periodo libero vale se ordinato, e non supera un trimestre', () => {
    expect(periodoTempo({ da: '2026-09-01', a: '2026-09-30' }, '2026-09-30')).toMatchObject({
      da: '2026-09-01',
      a: '2026-09-30',
      tipo: 'libero',
      precedente: null,
      successivo: null,
    })
    expect(periodoTempo({ da: '2026-01-01', a: '2026-09-30' }, '2026-09-30').da).toBe('2026-07-01')
    expect(periodoTempo({ da: '2026-09-30', a: '2026-09-01' }, '2026-09-30').tipo).toBe('settimana')
  })
})
