import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Esito'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
})

function nomeUnico(etichetta: string) {
  return `${PREFISSO} ${etichetta} ${Date.now()}`
}

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

async function apriEsito(page: Page, nome: string) {
  await scheda(page, nome).getByRole('button', { name: /Registra esito|Cambia esito/ }).click()
  return page.getByRole('dialog')
}

test.describe('Le mie call, closer', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'closer')
  })

  test('no show in due tocchi', async ({ page }) => {
    const nome = nomeUnico('NoShow')
    await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    await expect(scheda(page, nome).getByText('Esito da registrare')).toBeVisible()

    const foglio = await apriEsito(page, nome) // 1
    await foglio.getByRole('button', { name: 'No show', exact: true }).click() // 2

    await expect(page.getByText(`${nome}: no show`)).toBeVisible()
    await expect(scheda(page, nome).getByText('No show')).toBeVisible()
  })

  test('persa in tre tocchi, con qualifica e obiezione', async ({ page }) => {
    const nome = nomeUnico('Persa')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    const foglio = await apriEsito(page, nome) // 1
    await foglio.getByRole('button', { name: 'Persa', exact: true }).click() // 2
    await foglio.getByLabel(/Obiezione principale/).fill('prezzo')
    await foglio.getByRole('button', { name: 'No', exact: true }).click() // 3

    await expect(scheda(page, nome).getByText('non qualificata')).toBeVisible()

    const { data } = await dbLocale()
      .from('calls')
      .select('stato, esito, qualificata, obiezione_principale')
      .eq('id', callId)
      .single()
    expect(data).toEqual({
      stato: 'svolta',
      esito: 'persa',
      qualificata: false,
      obiezione_principale: 'prezzo',
    })
  })

  test('chiusa porta alla nuova vendita precompilata', async ({ page }) => {
    const nome = nomeUnico('Chiusa')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    const foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Chiusa', exact: true }).click()

    await expect(page).toHaveURL(`/sales/new?call=${callId}`)
    // the client is prefilled from the lead: "E2E Esito Chiusa 123" -> nome + cognome
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('E2E')
    await expect(page.getByLabel('Cognome')).toHaveValue(nome.replace(/^E2E /, ''))
    await expect(page.getByTestId('precompilata')).toContainText('Loris Setter')
  })

  test('un esito sbagliato si annulla', async ({ page }) => {
    const nome = nomeUnico('Annulla')
    await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    let foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Cancellata', exact: true }).click()
    await expect(scheda(page, nome).getByText('Cancellata')).toBeVisible()

    foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: /Annulla l’esito/ }).click()
    await expect(scheda(page, nome).getByText('Esito da registrare')).toBeVisible()
  })

  test('il closer non vede le call assegnate all’admin', async ({ page }) => {
    const nome = nomeUnico('DiDany')
    await creaCallDiProva(nome, ID_ADMIN)
    await page.goto('/calls')
    await expect(scheda(page, nome)).toHaveCount(0)
  })
})

test('l’admin registra l’esito delle call assegnate a lui', async ({ page }) => {
  const nome = nomeUnico('Admin')
  await creaCallDiProva(nome, ID_ADMIN)
  await accedi(page, 'admin')
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Le mie call' }).click()

  const foglio = await apriEsito(page, nome)
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await foglio.getByRole('button', { name: 'Sì', exact: true }).click()
  await expect(scheda(page, nome).getByText('Follow-up')).toBeVisible()
})

test('il setter vede stato ed esito, ma non registra', async ({ page }) => {
  const nome = nomeUnico('Setter')
  await creaCallDiProva(nome, ID_CLOSER)
  await accedi(page, 'setter')
  await page.goto('/calls')

  await expect(scheda(page, nome).getByText('Esito da registrare')).toBeVisible()
  await expect(scheda(page, nome).getByText(/con Lorenzo/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registra esito' })).toHaveCount(0)
})

test('una call futura si può solo annullare o spostare', async ({ page }) => {
  const nome = nomeUnico('Futura')
  await creaCallDiProva(nome, ID_CLOSER, -48)
  await accedi(page, 'closer')
  await page.goto('/calls')

  await scheda(page, nome).getByRole('button', { name: 'Annulla o sposta' }).click()
  const foglio = page.getByRole('dialog')
  await expect(foglio.getByRole('button', { name: 'Riprogrammata', exact: true })).toBeVisible()
  await expect(foglio.getByRole('button', { name: 'Chiusa', exact: true })).toHaveCount(0)
  await expect(foglio.getByRole('button', { name: 'No show', exact: true })).toHaveCount(0)
})
