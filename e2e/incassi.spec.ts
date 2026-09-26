import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, ID_CLOSER, creaVenditaDiProva, pulisciVendite } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2EIncasso'

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
})

function rata(page: Page, nome: string) {
  return page.getByRole('listitem', { name: nome, exact: true })
}

test.describe('incassi dall’admin', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'admin')
  })

  test('segna una rata incassata con un tocco, e si può annullare dal toast', async ({ page }) => {
    const id = await creaVenditaDiProva(`${PREFISSO}${Date.now()}`, ID_ADMIN)
    await page.goto(`/sales/${id}`)

    const riepilogo = page.getByTestId('riepilogo-incassi')
    await expect(riepilogo).toContainText('Incassato0,00')

    await rata(page, 'Rata 1').getByRole('button', { name: 'Segna incassata' }).click()
    await expect(page.getByText('Rata 1 incassata · 300,00')).toBeVisible()
    await expect(rata(page, 'Rata 1').getByText('Incassata', { exact: true })).toBeVisible()
    await expect(riepilogo).toContainText('Incassato300,00')

    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(rata(page, 'Rata 1').getByRole('button', { name: 'Segna incassata' })).toBeVisible()
    await expect(riepilogo).toContainText('Incassato0,00')
  })

  test('modifica una rata: il dettaglio segnala lo scarto dal contratto', async ({ page }) => {
    const id = await creaVenditaDiProva(`${PREFISSO}${Date.now()}`, ID_ADMIN, { giorniFa: 5 })
    await page.goto(`/sales/${id}`)

    await rata(page, 'Rata 3').getByRole('button', { name: /Altre azioni/ }).click()
    const foglio = page.getByRole('dialog')
    await foglio.getByRole('button', { name: 'Modifica scadenza o importo' }).click()
    await foglio.getByLabel('Importo previsto').fill('250')
    await foglio.getByRole('button', { name: 'Salva la rata' }).click()

    await expect(page.getByText('Il piano rate non torna con il contratto: scarto di 50,00')).toBeVisible()
  })

  test('un rimborso diventa una riga a parte e riduce l’incassato', async ({ page }) => {
    const id = await creaVenditaDiProva(`${PREFISSO}${Date.now()}`, ID_ADMIN)
    await page.goto(`/sales/${id}`)

    await rata(page, 'Rata 1').getByRole('button', { name: 'Segna incassata' }).click()
    await expect(page.getByTestId('riepilogo-incassi')).toContainText('Incassato300,00')

    await rata(page, 'Rata 1').getByRole('button', { name: /Altre azioni/ }).click()
    const foglio = page.getByRole('dialog')
    await foglio.getByRole('button', { name: 'Registra un rimborso' }).click()
    await foglio.getByLabel('Importo').fill('100')
    await foglio.getByRole('button', { name: 'Registra il rimborso' }).click()

    await expect(rata(page, 'Rata 1 rimborso')).toContainText('-100,00')
    await expect(page.getByTestId('riepilogo-incassi')).toContainText('Incassato200,00')
  })

  test('la vendita del mese compare nell’elenco e i filtri funzionano', async ({ page }) => {
    const nome = `${PREFISSO}${Date.now()}`
    await creaVenditaDiProva(nome, ID_ADMIN, { giorniFa: 0 })

    await page.goto('/sales')
    // the list renders cards (mobile) and a table (desktop): only one is visible
    await expect(page.getByText(nome).filter({ visible: true })).toHaveCount(1)

    await page.getByLabel('Tipo').selectOption('upsell')
    await page.getByRole('button', { name: 'Filtra' }).click()
    await expect(page).toHaveURL(/tipo=upsell/)
    await expect(page.getByText(nome).filter({ visible: true })).toHaveCount(0)
  })
})

test('il closer incassa le sue vendite ma non tocca il piano', async ({ page }) => {
  const nome = `${PREFISSO}${Date.now()}`
  const id = await creaVenditaDiProva(nome, ID_CLOSER)
  await accedi(page, 'closer')

  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Le mie vendite' }).click()
  await page.getByRole('link', { name: new RegExp(nome) }).first().click()
  await expect(page).toHaveURL(`/sales/${id}`)

  await rata(page, 'Rata 1').getByRole('button', { name: 'Segna incassata' }).click()
  await expect(page.getByText('Rata 1 incassata')).toBeVisible()

  await rata(page, 'Rata 2').getByRole('button', { name: /Altre azioni/ }).click()
  const foglio = page.getByRole('dialog')
  await expect(foglio.getByRole('button', { name: 'Pagamento fallito' })).toBeVisible()
  await expect(foglio.getByRole('button', { name: 'Modifica scadenza o importo' })).toHaveCount(0)
})
