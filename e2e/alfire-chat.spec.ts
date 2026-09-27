import { expect, test } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

// Runs against the fake model (e2e/llm-finto.mjs): the dev server must start
// with ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and E2E_ALFIRE_FINTO=1 here.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

test.afterEach(async () => {
  await dbLocale().from('expenses').delete().like('descrizione', 'E2EAlfire%')
})

test('Alfire legge i numeri e registra un costo solo dopo la conferma', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')

  await pannello.getByRole('button', { name: 'Quanto ho incassato questo mese, e quanto è rinnovo?' }).click()
  await expect(pannello.getByText('Letto i numeri del periodo')).toBeVisible()
  await expect(pannello.getByText('Questo mese hai incassato 6.950,00 €.')).toBeVisible()

  await pannello.getByLabel('Scrivi ad Alfire').fill('Registra un costo di Canva da 12,99')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Registro il costo «E2EAlfire Canva»')
  // nothing written before the tap
  const prima = await dbLocale().from('expenses').select('id').like('descrizione', 'E2EAlfire%')
  expect(prima.data).toHaveLength(0)

  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(scheda).toContainText('Fatto')
  await expect(pannello.getByText('Fatto, ho registrato il costo.')).toBeVisible()
  const dopo = await dbLocale().from('expenses').select('importo, categoria').like('descrizione', 'E2EAlfire%').single()
  expect(dopo.data).toMatchObject({ importo: 12.99, categoria: 'software' })
})

test('annullando la scheda non si scrive niente', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill('Registra un costo di prova')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const scheda = pannello.getByTestId('alfire-conferma')
  await scheda.getByRole('button', { name: 'Annulla' }).click()
  await expect(scheda).toContainText('Annullato')
  const righe = await dbLocale().from('expenses').select('id').like('descrizione', 'E2EAlfire%')
  expect(righe.data).toHaveLength(0)
})

test('un vocale diventa testo; senza audio la route lo dice', async ({ page }) => {
  await accedi(page, 'admin')
  const audio = Buffer.alloc(4000, 1)
  const ok = await page.request.post('/api/alfire/voce', {
    multipart: { audio: { name: 'voce.webm', mimeType: 'audio/webm', buffer: audio } },
  })
  expect(ok.status()).toBe(200)
  expect(await ok.json()).toEqual({ testo: 'Quanto ho incassato questo mese?' })

  const vuoto = await page.request.post('/api/alfire/voce', { multipart: { altro: 'x' } })
  expect(vuoto.status()).toBe(400)
})
