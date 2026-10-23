import { expect, test, type Page } from '@playwright/test'

import { accedi } from './utenti'

/**
 * The app in English (1.53.0, Dany 22/10/2026: «Dai la possibilità di vedere tutta l'app in
 * inglese… con la bandierina»; «Il business coach deve avere accesso in lettura in inglese ai
 * dati in modo semplice»). The language is per device, in the «alpha_lingua» cookie; without
 * it the business coach reads English and everyone else Italian.
 */

async function nessunoScrollDiLato(page: Page) {
  const largo = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(largo).toBeLessThanOrEqual(390)
}

test.describe('la lingua dell’app', () => {
  test('il business coach entra e legge in inglese, poi torna all’italiano con la bandierina', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await expect(page.getByTestId('kpi')).toContainText('Cash collected')
    // euros the English way
    await expect(page.getByTestId('kpi')).toContainText('€')
    const menu = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(menu.getByRole('link', { name: 'Clients' })).toBeVisible()

    for (const [url, titolo] of [
      ['/clients', /^Clients$/],
      ['/sales', /^Sales$/],
      ['/payments', /^Payments$/],
      ['/setting', /Setter/],
    ] as const) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1, name: titolo })).toBeVisible()
    }

    // the flag: the page's language and where the tap leads
    const bandiera = page.getByRole('button', { name: 'Language: English. Switch to Italian' })
    await bandiera.click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'it')
    await expect(page.getByRole('heading', { level: 1, name: /Setter/ })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Clienti' })).toBeVisible()
    // the choice stays on the device
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Panoramica' })).toBeVisible()
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
    await accedi(page, 'business_coach')
    for (const url of ['/', '/clients', '/sales', '/payments', '/setting', '/account']) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await nessunoScrollDiLato(page)
    }
    // the bar at the bottom in English
    await expect(page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: /More/ })).toBeVisible()
  })
})
