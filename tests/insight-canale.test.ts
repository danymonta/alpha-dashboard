import { describe, expect, it } from 'vitest'

import { canaleDaUrl, canaleIniziale, COOKIE_CANALE_INSIGHT, cookieCanale, fonteDi, hrefInsight } from '@/lib/insight/canale'

// The three tabs of the Insight and where the chosen one is remembered.

describe('canaleIniziale: the address, then the cookie, then Instagram', () => {
  it('the address wins', () => {
    expect(canaleIniziale('agenda', 'messenger')).toBe('agenda')
    expect(canaleIniziale('instagram', 'messenger')).toBe('instagram')
  })

  it('the cookie without the address, or with a wrong one', () => {
    expect(canaleIniziale(undefined, 'messenger')).toBe('messenger')
    expect(canaleIniziale('whatsapp', 'agenda')).toBe('agenda')
  })

  it('Instagram otherwise', () => {
    expect(canaleIniziale(undefined, undefined)).toBe('instagram')
    expect(canaleIniziale('', 'ig')).toBe('instagram')
    expect(canaleDaUrl(['messenger'])).toBeNull()
  })
})

describe('fonteDi: the Agenda is inside the Instagram recap', () => {
  it('as the artifact’s src()', () => {
    expect(fonteDi('instagram')).toBe('instagram')
    expect(fonteDi('agenda')).toBe('instagram')
    expect(fonteDi('messenger')).toBe('messenger')
  })
})

describe('cookieCanale', () => {
  it('one year, the Insight’s path, Secure only on https', () => {
    expect(COOKIE_CANALE_INSIGHT).toBe('alpha_insight_canale')
    expect(cookieCanale('messenger', false)).toBe('alpha_insight_canale=messenger; Path=/insight; Max-Age=31536000; SameSite=Lax')
    expect(cookieCanale('agenda', true)).toBe('alpha_insight_canale=agenda; Path=/insight; Max-Age=31536000; SameSite=Lax; Secure')
  })
})

describe('hrefInsight', () => {
  it('the tab always written (a remembered Messenger would win otherwise), the day when given', () => {
    expect(hrefInsight('instagram')).toBe('/insight?canale=instagram')
    expect(hrefInsight('agenda', '2026-10-14')).toBe('/insight?canale=agenda&giorno=2026-10-14')
    expect(hrefInsight('messenger', null)).toBe('/insight?canale=messenger')
  })
})
