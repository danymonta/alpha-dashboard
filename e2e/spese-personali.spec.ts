import { expect, test } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

// Spese personali (1.68.0): the admin's own expenses, apart from the business costs.
const PREFISSO = 'E2ESpesaPersonale'

test.afterAll(async () => {
  await dbLocale().from('spese_personali').delete().like('descrizione', `${PREFISSO}%`)
})

test('l’admin registra una spesa personale: il suo totale cambia, quello dei costi no', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/expenses')
  const costiPrima = await page.getByTestId('totale-costi').locator('p').nth(1).innerText()

  const descrizione = `${PREFISSO} ${Date.now()}`
  await page.goto('/spese-personali')
  await expect(page.getByRole('heading', { level: 1, name: 'Spese personali' })).toBeVisible()
  const totalePrima = await page.getByTestId('totale-spese-personali').locator('p').nth(1).innerText()

  await page.getByRole('radio', { name: 'Casa e bollette' }).locator('..').click()
  await page.getByLabel('Descrizione').fill(descrizione)
  await page.getByLabel('Importo').fill('42,50')
  await page.getByRole('button', { name: 'Aggiungi spesa' }).click()

  await expect(page.getByText('Spesa aggiunta')).toBeVisible()
  await expect(page.getByText(descrizione)).toBeVisible()
  await expect(page.getByTestId('totale-spese-personali').locator('p').nth(1)).not.toHaveText(totalePrima)

  // the business costs never see it
  await page.goto('/expenses')
  await expect(page.getByTestId('totale-costi').locator('p').nth(1)).toHaveText(costiPrima)

  await page.goto('/spese-personali')
  await page.getByRole('button', { name: new RegExp(`Elimina la spesa personale «${descrizione}»`) }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
  await expect(page.getByText('Spesa eliminata')).toBeVisible()
  await expect(page.getByText(descrizione)).toHaveCount(0)
})

test('nessun altro ruolo apre le spese personali', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/spese-personali')
  await expect(page).toHaveURL('/today')
  await expect(page.getByRole('heading', { name: 'Spese personali' })).toHaveCount(0)
})

test('a 390 px la pagina non scorre di lato', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto('/spese-personali')
  const larghezza = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(larghezza).toBeLessThanOrEqual(390)
})
