import { expect, test } from '@playwright/test'

import { ID_ADMIN, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2ERinnovoCliente'

/** '2026-09-29' -> '29/09/2026', as the app writes dates. */
function formatta(iso: string) {
  const [anno, mese, giorno] = iso.split('-')
  return `${giorno}/${mese}/${anno}`
}

function giornoDopo(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
})

test('ha rinnovato: il nuovo periodo parte il giorno dopo e il vecchio resta nello storico', async ({ page }) => {
  // 3 × 300 started 40 days ago, still running: the first two instalments are overdue
  const nome = `${PREFISSO}${Date.now()}`
  const venditaId = await creaVenditaDiProva(nome, ID_ADMIN, { valore: 900, rate: 3, giorniFa: 40 })
  const db = dbLocale()
  const { data: vendita } = await db
    .from('sales')
    .select('client_id, data_inizio, data_fine')
    .eq('id', venditaId)
    .single()
  const clienteId = vendita!.client_id
  const periodo = `dal ${formatta(vendita!.data_inizio)} al ${formatta(vendita!.data_fine)}`

  await accedi(page, 'admin')
  await page.goto(`/clients/${clienteId}`)
  const storico = page.getByTestId('storico-percorsi')
  await expect(storico.getByTestId('percorso')).toHaveCount(1)
  const primo = storico.getByRole('listitem', { name: 'Primo percorso', exact: true })
  await expect(primo.getByTestId('periodo')).toHaveText(periodo)
  await expect(primo.getByTestId('stato-percorso')).toHaveText('In corso')

  // the first instalment, cashed with one tap from the history
  const rata1 = primo.getByRole('listitem', { name: 'Primo percorso rata 1', exact: true })
  await rata1.getByRole('button', { name: 'Segna incassata' }).click()
  await expect(page.getByText('Rata 1 incassata')).toBeVisible()
  await expect(rata1.getByText('Incassata', { exact: true })).toBeVisible()
  await expect(rata1.getByRole('button', { name: 'Segna incassata' })).toHaveCount(0)

  // "Ha rinnovato": the form extends the last period
  await page.getByRole('link', { name: 'Ha rinnovato' }).click()
  await expect(page).toHaveURL(`/sales/new?cliente=${clienteId}&tipo=rinnovo`)
  await expect(page.getByRole('radio', { name: 'Rinnovo' })).toBeChecked()
  await expect(page.getByTestId('percorso-precedente')).toContainText(
    new RegExp(`Percorso precedente: Percorso Alpha 3 mesi, ${periodo}, 900,00\\s€`),
  )
  const inizio = giornoDopo(vendita!.data_fine)
  await expect(page.getByLabel('Inizio percorso')).toHaveValue(inizio)
  await expect(page.getByRole('radio', { name: /Percorso Alpha 3 mesi/ })).toBeChecked()
  await expect(page.getByTestId('setter-vendita')).toContainText('Rinnovo: nessun setter')

  await page.getByRole('button', { name: 'Registra vendita' }).click()
  await expect(page).toHaveURL(`/clients/${clienteId}`)
  await expect(page.getByText('Rinnovo registrato')).toBeVisible()

  // two periods: the renewal on top, the first path below with its paid instalment
  const percorsi = page.getByTestId('storico-percorsi').getByTestId('percorso')
  await expect(percorsi).toHaveCount(2)
  await expect(percorsi.nth(0)).toHaveAccessibleName('Rinnovo 1')
  await expect(percorsi.nth(0).getByTestId('periodo')).toContainText(`dal ${formatta(inizio)} al `)
  await expect(percorsi.nth(0).getByTestId('stato-percorso')).toHaveText('Da iniziare')
  await expect(percorsi.nth(1)).toHaveAccessibleName('Primo percorso')
  await expect(percorsi.nth(1).getByTestId('periodo')).toHaveText(periodo)
  await expect(
    percorsi.nth(1).getByRole('listitem', { name: 'Primo percorso rata 1', exact: true }).getByText('Incassata', { exact: true }),
  ).toBeVisible()

  // the database left the renewal without a setter
  const { data: rinnovo } = await db
    .from('sales')
    .select('setter_id, data_inizio')
    .eq('client_id', clienteId)
    .eq('tipo', 'rinnovo')
    .single()
  expect(rinnovo!.setter_id).toBeNull()
  expect(rinnovo!.data_inizio).toBe(inizio)
})

test('ha rinnovato in anticipo: parte quando finisce il percorso in corso, anche tra più di tre mesi', async ({ page }) => {
  // a path still running for 200 days: the renewal signed today starts in 201 days
  const nome = `${PREFISSO}Anticipo${Date.now()}`
  const venditaId = await creaVenditaDiProva(nome, ID_ADMIN, { valore: 900, rate: 3, giorniFa: 10 })
  const db = dbLocale()
  const fine = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10)
  const { data: vendita, error } = await db
    .from('sales')
    .update({ data_fine: fine })
    .eq('id', venditaId)
    .select('client_id')
    .single()
  if (error) throw error
  const inizio = giornoDopo(fine)

  await accedi(page, 'admin')
  await page.goto(`/sales/new?cliente=${vendita.client_id}&tipo=rinnovo`)
  await expect(page.getByLabel('Inizio percorso')).toHaveValue(inizio)
  await expect(page.getByTestId('percorso-precedente')).toContainText('Il rinnovo parte il giorno dopo.')
  await page.getByRole('button', { name: 'Registra vendita' }).click()
  await expect(page).toHaveURL(`/clients/${vendita.client_id}`)
  await expect(page.getByText('Rinnovo registrato')).toBeVisible()

  const { data: rinnovo } = await db
    .from('sales')
    .select('data_inizio')
    .eq('client_id', vendita.client_id)
    .eq('tipo', 'rinnovo')
    .single()
  expect(rinnovo!.data_inizio).toBe(inizio)
})
