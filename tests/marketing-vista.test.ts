import { describe, expect, it } from 'vitest'

import { COOKIE_VISTA_CONTENUTI, cookieVista, vistaDaUrl, vistaIniziale } from '@/lib/marketing/vista'

describe('Tabella | Calendario di /marketing/contenuti', () => {
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
})
