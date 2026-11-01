import { describe, expect, it } from 'vitest'

import { oscura } from '@/lib/marketing/analisi/oscura'
import {
  FINE_NUDO,
  INIZIO_NUDO,
  abbreviaHref,
  formaDelToken,
  hrefApribile,
  normalizzaHref,
  restaIndirizzo,
  ripristinaIndirizzi,
} from '@/lib/marketing/link'

/** The links of the content sections (01/11/2026, «stile Google Drive»): what opens, what is saved. */
describe('i link delle sezioni', () => {
  it('si apre solo un indirizzo http o https', () => {
    expect(hrefApribile('https://www.instagram.com/reel/ABC/')).toBe('https://www.instagram.com/reel/ABC/')
    expect(hrefApribile('http://esempio.it')).toBe('http://esempio.it/')
    for (const no of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'mailto:a@b.it', 'file:///etc/passwd', '/relativo', '', null, undefined])
      expect(hrefApribile(no), String(no)).toBeNull()
  })

  it('«Modifica»: https:// aggiunto quando manca, ogni altro schema rifiutato', () => {
    expect(normalizzaHref('www.instagram.com/reel/ABC/')).toBe('https://www.instagram.com/reel/ABC/')
    expect(normalizzaHref('  esempio.it ')).toBe('https://esempio.it')
    expect(normalizzaHref('http://esempio.it/a')).toBe('http://esempio.it/a')
    for (const no of ['', 'ciao', 'due parole.it', 'javascript:alert(1)', 'ftp://esempio.it', 'mailto:a@b.it']) expect(normalizzaHref(no), no).toBeNull()
  })

  it('l’indirizzo abbreviato del popup', () => {
    expect(abbreviaHref('https://www.instagram.com/reel/ABC/')).toBe('instagram.com/reel/ABC')
    expect(abbreviaHref('https://esempio.it/una/strada/molto/lunga/da/abbreviare/davvero', 20)).toBe('esempio.it/una/stra…')
    expect(abbreviaHref('mailto:a@b.it')).toBe('a@b.it')
  })

  it('la forma di un link nel Markdown', () => {
    expect(formaDelToken({ raw: '[testo](https://x.it)', text: 'testo' })).toBeNull()
    expect(formaDelToken({ raw: 'https://x.it', text: 'https://x.it' })).toBe('nudo')
    expect(formaDelToken({ raw: '<https://x.it>', text: 'https://x.it' })).toBe('angolare')
    expect(restaIndirizzo('www.x.it', 'http://www.x.it')).toBe(true)
    expect(restaIndirizzo('a@b.it', 'mailto:a@b.it')).toBe(true)
    expect(restaIndirizzo('clicca', 'https://x.it')).toBe(false)
  })

  it('un indirizzo nudo torna come era scritto, senza gli escape del serializzatore', () => {
    expect(ripristinaIndirizzi(`vedi ${INIZIO_NUDO}https://x.it/a\\_b?c=1&amp;d=\\*${FINE_NUDO} fine`)).toBe('vedi https://x.it/a_b?c=1&d=* fine')
    expect(ripristinaIndirizzi('niente da fare a\\_b')).toBe('niente da fare a\\_b')
    // a stray mark never reaches the database
    expect(ripristinaIndirizzi(`a${INIZIO_NUDO}b`)).toBe('ab')
  })

  it('le analisi tolgono ancora i link prima di Claude', () => {
    const fuori = oscura('Vedi https://www.instagram.com/reel/ABC/ e www.esempio.it e [testo](https://esempio.it/x)', new Set())
    expect(fuori).not.toMatch(/https?:|www\./)
  })
})
