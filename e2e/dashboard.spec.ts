import { expect, test } from '@playwright/test'

import { ID_ADMIN, ID_SETTER, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2EDashboard'

test.afterAll(async () => {
  const db = dbLocale()
  await pulisciVendite(PREFISSO)
  await db.from('commission_payouts').delete().eq('note', PREFISSO)
})

test('incassi: la rata in ritardo si incassa dall’elenco e passa tra le incassate', async ({ page }) => {
  const nome = `${PREFISSO}${Date.now()}`
  await creaVenditaDiProva(nome, ID_ADMIN, { valore: 600, rate: 2, giorniFa: 40 })
  await accedi(page, 'admin')

  await page.goto('/payments')
  const rata = page.getByRole('listitem', { name: `${nome} Incassi rata 1` })
  await expect(rata).toContainText('giorni di ritardo')

  await rata.getByRole('button', { name: 'Segna incassata' }).click()
  await expect(page.getByText('Rata 1 incassata · 300,00')).toBeVisible()
  await expect(page.getByRole('listitem', { name: `${nome} Incassi rata 1` })).toHaveCount(0)

  await page.getByRole('link', { name: /Incassate nel mese/ }).click()
  await expect(page.getByRole('listitem', { name: `${nome} Incassi rata 1` })).toBeVisible()
})

test('setting: metriche per setter e report del mese', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/setting')
  const card = page.getByTestId('metriche-setter')
  await expect(card.getByRole('heading', { name: 'Loris Setter' })).toBeVisible()
  await expect(card.getByText('DM totali')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Report giornalieri del mese' })).toBeVisible()
})

test('provvigioni: saldo, registrazione del pagamento, storico', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/commissions')
  await expect(page.getByTestId(`saldo-${ID_SETTER}`)).toContainText('€')

  await page.getByRole('button', { name: 'Registra pagamento' }).first().click()
  const foglio = page.getByRole('dialog')
  await foglio.getByLabel('Importo').fill('12,34')
  await foglio.getByLabel('Note (facoltative)').fill(PREFISSO)
  await foglio.getByRole('button', { name: 'Registra pagamento' }).click()

  await expect(page.getByText('Pagamento a Loris Setter registrato')).toBeVisible()
  await expect(page.getByText('12,34 €').filter({ visible: true }).first()).toBeVisible()
})

test('i miei numeri: il setter vede solo i suoi totali', async ({ page }) => {
  await accedi(page, 'setter')
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'I miei numeri' }).click()

  await expect(page.getByTestId('mie-provvigioni')).toContainText('€')
  await expect(page.getByText('DM totali')).toBeVisible()
  // no client name, no single sale: the seed clients never appear here
  await expect(page.getByText(/Bianchi|Martini|Neri/)).toHaveCount(0)
})
