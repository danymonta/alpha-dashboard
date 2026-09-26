import { expect, test, type Page } from '@playwright/test'

import {
  ID_ADMIN,
  ID_CLOSER,
  ID_SETTER,
  chiudiCall,
  creaCallDiProva,
  creaClienteConVendita,
  dbLocale,
  pulisciVendite,
} from './db'
import { accedi } from './utenti'

// Client names start with this: the lead "E2EVendita123 Rossi" becomes nome "E2EVendita123"
const PREFISSO = 'E2EVendita'

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
})

async function scegli(page: Page, nome: string | RegExp) {
  const radio = page.getByRole('radio', { name: nome, exact: typeof nome === 'string' })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

test.describe('Nuova vendita dal closer', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'closer')
  })

  test('call chiusa → vendita con piano rate generato dal database', async ({ page }) => {
    const nome = `${PREFISSO}${Date.now()}`
    const callId = await creaCallDiProva(`${nome} Rossi`, ID_CLOSER)
    await chiudiCall(callId)

    await page.goto(`/sales/new?call=${callId}`)
    await expect(page.getByTestId('precompilata')).toContainText('Loris Setter')
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(nome)
    await expect(page.getByLabel('Cognome')).toHaveValue('Rossi')

    await scegli(page, /Percorso Alpha 6 mesi/)
    // list price arrives by itself
    await expect(page.getByLabel('Valore del contratto')).toHaveValue('2.400,00')
    await scegli(page, '3')

    const anteprima = page.getByTestId('anteprima-rate')
    await expect(anteprima.getByRole('row')).toHaveCount(4) // header + 3
    await expect(anteprima).toContainText('800,00')

    await page.getByRole('button', { name: 'Registra vendita' }).click()
    await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${nome} Rossi`)
    await expect(page.getByTestId('piano-rate').getByRole('listitem')).toHaveCount(3)
    // nothing cashed yet: the whole contract is still to collect
    await expect(page.getByTestId('riepilogo-incassi')).toContainText('Incassato0,00')
    await expect(page.getByTestId('riepilogo-incassi')).toContainText('Da incassare2.400,00')

    const { data: vendita } = await dbLocale()
      .from('sales')
      .select('tipo, setter_id, closer_id, valore_contratto, numero_rate, cliente:clients(lead_id, nome)')
      .eq('call_id', callId)
      .single()
    expect(vendita).toMatchObject({
      tipo: 'nuovo',
      setter_id: ID_SETTER,
      closer_id: ID_CLOSER,
      valore_contratto: 2400,
      numero_rate: 3,
    })
    expect(vendita?.cliente?.lead_id).toBeTruthy()
  })

  test('la stessa call non produce una seconda vendita', async ({ page }) => {
    const callId = await creaCallDiProva(`${PREFISSO}${Date.now()} Doppia`, ID_CLOSER)
    await chiudiCall(callId)

    await page.goto(`/sales/new?call=${callId}`)
    await scegli(page, /Percorso Alpha 3 mesi/)
    await page.getByRole('button', { name: 'Registra vendita' }).click()
    await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/)

    await page.goto(`/sales/new?call=${callId}`)
    await expect(page.getByText('Vendita già registrata')).toBeVisible()
    await page.getByRole('link', { name: 'Apri la vendita' }).click()
    await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/)
  })

  test('una call non chiusa non porta a una vendita', async ({ page }) => {
    const callId = await creaCallDiProva(`${PREFISSO}${Date.now()} Aperta`, ID_CLOSER)
    await page.goto(`/sales/new?call=${callId}`)
    await expect(page.getByText('La call non risulta chiusa')).toBeVisible()
  })

  test('senza prodotto il modulo dice cosa manca', async ({ page }) => {
    const callId = await creaCallDiProva(`${PREFISSO}${Date.now()} Vuota`, ID_CLOSER)
    await chiudiCall(callId)
    await page.goto(`/sales/new?call=${callId}`)
    await page.getByRole('button', { name: 'Registra vendita' }).click()
    await expect(page.getByText('Scegli il prodotto')).toBeVisible()
    await expect(page).toHaveURL(/\/sales\/new/)
  })
})

test('l’admin registra un rinnovo su un cliente esistente', async ({ page }) => {
  const clienteId = await creaClienteConVendita(`${PREFISSO}${Date.now()}`, ID_ADMIN)
  await accedi(page, 'admin')

  await page.goto(`/sales/new?cliente=${clienteId}`)
  await expect(page.getByText('cliente già registrato')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Rinnovo' })).toBeChecked()

  await scegli(page, /Percorso Alpha 3 mesi/)
  await page.getByRole('button', { name: 'Registra vendita' }).click()

  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Rinnovo', { exact: true })).toBeVisible()
})

test('il setter non registra vendite', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/sales/new')
  await expect(page).toHaveURL('/today')
})
