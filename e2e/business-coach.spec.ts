import { expect, test, type Page } from '@playwright/test'

import { accedi as accediSeed } from './utenti'

/**
 * The business coach (1.58.0, Dany 23/10/2026: «una versione per Max dove lui ha semplicemente una
 * pagina... Non vede neanche il file, non vede il tutorial, non vede niente... unicamente una
 * dashboard sales per il mio business coach»): one page, /recap, with the sales funnel's aggregates
 * from recap_sales(). No menu, no bell, no Alfire, no timer, no tutorial; every other page of the
 * app sends him back there. The database gives him nothing else (pgTAP 101_business_coach.sql).
 */

/** Italian here: without a choice the business coach reads English (the last test covers it). */
async function accedi(page: Page, ruolo: Parameters<typeof accediSeed>[1]) {
  await accediSeed(page, ruolo)
  await page.context().addCookies([{ name: 'alpha_lingua', value: 'it', url: new URL(page.url()).origin }])
}

/** Six months of the seed's data, so the numbers are there. */
async function periodoConDati(page: Page) {
  await page.goto('/recap?da=2026-04-01&a=2026-10-31')
  await expect(page.getByRole('heading', { level: 1, name: 'Recap vendite' })).toBeVisible()
}

test.describe('il business coach ha solo il recap vendite', () => {
  test('entra e arriva sul recap, con i numeri e i grafici', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/')
    await expect(page).toHaveURL(/\/recap$/)
    await periodoConDati(page)
    const kpi = page.getByTestId('recap-kpi')
    await expect(kpi).toContainText('Cash incassato dai nuovi clienti')
    await expect(kpi).toContainText('€')
    await expect(kpi).toContainText('Call chiuse')
    await expect(kpi).toContainText('close rate')
    await expect(kpi).toContainText('Call svolte')
    await expect(kpi).toContainText('show rate')
    await expect(page.getByTestId('recap-setting')).toContainText('DM totali')
    await expect(page.getByTestId('recap-setting')).toContainText('outbound')
    for (const titolo of ['Funnel del periodo', 'DM nel tempo', 'Call nel tempo', 'Cash dai nuovi clienti nel tempo']) {
      await expect(page.getByRole('heading', { level: 2, name: titolo })).toBeVisible()
    }
    // every chart has its table view
    await expect(page.getByText('Vedi come tabella')).toHaveCount(3)
    await page.getByText('Vedi come tabella').first().click()
    await expect(page.getByRole('table', { name: 'DM nel tempo' })).toBeVisible()
    // never a name of a client or a person of the team
    await expect(page.getByRole('main')).not.toContainText('Loris')
    await expect(page.getByRole('main')).not.toContainText('Margine')
  })

  test('niente menu, campanella, Alfire, timer, tutorial: logo, lingua, tema ed Esci', async ({ page }) => {
    await accedi(page, 'business_coach')
    await periodoConDati(page)
    await expect(page.getByRole('navigation', { name: /Navigazione/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Notifiche/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Alfire/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /profilo/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Testa il tutorial/ })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Torna all’app' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Lingua: italiano/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Esci' })).toBeVisible()
  })

  test('ogni altra pagina lo riporta al recap', async ({ page }) => {
    await accedi(page, 'business_coach')
    for (const url of [
      '/',
      '/clients',
      '/sales',
      '/payments',
      '/setting',
      '/commissions',
      '/expenses',
      '/marketing/contenuti',
      '/progetti',
      '/tempo/team',
      '/settings/team',
      '/changelog',
      '/notifiche',
      '/account',
      '/insight',
      '/task',
    ]) {
      await page.goto(url)
      await expect(page, url).toHaveURL(/\/recap$/)
    }
  })

  test('il periodo cambia i numeri, e un periodo vuoto lo dice', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/recap?da=2020-01-01&a=2020-01-31')
    await expect(page.getByText('Nessun dato in questo periodo')).toBeVisible()
    await page.getByRole('link', { name: 'Questo mese' }).click()
    await expect(page).toHaveURL(/\/recap$/)
  })

  test('Esci lo porta al login', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/recap')
    await page.getByRole('button', { name: 'Esci' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('dal telefono, in inglese di base: nessuno scroll di lato', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accediSeed(page, 'business_coach')
    await page.goto('/recap?da=2026-04-01&a=2026-10-31')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1, name: 'Sales recap' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    const largo = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(largo).toBeLessThanOrEqual(390)
  })

  test('l’admin apre lo stesso recap da Amministrazione e torna all’app', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Recap del business coach/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recap vendite' })).toBeVisible()
    await page.getByRole('link', { name: 'Torna all’app' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Panoramica' })).toBeVisible()
  })
})
