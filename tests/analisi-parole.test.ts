import { describe, expect, it } from 'vitest'

import {
  eVerdetto,
  formatDurata,
  formatQuota,
  formatRapporto,
  formatSecondi,
  formatTasso,
  formatVisione,
  fraseStatoPost,
  parolaAnalisi,
  parolaLead,
  viewsConConfronto,
} from '@/lib/marketing/analisi/parole'

describe('le parole dell’analisi', () => {
  it('rapporti, quote, tassi e tempi in italiano; nessun numero inventato', () => {
    expect(formatRapporto(1.4)).toBe('×1,4')
    expect(formatRapporto(12)).toBe('×12')
    expect(formatRapporto(null)).toBeNull()
    expect(formatRapporto(Number.NaN)).toBeNull()
    expect(formatQuota(0.2345)).toBe('23%')
    expect(formatTasso(0.0123)).toBe('1,2%')
    expect(formatTasso(undefined)).toBeNull()
    expect(formatSecondi(9800)).toBe('9,8 s')
    expect(formatDurata(42)).toBe('0:42')
    expect(formatDurata(75.4)).toBe('1:15')
    expect(formatVisione(9800, 0.31)).toBe('9,8 s · 31%')
    expect(formatVisione(null, 0.31)).toBe('n/d')
  })

  it('le views col confronto: vita intera o a N giorni, senza rapporto nessun confronto', () => {
    expect(viewsConConfronto(12480, 3, 'stessa_eta', 7)).toEqual({ numero: '12.480', confronto: '×3 della mediana a 7 giorni' })
    expect(viewsConConfronto(100, 0.5, 'vita_intera', null).confronto).toBe('×0,5 della mediana (sulla vita intera)')
    expect(viewsConConfronto(100, null, null, null)).toEqual({ numero: '100', confronto: null })
    expect(viewsConConfronto(null, null, null, null).numero).toBeNull()
  })

  it('la colonna Analisi: pronta, in coda, in corso, non riuscita, «Dal …» per un reel giovane, «Da chiedere»', () => {
    expect(parolaAnalisi('pronta', 400, null)).toBe('Pronta')
    expect(parolaAnalisi('in_coda', 400, null)).toBe('In coda')
    expect(parolaAnalisi('in_corso', 400, null)).toBe('Claude la sta facendo…')
    expect(parolaAnalisi('fallita', 400, null)).toBe('Non riuscita')
    expect(parolaAnalisi(null, 20, '18/10')).toBe('Dal 18/10')
    expect(parolaAnalisi(null, 200, '18/10')).toBe('Da chiedere')
  })

  it('i lead: mai zero quando non sono contati, «alcuni giorni non contati» dopo i 14 giorni', () => {
    expect(parolaLead({ lead_contati: false, lead_completi: false, dm_14g: null, in_target_14g: null, call_14g: null })).toBe('non contati')
    expect(parolaLead({ lead_contati: true, lead_completi: true, dm_14g: 6, in_target_14g: 3, call_14g: 1 })).toBe('6 DM · 3 in target · 1 call')
    expect(parolaLead({ lead_contati: true, lead_completi: false, dm_14g: 0, in_target_14g: null, call_14g: null })).toBe(
      '0 DM · 0 in target · 0 call · alcuni giorni non contati',
    )
  })

  it('le frasi di un post senza statistiche', () => {
    expect(fraseStatoPost('prima_della_conversione', null, null)).toContain('prima che l’account diventasse professionale')
    expect(fraseStatoPost('da_leggere', null, null)).toContain('riprovo domani')
    expect(fraseStatoPost('senza_permesso', null, null)).toContain('non sono ancora attive')
    expect(fraseStatoPost('lette', 'x', true)).toContain('48 ore')
    expect(fraseStatoPost('lette', 'x', false)).toBeNull()
  })

  it('un verdetto è uno dei tre', () => {
    expect(['spingere', 'mantenere', 'cambiare'].every(eVerdetto)).toBe(true)
    expect(eVerdetto('boh')).toBe(false)
    expect(eVerdetto(null)).toBe(false)
  })
})
