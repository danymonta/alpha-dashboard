import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

test('la panoramica risponde alla domanda del mese', async ({ page }) => {
  await accedi(page, 'admin')
  await expect(page).toHaveURL('/')

  for (const etichetta of [
    'Cash incassato',
    'Revenue firmata',
    'Nuovi clienti firmati',
    'Rinnovi firmati',
    'Margine operativo',
  ]) {
    await expect(page.getByText(etichetta, { exact: true }).first()).toBeVisible()
  }
  // "quanto è nuovo e quanto è rinnovo": the cash split, not the count of sales
  await expect(page.getByTestId('cash-per-tipo')).toContainText('da nuovi')
  await expect(page.getByTestId('cash-per-tipo')).toContainText('da rinnovi')
  await expect(page.getByText('Tasse escluse.')).toBeVisible()

  await page.getByText('Vedi come tabella').click()
  await expect(page.getByRole('table', { name: 'Cash incassato per mese e tipo' })).toBeVisible()
})

test('un mese passato si apre dal selettore e non mostra i numeri di oggi', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('link', { name: 'Mese precedente' }).click()
  await expect(page).toHaveURL(/\?mese=/)
  await expect(page.getByTestId('oggi-team')).toHaveCount(0)
  await expect(page.getByTestId('stato-live')).toHaveCount(0)
})

test('tempo reale: il setter salva, la panoramica dell’admin si aggiorna da sola', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage()
  const setter = await (await browser.newContext()).newPage()

  await accedi(admin, 'admin')
  await expect(admin.getByTestId('stato-live')).toHaveAttribute('data-stato', 'live', { timeout: 15_000 })
  const dmPrima = Number((await admin.getByTestId('oggi-DM').innerText()).replace(/\D/g, ''))

  await accedi(setter, 'setter')
  await setter.goto('/today')
  await setter.getByRole('button', { name: 'DM outbound: più 5' }).click()
  await expect(setter.getByTestId('stato-salvato')).toBeVisible()
  await expect(setter.getByText('Salvataggio…')).toHaveCount(0)

  // no reload on the admin side: the number changes on its own
  await expect(admin.getByTestId('oggi-DM')).toHaveText(String(dmPrima + 5), { timeout: 15_000 })
  await expect(admin.getByTestId('stato-live')).toContainText('aggiornato alle')

  await admin.context().close()
  await setter.context().close()
})

test('setter e closer non raggiungono la panoramica', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/')
  await expect(page).toHaveURL('/today')
})
