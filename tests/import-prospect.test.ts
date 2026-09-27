import { describe, expect, it } from 'vitest'

import { leggiCsv, mappaProspect, nomeEHandle } from '@/lib/import/prospect'

// Invented rows, same columns as the real sheet
const INTESTAZIONE =
  '"Nome","Data call","Status","Importo pitch €","Tipologia","Performance","Motivo di non chiusura","Link alla call","Note aggiutive"'

function mappa(...righe: string[]) {
  return mappaProspect(leggiCsv([INTESTAZIONE, ...righe].join('\n')))
}

describe('lettura del CSV', () => {
  it('tiene insieme i campi tra virgolette con a capo e virgolette doppie', () => {
    const r = leggiCsv('"a","b"\n"riga\ndue","dice ""sì"""\n')
    expect(r).toEqual([['a', 'b'], ['riga\ndue', 'dice "sì"']])
  })
})

describe('nome e handle', () => {
  it('estrae l’handle tra parentesi o riconosce un handle da solo', () => {
    expect(nomeEHandle('Marco (marcogh.87)')).toEqual({ nome: 'Marco', handle: '@marcogh.87' })
    expect(nomeEHandle('fili_manzi')).toEqual({ nome: 'fili_manzi', handle: '@fili_manzi' })
    expect(nomeEHandle('Fabio')).toEqual({ nome: 'Fabio', handle: null })
    expect(nomeEHandle(' Mario Rossi\n')).toEqual({ nome: 'Mario Rossi', handle: null })
  })
})

describe('mappatura delle call', () => {
  it('una chiusa dopo il follow-up è una call chiusa, con pitch e prodotto', () => {
    const { call } = mappa('"Luca Verdi","02/04/2031","Follow up chiuso","1500","Semestrale","Ottima","","https://fathom.video/share/x","250/mese"')
    expect(call[0]).toMatchObject({
      data: '2031-04-02',
      stato: 'svolta',
      esito: 'chiusa',
      qualificata: true,
      stato_lead: 'cliente',
      performance: 'ottima',
      prodotto: 'Percorso Alpha 6 mesi',
      importo: 1500,
      link: 'https://fathom.video/share/x',
      note: 'Chiusa dopo il follow-up. 250/mese',
    })
  })

  it('una persa porta il motivo come obiezione, un link finto non passa', () => {
    const { call } = mappa('"Anna Neri","03/03/2031","Persa","500","Trimestrale","Media","Costa troppo","no link",""')
    expect(call[0]).toMatchObject({ esito: 'persa', obiezione: 'Costa troppo', link: null, prodotto: 'Percorso Alpha 3 mesi' })
  })

  it('una call annullata non ha esito né qualifica', () => {
    const { call } = mappa('"Gino","01/01/2031","Call annullata","","","","No show","",""')
    expect(call[0]).toMatchObject({ stato: 'cancellata', esito: null, qualificata: null, stato_lead: 'perso', importo: null })
  })

  it('una tipologia senza prodotto finisce nelle note', () => {
    const { call } = mappa('"Pino","01/02/2031","Chiusa","500","Rinnovo","Buona","","",""')
    expect(call[0]).toMatchObject({ prodotto: null, note: 'Tipologia: Rinnovo.' })
  })

  it('senza data o con uno stato sconosciuto la riga resta fuori, con un avviso', () => {
    const { call, avvisi } = mappa(
      '"Senza data","","Chiusa","","","","","",""',
      '"Strano","01/01/2031","Boh","","","","","",""',
    )
    expect(call).toEqual([])
    expect(avvisi).toHaveLength(2)
  })
})
