import { describe, expect, it } from 'vitest'

import {
  copiaDelleNote,
  oscura,
  paroleDaOscurare,
  paroleNormalizzate,
  PAROLE_DI_COPIA,
  ripulisciUscita,
  sostituisciNomi,
} from '@/lib/marketing/analisi/oscura'

// Names, handles, amounts and links out of what reaches Claude and out of what comes back (1.36.0, R19).
// All names are invented.

const NOMI = ['Gustavo Rossiniello', '@gustavo.rossi81', 'Ale', 'Mattèo Verdi', 'Loris Setter', 'Dany Montagnolo', 'Rosa Marino', 'Al']

describe('paroleDaOscurare', () => {
  it('parole intere di almeno 3 lettere, senza accenti né maiuscole', () => {
    const parole = paroleDaOscurare(NOMI)
    expect(parole.has('gustavo')).toBe(true)
    expect(parole.has('rossiniello')).toBe(true)
    expect(parole.has('ale')).toBe(true)
    expect(parole.has('matteo')).toBe(true)
    expect(parole.has('loris')).toBe(true)
    // an @handle gives its parts; a number alone is never a name
    expect(parole.has('rossi81')).toBe(true)
    // two letters are too short
    expect(parole.has('al')).toBe(false)
  })

  it('mai il marchio né le parole comuni dell’italiano che sono anche nomi', () => {
    const parole = paroleDaOscurare(NOMI)
    for (const parola of ['dany', 'montagnolo', 'alpha', 'percorso', 'daniele']) expect(parole.has(parola)).toBe(false)
    for (const parola of ['rosa', 'marino', 'sole', 'costa']) expect(parole.has(parola)).toBe(false)
    expect(paroleDaOscurare(['Percorso Alpha', 'Sole Costa']).size).toBe(0)
  })
})

describe('oscura (in ingresso)', () => {
  const parole = paroleDaOscurare(NOMI)

  it('un nome diventa [lead]; un nome dentro un’altra parola no; un nome con l’accento sì', () => {
    expect(oscura('Dice Gustavo che Ale ha pagato', parole)).toBe('Dice [lead] che [lead] ha pagato')
    expect(oscura('Una palestra ale-ale e un valerio', parole)).toBe('Una palestra [lead]-[lead] e un valerio')
    expect(oscura('Dice MATTEO e anche Mattèo', parole)).toBe('Dice [lead] e anche [lead]')
    expect(oscura('Per Dany e Loris lo stesso', parole)).toBe('Per Dany e [lead] lo stesso')
    expect(oscura('Percorso Alpha di Dany', parole)).toBe('Percorso Alpha di Dany')
    expect(oscura('al supermercato', parole)).toBe('al supermercato')
  })

  it('gli @handle diventano @[account], gli importi [importo], i link spariscono', () => {
    expect(oscura('Scrivi a @mario.rossi e a @_danymonta', parole)).toBe('Scrivi a @[account] e a @[account]')
    expect(oscura('Costa 1.500 € o 1500 euro o € 500 o 99 EUR', parole)).toBe('Costa [importo] o [importo] o [importo] o [importo]')
    expect(oscura('Guarda https://esempio.test/x?y=1 oppure www.altro.test', parole)).toBe('Guarda oppure')
    expect(oscura(null, parole)).toBe('')
    expect(oscura(undefined, parole)).toBe('')
  })

  it('senza nomi da oscurare resta quello che c’è (ma handle, importi e link vanno)', () => {
    expect(oscura('Ciao Gustavo, 50 euro', new Set())).toBe('Ciao Gustavo, [importo]')
  })
})

describe('ripulisciUscita (in uscita)', () => {
  const parole = paroleDaOscurare(NOMI)

  it('nomi in «un lead», @handle in «un account», importi in «il prezzo», link e trattini', () => {
    const { testo, conteggi } = ripulisciUscita(
      'Gustavo — con @gustavo.rossi81 — paga 1.500 € qui https://esempio.test/pagina e Ale dice sì – sempre.',
      parole,
    )
    expect(testo).toBe('un lead, con un account, paga il prezzo qui e un lead dice sì, sempre.')
    expect(conteggi).toEqual({ nomi: 2, handle: 1, importi: 1, link: 1, trattini: 3 })
  })

  it('«Percorso Alpha» e Dany restano', () => {
    expect(ripulisciUscita('Percorso Alpha di Dany: Mattèo Verdi no', parole).testo).toBe('Percorso Alpha di Dany: un lead un lead no')
  })

  it('il trattino corto dentro una parola composta non si tocca', () => {
    expect(ripulisciUscita('un reel talking-head di 30-40 secondi', parole).testo).toBe('un reel talking-head di 30-40 secondi')
  })
})

describe('copiaDelleNote', () => {
  const nota = paroleNormalizzate('Molti non hanno tempo la sera perché tornano tardi dal lavoro e vogliono solo riposare')

  it(`${PAROLE_DI_COPIA} parole di fila uguali a una nota sono una copia`, () => {
    expect(copiaDelleNote('Molti non hanno tempo la sera perché', [nota])).toBe(false) // 7 words
    expect(copiaDelleNote('Molti non hanno tempo la sera perché tornano', [nota])).toBe(true) // 8 words
    expect(copiaDelleNote('Come dice la nota: molti, non hanno tempo, la sera, perché tornano tardi dal lavoro', [nota])).toBe(true)
  })

  it('riformulata no, sparsa no', () => {
    expect(copiaDelleNote('Chi lavora fino a tardi la sera non riesce ad allenarsi e rimanda', [nota])).toBe(false)
    expect(copiaDelleNote('molti hanno tempo la perché tornano non sera', [nota])).toBe(false)
    expect(copiaDelleNote('troppo corto', [nota])).toBe(false)
    expect(copiaDelleNote('Molti non hanno tempo la sera perché tornano tardi', [])).toBe(false)
  })
})

describe('sostituisciNomi', () => {
  it('conta le sostituzioni', () => {
    expect(sostituisciNomi('Gustavo e Ale e Gustavo', paroleDaOscurare(NOMI), 'X')).toEqual({ testo: 'X e X e X', sostituzioni: 3 })
  })
})
