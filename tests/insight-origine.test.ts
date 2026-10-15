import { describe, expect, it } from 'vitest'

import { giornoDiArrivo, haParolaChiave, normalizzaParola, origineCerta, origineDaCodice, origineDaShortcode, origineDalModello, paroleChiave } from '@/lib/insight/origine'
import { chatFinta, msg, postFinto } from './fixture-insight'

// Where a lead comes from (1.35.0, D26). Invented chats and captions only.

const adesso = new Date('2026-10-14T16:00:00.000Z')

const reelDany = postFinto('ReelDany01', '2026-10-10T09:00:00.000Z', { didascalia: 'Due ore a settimana. Scrivimi "ALPHA" in DM per la guida.' })
const altroReel = postFinto('ReelDany02', '2026-10-12T09:00:00.000Z', { didascalia: 'Il metodo. Commenta FORZA e ti mando il programma.' })
const post = [reelDany, altroReel]

describe('paroleChiave', () => {
  it('a word in quotes after the verb, or a word in capitals', () => {
    expect(paroleChiave('Scrivimi "ALPHA" in DM per la guida.')).toEqual(['ALPHA'])
    expect(paroleChiave('Commenta FORZA e ti mando il programma.')).toEqual(['FORZA'])
    expect(paroleChiave('Mandami «costanza» in direct')).toEqual(['costanza'])
    expect(paroleChiave('Scrivi “Via” per iniziare')).toEqual(['Via'])
  })

  it('nothing without a verb, nothing too far from it, «DM» itself is never a keyword', () => {
    expect(paroleChiave('ALPHA è il mio metodo')).toEqual([])
    expect(paroleChiave('Scrivimi pure quando vuoi, ti rispondo sempre con calma. ALPHA')).toEqual([])
    expect(paroleChiave('Scrivimi in DM')).toEqual([])
    expect(paroleChiave(null)).toEqual([])
  })

  it('whole word, without case and accents', () => {
    expect(normalizzaParola('Àlpha')).toBe('alpha')
    expect(haParolaChiave('alpha!', 'ALPHA')).toBe(true)
    expect(haParolaChiave('Àlpha', 'ALPHA')).toBe(true)
    expect(haParolaChiave('alphabet', 'ALPHA')).toBe(false)
  })
})

describe('origineDaCodice', () => {
  it('a reel of Dany shared in DM', () => {
    const chat = chatFinta({
      messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', '[contenuto condiviso: https://www.instagram.com/reel/ReelDany01/]', { codici: ['ReelDany01'] }), msg('alpha', '2026-10-13T21:00:00.000Z', 'Grazie!')],
    })
    expect(origineDaCodice({ chat, post, adesso })).toEqual({
      tipo: 'condivisione',
      shortcode: 'ReelDany01',
      il: '2026-10-13T20:00:00.000Z',
      giorno: '2026-10-13',
    })
  })

  it('a reel of someone else: no origin', () => {
    const chat = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', '[contenuto condiviso]', { codici: ['ReelAltrui1'] })] })
    expect(origineDaCodice({ chat, post, adesso })).toBeNull()
  })

  it('the keyword a caption asks for, in quotes or in capitals, case and accents ignored', () => {
    const conQuote = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'àlpha')] })
    expect(origineDaCodice({ chat: conQuote, post, adesso })).toMatchObject({ tipo: 'parola_chiave', shortcode: 'ReelDany01', parola: 'ALPHA' })
    const maiuscola = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'ciao'), msg('lead', '2026-10-13T20:01:00.000Z', 'Forza!')] })
    expect(origineDaCodice({ chat: maiuscola, post, adesso })).toMatchObject({ tipo: 'parola_chiave', shortcode: 'ReelDany02', parola: 'FORZA' })
    const parte = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'alphabeta')] })
    expect(origineDaCodice({ chat: parte, post, adesso })).toBeNull()
  })

  it('the most recent post with the keyword published before the message', () => {
    const vecchio = postFinto('ReelVecchio', '2026-10-01T09:00:00.000Z', { didascalia: 'Scrivimi "ALPHA"' })
    const recente = postFinto('ReelRecente', '2026-10-11T09:00:00.000Z', { didascalia: 'Scrivimi "ALPHA"' })
    const dopo = postFinto('ReelDopo123', '2026-10-13T09:00:00.000Z', { didascalia: 'Scrivimi "ALPHA"' })
    const chat = chatFinta({ messaggi: [msg('lead', '2026-10-12T20:00:00.000Z', 'ALPHA')] })
    expect(origineDaCodice({ chat, post: [vecchio, dopo, recente], adesso })?.shortcode).toBe('ReelRecente')
  })

  it('a reply to a story: with its post when Meta says it, without otherwise', () => {
    const conPost = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', '[risposta a una storia] bella!', { storia: true, codici: ['ReelDany02'] })] })
    expect(origineDaCodice({ chat: conPost, post, adesso })).toMatchObject({ tipo: 'storia', shortcode: 'ReelDany02' })
    const senza = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', '[risposta a una storia]', { storia: true })] })
    expect(origineDaCodice({ chat: senza, post, adesso })).toMatchObject({ tipo: 'storia', shortcode: null })
  })

  it('only the lead\'s first 3 messages, only a complete chat', () => {
    const tardi = chatFinta({
      messaggi: [
        msg('lead', '2026-10-13T20:00:00.000Z', 'ciao'),
        msg('lead', '2026-10-13T20:01:00.000Z', 'vorrei'),
        msg('alpha', '2026-10-13T20:02:00.000Z', 'dimmi'),
        msg('lead', '2026-10-13T20:03:00.000Z', 'info'),
        msg('lead', '2026-10-13T20:04:00.000Z', 'ALPHA'),
      ],
    })
    expect(origineDaCodice({ chat: tardi, post, adesso })).toBeNull()
    const incompleta = chatFinta({ completa: false, messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'ALPHA')] })
    expect(origineDaCodice({ chat: incompleta, post, adesso })).toBeNull()
  })
})

describe('origineDalModello', () => {
  const delGiorno = [
    { indice: 1, shortcode: 'ReelDany02', data: '12/10', tipo: 'reel' as const, hook: 'Il metodo.' },
    { indice: 2, shortcode: 'ReelDany01', data: '10/10', tipo: 'reel' as const, hook: 'Due ore a settimana.' },
  ]
  const chat = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'ho visto il tuo video sulle due ore')] })

  it('the post Claude says he cites', () => {
    expect(origineDalModello(chat, 2, delGiorno)).toEqual({ tipo: 'testo', shortcode: 'ReelDany01', il: '2026-10-13T20:00:00.000Z', giorno: '2026-10-13' })
  })

  it('nothing without a valid ref or on an incomplete chat', () => {
    expect(origineDalModello(chat, null, delGiorno)).toBeNull()
    expect(origineDalModello(chat, 7, delGiorno)).toBeNull()
    expect(origineDalModello({ ...chat, completa: false }, 2, delGiorno)).toBeNull()
  })

  it('a code origin is «certa», the model\'s is not', () => {
    expect(origineCerta({ tipo: 'condivisione', shortcode: 'X1234' })).toBe(true)
    expect(origineCerta({ tipo: 'parola_chiave', shortcode: 'X1234' })).toBe(true)
    expect(origineCerta({ tipo: 'storia', shortcode: 'X1234' })).toBe(true)
    expect(origineCerta({ tipo: 'storia', shortcode: null })).toBe(false)
    expect(origineCerta({ tipo: 'testo', shortcode: 'X1234' })).toBe(false)
  })
})

describe('origineDaShortcode', () => {
  const chat = chatFinta({ messaggi: [msg('lead', '2026-10-11T20:00:00.000Z', 'Ho visto il tuo reel'), msg('alpha', '2026-10-11T21:00:00.000Z', 'Ciao!')] })

  it('a post published before the lead\'s first message', () => {
    expect(origineDaShortcode(chat, 'ReelDany01', post)).toMatchObject({ tipo: 'testo', shortcode: 'ReelDany01' })
  })

  it('never a post published after it: the lead cannot come from what did not exist yet', () => {
    // ReelDany02 is from 12/10, the lead wrote on 11/10
    expect(origineDaShortcode(chat, 'ReelDany02', post)).toBeNull()
  })

  it('without the posts, or for a post they do not list, the shortcode is taken as it is; an incomplete chat never', () => {
    expect(origineDaShortcode(chat, 'ReelDany02')).toMatchObject({ shortcode: 'ReelDany02' })
    expect(origineDaShortcode(chat, 'PostPiuVecchio', post)).toMatchObject({ shortcode: 'PostPiuVecchio' })
    expect(origineDaShortcode({ ...chat, completa: false }, 'ReelDany01', post)).toBeNull()
  })
})

describe('giornoDiArrivo', () => {
  it('the Rome day of the first message, across midnight and on 25/10/2026', () => {
    expect(giornoDiArrivo({ messaggi: [msg('lead', '2026-10-14T22:30:00.000Z', 'ciao')] })).toBe('2026-10-15')
    expect(giornoDiArrivo({ messaggi: [msg('lead', '2026-10-24T22:30:00.000Z', 'ciao')] })).toBe('2026-10-25')
    expect(giornoDiArrivo({ messaggi: [msg('lead', '2026-10-25T22:30:00.000Z', 'ciao')] })).toBe('2026-10-25')
    expect(giornoDiArrivo({ messaggi: [msg('lead', '2026-10-25T23:30:00.000Z', 'ciao')] })).toBe('2026-10-26')
    expect(giornoDiArrivo({ messaggi: [] })).toBeNull()
  })
})
