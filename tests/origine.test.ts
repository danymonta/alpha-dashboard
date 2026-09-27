import { describe, expect, it } from 'vitest'

import { destinazioneSicura, origineAmmessa } from '@/lib/auth/origine'

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
})
