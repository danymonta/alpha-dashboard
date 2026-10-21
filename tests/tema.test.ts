import { describe, expect, it } from 'vitest'

import { classeTema, cookieTema, ePaginaChiara, eTema, temaDaCookie, TEMA_PREDEFINITO, TEMI } from '@/lib/tema/tema'
import { COOKIE_SIDEBAR, cookieSidebar, statoSidebar } from '@/lib/shell/sidebar-stato'

describe('tema', () => {
  it('ammette solo chiaro, scuro e sistema', () => {
    expect([...TEMI]).toEqual(['chiaro', 'scuro', 'sistema'])
    expect(eTema('chiaro')).toBe(true)
    expect(eTema('dark')).toBe(false)
    expect(eTema(undefined)).toBe(false)
    expect(eTema(3)).toBe(false)
  })

  it('di base resta scuro: nessun cambio non chiesto', () => {
    expect(TEMA_PREDEFINITO).toBe('scuro')
    expect(temaDaCookie(undefined)).toBe('scuro')
    expect(temaDaCookie(null)).toBe('scuro')
    expect(temaDaCookie('')).toBe('scuro')
    expect(temaDaCookie('rosa')).toBe('scuro')
  })

  it('legge il valore del cookie', () => {
    expect(temaDaCookie('chiaro')).toBe('chiaro')
    expect(temaDaCookie('sistema')).toBe('sistema')
    expect(temaDaCookie('scuro')).toBe('scuro')
  })

  it('la classe su html: il tema scuro non ne ha, come sempre', () => {
    expect(classeTema('scuro')).toBe('')
    expect(classeTema('chiaro')).toBe('light')
    expect(classeTema('sistema')).toBe('sistema')
  })

  it('la pagina è chiara col tema chiaro o con Sistema su un dispositivo chiaro', () => {
    expect(ePaginaChiara('chiaro', false)).toBe(true)
    expect(ePaginaChiara('scuro', true)).toBe(false)
    expect(ePaginaChiara('sistema', true)).toBe(true)
    expect(ePaginaChiara('sistema', false)).toBe(false)
  })

  it('il cookie dura un anno e vale su tutto il sito', () => {
    expect(cookieTema('chiaro')).toBe('alpha_tema=chiaro; path=/; max-age=31536000; samesite=lax')
  })
})

describe('sidebar ridotta', () => {
  it('solo «ridotta» la riduce, ogni altro valore la lascia aperta', () => {
    expect(statoSidebar('ridotta')).toBe('ridotta')
    expect(statoSidebar('estesa')).toBe('estesa')
    expect(statoSidebar(undefined)).toBe('estesa')
    expect(statoSidebar('boh')).toBe('estesa')
  })

  it('il cookie ricorda la scelta per un anno', () => {
    expect(COOKIE_SIDEBAR).toBe('alpha_sidebar')
    expect(cookieSidebar('ridotta')).toBe('alpha_sidebar=ridotta; path=/; max-age=31536000; samesite=lax')
  })
})
