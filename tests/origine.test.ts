import { describe, expect, it } from 'vitest'

import { destinazioneSicura, origineAmmessa, percorsoDiRitorno } from '@/lib/auth/origine'

const APP = 'https://alpha-dashboard-eta.vercel.app/'

describe('dominio di ritorno del login e dei link', () => {
  it('usa il dominio su cui si sta, se è nostro', () => {
    expect(origineAmmessa('https://dashboard.percorsoalpha.com', APP)).toBe('https://dashboard.percorsoalpha.com')
    expect(origineAmmessa('https://percorsoalpha.com', APP)).toBe('https://percorsoalpha.com')
    expect(origineAmmessa('https://alpha-dashboard-git-main.vercel.app', APP)).toBe('https://alpha-dashboard-git-main.vercel.app')
    expect(origineAmmessa('http://localhost:3000', APP)).toBe('http://localhost:3000')
  })

  it('un dominio altrui o strano ripiega su APP_URL', () => {
    expect(origineAmmessa('https://evil.example.com', APP)).toBe('https://alpha-dashboard-eta.vercel.app')
    expect(origineAmmessa('https://percorsoalpha.com.evil.com', APP)).toBe('https://alpha-dashboard-eta.vercel.app')
    expect(origineAmmessa('https://localhost:3000', APP)).toBe('https://alpha-dashboard-eta.vercel.app')
    expect(origineAmmessa('javascript:alert(1)', APP)).toBe('https://alpha-dashboard-eta.vercel.app')
    expect(origineAmmessa(null, APP)).toBe('https://alpha-dashboard-eta.vercel.app')
  })
})

describe('dove andare dopo il login', () => {
  it('solo percorsi di questa app', () => {
    expect(destinazioneSicura('/progetti/abc?scheda=note')).toBe('/progetti/abc?scheda=note')
    expect(destinazioneSicura('//evil.com')).toBe('/')
    expect(destinazioneSicura('/\\evil.com')).toBe('/')
    expect(destinazioneSicura('https://evil.com')).toBe('/')
    expect(destinazioneSicura('/login?da=/x')).toBe('/')
    expect(destinazioneSicura(null)).toBe('/')
  })

  it('tab, a capo e backslash non portano mai su un altro sito', () => {
    // the browser drops \t \n \r anywhere and reads "\" as "/": each would become //evil.example
    for (const da of ['/\t/evil.example', '/\n/evil.example', '/\r\n/evil.example/login', '/\t\\evil.example', '/x\\..\\\\evil']) {
      expect(destinazioneSicura(da)).toBe('/')
      expect(percorsoDiRitorno(da)).toBeNull()
    }
    // decoded from the query string exactly as Next hands it to the page
    const dalLink = new URLSearchParams('da=/%09/evil.example').get('da')
    expect(percorsoDiRitorno(dalLink)).toBeNull()
  })

  it('il ritorno di una pagina è solo un percorso interno', () => {
    expect(percorsoDiRitorno('/setting/closer/giorno?data=2026-09-27&closer=abc')).toBe(
      '/setting/closer/giorno?data=2026-09-27&closer=abc',
    )
    expect(percorsoDiRitorno('//evil.example')).toBeNull()
    expect(percorsoDiRitorno('https://evil.example')).toBeNull()
    expect(percorsoDiRitorno(undefined)).toBeNull()
  })
})
