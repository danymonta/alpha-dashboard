import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { GUIDA_SCORING } from '@/lib/marketing/punteggio/guida'
import {
  calcolaPunteggio,
  chiudiPunteggioAtteso,
  FASCE,
  fasciaDi,
  FLAG_DI_CLAUDE,
  FLAG_DEL_CODICE,
  FLAG_PENALITA,
  intervalloFascia,
  LIMITI_TOTALE,
  PENALITA,
  PESI,
  puntiRecuperabili,
  tipoDaReelType,
  TIPI_PUNTEGGIO,
  type IdCriterio,
  type TipoPunteggio,
} from '@/lib/marketing/punteggio/tabelle'

// The tables of the code against the ones written in the guide's text (sections 21, 23, 24): they cannot drift apart.

const SEZIONE_21 = GUIDA_SCORING.split('## 21.')[1].split('## 22.')[0]
const TITOLO: Record<TipoPunteggio, string> = { tof: '**REEL_TOF', mof: '**REEL_MOF', bof: '**REEL_BOF' }

function tabellaDelTipo(tipo: TipoPunteggio): [string, string, number][] {
  const dopo = SEZIONE_21.split(TITOLO[tipo])[1]
  const blocco = dopo.split('\n\n')[1]
  return blocco
    .split('\n')
    .filter((r) => r.startsWith('|') && !r.includes('---') && !r.includes('Criterio'))
    .map((r) => {
      const c = r.split('|').map((x) => x.trim()).filter(Boolean)
      return [c[0], c[1], Number(c[2])] as [string, string, number]
    })
}

describe('i pesi (sezione 21)', () => {
  for (const tipo of TIPI_PUNTEGGIO) {
    it(`${tipo}: come nella guida, e sommano a 100`, () => {
      expect(PESI[tipo].map((v) => [v.id, v.nome.replace(/’/g, "'"), v.peso])).toEqual(tabellaDelTipo(tipo))
      expect(PESI[tipo].reduce((s, v) => s + v.peso, 0)).toBe(100)
    })
  }
})

describe('le penalità (sezione 23)', () => {
  const sezione = GUIDA_SCORING.split('## 23.')[1].split('## 24.')[0]
  const righe = sezione.split('\n').filter((r) => /^\| [A-Z_]+ \|/.test(r) && !r.includes('| Flag |'))

  it('ogni flag della guida c’è nel codice, con lo stesso valore', () => {
    expect(righe.map((r) => r.split('|')[1].trim()).sort()).toEqual([...FLAG_PENALITA].sort())
    for (const r of righe) {
      const c = r.split('|').map((x) => x.trim())
      const effetto = c[3]
      const valore = /^(-\d+)/.exec(effetto)?.[1]
      expect(PENALITA[c[1] as keyof typeof PENALITA].valore, c[1]).toBe(valore ? Number(valore) : 0)
    }
  })

  it('i tetti di un criterio: trattino lungo CF 4, CTA dura nel TOF 3, nessuna CTA nel BOF 2', () => {
    expect(PENALITA.EM_DASH.tetto).toEqual({ criterio: 'CF', max: 4 })
    expect(PENALITA.HARD_CTA_TOF.tetto).toEqual({ criterio: 'CT', max: 3 })
    expect(PENALITA.NO_CTA_BOF.tetto).toEqual({ criterio: 'CT', max: 2 })
    expect(sezione).toContain('-8 e CT massimo 3')
    expect(sezione).toContain('-10 e CT massimo 2')
    expect(sezione).toContain('CF massimo 4')
  })

  it('i limiti del totale: 70, 65, 80', () => {
    expect(sezione).toContain('se H è sotto 4, il punteggio totale non supera 70')
    expect(sezione).toContain('Se ID è sotto 3, il totale non supera 65')
    expect(sezione).toContain('Se CF ha 3 o più violazioni, il totale non supera 80')
    expect(LIMITI_TOTALE.hookBasso).toEqual({ sotto: 4, max: 70 })
    expect(LIMITI_TOTALE.identificazioneBassa).toEqual({ sotto: 3, max: 65 })
    expect(LIMITI_TOTALE.conformitaFormale).toEqual({ violazioni: 3, max: 80 })
  })

  it('i flag del codice e quelli di Claude non si sovrappongono e coprono tutti quelli con un valore', () => {
    for (const f of FLAG_DEL_CODICE) expect(FLAG_DI_CLAUDE).not.toContain(f)
    const conValore = FLAG_PENALITA.filter((f) => PENALITA[f].valore !== 0)
    expect([...FLAG_DEL_CODICE, ...FLAG_DI_CLAUDE].sort()).toEqual([...conValore].sort())
  })
})

describe('le fasce (sezione 24)', () => {
  it('come nella guida', () => {
    const sezione = GUIDA_SCORING.split('## 24.')[1].split('## 25.')[0]
    const righe = sezione.split('\n').filter((r) => /^\| \d/.test(r))
    expect(righe).toHaveLength(FASCE.length)
    righe.forEach((r, i) => {
      const [da] = r.split('|')[1].trim().split('-').map(Number)
      expect(FASCE[i].da).toBe(da)
      expect(r).toContain(FASCE[i].etichetta)
    })
  })
  it('ai bordi', () => {
    expect([100, 90, 89, 80, 79, 65, 64, 50, 49, 0].map((n) => fasciaDi(n).codice)).toEqual([
      'pubblicare', 'pubblicare', 'pubblicare_dopo_ritocchi', 'pubblicare_dopo_ritocchi', 'rifare_le_parti_deboli',
      'rifare_le_parti_deboli', 'riscrivere', 'riscrivere', 'scartare', 'scartare',
    ])
    expect(intervalloFascia('pubblicare')).toEqual({ da: 90, a: 100 })
    expect(intervalloFascia('scartare')).toEqual({ da: 0, a: 49 })
  })
})

const tutti = (tipo: TipoPunteggio, voto: number): Partial<Record<IdCriterio, number>> =>
  Object.fromEntries(PESI[tipo].map((v) => [v.id, voto]))
const base = { paroleHook: 6, hookCitaIcp: true, flag: [] as never[], violazioniFormaliExtra: 0, senzaCaption: false }

describe('il calcolo', () => {
  // the formal conformity is not Claude's vote: it is 10 minus 2 per violation, so with none it is 10 whatever he says
  it('tutti 10 = 100; tutti 0 = solo la conformità formale, che non è un voto di Claude', () => {
    for (const tipo of TIPI_PUNTEGGIO) {
      expect(calcolaPunteggio({ ...base, tipo, voti: tutti(tipo, 10) }).totale).toBe(100)
      const peso = PESI[tipo].find((v) => v.id === 'CF')!.peso
      expect(calcolaPunteggio({ ...base, tipo, voti: tutti(tipo, 0) }).totale_grezzo).toBe(peso)
    }
  })

  it('i voti si arrotondano e si tengono tra 0 e 10', () => {
    const e = calcolaPunteggio({ ...base, tipo: 'mof', voti: { ...tutti('mof', 7.6), H: 14, EV: -3 } })
    expect(e.criteri.find((c) => c.id === 'H')!.voto).toBe(10)
    expect(e.criteri.find((c) => c.id === 'EV')!.voto).toBe(0)
    expect(e.criteri.find((c) => c.id === 'CH')!.voto).toBe(8)
  })

  it('un esempio a mano: MOF, voti 8 e CF 10', () => {
    const e = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 8) })
    // sum(weights except CF) = 98 x 0.8 = 78.4, CF 2 x 1.0 = 2
    expect(e.totale_grezzo).toBe(80.4)
    expect(e.totale).toBe(80)
    expect(e.fascia).toBe('pubblicare_dopo_ritocchi')
  })

  it('le penalità si sommano dopo e il totale non scende sotto 0', () => {
    const e = calcolaPunteggio({ ...base, tipo: 'tof', voti: tutti('tof', 9), flag: ['PROMESSA_IRREALISTICA', 'PALESTRA_O_INTEGRATORI'] })
    expect(e.penalita_totali).toBe(-20)
    expect(e.totale).toBe(Math.round(e.totale_grezzo - 20))
    const zero = calcolaPunteggio({ ...base, tipo: 'tof', voti: tutti('tof', 1), flag: ['FRASE_VIETATA', 'PROMESSA_IRREALISTICA', 'PALESTRA_O_INTEGRATORI'] })
    expect(zero.totale).toBe(0)
  })

  it('un flag due volte conta una volta; quello di un altro tipo si ignora', () => {
    const due = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 8), flag: ['INFO_DUMP', 'INFO_DUMP', 'NO_CTA_BOF', 'HARD_CTA_TOF'] })
    expect(due.penalita).toEqual([{ flag: 'INFO_DUMP', valore: -5 }])
    expect(due.criteri.find((c) => c.id === 'CT')!.voto).toBe(8)
  })

  it('i tetti di un criterio: HARD_CTA_TOF e NO_CTA_BOF', () => {
    const tof = calcolaPunteggio({ ...base, tipo: 'tof', voti: tutti('tof', 9), flag: ['HARD_CTA_TOF'] })
    expect(tof.criteri.find((c) => c.id === 'CT')).toMatchObject({ voto_modello: 9, voto: 3 })
    const bof = calcolaPunteggio({ ...base, tipo: 'bof', voti: tutti('bof', 9), flag: ['NO_CTA_BOF'] })
    expect(bof.criteri.find((c) => c.id === 'CT')).toMatchObject({ voto: 2 })
    expect(bof.penalita_totali).toBe(-10)
  })

  it('l’hook: oltre 15 parole al massimo 5, senza ICP al massimo 6; il totale non supera 70 sotto 4', () => {
    const lungo = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 9), paroleHook: 16 })
    expect(lungo.criteri[0]).toMatchObject({ id: 'H', voto: 5 })
    const senzaIcp = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 9), hookCitaIcp: false })
    expect(senzaIcp.criteri[0].voto).toBe(6)
    const giusto = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 9), paroleHook: 15 })
    expect(giusto.criteri[0].voto).toBe(9)
    const basso = calcolaPunteggio({ ...base, tipo: 'mof', voti: { ...tutti('mof', 10), H: 3 } })
    expect(basso.totale).toBe(70)
    expect(basso.limiti_applicati).toHaveLength(1)
  })

  it('ID sotto 3: il totale non supera 65', () => {
    const e = calcolaPunteggio({ ...base, tipo: 'tof', voti: { ...tutti('tof', 10), ID: 2 } })
    expect(e.totale).toBe(65)
  })

  it('la conformità formale è 10 meno 2 per violazione; con tre il totale non supera 80', () => {
    const una = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 10), flag: ['EMOJI'] })
    expect(una.criteri.find((c) => c.id === 'CF')).toMatchObject({ voto_modello: 10, voto: 8 })
    const tre = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 10), flag: ['EMOJI', 'ACCENTI'], violazioniFormaliExtra: 1 })
    expect(tre.violazioni_formali).toBe(3)
    expect(tre.criteri.find((c) => c.id === 'CF')!.voto).toBe(4)
    expect(tre.totale).toBe(Math.min(80, Math.round(tre.totale_grezzo + tre.penalita_totali)))
    // the long dash caps CF at 4 on its own
    const dash = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 10), flag: ['EM_DASH'] })
    expect(dash.criteri.find((c) => c.id === 'CF')!.voto).toBe(4)
    expect(dash.penalita_totali).toBe(-5)
  })

  it('senza caption la Caption è 5', () => {
    const e = calcolaPunteggio({ ...base, tipo: 'bof', voti: tutti('bof', 10), senzaCaption: true })
    expect(e.criteri.find((c) => c.id === 'CA')).toMatchObject({ voto: 5, tetto: 'Caption non fornita: 5' })
  })

  it('un criterio senza voto vale 0', () => {
    expect(calcolaPunteggio({ ...base, tipo: 'tof', voti: {} }).criteri.every((c) => c.id === 'CF' || c.voto === 0)).toBe(true)
  })
})

describe('il punteggio atteso dopo il rifacimento', () => {
  const e = calcolaPunteggio({ ...base, tipo: 'mof', voti: tutti('mof', 8), flag: ['INFO_DUMP'] })
  it('mai sotto quello di oggi, mai sopra 100 né sopra quello che si può ancora guadagnare', () => {
    expect(chiudiPunteggioAtteso(10, e)).toBe(e.totale)
    expect(chiudiPunteggioAtteso(500, e)).toBeLessThanOrEqual(100)
    const guadagnabile = e.criteri.reduce((s, c) => s + puntiRecuperabili(c), 0) + 5
    expect(chiudiPunteggioAtteso(500, e)).toBe(Math.min(100, Math.round(e.totale + guadagnabile)))
    expect(chiudiPunteggioAtteso(Number.NaN, e)).toBe(e.totale)
    expect(chiudiPunteggioAtteso(e.totale + 3, e)).toBe(e.totale + 3)
  })
})

describe('il tipo dal Reel Type del calendario', () => {
  it('Attraction, Education, Converting; gli altri si deducono', () => {
    expect([tipoDaReelType('attraction'), tipoDaReelType('education'), tipoDaReelType('converting')]).toEqual(['tof', 'mof', 'bof'])
    expect(tipoDaReelType('radio')).toBeNull()
    expect(tipoDaReelType('workshop')).toBeNull()
    expect(tipoDaReelType(null)).toBeNull()
  })

  it('un Reel Type creato dalla persona (21/10/2026) non dichiara nessun tipo: mai un punteggio inventato, lo deduce l’analisi', () => {
    expect(tipoDaReelType('case_study')).toBeNull()
    expect(tipoDaReelType('attraction_2')).toBeNull()
    expect(tipoDaReelType('')).toBeNull()
    expect(tipoDaReelType(undefined)).toBeNull()
  })
})
