import { expect, test } from '@playwright/test'

import {
  ID_ADMIN,
  ID_COACH,
  ID_EDITOR,
  assegnatariDelTask,
  creaProgettoDiProva,
  creaTaskDiProva,
  dbLocale,
  pulisciProgetti,
} from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Progetto'

test.afterAll(async () => {
  await pulisciProgetti(PREFISSO)
})

test('il manager crea il progetto di un cliente dal modello e trova le 8 attività del coach', async ({ page }) => {
  const nome = `${PREFISSO} percorso ${Date.now()}`
  await accedi(page, 'coach')
  await page.goto('/progetti')

  await page.getByRole('button', { name: 'Nuovo progetto in Fitness Coaching' }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByLabel('Nome', { exact: true }).fill(nome)
  // the first template of the department is already chosen
  await expect(foglio.getByLabel('Modello').locator('option:checked')).toHaveText('Percorso cliente')
  await expect(foglio.getByText('Apre il progetto con 8 attività')).toBeVisible()
  // only the app admin links a client
  await expect(foglio.getByLabel('Cliente')).toHaveCount(0)
  await foglio.getByText('Sara Editor').click()
  await foglio.getByRole('button', { name: 'Crea il progetto' }).click()

  await page.waitForURL(/\/progetti\/[0-9a-f-]{36}\/attivita$/)
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  // since 02/10/2026 the client's path is 8 buckets, outside any list and without dates
  await expect(page.getByTestId('task')).toHaveCount(8)
  for (const titolo of ['Call di onboarding', 'Revisione video', 'Altre attività']) {
    await expect(page.getByRole('listitem', { name: titolo })).toBeVisible()
  }

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

test('il manager assegna un task a due persone e lo trovano entrambe nei loro task', async ({ page, browser }) => {
  const { progettoId, listaId } = await creaProgettoDiProva(`${PREFISSO} due mani ${Date.now()}`)
  const taskId = await creaTaskDiProva(progettoId, listaId, 'Reel a quattro mani', null)

  await accedi(page, 'coach')
  await page.goto(`/progetti/${progettoId}/attivita`)
  const riga = page.getByRole('listitem', { name: 'Reel a quattro mani' })
  await expect(riga).toContainText('Senza assegnatario')

  await riga.getByRole('button', { name: 'Reel a quattro mani', exact: true }).click()
  const foglio = page.getByRole('dialog')
  const persone = foglio.getByRole('group', { name: 'Assegnato a' })
  await persone.getByText('Marco Coach').click()
  await persone.getByText('Sara Editor').click()
  await foglio.getByRole('button', { name: 'Salva il task' }).click()
  await expect(page.getByText('Task salvato')).toBeVisible()
  await expect.poll(() => assegnatariDelTask(taskId)).toEqual([ID_COACH, ID_EDITOR].sort())
  await expect(riga.getByTestId('assegnatari-task')).toContainText('Marco Coach e Sara Editor')

  // a new task can start with its people too
  const lista = page.getByTestId('lista')
  await lista.getByLabel('Nuovo task in Montaggio').fill('Copertina a quattro mani')
  await lista.getByRole('button', { name: 'A chi assegnarlo' }).click()
  await lista.getByRole('group', { name: 'Assegnato a' }).getByText('Sara Editor').click()
  await lista.getByRole('group', { name: 'Assegnato a' }).getByText('Marco Coach').click()
  await lista.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(page.getByRole('listitem', { name: 'Copertina a quattro mani' })).toBeVisible()
  const { data: copertina } = await dbLocale()
    .from('pm_task')
    .select('id')
    .eq('progetto_id', progettoId)
    .eq('titolo', 'Copertina a quattro mani')
    .single()
  expect(await assegnatariDelTask(copertina!.id)).toEqual([ID_COACH, ID_EDITOR].sort())

  // both find it in "I miei task", with the name of the other person
  await page.goto('/task?vista=elenco')
  await expect(page.getByRole('listitem', { name: 'Reel a quattro mani' })).toContainText('con Sara Editor')

  const editor = await (await browser.newContext()).newPage()
  await accedi(editor, 'editor')
  await editor.goto('/task?vista=elenco')
  const suo = editor.getByRole('listitem', { name: 'Reel a quattro mani' })
  await expect(suo).toContainText('con Marco Coach')
  // one of two people, she closes it
  await suo.getByRole('checkbox', { name: 'Completa Reel a quattro mani' }).click()
  // it stays in its place, ticked, until she leaves the page (04/10/2026)
  await expect(editor.getByText('Fatto', { exact: true })).toBeVisible()
  await expect(suo).toContainText('Completato adesso')
  await expect
    .poll(async () => (await dbLocale().from('pm_task').select('stato').eq('id', taskId).single()).data?.stato)
    .toBe('completato')
  await editor.context().close()
})

test('l’admin collega un cliente, e chi non vede i clienti non vede il collegamento', async ({ page, browser }) => {
  const nome = `${PREFISSO} cliente ${Date.now()}`
  const { progettoId } = await creaProgettoDiProva(nome, { reparto: 'Fitness Coaching' })
  // a client without a project: since 02/10/2026 every paying client has its own, and is not offered again
  const { data: cliente } = await dbLocale()
    .from('clients')
    .insert({ nome: `${PREFISSO} cliente`, cognome: 'Senza progetto', created_by: ID_ADMIN })
    .select('id, nome, cognome')
    .single()
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
  await dbLocale().from('pm_progetti').delete().eq('id', progettoId)
  await dbLocale().from('clients').delete().eq('id', cliente!.id)
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
