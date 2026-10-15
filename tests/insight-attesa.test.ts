import { describe, expect, it } from 'vitest'

import {
  annoDelRecap,
  attesaLead,
  etichettaAttesa,
  etichettaSilenzio,
  ORE_CALDA,
  parseOraRecap,
  ultimoMessaggioDelLead,
} from '@/lib/insight/attesa'
import type { LeadRecap, MessaggioRecap } from '@/lib/insight/recap'

// «aspetta da N ore» as the artifact computes it, with the rule of D8. Every chat is invented.

const ORA = 3_600_000

type Lead = Pick<LeadRecap, 'last_from' | 'stage' | 'last_message_at' | 'messages'>

function lead(campi: Partial<Lead> = {}): Lead {
  return { last_from: 'lead', stage: 'pitch', last_message_at: '', messages: [], ...campi }
}

const msg = (from: 'lead' | 'alpha', time: string): MessaggioRecap => ({ from, time, text: 'ciao', at: '' })

describe('etichettaAttesa: the artifact’s words and rounding', () => {
  it.each([
    [0, 'aspetta da meno di 1 ora'],
    [0.99, 'aspetta da meno di 1 ora'],
    [1, 'aspetta da 1 ora'],
    [1.4, 'aspetta da 1 ora'],
    [1.5, 'aspetta da 2 ore'],
    [5, 'aspetta da 5 ore'],
    [47.4, 'aspetta da 47 ore'],
    // below 48 hours the hours, rounded as the artifact (Math.round): 48 can show
    [47.6, 'aspetta da 48 ore'],
    [48, 'aspetta da 2 giorni'],
    [60, 'aspetta da 3 giorni'],
    [100, 'aspetta da 4 giorni'],
  ])('%s hours: %s', (ore, etichetta) => {
    expect(etichettaAttesa(ore)).toBe(etichetta)
  })
})

describe('parseOraRecap: GG/MM HH:MM in Rome as an instant', () => {
  it('summer and winter time', () => {
    expect(parseOraRecap('08/10 21:27', 2026)?.toISOString()).toBe('2026-10-08T19:27:00.000Z')
    expect(parseOraRecap('30/10 10:00', 2026)?.toISOString()).toBe('2026-10-30T09:00:00.000Z')
    expect(parseOraRecap('15/01 08:05', 2027)?.toISOString()).toBe('2027-01-15T07:05:00.000Z')
  })

  it('the days the time changes (29/03 and 25/10/2026)', () => {
    expect(parseOraRecap('29/03 12:00', 2026)?.toISOString()).toBe('2026-03-29T10:00:00.000Z')
    expect(parseOraRecap('29/03 01:30', 2026)?.toISOString()).toBe('2026-03-29T00:30:00.000Z')
    expect(parseOraRecap('25/10 12:00', 2026)?.toISOString()).toBe('2026-10-25T11:00:00.000Z')
    expect(parseOraRecap('25/10 00:30', 2026)?.toISOString()).toBe('2026-10-24T22:30:00.000Z')
  })

  it('a year written in the text wins', () => {
    expect(parseOraRecap('31/12/2025 23:40', 2026)?.toISOString()).toBe('2025-12-31T22:40:00.000Z')
  })

  it('null for what is not a time', () => {
    expect(parseOraRecap('', 2026)).toBeNull()
    expect(parseOraRecap(null, 2026)).toBeNull()
    expect(parseOraRecap('ieri sera', 2026)).toBeNull()
    expect(parseOraRecap('32/10 10:00', 2026)).toBeNull()
    expect(parseOraRecap('30/02 10:00', 2026)).toBeNull()
    expect(parseOraRecap('10/13 10:00', 2026)).toBeNull()
    expect(parseOraRecap('10/10 24:00', 2026)).toBeNull()
  })
})

describe('attesaLead (D8)', () => {
  const adesso = Date.parse('2026-10-14T17:00:00Z')

  it('from last_message_at, hot from 12 hours', () => {
    const cinque = attesaLead(lead({ last_message_at: '2026-10-14T12:00:00Z' }), adesso, 2026)
    expect(cinque).toEqual({ ore: 5, etichetta: 'aspetta da 5 ore', calda: false })
    const dodici = attesaLead(lead({ last_message_at: '2026-10-14T05:00:00Z' }), adesso, 2026)
    expect(dodici?.calda).toBe(true)
    expect(ORE_CALDA).toBe(12)
  })

  it('without last_message_at, the time of the lead’s last message, read in Rome', () => {
    const l = lead({ messages: [msg('lead', '14/10 16:00'), msg('alpha', '14/10 16:10'), msg('lead', '14/10 17:00')] })
    // 17:00 in Rome is 15:00 UTC: two hours ago
    expect(attesaLead(l, adesso, 2026)?.etichetta).toBe('aspetta da 2 ore')
    expect(ultimoMessaggioDelLead(l, 2026)?.toISOString()).toBe('2026-10-14T15:00:00.000Z')
  })

  it('never when our message is the last (the artifact counted from it when the status said «attende»)', () => {
    expect(attesaLead(lead({ last_from: 'alpha', last_message_at: '2026-10-14T12:00:00Z' }), adesso, 2026)).toBeNull()
  })

  it('never for a lost lead or one who left', () => {
    expect(attesaLead(lead({ stage: 'perso', last_message_at: '2026-10-14T12:00:00Z' }), adesso, 2026)).toBeNull()
    expect(attesaLead(lead({ stage: 'uscita', last_message_at: '2026-10-14T12:00:00Z' }), adesso, 2026)).toBeNull()
  })

  it('null without a time to count from', () => {
    expect(attesaLead(lead(), adesso, 2026)).toBeNull()
    expect(attesaLead(lead({ messages: [msg('lead', 'boh')] }), adesso, 2026)).toBeNull()
  })

  it('a time of 31/12 in the recap of 1 January is the year before, never the future', () => {
    const capodanno = Date.parse('2027-01-01T09:00:00Z')
    const l = lead({ messages: [msg('lead', '31/12 23:00')] })
    expect(attesaLead(l, capodanno, 2027)?.etichetta).toBe('aspetta da 11 ore')
  })

  it('a time a little ahead of the clock is «meno di 1 ora», never negative', () => {
    expect(attesaLead(lead({ last_message_at: '2026-10-14T17:05:00Z' }), adesso, 2026)?.etichetta).toBe(
      'aspetta da meno di 1 ora',
    )
  })

  it('days from 48 hours', () => {
    expect(attesaLead(lead({ last_message_at: new Date(adesso - 72 * ORA).toISOString() }), adesso, 2026)?.etichetta).toBe(
      'aspetta da 3 giorni',
    )
  })
})

describe('etichettaSilenzio and annoDelRecap', () => {
  it('«silenzio da 1 giorno» (the artifact said «1 giorni»)', () => {
    expect(etichettaSilenzio(1)).toBe('silenzio da 1 giorno')
    expect(etichettaSilenzio(5)).toBe('silenzio da 5 giorni')
    expect(etichettaSilenzio(0)).toBeNull()
    expect(etichettaSilenzio(Number.NaN)).toBeNull()
  })

  it('the recap’s year, or the fallback', () => {
    expect(annoDelRecap('2026-10-14', 2030)).toBe(2026)
    expect(annoDelRecap('', 2030)).toBe(2030)
  })
})
