import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { PASSWORD_SEED, accedi, accediCliente, attendiStreaming } from './utenti'

/*
 * The client's home base (1.83.0): the seed's Davide moves between the tabs and completes a
 * text lesson of the Aula; the coach of Giorgio's project adds a check-up from «Percorso del
 * cliente» and Giorgio reads it with the Fathom link and without the team's notes; a member of
 * the project who is not on Giorgio's team never sees the tab. Local database only, invented data.
 */
const DAVIDE = '0b0b0000-0000-4000-8000-000000000001'
const GIORGIO = '0b0b0000-0000-4000-8000-000000000003'
const LEZIONE_TESTO = 'cc000000-0000-4000-8000-000000000002'
const ID_EDITOR = '55555555-5555-4555-8555-555555555555'
const ARGOMENTO = 'E2ECampo la discesa lenta'
const APPUNTI = 'E2ECampo appunti riservati del team'

async function progettoDi(clientId: string): Promise<string> {
  const { data, error } = await dbLocale().from('pm_progetti').select('id').eq('client_id', clientId).single()
  if (error) throw error
  return data.id
}

async function pulisci() {
  const db = dbLocale()
  await db.from('aula_progressi').delete().eq('client_id', DAVIDE).eq('lezione_id', LEZIONE_TESTO)
  await db.from('clienti_checkup').delete().eq('client_id', GIORGIO).like('argomento', 'E2ECampo%')
  const progetto = await progettoDi(GIORGIO)
  await db.from('pm_membri').delete().eq('progetto_id', progetto).eq('profile_id', ID_EDITOR)
}

test.beforeAll(pulisci)
test.afterAll(pulisci)

async function entraComeGiorgio(page: Page) {
  attendiStreaming(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill('giorgio.neri@example.test')
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/percorso'))
}

test('the client moves between the tabs and completes a lesson', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accediCliente(page)
  await expect(page.getByTestId('campo-base')).toBeVisible()

  for (const scheda of ['home', 'call', 'regole', 'community'] as const) {
    await page.getByTestId(`tab-${scheda}`).click()
    await expect(page.getByTestId('campo-base')).toHaveAttribute('data-scheda', scheda)
    await expect(page.getByTestId(`tab-${scheda}`)).toHaveAttribute('aria-current', 'page')
  }
  // the call tab: the seed's check-up, never the team's notes
  await page.getByTestId('tab-call').click()
  await expect(page.getByTestId('checkup').first()).toBeVisible()
  await expect(page.getByText('Appunti di prova')).toHaveCount(0)

  await page.getByTestId('tab-aula').click()
  await expect(page.getByTestId('aula-moduli')).toBeVisible()
  await page.goto(`/percorso?scheda=aula&modulo=ca000000-0000-4000-8000-000000000001&lezione=${LEZIONE_TESTO}`)
  await expect(page.getByTestId('lezione')).toBeVisible()
  await page.getByTestId('segna-completata').click()
  await expect(page.getByTestId('lezione-fatta')).toBeVisible()

  const { data } = await dbLocale().from('aula_progressi').select('completata_il').eq('client_id', DAVIDE).eq('lezione_id', LEZIONE_TESTO).single()
  expect(data?.completata_il).not.toBeNull()

  const larghezza = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(larghezza).toBeLessThanOrEqual(390)
})

test('the coach adds a check-up and the client reads it without the notes', async ({ page, browser }) => {
  const progetto = await progettoDi(GIORGIO)
  await accedi(page, 'coach')
  await page.goto(`/progetti/${progetto}/percorso`)
  await expect(page.getByTestId('percorso-progetto')).toBeVisible()
  await page.getByTestId('aggiungi-checkup').click()
  const foglio = page.getByTestId('foglio-checkup')
  await expect(foglio).toBeVisible()
  await foglio.getByLabel('Link di Fathom').fill('https://fathom.video/share/E2ECampoFinto')
  await foglio.getByLabel('Argomento', { exact: true }).fill(ARGOMENTO)
  await foglio.getByLabel('Appunti del team', { exact: true }).fill(APPUNTI)
  await foglio.getByLabel('Compiti entro la prossima call').fill('Carica il peso\nRallenta la discesa')
  await page.getByTestId('salva-checkup').click()
  await expect(page.getByTestId('checkup-team-voce').filter({ hasText: ARGOMENTO })).toBeVisible()
  await expect(page.getByTestId('checkup-team-voce').filter({ hasText: APPUNTI })).toBeVisible()

  const contesto = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const cliente = await contesto.newPage()
  await entraComeGiorgio(cliente)
  await cliente.goto('/percorso?scheda=call')
  const voce = cliente.getByTestId('checkup').filter({ hasText: ARGOMENTO })
  await expect(voce).toBeVisible()
  await expect(voce.getByText('Rallenta la discesa')).toBeVisible()
  await expect(voce.getByTestId('checkup-fathom')).toHaveAttribute('href', 'https://fathom.video/share/E2ECampoFinto')
  await expect(cliente.getByText(APPUNTI)).toHaveCount(0)
  expect(await cliente.content()).not.toContain(APPUNTI)
  await contesto.close()
})

test('a project member outside the client’s team never sees «Percorso del cliente»', async ({ page }) => {
  const progetto = await progettoDi(GIORGIO)
  const { error } = await dbLocale().from('pm_membri').insert({ progetto_id: progetto, profile_id: ID_EDITOR })
  if (error) throw error
  await accedi(page, 'editor')
  await page.goto(`/progetti/${progetto}`)
  await expect(page.getByRole('navigation', { name: 'Sezioni del progetto' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Percorso del cliente' })).toHaveCount(0)
  await page.goto(`/progetti/${progetto}/percorso`)
  await expect(page.getByTestId('percorso-progetto')).toHaveCount(0)
  expect(await page.content()).not.toContain('Appunti di prova')
})
