import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { ID_ADMIN, ID_SETTER, dbLocale } from './db'
import { attendiPagina, creaProgettoDiProva, pulisciProgetti, type ProgettoDiProva } from './pm-db'
import { accedi } from './utenti'

/**
 * "I miei task" (Dany, 04/10/2026): a task I tick stays in its place, struck
 * through, with "Fatto · Annulla"; on the next visit it is in "Completati",
 * with the day; "Riapri" sends it back to its group. The seed setter is in no
 * project but the one made here.
 */
const PREFISSO = 'E2E Miei completati '

let progetto: ProgettoDiProva

test.beforeEach(async () => {
  await pulisciProgetti(PREFISSO)
  progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)
})
test.afterAll(async () => {
  await pulisciProgetti(PREFISSO)
})

async function statoDi(id: string) {
  return (await dbLocale().from('pm_task').select('stato').eq('id', id).single()).data?.stato
}

/** How many completed tasks the setter has, counted by the database. */
async function completatiDelSetter() {
  const { count, error } = await dbLocale()
    .from('v_pm_task')
    .select('id', { count: 'exact', head: true })
    .contains('assegnatari', [ID_SETTER])
    .eq('stato', 'completato')
  if (error) throw error
  return count ?? 0
}

async function spuntaRiapriERitrova(page: Page) {
  // three round trips to the server and a reload: longer than the default under a full run
  test.setTimeout(90_000)
  const risposta = { timeout: 20_000 }
  await accedi(page, 'setter')
  await page.goto('/task?vista=elenco')
  await attendiPagina(page)

  const settimana = page.getByTestId('gruppo-settimana')
  const completati = page.getByTestId('gruppo-completati')
  const riga = settimana.getByRole('listitem', { name: 'Montaggio' }).filter({ hasText: progetto.nome })
  const prima = await completatiDelSetter()
  await expect(completati.getByRole('heading', { level: 2 })).toHaveText(`Completati (${prima})`, risposta)

  // ticked: it stays where it was, struck through, with the toast to undo
  const casella = riga.getByRole('checkbox', { name: 'Completa Montaggio' })
  await casella.click()
  await expect(page.getByText('Fatto', { exact: true })).toBeVisible(risposta)
  await expect(riga).toContainText('Completato adesso')
  await expect(riga.getByRole('checkbox', { name: 'Riapri Montaggio' })).toBeChecked()
  await expect(riga.getByText('Montaggio', { exact: true })).toHaveCSS('text-decoration-line', 'line-through')
  await expect(riga.getByRole('button', { name: /timer/ })).toHaveCount(0)
  await expect(riga.getByRole('checkbox', { name: 'Riapri Montaggio' })).toBeFocused()
  await expect(page.getByTestId('annuncio-miei-task')).toHaveText(
    'Montaggio: completato. Resta qui spuntato, poi lo trovi in Completati.',
  )
  await expect.poll(() => statoDi(progetto.task.montaggio)).toBe('completato')
  // the server already counts it (the page re-rendered), and the row did not move
  await expect(completati.getByRole('heading', { level: 2 })).toHaveText(`Completati (${prima + 1})`, risposta)
  await expect(riga).toContainText('Completato adesso')
  await expect(completati.getByRole('listitem', { name: 'Montaggio' }).filter({ hasText: progetto.nome })).toHaveCount(0)

  // Annulla: open again, in the same place, the focus on it
  const annulla = page.getByRole('button', { name: 'Annulla' })
  // the toast may still be sliding in: its transform gives 43.99999 for a moment
  await expect.poll(async () => Math.round((await annulla.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44)
  await annulla.click()
  await expect(page.getByText('Task riaperto', { exact: true })).toBeVisible(risposta)
  await expect(riga.getByRole('checkbox', { name: 'Completa Montaggio' })).not.toBeChecked()
  await expect(riga).not.toContainText('Completato adesso')
  await expect(riga.getByRole('checkbox', { name: 'Completa Montaggio' })).toBeFocused()
  await expect.poll(() => statoDi(progetto.task.montaggio)).toBe('da_fare')
  await expect(completati.getByRole('heading', { level: 2 })).toHaveText(`Completati (${prima})`, risposta)
  await expect(riga.getByRole('button', { name: 'Avvia il timer su Montaggio' })).toBeVisible()

  // ticked again, then the page opened again: under "Completati", with today
  await riga.getByRole('checkbox', { name: 'Completa Montaggio' }).click()
  await expect.poll(() => statoDi(progetto.task.montaggio)).toBe('completato')
  await expect(completati.getByRole('heading', { level: 2 })).toHaveText(`Completati (${prima + 1})`, risposta)
  await page.reload()
  await expect(riga).toHaveCount(0)
  const chiuso = completati.getByRole('listitem', { name: 'Montaggio' }).filter({ hasText: progetto.nome })
  await expect(chiuso).toContainText(/Completato oggi alle \d\d:\d\d/)
  await expect(chiuso.getByRole('button', { name: /timer/ })).toHaveCount(0)
  // "Brief e materiali" is completed but nobody's: it stays in its project
  await expect(page.getByRole('listitem', { name: 'Brief e materiali' })).toHaveCount(0)

  // Riapri: back in its group, the focus on its checkbox
  const riapri = chiuso.getByRole('button', { name: 'Riapri Montaggio' })
  expect((await riapri.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await riapri.click()
  await expect(riga.getByRole('checkbox', { name: 'Completa Montaggio' })).toBeVisible(risposta)
  await expect(chiuso).toHaveCount(0)
  await expect(riga.getByRole('checkbox', { name: 'Completa Montaggio' })).toBeFocused()
  await expect(page.getByTestId('annuncio-miei-task')).toHaveText('Montaggio: riaperto, torna in Prossimi 7 giorni.')
  await expect.poll(() => statoDi(progetto.task.montaggio)).toBe('da_fare')

  // never wider than the screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
}

test('spunto un task: resta lì barrato con Annulla, poi lo ritrovo in Completati e lo riapro', async ({ page }) => {
  await spuntaRiapriERitrova(page)
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('lo stesso a 390 px', async ({ page }) => {
    await spuntaRiapriERitrova(page)
  })
})

test('Completati: i 30 più recenti, poi "Mostra tutti" con il conteggio del database', async ({ page }) => {
  test.setTimeout(90_000)
  const db = dbLocale()
  const ieri = aggiungiGiorni(oggiRoma(), -1)
  const quanti = 32
  const { data: creati, error } = await db
    .from('pm_task')
    .insert(
      Array.from({ length: quanti }, (_, i) => ({
        progetto_id: progetto.id,
        titolo: `Consegna ${String(i + 1).padStart(2, '0')}`,
        ordine: 20 + i,
        stato: 'completato' as const,
        created_by: ID_ADMIN,
      })),
    )
    .select('id, titolo')
  if (error) throw error
  const { error: e2 } = await db
    .from('pm_task_assegnatari')
    .insert(creati.map((t) => ({ task_id: t.id, profile_id: ID_SETTER, created_by: ID_ADMIN })))
  if (e2) throw e2
  // closed yesterday, a minute apart: "Consegna 01" is the most recent
  await Promise.all(
    creati.map(async (t) => {
      const n = Number(t.titolo.slice(-2))
      const istante = new Date(`${ieri}T10:00:00+02:00`)
      istante.setMinutes(istante.getMinutes() - n)
      const { error: e3 } = await db.from('pm_task').update({ completato_il: istante.toISOString() }).eq('id', t.id)
      if (e3) throw e3
    }),
  )
  const totale = await completatiDelSetter()
  expect(totale).toBeGreaterThanOrEqual(quanti)

  await accedi(page, 'setter')
  await page.goto('/task?vista=elenco')
  await attendiPagina(page)
  const completati = page.getByTestId('gruppo-completati')
  await expect(completati.getByRole('heading', { level: 2 })).toHaveText(`Completati (${totale})`)
  await expect(completati.getByTestId('mio-task-completato')).toHaveCount(30)
  const primo = completati.getByTestId('mio-task-completato').first()
  await expect(primo).toHaveAccessibleName('Consegna 01')
  await expect(primo).toContainText('Completato ieri alle 09:59')
  await expect(primo.getByRole('link', { name: progetto.nome })).toHaveAttribute('href', `/progetti/${progetto.id}/attivita`)

  await completati.getByRole('link', { name: `Mostra tutti (${totale})` }).click()
  await expect(page).toHaveURL(/\/task\?completati=tutti$/)
  await expect(completati.getByTestId('mio-task-completato')).toHaveCount(Math.min(totale, 1000))
  await expect(completati.getByRole('listitem', { name: 'Consegna 32' })).toBeVisible()
  await expect(completati.getByRole('link', { name: /Mostra tutti/ })).toHaveCount(0)

  await completati.getByRole('link', { name: 'Mostra solo i più recenti' }).click()
  await expect(page).toHaveURL(/\/task$/)
  await expect(completati.getByTestId('mio-task-completato')).toHaveCount(30)
})

test('nessun task aperto: "Niente da fare", e sotto quelli chiusi', async ({ page }) => {
  // "Montaggio" is the setter's only task: closed, nothing is left to do
  const { error } = await dbLocale().from('pm_task').update({ stato: 'completato' }).eq('id', progetto.task.montaggio)
  if (error) throw error
  const { count: aperti } = await dbLocale()
    .from('v_pm_task')
    .select('id', { count: 'exact', head: true })
    .contains('assegnatari', [ID_SETTER])
    .neq('stato', 'completato')
  expect(aperti).toBe(0)

  await accedi(page, 'setter')
  await page.goto('/task?vista=elenco')
  await attendiPagina(page)
  await expect(page.getByText('Niente da fare', { exact: true })).toBeVisible()
  await expect(page.getByTestId('mio-task')).toHaveCount(0)
  const chiuso = page
    .getByTestId('gruppo-completati')
    .getByRole('listitem', { name: 'Montaggio' })
    .filter({ hasText: progetto.nome })
  await expect(chiuso).toContainText(/Completato oggi alle \d\d:\d\d/)
})
