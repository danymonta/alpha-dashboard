import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ZodTypeAny } from 'zod'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { numeroInLettere } from '@/lib/numeri-in-lettere'
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
  fasciaDellaVoce,
  fermaTimerSchema,
  istanteRoma,
  minutiFascia,
  modificaTempoSchema,
  parseDurata,
  parseOra,
  tempoManualeSchema,
  timerSenzaFascia,
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

  // as people say it to Alfire (03/10/2026)
  it.each([
    ['un’ora', 60],
    ["un'ora", 60],
    ['mezz’ora', 30],
    ['un quarto d’ora', 15],
    ['tre quarti d’ora', 45],
    ['1 ora e mezza', 90],
    ['un’ora e mezza', 90],
    ['2 ore e 30', 150],
    ['2 ore e 30 minuti', 150],
    ['1 ora e un quarto', 75],
    // dictation often drops the apostrophe
    ['un ora', 60],
    ['un ora e mezza', 90],
    ['mezzora', 30],
    ['mezz ora', 30],
    ['un quarto d ora', 15],
    // the numbers in letters, as dictation writes them (03/10/2026)
    ['due ore', 120],
    ['Due ore', 120],
    ['venti minuti', 20],
    ['quarantacinque minuti', 45],
    ['ventitré minuti', 23],
    ['trentotto min', 38],
    ['un minuto', 1],
    ['un’ora e venti', 80],
    ['un ora e venti', 80],
    ['due ore e mezza', 150],
    ['tre ore e un quarto', 195],
    ['due ore e quindici minuti', 135],
    ['ventiquattro ore', 1440],
    ['un paio d’ore', 120],
    ['un paio di ore', 120],
    ['una ventina di minuti', 20],
    ['una trentina di minuti', 30],
    ['una quarantina di minuti', 40],
    ['un’oretta', 60],
    ['oretta', 60],
    ['mezz’oretta', 30],
    ['mezza ora', 30],
    ['novanta minuti', 90],
    ['settantacinque minuti', 75],
  ])('a voce: %s → %i minuti', (input, minuti) => {
    expect(parseDurata(input)).toBe(minuti)
  })

  it.each([
    '',
    '1:75',
    '1h75',
    '1:3',
    '-30',
    '1.5',
    '1.30',
    '1,30',
    '1 ora e 75',
    'venti',
    'due ore e sessanta',
    'una ventina',
    'un sacco di minuti',
  ])('"%s" non si legge', (input) => {
    expect(parseDurata(input)).toBeNull()
  })

  it('i numeri in lettere fino a sessanta, gli stessi che Alfire riconosce sul piano gratuito', () => {
    const attesi: [string, number][] = [
      ['un', 1],
      ['una', 1],
      ['uno', 1],
      ['nove', 9],
      ['dieci', 10],
      ['diciannove', 19],
      ['venti', 20],
      ['ventuno', 21],
      ['ventidue', 22],
      ['ventitré', 23],
      ['ventotto', 28],
      ['trenta', 30],
      ['trentatre', 33],
      ['quarantacinque', 45],
      ['cinquantotto', 58],
      ['sessanta', 60],
    ]
    for (const [parola, numero] of attesi) expect(numeroInLettere(parola), parola).toBe(numero)
    for (const parola of ['ventiuno', 'trentaotto', 'cento', 'mezza', '']) expect(numeroInLettere(parola), parola).toBeNull()
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
      dalle: null,
      alle: null,
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

describe('fascia oraria facoltativa (Dalle – Alle)', () => {
  const base = { progetto_id: PROGETTO, task_id: '', data: '2026-09-28', durata: '', nota: '' }

  afterEach(() => {
    vi.useRealTimers()
  })

  /** "Now" in the tests: a fixed instant, so today and the future do not move. */
  function adesso(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
  }

  it('le ore si leggono come le scrive la gente o il campo orario', () => {
    expect(parseOra('9')).toBe('09:00')
    expect(parseOra('9:30')).toBe('09:30')
    expect(parseOra('09.30')).toBe('09:30')
    expect(parseOra('09:30:00')).toBe('09:30')
    expect(parseOra('23:59')).toBe('23:59')
    for (const x of ['', '24:00', '9:60', 'nove', '9:3']) expect(parseOra(x)).toBeNull()
  })

  it('con dalle e alle la durata viene dalla fascia, non da quella scritta', () => {
    adesso('2026-09-29T10:00:00Z')
    const fatto = rilegge(tempoManualeSchema, { ...base, durata: '5h', dalle: '9:00', alle: '10:30' })
    expect(fatto).toMatchObject({ dalle: '09:00', alle: '10:30', durata: 90 })
  })

  it('senza fascia resta la durata scritta', () => {
    adesso('2026-09-29T10:00:00Z')
    expect(rilegge(tempoManualeSchema, { ...base, durata: '1:15', dalle: '', alle: '' })).toMatchObject({
      dalle: null,
      alle: null,
      durata: 75,
    })
    expect(rilegge(tempoManualeSchema, { ...base, durata: '45', dalle: null, alle: undefined }).durata).toBe(45)
  })

  it('solo uno dei due: si chiede l’altro', () => {
    adesso('2026-09-29T10:00:00Z')
    const soloInizio = tempoManualeSchema.safeParse({ ...base, durata: '1:00', dalle: '09:00' })
    expect(soloInizio.success).toBe(false)
    expect(soloInizio.error?.issues[0]).toMatchObject({
      path: ['alle'],
      message: 'Indica sia l’inizio sia la fine, o nessuno dei due',
    })
    const soloFine = tempoManualeSchema.safeParse({ ...base, durata: '1:00', alle: '10:00' })
    expect(soloFine.error?.issues[0].path).toEqual(['dalle'])
    expect(errore(modificaTempoSchema, { ...base, id: TASK, durata: '1:00', alle: '10:00' })).toBe(
      'Indica sia l’inizio sia la fine, o nessuno dei due',
    )
  })

  it('la fine viene dopo l’inizio, e l’ora deve essere un’ora', () => {
    adesso('2026-09-29T10:00:00Z')
    // an end before the start is often a night across midnight: two entries
    expect(errore(tempoManualeSchema, { ...base, dalle: '10:30', alle: '09:00' })).toBe(
      'L’ora di fine deve essere dopo quella di inizio. Se passa la mezzanotte sono due voci: nel giorno dell’inizio 13 h 30 min come durata, senza fascia (dalle 10:30 a mezzanotte), e nel giorno dopo la fascia 00:00–09:00',
    )
    expect(errore(tempoManualeSchema, { ...base, dalle: '10:30', alle: '10:30' })).toBe('L’ora di fine deve essere dopo quella di inizio')
    const oraSbagliata = tempoManualeSchema.safeParse({ ...base, dalle: '25:00', alle: '10:00' })
    expect(oraSbagliata.error?.issues.map((i) => i.message)).toEqual(['Scrivi l’ora come 09:30'])
  })

  it('a cavallo della mezzanotte: quali due voci, senza perdere un minuto (03/10/2026)', () => {
    adesso('2026-09-29T10:00:00Z')
    expect(errore(tempoManualeSchema, { ...base, data: '2026-09-28', dalle: '23:00', alle: '01:00' })).toBe(
      'L’ora di fine deve essere dopo quella di inizio. Se passa la mezzanotte sono due voci: nel giorno dell’inizio 1 h come durata, senza fascia (dalle 23:00 a mezzanotte), e nel giorno dopo la fascia 00:00–01:00',
    )
    expect(errore(tempoManualeSchema, { ...base, data: '2026-09-28', dalle: '22:30', alle: '00:00' })).toBe(
      'L’ora di fine deve essere dopo quella di inizio. Fino a mezzanotte registra 1 h 30 min come durata, senza fascia (dalle 22:30 a mezzanotte)',
    )
    // the day summer time ends has 25 hours: from 01:00 to midnight are 24
    expect(errore(tempoManualeSchema, { ...base, data: '2025-10-26', dalle: '01:00', alle: '00:30' })).toMatch(/nel giorno dell’inizio 24 h come/)
    // 24:00 is no hour of the day: the database keeps a range inside its day
    for (const alle of ['24:00', '24', 'mezzanotte']) {
      const r = tempoManualeSchema.safeParse({ ...base, data: '2026-09-28', dalle: '22:00', alle })
      expect(r.error?.issues.map((i) => i.message), alle).toEqual([
        'La fascia finisce entro le 23:59: fino a mezzanotte scrivi la durata, senza fascia',
      ])
    }
    // midnight as the start is 00:00 of that day: the words say so, not the end's
    for (const dalle of ['24:00', '24', 'mezzanotte', 'Mezzanotte']) {
      const r = tempoManualeSchema.safeParse({ ...base, data: '2026-09-28', dalle, alle: '01:00' })
      expect(r.error?.issues.map((i) => i.message), dalle).toEqual(['Una fascia che parte a mezzanotte comincia alle 00:00: scrivi 00:00'])
    }
  })

  it('una fascia di oggi non finisce nel futuro', () => {
    // 29/09/2026 12:00 in Rome (10:00 UTC, summer time)
    adesso('2026-09-29T10:00:00Z')
    const oggiQui = '2026-09-29'
    expect(errore(tempoManualeSchema, { ...base, data: oggiQui, dalle: '11:00', alle: '12:30' })).toBe('La fascia non può finire nel futuro')
    expect(rilegge(tempoManualeSchema, { ...base, data: oggiQui, dalle: '11:00', alle: '12:00' }).durata).toBe(60)
    // a future day says so on its own, once
    expect(errore(tempoManualeSchema, { ...base, data: '2026-09-30', dalle: '09:00', alle: '10:00' })).toMatch(
      /oggi o per un giorno passato/,
    )
  })

  it('istanti in Europe/Rome, come li costruisce il database', () => {
    expect(istanteRoma('2026-09-28', '09:00').toISOString()).toBe('2026-09-28T07:00:00.000Z')
    expect(istanteRoma('2026-01-15', '09:00').toISOString()).toBe('2026-01-15T08:00:00.000Z')
    // 29/03/2026: 02:00–02:59 does not exist, it counts before the change (as Postgres)
    expect(istanteRoma('2026-03-29', '01:59').toISOString()).toBe('2026-03-29T00:59:00.000Z')
    expect(istanteRoma('2026-03-29', '02:30').toISOString()).toBe('2026-03-29T01:30:00.000Z')
    expect(istanteRoma('2026-03-29', '03:15').toISOString()).toBe('2026-03-29T01:15:00.000Z')
    // 25/10/2026: 02:00–02:59 happens twice, it counts after the change (as Postgres)
    expect(istanteRoma('2026-10-25', '01:59').toISOString()).toBe('2026-10-24T23:59:00.000Z')
    expect(istanteRoma('2026-10-25', '02:30').toISOString()).toBe('2026-10-25T01:30:00.000Z')
    expect(istanteRoma('2026-10-25', '03:00').toISOString()).toBe('2026-10-25T02:00:00.000Z')
  })

  it('nei giorni del cambio d’ora la durata è quella vera', () => {
    expect(minutiFascia('2026-09-28', '09:00', '10:30')).toBe(90)
    expect(minutiFascia('2026-10-25', '00:30', '03:30')).toBe(240)
    expect(minutiFascia('2026-03-29', '01:30', '03:30')).toBe(60)
    expect(minutiFascia('2026-10-25', '00:00', '23:59')).toBe(1499)
    expect(minutiFascia('2026-10-25', '09:00', null)).toBeNull()

    adesso('2026-11-02T10:00:00Z')
    expect(rilegge(tempoManualeSchema, { ...base, data: '2026-10-25', dalle: '01:00', alle: '04:00' }).durata).toBe(240)
    expect(rilegge(tempoManualeSchema, { ...base, data: '2026-03-29', dalle: '01:00', alle: '04:00' }).durata).toBe(120)
    // the day summer time ends has 25 hours: a whole day is more than 24
    expect(errore(tempoManualeSchema, { ...base, data: '2026-10-25', dalle: '00:00', alle: '23:59' })).toBe('Al massimo 24 ore in una voce')
    expect(rilegge(tempoManualeSchema, { ...base, data: '2026-03-29', dalle: '00:00', alle: '23:59' }).durata).toBe(1379)
    // 02:30 does not exist on 29/03: from it to 03:15 goes backwards
    expect(errore(tempoManualeSchema, { ...base, data: '2026-03-29', dalle: '02:30', alle: '03:15' })).toBe(
      'L’ora di fine deve essere dopo quella di inizio',
    )
  })

  it('la fascia di una voce: il timer di un giorno sì, quello a cavallo della mezzanotte no', () => {
    expect(fasciaDellaVoce({ data: '2026-09-28', inizio: '2026-09-28T07:00:40Z', fine: '2026-09-28T08:30:10Z' })).toEqual({
      dalle: '09:00',
      alle: '10:30',
    })
    expect(fasciaDellaVoce({ data: '2026-09-28', inizio: '2026-09-28T21:30:00Z', fine: '2026-09-28T22:30:00Z' })).toBeNull()
    expect(fasciaDellaVoce({ data: '2026-09-28', inizio: null, fine: null })).toBeNull()
    expect(timerSenzaFascia({ data: '2026-09-28', inizio: '2026-09-28T21:30:00Z', fine: '2026-09-28T22:30:00Z' })).toBe(
      '23:30–00:30, a cavallo della mezzanotte',
    )
    expect(timerSenzaFascia({ data: '2026-09-28', inizio: '2026-09-28T07:00:40Z', fine: '2026-09-28T08:30:10Z' })).toBeNull()
    expect(timerSenzaFascia({ data: '2026-09-28', inizio: null, fine: null })).toBeNull()
  })

  it('il timer fermato dentro il suo primo minuto non ha fascia: si corregge la nota senza toglierla', () => {
    // started and stopped within 09:00: 09:00–09:00 is not a range
    const voce = { data: '2026-09-28', inizio: '2026-09-28T07:00:05Z', fine: '2026-09-28T07:00:50Z' }
    expect(fasciaDellaVoce(voce)).toBeNull()
    expect(timerSenzaFascia(voce)).toBe('09:00–09:00, meno di un minuto')

    // the edit sheet's values (ModificaTempo) with only the note changed
    adesso('2026-09-29T10:00:00Z')
    const fascia = fasciaDellaVoce(voce)
    const valori = rilegge(modificaTempoSchema, {
      ...base,
      id: TASK,
      data: voce.data,
      durata: formatDurataInput(1),
      dalle: fascia?.dalle ?? '',
      alle: fascia?.alle ?? '',
      nota: 'Cambio di task',
    })
    expect(valori).toMatchObject({ durata: 1, dalle: null, alle: null, nota: 'Cambio di task' })
  })

  it('nella notte del cambio d’ora la fascia si mostra solo se si ricostruisce uguale', () => {
    // 26/10/2025: 02:10–02:40 of summer time, before the hour repeats: rebuilt it would move one hour
    const primaOra = { data: '2025-10-26', inizio: '2025-10-26T00:10:00Z', fine: '2025-10-26T00:40:00Z' }
    expect(fasciaDellaVoce(primaOra)).toBeNull()
    expect(timerSenzaFascia(primaOra)).toBe('02:10–02:40, nella notte del cambio d’ora')
    // 02:50 summer time → 02:10 winter time: 20 minutes, the end reads before the start
    const indietro = { data: '2025-10-26', inizio: '2025-10-26T00:50:00Z', fine: '2025-10-26T01:10:00Z' }
    expect(fasciaDellaVoce(indietro)).toBeNull()
    expect(timerSenzaFascia(indietro)).toBe('02:50–02:10, nella notte del cambio d’ora')
    // 01:50 summer time → 02:10 winter time: both rebuild, 80 minutes
    const intorno = { data: '2025-10-26', inizio: '2025-10-25T23:50:00Z', fine: '2025-10-26T01:10:00Z' }
    expect(fasciaDellaVoce(intorno)).toEqual({ dalle: '01:50', alle: '02:10' })
    expect(minutiFascia('2025-10-26', '01:50', '02:10')).toBe(80)
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
