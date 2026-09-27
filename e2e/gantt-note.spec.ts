import { expect, test } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { attendiPagina, creaProgettoDiProva, pulisciProgetti, type ProgettoDiProva } from './pm-db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Gantt Note '

test.describe('Note e Gantt del progetto', () => {
  let progetto: ProgettoDiProva

  test.beforeEach(async () => {
    await pulisciProgetti(PREFISSO)
    progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)
  })

  test.afterEach(async () => {
    await pulisciProgetti(PREFISSO)
  })

  test('una nota compare sotto la sua data e si sposta se cambia giorno', async ({ page }) => {
    const oggi = oggiRoma()
    const ieri = aggiungiGiorni(oggi, -1)
    const tempoFa = aggiungiGiorni(oggi, -4)

    await accedi(page, 'setter')
    await page.goto(`/progetti/${progetto.id}/note`)
    await attendiPagina(page)
    await expect(page.getByText('Ancora nessuna nota')).toBeVisible()

    const composer = page.getByRole('form', { name: 'Nuova nota' })
    await composer.getByLabel('Nuova nota').fill('Il cliente ha approvato la scaletta')
    await composer.getByLabel('Giorno').fill(ieri)
    await composer.getByRole('button', { name: 'Aggiungi nota' }).click()
    await expect(page.getByText('Nota aggiunta', { exact: true })).toBeVisible()

    const sezioneIeri = page.getByTestId(`note-${ieri}`)
    await expect(sezioneIeri.getByRole('heading')).toHaveText(`Ieri · ${formatData(ieri)}`)
    await expect(sezioneIeri.getByTestId('nota')).toContainText('Il cliente ha approvato la scaletta')
    await expect(sezioneIeri.getByTestId('nota')).toContainText('Tu')

    await composer.getByLabel('Nuova nota').fill('Riprese fissate per giovedì')
    await composer.getByLabel('Giorno').fill(oggi)
    await composer.getByRole('button', { name: 'Aggiungi nota' }).click()
    const sezioneOggi = page.getByTestId(`note-${oggi}`)
    await expect(sezioneOggi.getByRole('heading')).toHaveText(`Oggi · ${formatData(oggi)}`)
    await expect(sezioneOggi.getByTestId('nota')).toContainText('Riprese fissate per giovedì')

    // most recent day first
    const intestazioni = page.getByRole('heading', { level: 2 })
    await expect(intestazioni.first()).toHaveText(`Oggi · ${formatData(oggi)}`)

    // moved to another day: it leaves yesterday
    await sezioneIeri.getByRole('button', { name: 'Modifica la nota' }).click()
    const foglio = page.getByRole('dialog', { name: 'Modifica la nota' })
    await foglio.getByLabel('Giorno').fill(tempoFa)
    await foglio.getByRole('button', { name: 'Salva la nota' }).click()
    await expect(page.getByText('Nota aggiornata', { exact: true })).toBeVisible()
    await expect(page.getByTestId(`note-${tempoFa}`).getByTestId('nota')).toContainText('Il cliente ha approvato la scaletta')
    await expect(page.getByTestId(`note-${ieri}`)).toHaveCount(0)
  })

  test('il Gantt mostra liste, barre, rombo, oggi, i task senza date e la vista tabella', async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto(`/progetti/${progetto.id}/gantt`)
    await attendiPagina(page)

    const grafico = page.getByTestId('gantt-grafico').filter({ visible: true })
    await expect(grafico).toBeVisible()
    await expect(grafico.getByTestId('gantt-lista')).toHaveCount(2)
    await expect(grafico.getByTestId('gantt-barra')).toHaveCount(2)
    await expect(grafico.getByTestId('gantt-rombo')).toHaveCount(1)
    await expect(grafico.getByText('Oggi', { exact: true })).toBeVisible()
    // completed: an icon, not only a paler bar
    await expect(grafico.getByRole('img', { name: 'Completata' })).toBeVisible()
    await expect(page.getByText('Lista (milestone)')).toBeVisible()
    await expect(page.getByTestId('gantt-senza-date')).toContainText('Idee per il prossimo mese')

    // tooltip on hover: dates, state, who
    const oggi = oggiRoma()
    await grafico.getByRole('button', { name: /^Montaggio:/ }).hover()
    const tooltip = page.locator('[data-slot="popover-content"]')
    await expect(tooltip).toContainText(`Dal ${formatData(aggiungiGiorni(oggi, -3))} al ${formatData(aggiungiGiorni(oggi, 4))}`)
    await expect(tooltip).toContainText('In corso')
    await expect(tooltip).toContainText('Loris Setter')
    await page.mouse.move(0, 0)

    // month scale keeps the same marks
    await page.getByRole('button', { name: 'Mesi' }).click()
    await expect(grafico.getByTestId('gantt-barra')).toHaveCount(2)

    // the table view
    await page.getByRole('button', { name: 'Tabella' }).click()
    const tabella = page.getByRole('table', { name: 'Liste e attività del progetto con le loro date' })
    await expect(tabella).toBeVisible()
    await expect(tabella.getByRole('row', { name: /Revisione cliente/ })).toContainText(formatData(aggiungiGiorni(oggi, 8)))
    await expect(tabella.getByRole('row', { name: /Idee per il prossimo mese/ })).toBeVisible()
    await expect(grafico).toHaveCount(0)
  })

  test('sul telefono scorre solo la linea del tempo, mai la pagina', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'setter')
    await page.goto(`/progetti/${progetto.id}/gantt`)
    await attendiPagina(page)
    await expect(page.getByTestId('gantt-grafico').filter({ visible: true })).toBeVisible()

    const misure = await page.evaluate(() => {
      const assi = [...document.querySelectorAll<HTMLElement>('[aria-label="Linea del tempo: scorri in orizzontale"]')]
      const asse = assi.find((a) => a.offsetParent !== null)!
      return {
        pagina: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        asse: asse.scrollWidth > asse.clientWidth,
      }
    })
    expect(misure).toEqual({ pagina: false, asse: true })

    // below 768px the table becomes cards
    await page.getByRole('button', { name: 'Tabella' }).click()
    await expect(page.getByTestId('gantt-tabella').getByRole('listitem').filter({ hasText: 'Montaggio' })).toBeVisible()
  })
})
