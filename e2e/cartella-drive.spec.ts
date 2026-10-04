import { expect, test } from '@playwright/test'

import { dbLocale, ID_ADMIN, ID_CLOSER, PRODOTTO_6_MESI } from './db'
import { accedi } from './utenti'

/**
 * The link to the client's Google Drive folder (Dany, 04/10/2026): the admin
 * adds it, opens it and takes it away from the client sheet, on the phone too;
 * the closer, who reads his clients and his sales, never sees it.
 */
const NOME = 'Cliente Con Cartella'
const URL_DRIVE = 'https://drive.google.com/drive/folders/e2e-cartella-53'

function oggiRoma() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

async function creaCliente() {
  const db = dbLocale()
  const { data, error } = await db
    .from('clients')
    .insert({ nome: NOME, closer_id: ID_CLOSER, created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

test.afterEach(async () => {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').eq('nome', NOME)
  for (const c of clienti ?? []) {
    await db.from('pm_progetti').delete().eq('client_id', c.id)
    await db.from('sales').delete().eq('client_id', c.id)
    // the folder link goes with the client (on delete cascade)
    await db.from('clients').delete().eq('id', c.id)
  }
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('l’admin collega la cartella Drive, la apre e toglie il link', async ({ page, context }) => {
    // several pages and actions compiled on the first hit by the dev server
    test.setTimeout(90_000)
    const id = await creaCliente()
    // the folder opens in a new tab: Google Drive answered locally, never on the network
    await context.route('https://drive.google.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Drive</title><p>Cartella</p>' }),
    )

    await accedi(page, 'admin')
    await page.goto(`/clients/${id}`)
    const riga = page.getByTestId('cartella-drive')
    await expect(riga).toContainText('Nessuna cartella collegata')

    await riga.getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
    const campo = foglio.getByLabel('Link della cartella')
    await campo.fill('https://example.com/cartella')
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(foglio.getByText('Incolla il link di una cartella di Google Drive')).toBeVisible()

    await campo.fill(URL_DRIVE)
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText('Cartella collegata')).toBeVisible()
    await expect(foglio).toBeHidden()

    const link = riga.getByRole('link', { name: /Cartella Drive/ })
    await expect(link).toHaveAttribute('href', URL_DRIVE)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const { data: salvata } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id).single()
    expect(salvata?.url).toBe(URL_DRIVE)

    // no sideways scroll on the phone, the pencil is a 44px target
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const matita = riga.getByRole('button', { name: 'Modifica il link della cartella Drive' })
    const box = await matita.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)

    const [scheda] = await Promise.all([page.waitForEvent('popup'), link.click()])
    await expect(scheda).toHaveURL(URL_DRIVE)
    await scheda.close()

    // the pencil opens on the saved link; "Togli il link" asks first
    await matita.click()
    await expect(foglio.getByLabel('Link della cartella')).toHaveValue(URL_DRIVE)
    await foglio.getByRole('button', { name: 'Togli il link' }).click()
    const domanda = page.getByRole('dialog', { name: /^Eliminare il link alla cartella Drive/ })
    await expect(domanda).toContainText('La cartella su Google Drive resta com’è')
    await domanda.getByRole('button', { name: 'Elimina' }).click()
    await expect(page.getByText('Link tolto')).toBeVisible()
    await expect(riga).toContainText('Nessuna cartella collegata')
    await expect(riga.getByRole('link')).toHaveCount(0)

    const { data: dopo } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id)
    expect(dopo).toEqual([])
  })
})

test('il closer non vede mai la cartella Drive del suo cliente', async ({ page }) => {
  test.setTimeout(90_000)
  const id = await creaCliente()
  const db = dbLocale()
  const oggi = oggiRoma()
  const fine = new Date(`${oggi}T12:00:00Z`)
  fine.setUTCMonth(fine.getUTCMonth() + 6)
  fine.setUTCDate(fine.getUTCDate() - 1)
  const { data: vendita, error } = await db
    .from('sales')
    .insert({
      client_id: id,
      product_id: PRODOTTO_6_MESI,
      tipo: 'nuovo',
      closer_id: ID_CLOSER,
      data_vendita: oggi,
      data_inizio: oggi,
      data_fine: fine.toISOString().slice(0, 10),
      valore_contratto: 2400,
      numero_rate: 2,
      created_by: ID_ADMIN,
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await db.from('clienti_cartelle').insert({ client_id: id, url: URL_DRIVE, created_by: ID_ADMIN })
  if (e2) throw e2

  await accedi(page, 'closer')
  // the client sheet is the admin's: the closer is sent back to his own pages
  await page.goto(`/clients/${id}`)
  await expect(page).not.toHaveURL(new RegExp(`/clients/${id}`))
  expect(await page.content()).not.toContain('drive.google.com')

  // his sales list and his sale: the client is there, the folder never
  await page.goto('/my-sales')
  await expect(page.getByText(NOME).filter({ visible: true }).first()).toBeVisible()
  expect(await page.content()).not.toContain('drive.google.com')
  await page.goto(`/sales/${vendita.id}`)
  await expect(page.getByText(NOME).filter({ visible: true }).first()).toBeVisible()
  const html = await page.content()
  expect(html).not.toContain('drive.google.com')
  expect(html).not.toContain('Cartella Drive')
})
