import { describe, expect, it } from 'vitest'

import { ARGOMENTI_GUIDA, GUIDA } from '@/lib/alfire/guida'
import { SCRITTURE, STRUMENTI, isScrittura, strumentiConsentiti } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import { riassuntoScrittura } from '@/lib/alfire/riassunto'

// Tools that read a client's money, costs, margin or other people's pay
const SOLDI = ['numeri_periodo', 'cash_per_mese', 'da_incassare', 'cerca_clienti', 'vendite_periodo', 'provvigioni', 'costi_periodo']

describe('strumenti di Alfire per ruolo', () => {
  it('l’admin ha tutto tranne gli strumenti del setter', () => {
    const admin = strumentiConsentiti('admin', 'admin')
    for (const s of SOLDI) expect(admin).toContain(s)
    expect(admin).toContain('crea_cliente')
    expect(admin).toContain('crea_progetto')
    expect(admin).not.toContain('aggiorna_report')
  })

  it('un collaboratore non riceve mai strumenti sui soldi dei clienti, i costi o i compensi altrui', () => {
    for (const ruolo of ['setter', 'closer', 'coach', 'editor', 'nutrizione', 'dev'] as const) {
      const suoi = strumentiConsentiti(ruolo, 'employee')
      for (const s of SOLDI) expect(suoi, `${ruolo} → ${s}`).not.toContain(s)
      expect(suoi).not.toContain('segna_incassata')
      expect(suoi).not.toContain('registra_costo')
    }
  })

  it('il setter ha i suoi numeri, il report e le call', () => {
    expect(strumentiConsentiti('setter', 'employee')).toEqual(
      expect.arrayContaining(['miei_numeri', 'aggiorna_report', 'fissa_call', 'call_periodo', 'guida']),
    )
  })

  it('crea progetti solo chi li gestisce', () => {
    expect(strumentiConsentiti('coach', 'employee')).not.toContain('crea_progetto')
    expect(strumentiConsentiti('coach', 'manager')).toContain('crea_progetto')
    expect(strumentiConsentiti('coach', 'employee')).toContain('aggiungi_task')
  })

  it('ogni scrittura è uno strumento esistente e passa dalla conferma', () => {
    for (const s of SCRITTURE) expect(Object.keys(STRUMENTI)).toContain(s)
    expect(isScrittura('crea_cliente')).toBe(true)
    expect(isScrittura('numeri_periodo')).toBe(false)
  })
})

describe('scheda di conferma', () => {
  it('dice cosa verrà scritto, in italiano', () => {
    const r = riassuntoScrittura('registra_costo', {
      descrizione: 'Abbonamento Canva',
      importo: 12.99,
      categoria: 'software',
      data: '2026-09-27',
      ricorrente: true,
    })
    expect(r.titolo).toBe('Registro il costo «Abbonamento Canva»')
    expect(r.dettagli.join(' | ').replace(/ /g, ' ')).toBe(
      '12,99 € | Categoria: software | Data: 27/09/2026 | Ricorrente ogni mese',
    )
  })

  it('il report: somma o sostituisce, e lo dice', () => {
    const aggiungi = riassuntoScrittura('aggiorna_report', { modalita: 'aggiungi', dm_outbound: 20, conversazioni: 5 })
    expect(aggiungi.titolo).toBe('Aggiungo al report di oggi')
    expect(aggiungi.dettagli).toEqual(['+20 DM outbound', '+5 conversazioni'])
    const imposta = riassuntoScrittura('aggiorna_report', { modalita: 'imposta', data: '2026-09-26', dm_inbound: 3 })
    expect(imposta.titolo).toBe('Imposto il report di 26/09/2026')
  })

  it('cliente, incasso, call, progetto, task', () => {
    expect(riassuntoScrittura('crea_cliente', { nome: 'Mario', cognome: 'Rossi', fonte: 'dm_inbound' }).titolo).toBe(
      'Creo il cliente Mario Rossi',
    )
    expect(riassuntoScrittura('segna_incassata', { cliente: 'Saverio', payment_id: 'x' }).dettagli).toContain('Incassata oggi')
    expect(riassuntoScrittura('fissa_call', { nome: 'Luca', tipo: 'strategy', data: '2026-09-30', ora: '15:00' }).dettagli[0]).toBe(
      '30/09/2026 alle 15:00',
    )
    expect(riassuntoScrittura('crea_progetto', { nome: 'Lancio', reparto: 'DM Setter' }).dettagli).toEqual(['Reparto: DM Setter'])
    expect(riassuntoScrittura('aggiungi_task', { titolo: 'Script DM', progetto: 'Lancio' }).titolo).toBe('Aggiungo il task «Script DM»')
  })
})

describe('prompt e guida', () => {
  it('il prompt resta corto e porta data, nome e ruolo', () => {
    const p = promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-27' })
    expect(p).toContain('2026-09-27')
    expect(p).toContain('Dany')
    expect(p).toContain('margine operativo')
    // the free tier counts tokens: a few hundred words at most
    expect(p.split(/\s+/).length).toBeLessThan(260)
  })

  it('ogni argomento della guida ha un testo', () => {
    for (const a of ARGOMENTI_GUIDA) expect(GUIDA[a].length).toBeGreaterThan(40)
  })
})
