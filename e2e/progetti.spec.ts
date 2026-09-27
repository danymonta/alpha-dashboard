import { expect, test } from '@playwright/test'

import { ID_COACH, ID_EDITOR, creaProgettoDiProva, creaTaskDiProva, dbLocale, pulisciProgetti } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Progetto'

test.afterAll(async () => {
  await pulisciProgetti(PREFISSO)
})

test('il manager crea il progetto di un cliente dal modello e trova le 12 attività', async ({ page }) => {
  const nome = `${PREFISSO} percorso ${Date.now()}`
  await accedi(page, 'coach')
  await page.goto('/progetti')

  await page.getByRole('button', { name: 'Nuovo progetto in Fitness Coaching' }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByLabel('Nome', { exact: true }).fill(nome)
  // the first template of the department is already chosen
  await expect(foglio.getByLabel('Modello').locator('option:checked')).toHaveText('Percorso cliente')
  await expect(foglio.getByText('Apre il progetto con 12 attività')).toBeVisible()
  // only the app admin links a client
  await expect(foglio.getByLabel('Cliente')).toHaveCount(0)
  await foglio.getByText('Sara Editor').click()
  await foglio.getByRole('button', { name: 'Crea il progetto' }).click()

  await page.waitForURL(/\/progetti\/[0-9a-f-]{36}\/attivita$/)
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  await expect(page.getByTestId('task')).toHaveCount(12)
  for (const lista of ['Onboarding', 'Percorso', 'Chiusura e rinnovo']) {
    await expect(page.getByRole('heading', { level: 2, name: lista })).toBeVisible()
  }
  await expect(page.getByRole('listitem', { name: 'Call di onboarding' })).toBeVisible()

  const progettoId = page.url().split('/').at(-2)!
  const { data: membri } = await dbLocale().from('pm_membri').select('profile_id').eq('progetto_id', progettoId)
  expect(membri?.map((m) => m.profile_id).sort()).toEqual([ID_COACH, ID_EDITOR].sort())
})

test('l’employee completa il task assegnato a lui e non vede i comandi di gestione', async ({ page }) => {
  const { progettoId, listaId } = await creaProgettoDiProva(`${PREFISSO} reel ${Date.now()}`)
  const suo = await creaTaskDiProva(progettoId, listaId, 'Montaggio del reel di prova', ID_EDITOR)
  await creaTaskDiProva(progettoId, listaId, 'Riprese del coach', ID_COACH)

  await accedi(page, 'editor')
  await page.goto(`/progetti/${progettoId}/attivita`)
  await expect(page.getByTestId('task')).toHaveCount(2)

  // no project, list or member management for an employee
  await expect(page.getByRole('button', { name: 'Nuova lista' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Azioni sulla lista/ })).toHaveCount(0)
  // someone else's task stays closed to them
  await expect(page.getByRole('checkbox', { name: 'Completa Riprese del coach' })).toBeDisabled()

  await page.getByRole('checkbox', { name: 'Completa Montaggio del reel di prova' }).click()
  await expect(page.getByText('Task completato')).toBeVisible()
  // a completed task moves to the closed "Completati" group of its list
  await page.getByRole('button', { name: 'Completati (1)' }).click()
  await expect(page.getByRole('checkbox', { name: 'Riapri Montaggio del reel di prova' })).toBeChecked()
  const { data } = await dbLocale().from('pm_task').select('stato, completato_il').eq('id', suo).single()
  expect(data?.stato).toBe('completato')
  expect(data?.completato_il).not.toBeNull()

  // an employee adds tasks, though
  await page.getByLabel('Nuovo task in Montaggio').fill('Sottotitoli del reel')
  await page.getByLabel('Nuovo task in Montaggio').press('Enter')
  await expect(page.getByRole('listitem', { name: 'Sottotitoli del reel' })).toBeVisible()

  await page.getByRole('link', { name: 'Membri' }).click()
  await expect(page.getByTestId('membri-progetto').getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /dal progetto$/ })).toHaveCount(0)
  await expect(page.getByLabel('Aggiungi una persona')).toHaveCount(0)
})

test('l’admin collega un cliente, e chi non vede i clienti non vede il collegamento', async ({ page, browser }) => {
  const nome = `${PREFISSO} cliente ${Date.now()}`
  const { progettoId } = await creaProgettoDiProva(nome, { reparto: 'Fitness Coaching' })
  const { data: cliente } = await dbLocale().from('clients').select('id, nome, cognome').order('created_at').limit(1).single()
  const nomeCliente = [cliente!.nome, cliente!.cognome].filter(Boolean).join(' ')

  await accedi(page, 'admin')
  await page.goto(`/progetti/${progettoId}/attivita`)
  await page.getByRole('button', { name: 'Modifica', exact: true }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByLabel('Cliente').selectOption(cliente!.id)
  await foglio.getByRole('button', { name: 'Salva il progetto' }).click()
  await expect(page.getByText('Progetto salvato')).toBeVisible()
  await expect(page.getByText(`Cliente: ${nomeCliente}`)).toBeVisible()

  const { data } = await dbLocale().from('pm_progetti').select('client_id').eq('id', progettoId).single()
  expect(data?.client_id).toBe(cliente!.id)

  // the coach manages the project but has no access to clients
  const coach = await (await browser.newContext()).newPage()
  await accedi(coach, 'coach')
  await coach.goto(`/progetti/${progettoId}/attivita`)
  await expect(coach.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  await expect(coach.getByText('Cliente:')).toHaveCount(0)
  await coach.getByRole('button', { name: 'Modifica', exact: true }).click()
  await expect(coach.getByRole('dialog').getByLabel('Cliente')).toHaveCount(0)
  await coach.context().close()
})

test('chi non è membro non vede il progetto', async ({ page }) => {
  const nome = `${PREFISSO} riservato ${Date.now()}`
  const { progettoId } = await creaProgettoDiProva(nome)

  await accedi(page, 'setter')
  await page.goto('/progetti?stato=tutti')
  await expect(page.getByText(nome)).toHaveCount(0)

  await page.goto(`/progetti/${progettoId}/attivita`)
  await expect(page.getByText('Progetto non trovato')).toBeVisible()
  await expect(page.getByTestId('task')).toHaveCount(0)
})
