import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Pipeline'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
})

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

test('il setter sposta un suo lead in follow-up con un tocco', async ({ page }) => {
  const nome = `${PREFISSO} Setter ${Date.now()}`
  await creaCallDiProva(nome, ID_CLOSER)
  await accedi(page, 'setter')

  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Pipeline' }).click()
  await expect(page).toHaveURL('/leads')

  const stato = scheda(page, nome).getByRole('radiogroup', { name: `Stato di ${nome}` })
  await expect(stato.getByRole('radio', { name: 'Call fissata' })).toHaveAttribute('aria-checked', 'true')

  await stato.getByRole('radio', { name: 'Follow-up' }).click()
  await expect(page.getByText(`${nome}: follow-up`)).toBeVisible()

  await page.goto('/leads?stato=follow_up')
  await expect(
    scheda(page, nome).getByRole('radio', { name: 'Follow-up' }),
  ).toHaveAttribute('aria-checked', 'true')
})

test('il closer aggiorna il lead della sua call, e non vede gli altri', async ({ page }) => {
  const suo = `${PREFISSO} Closer ${Date.now()}`
  const altrui = `${PREFISSO} Dany ${Date.now()}`
  await creaCallDiProva(suo, ID_CLOSER)
  await creaCallDiProva(altrui, ID_ADMIN)
  await accedi(page, 'closer')

  await page.goto('/leads')
  await expect(scheda(page, altrui)).toHaveCount(0)

  await scheda(page, suo).getByRole('radio', { name: 'Cliente' }).click()
  await expect(page.getByText(`${suo}: cliente`)).toBeVisible()

  const { data } = await dbLocale().from('leads').select('stato').eq('nome', suo).single()
  expect(data?.stato).toBe('cliente')
})

test('la ricerca trova un lead per nome', async ({ page }) => {
  const nome = `${PREFISSO} Ricerca ${Date.now()}`
  await creaCallDiProva(nome, ID_CLOSER)
  await accedi(page, 'admin')

  await page.goto('/leads')
  await page.getByLabel('Cerca per nome o handle').fill(nome)
  await page.getByLabel('Cerca per nome o handle').press('Enter')

  await expect(page).toHaveURL(/q=/)
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(scheda(page, nome)).toBeVisible()
})
