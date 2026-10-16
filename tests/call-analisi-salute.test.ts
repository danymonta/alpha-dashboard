import { describe, expect, it } from 'vitest'

import { nominaUnaCondizione, parlaDiSalute, pettoNeutro, pulisciElenco, pulisciTesto } from '@/lib/call/analisi/salute'

describe('il lessico della salute', () => {
  it.each([
    'Ha un’ernia al disco',
    'Ha una diagnosi di scoliosi',
    'Sta facendo controlli medici',
    'Prende dei farmaci per la pressione',
    'Soffre d’ansia e di attacchi di panico',
    'Ha avuto un infortunio al ginocchio',
    'Mal di schiena da mesi',
    'Pesa 92 kg',
    'Alto 1,80 cm di più',
    'Il suo BMI è alto',
    'Ha il 28% di massa grassa',
    'Va dal fisioterapista ogni settimana',
    'Aspetta l’esito di un esame del sangue',
    'È stato operato a una spalla',
    'Il medico gli ha detto di aspettare',
  ])('riconosce %j', (testo) => expect(parlaDiSalute(testo)).toBe(true))

  it.each([
    'Vuole un petto più pieno',
    'Cerca un fisico fit, non grosso',
    'Ha poco tempo la sera dopo il lavoro',
    'Si sente stanco dopo giornate piene',
    'Ha già provato la palestra e ha mollato',
    'Vorrebbe spalle e braccia più definite',
    'Il percorso dura sei mesi',
    'Allenamenti di 40 minuti',
    'Ha 38 anni e due figli',
  ])('lascia stare %j', (testo) => expect(parlaDiSalute(testo)).toBe(false))
})

describe('il nome di una condizione fisica', () => {
  it('pectus, petto incavato e petto carenato diventano «il petto»', () => {
    expect(pettoNeutro('Ha il pectus')).toBe('Ha il petto')
    expect(pettoNeutro('Ha un pectus excavatum importante')).toBe('Ha il petto importante')
    expect(pettoNeutro('Si vergogna del petto incavato')).toBe('Si vergogna del petto')
    expect(pettoNeutro('Il petto carenato lo frena')).toBe('Il petto lo frena')
    expect(pettoNeutro('Pectus e schiena')).toBe('Il petto e schiena')
  })
  it('«petto» da solo e gli obiettivi estetici restano', () => {
    expect(pettoNeutro('Vuole un petto più pieno')).toBe('Vuole un petto più pieno')
    expect(pettoNeutro('Riempire il petto')).toBe('Riempire il petto')
  })
  it('dopo averlo reso neutro non ne resta traccia', () => {
    expect(nominaUnaCondizione(pettoNeutro('Il pectus e il petto incavato'))).toBe(false)
    expect(nominaUnaCondizione('il pectus')).toBe(true)
  })
})

describe('pulizia', () => {
  it('di un elenco: la voce che ne parla se ne va intera, il resto resta', () => {
    expect(pulisciElenco(['Poco tempo la sera', 'Ha un’ernia al disco', 'Teme il pectus'])).toEqual({
      voci: ['Poco tempo la sera', 'Teme il petto'],
      tolte: 1,
    })
  })
  it('di un testo: via la frase', () => {
    const r = pulisciTesto('Il lead lavora molto. Ha un’ernia al disco. Vuole tornare in forma.')
    expect(r.tolte).toBe(1)
    expect(r.testo).toBe('Il lead lavora molto. Vuole tornare in forma.')
  })
  it('un testo senza salute resta com’è', () => {
    expect(pulisciTesto('Cerca un metodo semplice.')).toEqual({ testo: 'Cerca un metodo semplice.', tolte: 0 })
  })
})
