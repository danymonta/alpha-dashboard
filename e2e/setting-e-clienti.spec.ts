import { expect, test } from '@playwright/test'

import { dbLocale, ID_ADMIN, ID_CLOSER } from './db'
import { accedi } from './utenti'

// a day far from every period the other tests look at
const GIORNO = '2020-01-15'

const ALTRUI = 'Cliente Altrui'

test.afterEach(async () => {
  const db = dbLocale()
  await db.from('setter_daily_reports').delete().eq('setter_id', ID_ADMIN).eq('data', GIORNO)
  const { data: clienti } = await db.from('clients').select('id').eq('nome', ALTRUI)
  for (const c of clienti ?? []) {
    await db.from('sales').delete().eq('client_id', c.id)
    await db.from('clients').delete().eq('id', c.id)
  }
})

test('setting: l’admin aggiunge una giornata, e un giorno che c’è già non si sovrascrive', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/setting')

  const aggiungi = async () => {
    await page.getByTestId('aggiungi-giornata').click()
    const foglio = page.getByRole('dialog')
    await foglio.getByLabel('Chi').selectOption({ label: 'Dany Montagnolo' })
    await foglio.getByLabel('Giorno', { exact: true }).fill(GIORNO)
    await foglio.getByLabel('DM outbound').fill('12')
    await foglio.getByLabel('Conversazioni').fill('4')
    await foglio.getByRole('button', { name: 'Salva la giornata' }).click()
    return foglio
  }

  await aggiungi()
  await expect(page.getByText('Giornata aggiunta')).toBeVisible()
  const { data } = await dbLocale()
    .from('setter_daily_reports')
    .select('dm_outbound, conversazioni')
    .eq('setter_id', ID_ADMIN)
    .eq('data', GIORNO)
    .single()
  expect(data).toEqual({ dm_outbound: 12, conversazioni: 4 })

  const foglio = await aggiungi()
  await expect(foglio.getByText('c’è già: correggilo dalla tabella')).toBeVisible()
})

test('i miei numeri: il setter vede i suoi clienti, cosa hanno pagato e la sua provvigione', async ({ page }) => {
  // a sale brought by someone else: the setter never sees it
  const db = dbLocale()
  const { data: prodotto } = await db.from('products').select('id').eq('nome', 'Percorso Alpha 6 mesi').single()
  const { data: cliente } = await db.from('clients').insert({ nome: ALTRUI, created_by: ID_ADMIN }).select('id').single()
  await db.from('sales').insert({
    client_id: cliente!.id,
    product_id: prodotto!.id,
    tipo: 'nuovo',
    setter_id: ID_ADMIN,
    closer_id: ID_CLOSER,
    data_vendita: '2026-09-01',
    data_inizio: '2026-09-01',
    data_fine: '2027-02-28',
    valore_contratto: 1500,
    numero_rate: 1,
    created_by: ID_ADMIN,
  })

  await accedi(page, 'setter')
  await page.goto('/my-numbers')

  const clienti = page.getByTestId('miei-clienti')
  await expect(clienti.getByText('I tuoi clienti')).toBeVisible()
  const primo = clienti.getByRole('listitem').first()
  await expect(primo).toContainText('revenue')
  await expect(primo).toContainText('Rate pagate')
  await expect(primo).toContainText('€')

  await primo.getByText('Le rate').click()
  await expect(primo.getByText('Rata 1', { exact: true })).toBeVisible()

  await expect(clienti.getByRole('listitem', { name: 'Bianchi' })).not.toHaveCount(0)
  await expect(page.getByText(ALTRUI)).toHaveCount(0)
})

test('provvigioni: l’admin vede la percentuale del setter cliente per cliente, anche nella vendita', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/commissions')
  const perCliente = page.getByTestId('provvigioni-per-cliente').first()
  const riga = perCliente.getByRole('listitem').first()
  await expect(riga).toContainText('%')
  await expect(riga).toContainText('€')

  await riga.getByRole('link').click()
  await expect(page).toHaveURL(/\/sales\//)
  await expect(page.getByText('Provvigione setter')).toBeVisible()
})

test('incassi dal telefono: la vista scelta resta in vista anche dopo una ricarica', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto('/payments?vista=incassate')
  const scelta = page.getByRole('navigation', { name: 'Viste' }).locator('[aria-current="page"]')
  await expect(scelta).toBeVisible()
  await expect(scelta).toBeInViewport({ ratio: 1 })
})

test('l’admin può essere il setter di una vendita: su quella il setter non matura provvigione', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/commissions')
  const riga = page.getByTestId('provvigioni-per-cliente').first().getByRole('listitem').first()
  await riga.getByRole('link').click()
  await expect(page).toHaveURL(/\/sales\//)

  await page.getByRole('button', { name: 'Modifica', exact: true }).click()
  const setter = page.getByRole('dialog').getByLabel('Setter')
  await expect(setter.locator('option', { hasText: 'Dany Montagnolo' })).toHaveCount(1)
  await expect(setter.locator('option', { hasText: 'Loris Setter' })).toHaveCount(1)
})
