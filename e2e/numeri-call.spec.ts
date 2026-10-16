import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

/**
 * I numeri delle call registrate nella pagina Closer (1.37.0, CLAUDE.md sezione 31), sui dati del
 * seed (supabase/seeds/50_fathom.sql e 51_analisi_call.sql): copertura, durata e performance solo
 * per chi ha fatto le call, obiezioni più frequenti, e il raggruppamento per fonte e per contenuto.
 * Gli euro e le call chiuse per contenuto sono dell'admin; il setter legge la pagina senza la sezione.
 */

const PERIODO = 'da=2026-07-01&a=2026-10-31'

test('il closer legge copertura, durata, performance e obiezioni delle sue call', async ({ page }) => {
  await accedi(page, 'closer')
  await page.goto(`/setting/closer?${PERIODO}`)
  const sezione = page.getByTestId('dalle-registrazioni')
  await expect(sezione).toBeVisible()
  await expect(sezione.getByTestId('reg-registrate')).toContainText(/\d+ su \d+/)
  await expect(sezione.getByTestId('reg-durata')).toContainText('min')
  await expect(sezione.getByTestId('reg-performance')).toContainText('Performance confermata')
  await expect(sezione.getByTestId('reg-close-rate')).toBeVisible()
  await expect(sezione.getByTestId('reg-obiezioni')).toContainText('Obiezioni più frequenti')
  await expect(sezione.getByTestId('reg-obiezioni').getByRole('listitem').first()).toBeVisible()
  // by source: the closer's groups, no euros
  await sezione.getByRole('link', { name: 'Per fonte' }).click()
  const gruppi = page.getByTestId('reg-gruppi')
  await expect(gruppi).toBeVisible()
  expect(await page.locator('main').innerText()).not.toMatch(/Cash nuovi|Revenue nuovi/)
})

test('l’admin su tutti i closer vede il quadro senza performance; per fonte e per contenuto con gli euro', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/setting/closer?${PERIODO}`)
  const sezione = page.getByTestId('dalle-registrazioni')
  await expect(sezione).toBeVisible()
  // the coverage, the length and the performance judge who leads the calls: only on one's own
  await expect(sezione.getByTestId('reg-registrate')).toHaveCount(0)
  await expect(sezione.getByTestId('reg-performance')).toHaveCount(0)
  await expect(sezione.getByTestId('reg-solo-tue')).toBeVisible()
  await expect(sezione.getByTestId('reg-in-target')).toBeVisible()

  await page.goto(`/setting/closer?${PERIODO}&per=fonte`)
  await expect(page.getByTestId('reg-gruppi')).toBeVisible()
  await expect(page.getByTestId('dalle-registrazioni').getByRole('link', { name: 'Per fonte' })).toHaveAttribute('aria-current', 'page')
  expect(await page.getByTestId('reg-gruppi').innerText()).toMatch(/Cash nuovi|Revenue nuovi|Cash|Revenue/)

  await page.goto(`/setting/closer?${PERIODO}&per=contenuto`)
  await expect(page.getByTestId('dalle-registrazioni').getByRole('link', { name: 'Per contenuto' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('reg-gruppi').or(page.getByText('Nessuna call registrata nel periodo'))).toBeVisible()
})

test('a 390 px la sezione non scorre di lato e i bottoni sono da 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'closer')
  await page.goto(`/setting/closer?${PERIODO}&per=fonte`)
  await expect(page.getByTestId('dalle-registrazioni')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const nome of ['Totale', 'Per fonte', 'Per contenuto']) {
    const b = await page.getByTestId('dalle-registrazioni').getByRole('link', { name: nome }).boundingBox()
    expect(b!.height).toBeGreaterThanOrEqual(44)
  }
})

test('il setter legge la pagina Closer senza la sezione delle call registrate', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto(`/setting/closer?${PERIODO}&per=fonte`)
  await expect(page.getByRole('heading', { name: /Closer/ }).first()).toBeVisible()
  await expect(page.getByTestId('dalle-registrazioni')).toHaveCount(0)
})
