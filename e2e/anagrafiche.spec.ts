import { expect, test } from '@playwright/test'

import { ID_ADMIN, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2EAnagrafica'

test.afterAll(async () => {
  const db = dbLocale()
  await pulisciVendite(PREFISSO)
  await db.from('products').delete().like('nome', `${PREFISSO}%`)
  await db.from('expenses').delete().like('descrizione', `${PREFISSO}%`)
})

test.beforeEach(async ({ page }) => {
  await accedi(page, 'admin')
})

test('scheda cliente: valore nel tempo, rinnovo precompilato, contatti modificabili', async ({ page }) => {
  const nome = `${PREFISSO}${Date.now()}`
  const venditaId = await creaVenditaDiProva(nome, ID_ADMIN, { valore: 900, rate: 3 })
  const { data: vendita } = await dbLocale().from('sales').select('client_id').eq('id', venditaId).single()
  const clienteId = vendita!.client_id

  await page.goto('/clients')
  await page.getByLabel('Cerca un cliente').fill(nome)
  await page.getByLabel('Cerca un cliente').press('Enter')
  await page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true }).click()
  await expect(page).toHaveURL(`/clients/${clienteId}`)
  await expect(page.getByText('Storico vendite (1)')).toBeVisible()

  await page.getByRole('button', { name: 'Modifica', exact: true }).click()
  await page.getByLabel('Telefono').fill('+39 333 1234567')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Cliente aggiornato')).toBeVisible()
  await expect(page.getByText('+39 333 1234567')).toBeVisible()

  await page.getByRole('link', { name: 'Registra rinnovo' }).click()
  await expect(page).toHaveURL(`/sales/new?cliente=${clienteId}&tipo=rinnovo`)
  await expect(page.getByRole('radio', { name: 'Rinnovo' })).toBeChecked()
})

test('i filtri per stato mostrano solo i clienti di quello stato', async ({ page }) => {
  await page.goto('/clients?stato=attivo')
  const tabella = page.locator('table')
  await expect(tabella.getByText('Attivo', { exact: true }).first()).toBeVisible()
  await expect(tabella.getByText('Scaduto', { exact: true })).toHaveCount(0)
})

test('prodotti: creo, metto fuori vendita e sparisce dal modulo di vendita', async ({ page }) => {
  const nome = `${PREFISSO} Percorso ${Date.now()}`
  await page.goto('/settings')
  await page.getByRole('link', { name: /Prodotti/ }).click()

  await page.getByRole('button', { name: 'Nuovo prodotto' }).first().click()
  await page.getByLabel('Nome').fill(nome)
  await page.getByLabel('Durata (mesi)').fill('2')
  await page.getByLabel('Prezzo di listino').fill('990')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Prodotto creato')).toBeVisible()
  await expect(page.getByText(nome)).toBeVisible()

  await page.goto('/sales/new')
  await expect(page.getByRole('radio', { name: new RegExp(nome) })).toHaveCount(1)

  await page.goto('/settings/products')
  await page.getByRole('switch', { name: `${nome} in vendita` }).click()
  await expect(page.getByText(`${nome} fuori vendita`)).toBeVisible()

  await page.goto('/sales/new')
  await expect(page.getByRole('radio', { name: new RegExp(nome) })).toHaveCount(0)
})

test('costi: aggiungo, il totale del mese cambia, elimino con doppia conferma', async ({ page }) => {
  const descrizione = `${PREFISSO} costo ${Date.now()}`
  await page.goto('/expenses')
  const totalePrima = await page.getByTestId('totale-costi').locator('p').nth(1).innerText()

  await page.getByRole('radio', { name: 'Software' }).locator('..').click()
  await page.getByLabel('Descrizione').fill(descrizione)
  await page.getByLabel('Importo').fill('12,50')
  await page.getByRole('button', { name: 'Aggiungi costo' }).click()

  await expect(page.getByText('Costo aggiunto')).toBeVisible()
  await expect(page.getByText(descrizione)).toBeVisible()
  await expect(page.getByTestId('totale-costi').locator('p').nth(1)).not.toHaveText(totalePrima)

  await page.getByRole('button', { name: `Elimina ${descrizione}` }).click()
  await page.getByRole('button', { name: 'Conferma' }).click()
  await expect(page.getByText('Costo eliminato')).toBeVisible()
  await expect(page.getByText(descrizione)).toHaveCount(0)
  await expect(page.getByTestId('totale-costi').locator('p').nth(1)).toHaveText(totalePrima)
})

test('copiare i ricorrenti due volte non duplica nulla', async ({ page }) => {
  await page.goto('/expenses')
  const bottone = page.getByRole('button', { name: /Copia i ricorrenti di/ })
  await bottone.click()
  await bottone.click()
  await expect(page.getByText('Nessun costo da copiare: i ricorrenti ci sono già.').first()).toBeVisible()
})
