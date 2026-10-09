import { describe, expect, it } from 'vitest'

import { RE_SHORTCODE, linkDiCondivisione, shortcodeInstagram } from '@/lib/marketing/shortcode'

// The same URLs as supabase/tests/67_contenuti_marketing.sql: the generated
// column instagram_shortcode and this function are one rule.
describe('shortcodeInstagram, gemello di marketing_contenuti.instagram_shortcode', () => {
  it.each([
    ['https://www.instagram.com/reel/ABCdef12345/', 'ABCdef12345'],
    ['https://www.instagram.com/reels/ABCdef12346/', 'ABCdef12346'],
    ['https://www.instagram.com/p/Cxyz_-12347/', 'Cxyz_-12347'],
    ['https://www.instagram.com/tv/TVabc12348/', 'TVabc12348'],
    ['https://www.instagram.com/some.user_name/reel/USRabc12349/', 'USRabc12349'],
    ['https://www.instagram.com/reel/IGSHabc1235/?igsh=MWx0bXo5bTlh', 'IGSHabc1235'],
    ['https://m.instagram.com/reel/MOBabc12351/', 'MOBabc12351'],
    ['https://instagr.am/p/SHORTabc1252/', 'SHORTabc1252'],
    ['https://instagram.com/reel/ABCdef12345?utm_source=ig_web', 'ABCdef12345'],
  ])('%s → %s', (url, codice) => {
    expect(shortcodeInstagram(url)).toBe(codice)
  })

  it.each([
    'https://www.instagram.com/share/reel/SHAREabc123/',
    'https://www.instagram.com/reels/audio/123456789012345/',
    'https://www.instagram.com/stories/qualcuno/3456789012345678901/',
    'https://www.instagram.com/qualcuno/',
    'https://www.tiktok.com/@qualcuno/video/7234567890123456789',
  ])('nessuno shortcode da %s', (url) => {
    expect(shortcodeInstagram(url)).toBeNull()
  })

  it('niente link, niente shortcode; maiuscole nel dominio come Postgres (che distingue)', () => {
    expect(shortcodeInstagram(null)).toBeNull()
    expect(shortcodeInstagram(undefined)).toBeNull()
    expect(shortcodeInstagram('')).toBeNull()
    expect(shortcodeInstagram('https://www.INSTAGRAM.com/reel/ABCdef12345/')).toBeNull()
    expect(RE_SHORTCODE.flags).not.toContain('i')
  })
})

describe('linkDiCondivisione', () => {
  it('riconosce instagram.com/share/…, con o senza schema', () => {
    expect(linkDiCondivisione('https://www.instagram.com/share/reel/SHAREabc123/')).toBe(true)
    expect(linkDiCondivisione('instagram.com/share/p/SHAREabc123')).toBe(true)
    expect(linkDiCondivisione(' https://m.instagram.com/share/abc ')).toBe(true)
  })

  it('il link del post non è un link di condivisione', () => {
    expect(linkDiCondivisione('https://www.instagram.com/reel/ABCdef12345/')).toBe(false)
    expect(linkDiCondivisione('https://www.instagram.com/qualcuno/')).toBe(false)
  })
})
