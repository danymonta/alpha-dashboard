import { expect, test, type Page } from '@playwright/test'

import { accedi } from './utenti'

/**
 * The app in English (1.53.0, Dany 22/10/2026: «Dai la possibilità di vedere tutta l'app in
 * inglese… con la bandierina»; «Il business coach deve avere accesso in lettura in inglese ai
 * dati in modo semplice»). The language is per device, in the «alpha_lingua» cookie; without
 * it the business coach reads English (his sales recap, 1.58.0) and everyone else Italian.
 */

async function nessunoScrollDiLato(page: Page) {
  const largo = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(largo).toBeLessThanOrEqual(390)
}

test.describe('la lingua dell’app', () => {
  test('il business coach entra e legge il recap in inglese, poi passa all’italiano con la bandierina', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/recap')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1, name: 'Sales recap' })).toBeVisible()

    // the flag: the page's language and where the tap leads
    await page.getByRole('button', { name: 'Language: English. Switch to Italian' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await expect(page.getByRole('heading', { level: 1, name: 'Recap vendite' })).toBeVisible()
    // the choice stays on the device
    await page.goto('/recap')
    await expect(page.getByRole('heading', { level: 1, name: 'Recap vendite' })).toBeVisible()
    const cookie = (await page.context().cookies()).find((c) => c.name === 'alpha_lingua')
    expect(cookie?.value).toBe('it')
  })

  test('l’admin legge in italiano, tocca EN e legge in inglese', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await expect(page.getByRole('heading', { level: 1, name: 'Panoramica' })).toBeVisible()
    await page.getByRole('button', { name: 'Lingua: italiano. Passa all’inglese' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: 'Language: English. Switch to Italian' })).toBeVisible()
    // the profile has the same choice
    await page.goto('/account')
    await expect(page.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('radio', { name: /Italiano/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Il tuo profilo' })).toBeVisible()
  })

  test('dal telefono, in inglese, nessuno scroll di lato', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'admin')
    await page.context().addCookies([{ name: 'alpha_lingua', value: 'en', url: new URL(page.url()).origin }])
    for (const url of ['/', '/clients', '/sales', '/payments', '/setting', '/account']) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await nessunoScrollDiLato(page)
    }
    // the bar at the bottom in English
    await expect(page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: /More/ })).toBeVisible()
  })
})
