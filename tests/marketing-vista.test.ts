import { describe, expect, it } from 'vitest'

import { COOKIE_VISTA_CONTENUTI, cookieVista, hrefVista, vistaDaUrl, vistaIniziale } from '@/lib/marketing/vista'

describe('Tabella | Calendario del Piano editoriale', () => {
  it('?vista dice una vista valida, o niente', () => {
    expect(vistaDaUrl('tabella')).toBe('tabella')
    expect(vistaDaUrl('calendario')).toBe('calendario')
    expect(vistaDaUrl('Calendario')).toBeNull()
    expect(vistaDaUrl(['calendario'])).toBeNull()
    expect(vistaDaUrl(undefined)).toBeNull()
  })

  it('vince l’indirizzo, poi la vista ricordata, poi la tabella', () => {
    expect(vistaIniziale('tabella', 'calendario')).toBe('tabella')
    expect(vistaIniziale(undefined, 'calendario')).toBe('calendario')
    expect(vistaIniziale('boh', 'calendario')).toBe('calendario')
    expect(vistaIniziale(undefined, 'timeline')).toBe('tabella')
    expect(vistaIniziale(undefined, undefined)).toBe('tabella')
  })

  it('il cookie vale un anno su tutta l’area Marketing, Secure solo su https', () => {
    expect(COOKIE_VISTA_CONTENUTI).toBe('alpha_vista_marketing')
    expect(cookieVista('calendario', false)).toBe(
      'alpha_vista_marketing=calendario; Path=/marketing; Max-Age=31536000; SameSite=Lax',
    )
    expect(cookieVista('tabella', true)).toBe(
      'alpha_vista_marketing=tabella; Path=/marketing; Max-Age=31536000; SameSite=Lax; Secure',
    )
  })

  it('cambiando vista restano i filtri e la scheda YouTube; il mese è solo del calendario', () => {
    const parametri = { stato: 'posted', canale: 'youtube', q: undefined, mese: '2026-11' }
    expect(hrefVista('calendario', 'tabella', parametri)).toBe(
      '/marketing/contenuti?stato=posted&canale=youtube&mese=2026-11&vista=calendario',
    )
    // the calendar came from the memory: back to the table it says so, or the cookie would show it again
    expect(hrefVista('tabella', 'calendario', parametri)).toBe(
      '/marketing/contenuti?stato=posted&canale=youtube&vista=tabella',
    )
    // the calendar was in the address: the table needs no ?vista (the tap writes the cookie)
    expect(hrefVista('tabella', 'calendario', { vista: 'calendario' })).toBe('/marketing/contenuti')
    expect(hrefVista('tabella', 'tabella', {})).toBe('/marketing/contenuti')
  })
})
