import { describe, expect, it } from 'vitest'

import { collegamentoVoce, differenze, raggruppaVoci, sintesi, titoloVoce, type VoceRegistro } from '@/lib/audit'

// Intl puts a narrow no-break space before "€": compare on plain spaces
const piano = (s: string) => s.replace(/\s/g, ' ')

describe('registro modifiche', () => {
  it('mostra solo i campi cambiati, con nomi leggibili e importi in euro', () => {
    const prima = { id: 'x', importo_previsto: 800, scadenza: '2026-10-01', updated_at: 'a' }
    const dopo = { id: 'x', importo_previsto: 750.5, scadenza: '2026-10-01', updated_at: 'b' }
    const [d] = differenze(prima, dopo)
    expect({ ...d, prima: piano(d.prima), dopo: piano(d.dopo) }).toEqual({
      campo: 'importo previsto',
      prima: '800,00 €',
      dopo: '750,50 €',
    })
  })

  it('su un inserimento elenca i campi significativi della riga', () => {
    const d = differenze(null, { id: 'x', descrizione: 'Hosting', importo: 89, ricorrente: true, created_by: 'u' })
    expect(d.map((c) => ({ ...c, dopo: piano(c.dopo) }))).toEqual([
      { campo: 'descrizione', prima: '–', dopo: 'Hosting' },
      { campo: 'importo', prima: '–', dopo: '89,00 €' },
      { campo: 'ricorrente', prima: '–', dopo: 'sì' },
    ])
  })

  it('scrive le date all’italiana e i booleani in parole', () => {
    expect(differenze({ attivo: true, valida_al: null }, { attivo: false, valida_al: '2026-12-31' })).toEqual([
      { campo: 'attivo', prima: 'sì', dopo: 'no' },
      { campo: 'valida al', prima: '–', dopo: '31/12/2026' },
    ])
  })

  it('formatta percentuale, periodo e ruolo come nel resto dell’app', () => {
    expect(differenze({ percentuale: 0.05 }, { percentuale: 0.07 })).toEqual([
      { campo: 'percentuale', prima: '5%', dopo: '7%' },
    ])
    expect(differenze(null, { periodo: '2026-09-01' })[0].dopo).toBe('settembre 2026')
    expect(differenze({ ruolo: 'setter' }, { ruolo: 'admin' })[0]).toEqual({ campo: 'ruolo', prima: 'Setter', dopo: 'Admin' })
  })

  it('ordina i campi in modo stabile, non secondo le chiavi del JSON', () => {
    const d = differenze(null, { data_fine: '2026-12-31', data_inizio: '2026-10-01', tipo: 'nuovo' })
    expect(d.map((c) => c.campo)).toEqual(['tipo', 'inizio', 'fine'])
  })

  it('ignora le colonne tecniche', () => {
    expect(differenze({ sale_id: 'a', created_by: 'b' }, { sale_id: 'c', created_by: 'd' })).toEqual([])
  })
})

describe('sintesi delle voci', () => {
  it('riassume la riga creata in una frase', () => {
    expect(piano(sintesi('sales', { tipo: 'nuovo', valore_contratto: 900, numero_rate: 3 }))).toBe('nuovo · 900,00 € · 3 rate')
    expect(piano(sintesi('payments', { numero_rata: 2, importo_previsto: 300, scadenza: '2026-10-01' }))).toBe(
      'rata 2 · 300,00 € · scadenza 01/10/2026',
    )
    expect(sintesi('commission_rules', { percentuale: 0.05, valida_dal: '2026-01-01', valida_al: null })).toBe('5% · dal 01/01/2026')
    expect(sintesi('sales', { numero_rate: 1 })).toBe('1 rata')
  })

  it('accorda il titolo al genere della tabella', () => {
    expect(titoloVoce('sales', 'insert')).toBe('Vendita creata')
    expect(titoloVoce('expenses', 'delete')).toBe('Costo eliminato')
    expect(titoloVoce('commission_rules', 'update')).toBe('Regola provvigione modificata')
  })

  it('collega la voce alla vendita, mai a una riga eliminata', () => {
    const base = { record_id: 'r', dati_prima: null }
    expect(collegamentoVoce({ ...base, tabella: 'sales', azione: 'insert', dati_dopo: {} })?.href).toBe('/sales/r')
    expect(collegamentoVoce({ ...base, tabella: 'payments', azione: 'update', dati_dopo: { sale_id: 's' } })?.href).toBe('/sales/s')
    expect(collegamentoVoce({ ...base, tabella: 'sales', azione: 'delete', dati_dopo: null })).toBeNull()
  })
})

describe('raggruppamento', () => {
  const voce = (id: string, over: Partial<VoceRegistro>): VoceRegistro => ({
    id,
    tabella: 'payments',
    record_id: id,
    azione: 'insert',
    dati_prima: null,
    dati_dopo: { sale_id: 's1', numero_rata: Number(id.slice(1)) },
    created_at: '2026-09-27T10:00:00+00:00',
    ...over,
  })

  it('unisce le rate create nella stessa transazione, anche se arrivano in disordine', () => {
    const voci = [
      voce('r2', {}),
      voce('v', { tabella: 'sales', dati_dopo: {} }),
      voce('r1', {}),
      voce('r3', {}),
      voce('x1', { dati_dopo: { sale_id: 's2', numero_rata: 1 } }),
    ]
    const gruppi = raggruppaVoci(voci)
    expect(gruppi.map((g) => g.map((v) => v.id))).toEqual([['r1', 'r2', 'r3'], ['v'], ['x1']])
  })

  it('non unisce le modifiche né le rate di momenti diversi', () => {
    const voci = [
      voce('r1', { azione: 'update', dati_prima: { sale_id: 's1' } }),
      voce('r2', { azione: 'update', dati_prima: { sale_id: 's1' } }),
      voce('r3', { created_at: '2026-09-27T11:00:00+00:00' }),
      voce('r4', {}),
    ]
    expect(raggruppaVoci(voci)).toHaveLength(4)
  })
})
