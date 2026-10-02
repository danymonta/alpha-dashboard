import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Pipeline'

test.afterAll(async () => {
  const db = dbLocale()
  const { data: leads } = await db.from('leads').select('id').like('nome', `${PREFISSO}%`)
  const ids = (leads ?? []).map((l) => l.id)
  if (ids.length) {
    const { data: clienti } = await db.from('clients').select('id').in('lead_id', ids)
    const idClienti = (clienti ?? []).map((c) => c.id)
    if (idClienti.length) {
      // a paid instalment opened the client's project (02/10/2026): it goes too
      await db.from('pm_progetti').delete().in('client_id', idClienti)
      await db.from('sales').delete().in('client_id', idClienti)
      await db.from('clients').delete().in('id', idClienti)
    }
  }
  await db.from('leads').delete().like('nome', `${PREFISSO}%`)
})

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

async function cambiaStato(page: Page, nome: string, stato: string) {
  await scheda(page, nome).getByRole('button', { name: 'Cambia stato' }).click()
  await page.getByRole('dialog').getByRole('radiogroup', { name: `Stato di ${nome}` }).getByRole('radio', { name: stato }).click()
}

test('il setter sposta un suo lead in follow-up', async ({ page }) => {
  const nome = `${PREFISSO} Setter ${Date.now()}`
  await creaCallDiProva(nome, ID_CLOSER, -24)
  await accedi(page, 'setter')

  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Pipeline' }).click()
  await expect(scheda(page, nome).getByTestId('stato-lead')).toHaveText('Call da fare')

  await cambiaStato(page, nome, 'Follow-up')
  await expect(page.getByText(`${nome}: follow-up`)).toBeVisible()

  await page.goto('/leads?stato=follow_up')
  await expect(scheda(page, nome).getByTestId('stato-lead')).toHaveText('Follow-up')
})

test('una call persa propone "Segna perso", e un tocco risolve', async ({ page }) => {
  const nome = `${PREFISSO} Persa ${Date.now()}`
  const callId = await creaCallDiProva(nome, ID_CLOSER)
  await dbLocale().from('calls').update({ stato: 'svolta', qualificata: false, esito: 'persa' }).eq('id', callId)
  await accedi(page, 'closer')

  await page.goto('/leads')
  const card = scheda(page, nome)
  await expect(card.getByTestId('suggerimento-lead')).toContainText('L’ultima call è andata persa.')
  await card.getByRole('button', { name: 'Segna perso' }).click()

  await expect(card.getByTestId('stato-lead')).toHaveText('Perso')
  await expect(card.getByTestId('suggerimento-lead')).toHaveCount(0)
})

test('una call chiusa porta il closer alla vendita, il setter no', async ({ page, browser }) => {
  const nome = `${PREFISSO} Chiusa ${Date.now()}`
  const callId = await creaCallDiProva(nome, ID_CLOSER)
  await dbLocale().from('calls').update({ stato: 'svolta', qualificata: true, esito: 'chiusa' }).eq('id', callId)

  await accedi(page, 'closer')
  await page.goto('/leads')
  await expect(scheda(page, nome).getByRole('link', { name: 'Registra la vendita' })).toHaveAttribute(
    'href',
    `/sales/new?call=${callId}`,
  )

  const setter = await (await browser.newContext()).newPage()
  await accedi(setter, 'setter')
  await setter.goto('/leads')
  await expect(scheda(setter, nome).getByRole('button', { name: 'Segna cliente' })).toBeVisible()
  await expect(scheda(setter, nome).getByRole('link', { name: 'Registra la vendita' })).toHaveCount(0)
  await setter.context().close()
})

test('il closer non vede i lead delle call di altri', async ({ page }) => {
  const altrui = `${PREFISSO} Dany ${Date.now()}`
  await creaCallDiProva(altrui, ID_ADMIN)
  await accedi(page, 'closer')
  await page.goto('/leads')
  await expect(scheda(page, altrui)).toHaveCount(0)
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
