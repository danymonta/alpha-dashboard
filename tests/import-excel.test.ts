import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import {
  attribuisciPeriodi,
  confrontaConExcel,
  csvDaCompletare,
  leggiCsvVendite,
  leggiFoglioMensile,
  leggiPagamentiSetter,
  rateCoperte,
} from '@/lib/import/excel'

/** A monthly sheet shaped like the coach's: header on row 11, one row per day. Invented numbers. */
function foglioMese() {
  const ws = new ExcelJS.Workbook().addWorksheet('July')
  ws.getCell('B11').value = 'DATE'
  ws.getCell('I11').value = 'OUT BOUND'
  const giorno = (r: number, d: number, valori: Record<string, unknown>) => {
    ws.getCell(`B${r}`).value = new Date(Date.UTC(2031, 2, d))
    for (const [c, v] of Object.entries(valori)) ws.getCell(`${c}${r}`).value = v as ExcelJS.CellValue
  }
  giorno(12, 1, { E: 'Yes', I: 20, J: 3, K: 9, Q: 4, X: 1, Y: 300, Z: 1800 })
  giorno(13, 2, { I: 0, J: 0, X: 0, Y: 0, Z: 0 }) // empty day: skipped
  giorno(14, 3, { I: { formula: 'SUM(1,1)', result: 2 }, L: 1, X: 0, Y: 150, Z: 0 }) // cash without close
  ws.getCell('B15').value = '-'
  ws.getCell('I15').value = 57 // numbers without a date
  ws.getCell('I16').value = { formula: 'SUM(I12:I15)', result: 79 } // totals row: B empty, scan stops
  return ws
}

describe('lettura del foglio mensile', () => {
  const mese = leggiFoglioMensile(foglioMese())!

  it('legge le colonne I-Q e salta i giorni vuoti', () => {
    expect(mese.report).toHaveLength(2)
    expect(mese.report[0]).toMatchObject({ data: '2031-03-01', dm_outbound: 20, dm_inbound: 3, conversazioni: 9, follow_up: 4, contenuto_pubblicato: true })
    expect(mese.report[1]).toMatchObject({ data: '2031-03-03', dm_outbound: 2, call_proposte: 1, contenuto_pubblicato: false })
    expect(mese.vuote).toBe(1)
  })

  it('tiene le chiusure come totali del giorno e avvisa di ciò che non importa', () => {
    expect(mese.chiusure).toEqual([{ data: '2031-03-01', chiusure: 1, cash: 300, revenue: 1800 }])
    expect(mese.avvisi.join('\n')).toMatch(/2031-03-03: cash o revenue senza chiusure/)
    expect(mese.avvisi.join('\n')).toMatch(/riga 15: numeri senza data/)
  })

  it('ignora i fogli che non sono mesi', () => {
    expect(leggiFoglioMensile(new ExcelJS.Workbook().addWorksheet('Note'))).toBeNull()
  })
})

describe('pagamenti al setter', () => {
  it('legge date gg/mm/aaaa e il totale calcolato dal foglio', () => {
    const ws = new ExcelJS.Workbook().addWorksheet('Setter Payments')
    ws.addRow(['Date', 'Value so far', '%', 'Total'])
    ws.addRow(['15/03/2031', 300, 0.05, { formula: 'B2*C2', result: 15 }])
    ws.addRow(['10/04/2031', 1000, 0.05, null])
    expect(leggiPagamentiSetter(ws).pagamenti).toEqual([
      { pagato_il: '2031-03-15', base: 300, percentuale: 0.05, importo: 15 },
      { pagato_il: '2031-04-10', base: 1000, percentuale: 0.05, importo: 50 },
    ])
  })

  it('attribuisce ogni pagamento al mese più vecchio non ancora coperto', () => {
    const cash = new Map([
      ['2031-03-01', 1500],
      ['2031-04-01', 0],
      ['2031-05-01', 2000],
    ])
    const pagamenti = [
      { pagato_il: '2031-03-15', base: 300, percentuale: 0.05, importo: 15 },
      { pagato_il: '2031-04-20', base: 1000, percentuale: 0.05, importo: 50 },
      { pagato_il: '2031-06-01', base: 900, percentuale: 0.05, importo: 45 },
    ]
    expect(attribuisciPeriodi(pagamenti, cash)).toEqual(['2031-03-01', '2031-03-01', '2031-05-01'])
  })
})

describe('CSV delle vendite da completare', () => {
  const giorni = [{ data: '2031-03-01', chiusure: 1, cash: 300, revenue: 1800 }]

  it('senza segnaposto lascia vuoto ciò che deve scrivere Dany', () => {
    const csv = csvDaCompletare(giorni)
    expect(csv.split('\r\n')[1]).toBe('01/03/2031;300,00;1800,00;;;;;nuovo;;')
    expect(leggiCsvVendite(csv).errori[0]).toMatch(/manca cliente_nome.*manca prodotto.*numero_rate.*da_setter/)
  })

  it('con i segnaposto è già importabile e torna con l’Excel', () => {
    const { vendite, errori } = leggiCsvVendite(csvDaCompletare(giorni, { prodotto: () => 'Percorso 6 mesi' }))
    expect(errori).toEqual([])
    expect(vendite[0]).toMatchObject({ cliente_nome: 'Cliente', cliente_cognome: 'Excel 01/03/2031', numero_rate: 6, da_setter: true })
    expect(confrontaConExcel(vendite, giorni)).toEqual([])
  })

  it('segnala un totale del giorno che non torna', () => {
    const csv = 'data,cash,revenue,cliente_nome,cliente_cognome,prodotto,numero_rate,tipo,da_setter\n01/03/2031,250,1800,Luca,Rossi,P,6,nuovo,no\n'
    const { vendite } = leggiCsvVendite(csv)
    expect(vendite[0].da_setter).toBe(false)
    expect(confrontaConExcel(vendite, giorni)[0]).toMatch(/01\/03\/2031: nel CSV cash 250,00/)
  })
})

describe('rate coperte dal cash della firma', () => {
  it('trova quante rate iniziali copre, o nessuna combinazione', () => {
    expect(rateCoperte(300, [300, 300, 300])).toBe(1)
    expect(rateCoperte(600, [300, 300, 300])).toBe(2)
    expect(rateCoperte(0, [300, 300])).toBe(0)
    expect(rateCoperte(250, [300, 300])).toBeNull()
  })
})
