import { expect, test, type Page } from '@playwright/test'

import { accedi as accediSeed } from './utenti'

/**
 * The business coach (1.58.0, Dany 23/10/2026: «una versione per Max dove lui ha semplicemente una
 * pagina... Non vede neanche il file, non vede il tutorial, non vede niente... unicamente una
 * dashboard sales per il mio business coach»): one page, /recap, with the sales funnel's aggregates
 * from recap_mese() (by month and day from 1.59.0: tiles, calendar or table, the day's detail, the ratio
 * boxes of the Excel). No menu, no bell, no Alfire, no timer, no tutorial; every other page of the
 * app sends him back there. The database gives him nothing else (pgTAP 101_business_coach.sql).
 */

/** Italian here: without a choice the business coach reads English (the last test covers it). */
async function accedi(page: Page, ruolo: Parameters<typeof accediSeed>[1]) {
  await accediSeed(page, ruolo)
  await page.context().addCookies([{ name: 'alpha_lingua', value: 'it', url: new URL(page.url()).origin }])
}

/** The current month of the seed's data (relative to today), as a calendar. */
async function meseConDati(page: Page, vista: 'calendario' | 'tabella' = 'calendario') {
  await page.goto(`/recap?vista=${vista}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Recap vendite' })).toBeVisible()
}

test.describe('il business coach ha solo il recap vendite', () => {
  test('entra e arriva sul recap: tessere, calendario del mese, dettaglio di un giorno, riepilogo', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/')
    await expect(page).toHaveURL(/\/recap$/)
    await meseConDati(page)
    const kpi = page.getByTestId('recap-kpi')
    await expect(kpi).toContainText('Cash incassato dai nuovi clienti')
    await expect(kpi).toContainText('€')
    await expect(kpi).toContainText('Call chiuse')
    await expect(kpi).toContainText('close rate')
    await expect(kpi).toContainText('Call svolte')
    await expect(kpi).toContainText('show rate')
    await expect(page.getByTestId('recap-setting')).toContainText('DM totali')
    await expect(page.getByTestId('recap-setting')).toContainText('outbound')

    // the month as a calendar: Monday first, today marked in words
    const calendario = page.getByTestId('recap-calendario')
    await expect(calendario.getByRole('heading', { level: 2, name: 'Il mese giorno per giorno' })).toBeVisible()
    await expect(calendario.getByText('Lun', { exact: true })).toBeVisible()
    await expect(calendario.getByRole('button', { name: /Oggi/ })).toBeVisible()

    // a day opens as a row of the sheet: setting and closing, the zeros said
    const giorno = calendario.getByTestId('giorno-recap').filter({ visible: true, hasText: 'DM' }).last()
    await giorno.click()
    const foglio = page.getByRole('dialog')
    await expect(foglio.getByRole('heading', { level: 3, name: 'Setting' })).toBeVisible()
    await expect(foglio.getByRole('heading', { level: 3, name: 'Closing' })).toBeVisible()
    await expect(foglio).toContainText('DM totali')
    await expect(foglio).toContainText('Call svolte')
    await expect(foglio).toContainText('Show rate')
    const titolo = await foglio.getByRole('heading', { level: 2 }).textContent()
    await foglio.getByRole('button', { name: 'Giorno prima' }).click()
    await expect(foglio.getByRole('heading', { level: 2 })).not.toHaveText(titolo ?? '')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // the ratio boxes of the sheet
    const riepilogo = page.getByTestId('recap-riepilogo')
    await expect(riepilogo.getByRole('heading', { level: 2, name: 'Riepilogo del mese' })).toBeVisible()
    for (const voce of ['DM → conversazioni', 'Show rate', 'Close rate', 'Cash per DM', 'Cash medio per chiusura']) {
      await expect(riepilogo).toContainText(voce)
    }
    // never a name of a client or a person of the team
    await expect(page.getByRole('main')).not.toContainText('Loris')
    await expect(page.getByRole('main')).not.toContainText('Margine')
  })

  test('la tabella come il foglio, e la vista resta', async ({ page }) => {
    await accedi(page, 'business_coach')
    await meseConDati(page)
    await page.getByRole('group', { name: 'Vista' }).getByRole('link', { name: 'Tabella' }).click()
    await expect(page).toHaveURL(/vista=tabella/)
    const tabella = page.getByRole('table', { name: 'Il mese come il foglio' })
    await expect(tabella).toBeVisible()
    await expect(tabella.getByRole('columnheader', { name: 'Setting' })).toBeVisible()
    await expect(tabella.getByRole('columnheader', { name: 'Closing' })).toBeVisible()
    await expect(tabella.getByRole('rowheader', { name: 'Totale del mese' })).toBeVisible()
    // remembered: /recap without ?vista opens the table again
    await page.goto('/recap')
    await expect(page.getByRole('table', { name: 'Il mese come il foglio' })).toBeVisible()
    await page.getByRole('group', { name: 'Vista' }).getByRole('link', { name: 'Calendario' }).click()
    await expect(page.getByTestId('recap-calendario')).toBeVisible()
  })

  test('niente menu, campanella, Alfire, timer, tutorial: logo, lingua, tema ed Esci', async ({ page }) => {
    await accedi(page, 'business_coach')
    await meseConDati(page)
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

  test('un mese vuoto lo dice, e il futuro non si apre', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/recap?mese=2020-01')
    await expect(page.getByText('Nessuna attività a gennaio 2020')).toBeVisible()
    await page.getByRole('link', { name: 'Mese corrente' }).click()
    await expect(page).toHaveURL(/\/recap$/)
    await expect(page.getByTestId('recap-calendario')).toBeVisible()
    // a month in the future shows the current one, and its arrow forward is off
    await page.goto('/recap?mese=2099-01')
    await expect(page.getByTestId('recap-calendario')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mese successivo' })).toHaveCount(0)
  })

  test('Esci lo porta al login', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/recap')
    await page.getByRole('button', { name: 'Esci' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('dal telefono, in inglese di base: agenda dei giorni, foglio dal basso, nessuno scroll di lato', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accediSeed(page, 'business_coach')
    await page.goto('/recap?vista=calendario')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1, name: 'Sales recap' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    // the agenda instead of the grid
    await expect(page.getByTestId('recap-agenda')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.getByTestId('recap-agenda').getByTestId('giorno-recap').first().click()
    const foglio = page.getByRole('dialog')
    await expect(foglio.getByRole('heading', { level: 3, name: 'Closing' })).toBeVisible()
    await page.keyboard.press('Escape')
    // the table scrolls inside its frame, never the page
    await page.goto('/recap?vista=tabella')
    await expect(page.getByRole('table', { name: 'The month like the sheet' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
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
