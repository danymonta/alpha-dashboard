import { describe, expect, it } from 'vitest'

import { differenze } from '@/lib/audit'

describe('registro modifiche', () => {
  it('mostra solo i campi cambiati, con nomi leggibili', () => {
    const prima = { id: 'x', importo_previsto: 800, scadenza: '2026-10-01', updated_at: 'a' }
    const dopo = { id: 'x', importo_previsto: 750, scadenza: '2026-10-01', updated_at: 'b' }
    expect(differenze(prima, dopo)).toEqual([{ campo: 'importo previsto', prima: '800', dopo: '750' }])
  })

  it('su un inserimento elenca i campi significativi della riga', () => {
    const d = differenze(null, { id: 'x', descrizione: 'Hosting', importo: 89, ricorrente: true, created_by: 'u' })
    expect(d).toEqual([
      { campo: 'descrizione', prima: '–', dopo: 'Hosting' },
      { campo: 'importo', prima: '–', dopo: '89' },
      { campo: 'ricorrente', prima: '–', dopo: 'sì' },
    ])
  })

  it('scrive le date all’italiana e i booleani in parole', () => {
    expect(differenze({ attivo: true, valida_al: null }, { attivo: false, valida_al: '2026-12-31' })).toEqual([
      { campo: 'attivo', prima: 'sì', dopo: 'no' },
      { campo: 'valida al', prima: '–', dopo: '31/12/2026' },
    ])
  })

  it('ignora le colonne tecniche', () => {
    expect(differenze({ sale_id: 'a', created_by: 'b' }, { sale_id: 'c', created_by: 'd' })).toEqual([])
  })
})
