import { describe, expect, it } from 'vitest'

import { dataCsv, importoCsv, righeCsv } from '@/lib/csv'

describe('CSV per la commercialista', () => {
  it('usa il punto e virgola e il BOM, con righe CRLF', () => {
    const csv = righeCsv(['Data', 'Importo'], [['01/09/2026', '1500,00']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toBe('﻿Data;Importo\r\n01/09/2026;1500,00\r\n')
  })

  it('protegge i campi con punto e virgola, virgolette e a capo', () => {
    const csv = righeCsv(['Descrizione'], [['Coach; mese "settembre"'], ['riga\nsu due']])
    expect(csv).toContain('"Coach; mese ""settembre"""')
    expect(csv).toContain('"riga\nsu due"')
  })

  it('scrive gli importi con la virgola decimale e senza separatore delle migliaia', () => {
    expect(importoCsv(1500.5)).toBe('1500,50')
    expect(importoCsv('2400.00')).toBe('2400,00')
    expect(importoCsv(-100)).toBe('-100,00')
    expect(importoCsv(null)).toBe('')
  })

  it('scrive le date all’italiana', () => {
    expect(dataCsv('2026-09-07')).toBe('07/09/2026')
    expect(dataCsv(null)).toBe('')
  })

  it('traduce i booleani', () => {
    expect(righeCsv(['Ricorrente'], [[true], [false]])).toContain('sì\r\nno')
  })
})

describe('regola provvigionale', () => {
  it('trasforma la percentuale scritta a mano nel valore del database', async () => {
    const { regolaSchema } = await import('@/lib/validation/team')
    const base = { profile_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', applica_a: ['nuovo'], valida_dal: '2026-10-01' }
    expect(regolaSchema.parse({ ...base, percentuale: '5' }).percentuale).toBe(5)
    expect(regolaSchema.parse({ ...base, percentuale: '5,5' }).percentuale).toBe(5.5)
    expect(regolaSchema.parse({ ...base, percentuale: '7%' }).percentuale).toBe(7)
    expect(regolaSchema.safeParse({ ...base, percentuale: '80' }).success).toBe(false)
    expect(regolaSchema.safeParse({ ...base, percentuale: '5', applica_a: [] }).success).toBe(false)
  })
})

describe('schemi rilanciati dal server', () => {
  // the client sends its parsed output, the server parses it again: nothing may change
  it('la regola provvigionale resta uguale se riletta (bug: 7% salvato come 0,07%)', async () => {
    const { regolaSchema } = await import('@/lib/validation/team')
    const una = regolaSchema.parse({
      profile_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      percentuale: '7',
      applica_a: ['nuovo'],
      valida_dal: '2026-10-01',
    })
    expect(regolaSchema.parse(una)).toEqual(una)
  })

  it('anche vendita, costo e pagamento provvigione restano uguali se riletti', async () => {
    const { nuovaVenditaSchema } = await import('@/lib/validation/vendita')
    const { costoSchema } = await import('@/lib/validation/anagrafiche')
    const { pagamentoProvvigioneSchema } = await import('@/lib/validation/provvigione')
    const vendita = nuovaVenditaSchema.parse({
      nome: 'Marco', tipo: 'nuovo', product_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      valore_contratto: '2.400,00', numero_rate: '3', data_vendita: '2026-09-01', data_inizio: '2026-09-01',
    })
    expect(nuovaVenditaSchema.parse(vendita)).toEqual(vendita)
    const costo = costoSchema.parse({ data: '2026-09-01', categoria: 'ads', descrizione: 'Meta', importo: '1.250,50' })
    expect(costoSchema.parse(costo)).toEqual(costo)
    const pagamento = pagamentoProvvigioneSchema.parse({
      profile_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', periodo: '2026-08-01', importo: '375', pagato_il: '2026-09-01',
    })
    expect(pagamentoProvvigioneSchema.parse(pagamento)).toEqual(pagamento)
  })
})
