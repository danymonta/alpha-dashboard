import { expect, test } from '@playwright/test'

import { dbLocale } from './db'
import { attendiPagina, creaProgettoDiProva, pulisciProgetti, type ProgettoDiProva } from './pm-db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Panoramica '

test.describe('progetti come in Zoho, ma semplici', () => {
  let progetto: ProgettoDiProva

  test.beforeEach(async () => {
    await pulisciProgetti(PREFISSO)
    progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)
  })
  test.afterEach(async () => {
    await pulisciProgetti(PREFISSO)
  })

  test('la panoramica è la prima scheda: avanzamento, stati, scadenze, tappe', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto(`/progetti/${progetto.id}`)
    await attendiPagina(page)
    await expect(page.getByRole('navigation', { name: 'Sezioni del progetto' }).getByRole('link').first()).toHaveText('Panoramica')

    const panoramica = page.getByTestId('panoramica-progetto')
    await expect(panoramica).toContainText('25%')
    await expect(panoramica).toContainText('1 di 4 task')
    await expect(panoramica.getByRole('listitem').filter({ hasText: 'Da fare' })).toContainText('2')
    await expect(panoramica.getByRole('listitem').filter({ hasText: 'In corso' })).toContainText('1')
    await expect(panoramica).toContainText('2 task aperti senza assegnatario')
    await expect(panoramica).toContainText('Nessun task in ritardo.')
    const scadenze = panoramica.getByRole('region', { name: /Prossime scadenze/ })
    await expect(scadenze).toContainText('Montaggio')
    await expect(scadenze).toContainText('Revisione cliente')
    await expect(panoramica).toContainText('Preparazione')

    await panoramica.getByRole('link', { name: 'Tutte le attività del progetto' }).click()
    await expect(page).toHaveURL(new RegExp(`/progetti/${progetto.id}/attivita$`))
  })

  test('i miei task: quello che mi è assegnato, per scadenza; lo spunto da qui', async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto('/task')
    await attendiPagina(page)
    const settimana = page.getByTestId('gruppo-settimana')
    const riga = settimana.getByRole('listitem', { name: 'Montaggio' })
    await expect(riga).toContainText(progetto.nome)
    await expect(riga.getByRole('button', { name: 'Avvia il timer su Montaggio' })).toBeVisible()
    // "Revisione cliente" has no assignee: it stays in its project
    await expect(page.getByRole('listitem', { name: 'Revisione cliente' })).toHaveCount(0)

    await riga.getByRole('checkbox', { name: 'Completa Montaggio' }).click()
    await expect(page.getByText('Task completato')).toBeVisible()
    await expect
      .poll(async () => (await dbLocale().from('pm_task').select('stato').eq('id', progetto.task.montaggio).single()).data?.stato)
      .toBe('completato')
  })
})

test('il cliente compare solo nei reparti che lavorano sui clienti, e dà il nome al progetto', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/progetti')
  await attendiPagina(page)
  await page.getByRole('button', { name: 'Nuovo progetto' }).first().click()
  const foglio = page.getByRole('dialog', { name: 'Nuovo progetto' })

  await foglio.getByLabel('Reparto').selectOption({ label: 'Vendite e Marketing' })
  await expect(foglio.getByLabel('Cliente')).toHaveCount(0)

  await foglio.getByLabel('Reparto').selectOption({ label: 'Fitness Coaching' })
  const cliente = foglio.getByLabel('Cliente')
  await expect(cliente).toBeVisible()
  const scelta = (await cliente.locator('option').nth(1).textContent())!.trim()
  await cliente.selectOption({ label: scelta })
  await expect(foglio.getByLabel('Nome', { exact: true })).toHaveValue(scelta)

  // back to a department without clients: the client goes away
  await foglio.getByLabel('Reparto').selectOption({ label: 'Contenuti e Video' })
  await expect(foglio.getByLabel('Cliente')).toHaveCount(0)
})

test('scelto il reparto, il modello mostrato è quello proposto', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/progetti')
  await attendiPagina(page)
  await page.getByRole('button', { name: 'Nuovo progetto' }).first().click()
  const foglio = page.getByRole('dialog', { name: 'Nuovo progetto' })
  await foglio.getByLabel('Reparto').selectOption({ label: 'Fitness Coaching' })
  await expect(foglio.getByLabel('Modello').locator('option:checked')).toHaveText('Percorso cliente')
  await expect(foglio.getByText('Apre il progetto con 12 attività')).toBeVisible()
})
