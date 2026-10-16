import { describe, expect, it } from 'vitest'

import { misureSchema, verificaSchemaStrutturato } from '../e2e/schema-strutturato.mjs'
import { comeSpuntiModello, FORMATO_SPUNTI, LettoSpunti, type RispostaSpunti } from '@/lib/marketing/spunti/schema'

const idea = { modello: 'reel', nasce_da: 'tema', fase: 'attrazione', name: 'N', reel_type: 'Education', format: null, gancio: 'g', messaggio: 'm', hook: 'h', righe: ['a', 'b'], cta: 'c', perche: 'p', rif: ['R1'] }
const voce = (gruppo: string, testo: string) => ({ gruppo, testo, perche: 'p', rif: ['R1'] })

describe('lo schema degli Spunti mandato a Claude (1.37.1)', () => {
  it('è dentro le regole e piccolo: pochi oggetti, nessuna lista duplicata, lo script piatto', () => {
    expect(verificaSchemaStrutturato(FORMATO_SPUNTI.schema)).toEqual([])
    const m = misureSchema(FORMATO_SPUNTI.schema)
    // before: 10 objects (four lists of the same entry, the script nested); now the entries are 5
    expect(m.oggetti).toBeLessThanOrEqual(6)
    const proprieta = Object.keys((FORMATO_SPUNTI.schema as { properties: Record<string, unknown> }).properties)
    expect(proprieta).toEqual(['in_breve', 'voci', 'temi', 'obiezioni', 'domande', 'idee'])
    const json = JSON.stringify(FORMATO_SPUNTI.schema)
    expect(json).not.toContain('"script"')
    expect(json).not.toContain('"mantieni":{')
  })
  it('la conversione verso la forma della pagina tiene i gruppi, l’ordine e lo script', () => {
    const r: RispostaSpunti = LettoSpunti.parse({
      in_breve: 'x',
      voci: [voce('cambia', 'c1'), voce('cosa_funziona', 'f1'), voce('cambia', 'c2'), voce('potenzia', 'p1'), voce('mantieni', 'm1')],
      temi: [],
      obiezioni: [],
      domande: [],
      idee: [idea],
    })
    const m = comeSpuntiModello(r)
    expect(m.cosa_funziona.map((v) => v.testo)).toEqual(['f1'])
    expect(m.mantieni.map((v) => v.testo)).toEqual(['m1'])
    expect(m.cambia.map((v) => v.testo)).toEqual(['c1', 'c2'])
    expect(m.potenzia.map((v) => v.testo)).toEqual(['p1'])
    expect(m.cambia[0]).toEqual({ testo: 'c1', perche: 'p', rif: ['R1'] })
    expect(m.idee[0].script).toEqual({ hook: 'h', righe: ['a', 'b'], cta: 'c' })
    expect(m.idee[0]).not.toHaveProperty('hook')
    expect(m.in_breve).toBe('x')
  })
  it('un gruppo sconosciuto non passa la lettura', () => {
    expect(() => LettoSpunti.parse({ in_breve: '', voci: [voce('altro', 'x')], temi: [], obiezioni: [], domande: [], idee: [] })).toThrow()
  })
})
