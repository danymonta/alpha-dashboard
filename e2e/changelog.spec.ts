import { expect, test } from '@playwright/test'

import { VERSIONI } from '../lib/changelog/versioni'
import { formatData } from '../lib/format'
import { accedi } from './utenti'

const CORRENTE = VERSIONI[0]

test('l’admin apre il changelog da Impostazioni e vede la versione in uso', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/settings')

  const voce = page.getByTestId('voce-changelog')
  await expect(voce).toContainText('Changelog')
  await expect(voce).toContainText(`Versione ${CORRENTE.versione}`)
  await voce.click()

  await expect(page).toHaveURL(/\/changelog$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible()
  const inUso = page.getByTestId('versione-corrente')
  await expect(inUso).toContainText(`v${CORRENTE.versione}`)
  await expect(inUso).toContainText(formatData(CORRENTE.data))

  // every version, newest first
  const schede = page.getByTestId('versione')
  await expect(schede).toHaveCount(VERSIONI.length)
  await expect(schede.first()).toContainText(`v${CORRENTE.versione} · ${formatData(CORRENTE.data)}`)
  await expect(schede.first().getByRole('heading', { level: 2 })).toHaveText(CORRENTE.titolo)
  // the oldest version reads closed: title and counts, the lists open with a tap
  const primaVersione = VERSIONI.at(-1)!
  const ultima = schede.last()
  await expect(ultima).toContainText(`v${primaVersione.versione}`)
  await expect(ultima.getByText(primaVersione.novita[0])).toBeHidden()
  await ultima.getByRole('heading', { name: primaVersione.titolo }).click()
  await expect(ultima.getByText(primaVersione.novita[0])).toBeVisible()

  // the way back to the settings
  await page.getByRole('link', { name: 'Impostazioni' }).first().click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('il changelog sta bene a 390 px, senza scroll orizzontale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto('/changelog')
  await expect(page.getByTestId('versione-corrente')).toBeVisible()
  const larghezze = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(larghezze[0]).toBeLessThanOrEqual(larghezze[1])
})

test('setter e closer non aprono il changelog: tornano alla loro pagina', async ({ page, browser }) => {
  await accedi(page, 'setter')
  await page.goto('/changelog')
  await expect(page).toHaveURL('/today')
  await expect(page.getByRole('heading', { name: 'Changelog' })).toHaveCount(0)

  const closer = await browser.newPage()
  await accedi(closer, 'closer')
  await closer.goto('/changelog')
  await expect(closer).toHaveURL('/calls')
  await expect(closer.getByRole('heading', { name: 'Changelog' })).toHaveCount(0)
  await closer.close()
})
