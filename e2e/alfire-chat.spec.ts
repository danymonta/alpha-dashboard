import { expect, test } from '@playwright/test'

import { ID_ADMIN, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// Runs against the fake model (e2e/llm-finto.mjs): the dev server must start
// with ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and E2E_ALFIRE_FINTO=1 here.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

test.afterEach(async () => {
  await dbLocale().from('expenses').delete().like('descrizione', 'E2EAlfire%')
  await pulisciVendite('E2EAlfire')
})

test('Alfire legge i numeri e registra un costo solo dopo la conferma', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')

  await pannello.getByRole('button', { name: 'Quanto ho incassato questo mese, e quanto è rinnovo?' }).click()
  await expect(pannello.getByText('Ho letto i numeri del periodo')).toBeVisible()
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
  await expect(pannello.getByText('Fatto: registra_costo.')).toBeVisible()
  const dopo = await dbLocale().from('expenses').select('importo, categoria').like('descrizione', 'E2EAlfire%').single()
  expect(dopo.data).toMatchObject({ importo: 12.99, categoria: 'software' })
})

test('una vendita raccontata in chat diventa vendita, rata incassata e cliente, non una nota; poi si corregge', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')

  await pannello.getByLabel('Scrivi ad Alfire').fill('Registra la vendita di Loris: annuale 2500 pagato in contanti oggi')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Registro la vendita a E2EAlfire Loris Presti')
  await expect(scheda).toContainText('in contanti')
  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: registra_vendita.')).toBeVisible()

  const db = dbLocale()
  const { data: cliente } = await db
    .from('clients')
    .select('id, fonte, instagram_handle, note')
    .eq('nome', 'E2EAlfire')
    .single()
  expect(cliente).toMatchObject({ fonte: 'referral', instagram_handle: '@loris_e2e' })
  const { data: vendita } = await db
    .from('sales')
    .select('id, tipo, valore_contratto, prodotto_personalizzato, setter_id, closer_id, data_inizio, data_fine')
    .eq('client_id', cliente!.id)
    .single()
  expect(vendita).toMatchObject({
    tipo: 'nuovo',
    valore_contratto: 2500,
    prodotto_personalizzato: 'Annuale E2E',
    setter_id: ID_ADMIN,
    closer_id: ID_ADMIN,
  })
  const { data: rate } = await db.from('payments').select('stato, importo_incassato, metodo').eq('sale_id', vendita!.id)
  expect(rate).toEqual([{ stato: 'incassata', importo_incassato: 2500, metodo: 'contanti' }])

  await pannello.getByLabel('Scrivi ad Alfire').fill('Cambia il telefono di Loris')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const correzione = pannello.getByTestId('alfire-conferma').last()
  await expect(correzione).toContainText('Correggo il cliente E2EAlfire Loris Presti')
  await expect(correzione).toContainText('Telefono: +39 333 000 0000')
  await correzione.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: modifica_cliente.')).toBeVisible()
  const { data: dopo } = await db.from('clients').select('telefono, fonte').eq('id', cliente!.id).single()
  expect(dopo).toEqual({ telefono: '+39 333 000 0000', fonte: 'referral' })
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

test('dopo «Ci sei?» Alfire può ancora scrivere: ha sempre tutti i suoi strumenti', async ({ page }) => {
  // Dany, 29/09/2026: the second message had no write words, the write tools were
  // taken away and Groq refused the model's write ("not in request.tools")
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  const casella = pannello.getByLabel('Scrivi ad Alfire')
  await casella.fill('Segna questa spesa, te la dico subito')
  await casella.press('Enter')
  await expect(pannello.getByText('Ciao, sono Alfire.')).toBeVisible()

  await casella.fill('Ci sei? Canva, 12,99 al mese')
  await casella.press('Enter')
  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Registro il costo «E2EAlfire Canva»')
  await expect(pannello).not.toContainText('request.tools')
  await scheda.getByRole('button', { name: 'Annulla' }).click()
  await expect(scheda).toContainText('Annullato')
})

test('una chiamata a uno strumento rifiutata una volta da Groq si riprova da sola', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill('Registra il costo con lo strumento instabile')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Registro il costo «E2EAlfire Canva»')
  await expect(pannello).not.toContainText('non ha risposto')
  await scheda.getByRole('button', { name: 'Annulla' }).click()
  await expect(scheda).toContainText('Annullato')
})

test('se Alfire legge e si ferma senza rispondere, la chat lo dice e offre di riprovare', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill('Leggi e taci')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const muta = pannello.getByTestId('alfire-muta')
  await expect(muta).toContainText('si è fermato prima di rispondere')
  await expect(muta.getByRole('button', { name: 'Riprova' })).toBeVisible()
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
