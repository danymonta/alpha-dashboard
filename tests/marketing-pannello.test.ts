import { describe, expect, it } from 'vitest'

import {
  hrefContenuto,
  linkCondivisibile,
  messaggioCampo,
  piuRecente,
  urlCon,
  urlSenza,
  vicini,
} from '@/lib/marketing/pannello'

const A = '7e1f3a2b-0000-4000-8000-00000000000a'
const B = '7e1f3a2b-0000-4000-8000-00000000000b'
const C = '7e1f3a2b-0000-4000-8000-00000000000c'

describe('l’indirizzo del pannello (?contenuto)', () => {
  it('urlCon tiene filtri, vista e mese e mette il contenuto', () => {
    expect(urlCon('/marketing/contenuti', '?vista=calendario&mese=2026-10&gruppo=in_progress', A)).toBe(
      `/marketing/contenuti?vista=calendario&mese=2026-10&gruppo=in_progress&contenuto=${A}`,
    )
    expect(urlCon('/marketing/contenuti', '', A)).toBe(`/marketing/contenuti?contenuto=${A}`)
  })

  it('un contenuto già aperto si sostituisce, mai due', () => {
    expect(urlCon('/marketing/contenuti', `?q=sbarra&contenuto=${A}`, B)).toBe(`/marketing/contenuti?q=sbarra&contenuto=${B}`)
  })

  it('urlSenza toglie solo il contenuto', () => {
    expect(urlSenza('/marketing/contenuti', `?vista=tabella&contenuto=${A}&q=a*b`)).toBe('/marketing/contenuti?vista=tabella&q=a*b')
    expect(urlSenza('/marketing/contenuti', `?contenuto=${A}`)).toBe('/marketing/contenuti')
    expect(urlSenza('/marketing/instagram', '')).toBe('/marketing/instagram')
  })

  it('la pagina intera e il link da condividere', () => {
    expect(hrefContenuto(A)).toBe(`/marketing/contenuti/${A}`)
    expect(linkCondivisibile('https://dashboard.percorsoalpha.com', A)).toBe(
      `https://dashboard.percorsoalpha.com/marketing/contenuti?contenuto=${A}`,
    )
  })
})

describe('vicini: precedente e successivo nell’ordine della lista', () => {
  it('in mezzo, agli estremi', () => {
    expect(vicini([A, B, C], B)).toEqual({ precedente: A, successivo: C, posizione: 2, totale: 3 })
    expect(vicini([A, B, C], A)).toEqual({ precedente: null, successivo: B, posizione: 1, totale: 3 })
    expect(vicini([A, B, C], C)).toEqual({ precedente: B, successivo: null, posizione: 3, totale: 3 })
  })

  it('un contenuto uscito dalla lista non ha né precedente né successivo', () => {
    expect(vicini([A, C], B)).toEqual({ precedente: null, successivo: null, posizione: null, totale: 2 })
    expect(vicini([], B)).toEqual({ precedente: null, successivo: null, posizione: null, totale: 0 })
  })
})

describe('piuRecente', () => {
  it('il più recente dei due; a parità il secondo', () => {
    expect(piuRecente('2026-10-09T08:15:42.123456+00:00', '2026-10-09T08:15:43.000001+00:00')).toBe(
      '2026-10-09T08:15:43.000001+00:00',
    )
    expect(piuRecente('2026-10-09T08:16:00+00:00', '2026-10-09T08:15:00+00:00')).toBe('2026-10-09T08:16:00+00:00')
    expect(piuRecente('2026-10-09T08:15:42.123+00:00', '2026-10-09T08:15:42.123+00:00')).toBe('2026-10-09T08:15:42.123+00:00')
  })

  it('i microsecondi di Postgres contano anche nello stesso millisecondo', () => {
    expect(piuRecente('2026-10-09T08:15:42.123999+00:00', '2026-10-09T08:15:42.123001+00:00')).toBe(
      '2026-10-09T08:15:42.123999+00:00',
    )
  })

  it('un valore che non è una data non vince mai sull’altro', () => {
    expect(piuRecente('ieri', '2026-10-09T08:15:42+00:00')).toBe('2026-10-09T08:15:42+00:00')
  })
})

describe('messaggioCampo: il toast dopo un salvataggio', () => {
  it.each([
    ['reel_type', 'education', 'Reel Type: Education'],
    ['reel_type', null, 'Reel Type tolto'],
    ['formato', 'raw_talking_head', 'Format: Raw Talking Head'],
    ['post_date', '2026-10-12', 'Post Date: 12/10/2026'],
    ['post_date', null, 'Post Date tolta'],
    ['nome', 'Trazioni', 'Name salvato'],
    ['url', 'https://www.instagram.com/reel/ABCdef12345/', 'URL salvato'],
    ['url', null, 'URL tolto'],
    ['inspiration', 'https://esempio.it', 'Inspiration salvata'],
    ['audio', 'Brano', 'Audio salvato'],
    ['view_count', 12480, 'View Count: 12.480'],
    ['view_count', null, 'View Count tolto'],
    ['tipo', 'carousel', 'Modello: Carousel Topic'],
  ] as const)('%s = %s: «%s»', (campo, valore, atteso) => {
    expect(messaggioCampo(campo, valore)).toBe(atteso)
  })
})
