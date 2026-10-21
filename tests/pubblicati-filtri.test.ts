import { describe, expect, it } from 'vitest'

import {
  filtriAttivi,
  filtriDaParametri,
  FILTRI_PREDEFINITI,
  hrefPubblicati,
  parametriDaFiltri,
  sonoFiltriPredefiniti,
} from '@/lib/marketing/pubblicati/filtri'
import { eReel, numeroOTrattino, tipoDellaRiga, TRATTINO } from '@/lib/marketing/pubblicati/parole'
import { eVecchiaPagina, indirizzoDaVecchiaPagina } from '@/lib/marketing/pubblicati/vecchi-indirizzi'

describe('i filtri dei Pubblicati', () => {
  it('un valore sconosciuto torna al predefinito, mai un errore', () => {
    expect(filtriDaParametri({})).toEqual(FILTRI_PREDEFINITI)
    expect(filtriDaParametri({ periodo: '7', tipo: 'video', piano: 'forse', cambiare: 'si', q: '   ' })).toEqual(FILTRI_PREDEFINITI)
  })

  it('i valori buoni passano, anche come primo di un elenco', () => {
    expect(filtriDaParametri({ periodo: ['90'], tipo: 'carosello', piano: 'fuori', cambiare: '1', q: '  schiena ' })).toEqual({
      periodo: 90,
      tipo: 'carosello',
      piano: 'fuori',
      cambiare: true,
      q: 'schiena',
    })
  })

  it('la ricerca è al massimo di 100 caratteri', () => {
    expect(filtriDaParametri({ q: 'a'.repeat(300) }).q).toHaveLength(100)
  })

  it('l’indirizzo lascia fuori i predefiniti e porta i pannelli', () => {
    expect(hrefPubblicati(FILTRI_PREDEFINITI)).toBe('/marketing/pubblicati')
    expect(hrefPubblicati({ ...FILTRI_PREDEFINITI, periodo: 180, piano: 'nel_piano' }, { reel: '5' })).toBe(
      '/marketing/pubblicati?periodo=180&piano=nel_piano&reel=5',
    )
    expect(hrefPubblicati({ ...FILTRI_PREDEFINITI, q: 'a b' }, { contenuto: 'abc' })).toBe('/marketing/pubblicati?q=a+b&contenuto=abc')
    expect(parametriDaFiltri({ ...FILTRI_PREDEFINITI, cambiare: true })).toEqual({ cambiare: '1' })
  })

  it('«Togli i filtri» sa quando serve, e il numero sul bottone conta i filtri', () => {
    expect(sonoFiltriPredefiniti(FILTRI_PREDEFINITI)).toBe(true)
    expect(sonoFiltriPredefiniti({ ...FILTRI_PREDEFINITI, tipo: 'foto' })).toBe(false)
    expect(filtriAttivi(FILTRI_PREDEFINITI)).toBe(0)
    expect(filtriAttivi({ periodo: 90, tipo: 'reel', piano: 'tutti', cambiare: true, q: 'x' })).toBe(4)
  })
})

describe('le parole dei Pubblicati', () => {
  it('un numero non letto è «–», mai 0', () => {
    expect(numeroOTrattino(null)).toBe(TRATTINO)
    expect(numeroOTrattino(undefined)).toBe(TRATTINO)
    expect(numeroOTrattino(Number.NaN)).toBe(TRATTINO)
    expect(numeroOTrattino(0)).toBe('0')
    expect(numeroOTrattino(12480)).toBe('12.480')
  })

  it('il tipo del post: reel, carosello, foto', () => {
    expect(tipoDellaRiga({ media_type: 'VIDEO', reel: true })).toBe('reel')
    expect(tipoDellaRiga({ media_type: 'VIDEO', reel: false })).toBe('reel')
    expect(tipoDellaRiga({ media_type: 'CAROUSEL_ALBUM', reel: false })).toBe('carousel')
    expect(tipoDellaRiga({ media_type: 'IMAGE', reel: false })).toBe('foto')
    expect(eReel({ media_type: 'IMAGE', reel: false })).toBe(false)
    expect(eReel({ media_type: 'VIDEO', reel: null })).toBe(true)
  })
})

describe('i vecchi indirizzi di Post di Instagram e Analisi', () => {
  it('sono quei due percorsi, anche con la barra in fondo, e nessun altro', () => {
    expect(eVecchiaPagina('/marketing/instagram')).toBe(true)
    expect(eVecchiaPagina('/marketing/analisi')).toBe(true)
    expect(eVecchiaPagina('/marketing/analisi/')).toBe(true)
    for (const x of ['/marketing/pubblicati', '/marketing/contenuti', '/marketing/instagram/altro', '/api/marketing/analisi/1', '/marketing']) {
      expect(eVecchiaPagina(x), x).toBe(false)
    }
  })

  it('senza parametri portano ai Pubblicati', () => {
    expect(indirizzoDaVecchiaPagina(new URLSearchParams(''))).toBe('/marketing/pubblicati')
  })

  it('il pannello del reel e del contenuto, il periodo e i filtri che hanno ancora un senso vanno con loro', () => {
    expect(indirizzoDaVecchiaPagina(new URLSearchParams('reel=17900000000000001&scheda=perche&periodo=90'))).toBe(
      '/marketing/pubblicati?periodo=90&reel=17900000000000001&scheda=perche',
    )
    expect(indirizzoDaVecchiaPagina(new URLSearchParams('contenuto=7e1f3a2b-0000-4000-8000-000000000001'))).toBe(
      '/marketing/pubblicati?contenuto=7e1f3a2b-0000-4000-8000-000000000001',
    )
    expect(indirizzoDaVecchiaPagina(new URLSearchParams('verdetto=cambiare&senza_contenuto=1'))).toBe('/marketing/pubblicati?cambiare=1&piano=fuori')
    expect(indirizzoDaVecchiaPagina({ periodo: ['180'], reel: '5' })).toBe('/marketing/pubblicati?periodo=180&reel=5')
  })

  it('quello che non ha più un senso o non è valido si lascia fuori', () => {
    expect(
      indirizzoDaVecchiaPagina(new URLSearchParams('verdetto=spingere&punteggio=scartare&ordine=views&periodo=7&reel=abc&scheda=x&contenuto=no&q=ciao')),
    ).toBe('/marketing/pubblicati')
    // a scheda without its reel means nothing
    expect(indirizzoDaVecchiaPagina(new URLSearchParams('scheda=numeri'))).toBe('/marketing/pubblicati')
    // 30 days is the default: not written
    expect(indirizzoDaVecchiaPagina(new URLSearchParams('periodo=30'))).toBe('/marketing/pubblicati')
  })
})
