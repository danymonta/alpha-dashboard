import { expect, test } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { intestazioneGiorno } from '../lib/tempo'
import { ID_SETTER } from './db'
import { attendiPagina, avviaTimerAltrove, creaProgettoDiProva, pulisciProgetti, type ProgettoDiProva } from './pm-db'
import { accedi } from './utenti'

const PREFISSO = 'E2E Tempo '

test.describe('Il mio tempo', () => {
  let progetto: ProgettoDiProva

  test.beforeEach(async () => {
    await pulisciProgetti(PREFISSO)
    progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)
  })

  test.afterEach(async () => {
    await pulisciProgetti(PREFISSO)
  })

  test('avvio e stop del timer da /tempo, con l’indicatore nella barra laterale', async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto('/tempo')
    await attendiPagina(page)

    const avvio = page.getByRole('form', { name: 'Avvia un timer' })
    await avvio.getByLabel('Progetto').selectOption({ label: progetto.nome })
    await avvio.getByLabel('Attività (facoltativa)').selectOption({ label: 'Montaggio' })
    await avvio.getByRole('button', { name: 'Avvia il timer' }).click()
    await expect(page.getByText('Timer avviato', { exact: true })).toBeVisible()

    // the indicator of the shell: project, task and a clock that runs
    const indicatore = page.getByTestId('timer-attivo-sidebar')
    await expect(indicatore).toContainText(progetto.nome)
    await expect(indicatore).toContainText('Montaggio')
    const orologio = indicatore.getByTestId('cronometro')
    await expect(orologio).toHaveText(/^00:00:\d\d$/)
    const primo = await orologio.innerText()
    await expect(orologio).not.toHaveText(primo, { timeout: 5_000 })
    await expect(page.getByRole('region', { name: 'Timer in corso' })).toBeVisible()

    // stop with a note, from the indicator
    await indicatore.getByRole('button', { name: 'Ferma' }).click()
    const popover = page.locator('[data-slot="popover-content"]')
    await popover.getByLabel('Nota (facoltativa)').fill('Primo taglio del video')
    await popover.getByRole('button', { name: 'Ferma il timer' }).click()
    await expect(page.getByText(/^Timer fermato · 1 min$/)).toBeVisible()
    await expect(indicatore).toHaveCount(0)

    // the stopped timer is today's entry, with the minutes computed by the database
    const giorno = page.getByTestId(`giorno-${oggiRoma()}`)
    const voce = giorno.getByTestId('voce-tempo').filter({ hasText: progetto.nome })
    await expect(voce).toContainText('Montaggio')
    await expect(voce).toContainText('1 min')
    await expect(voce).toContainText('Primo taglio del video')
    await expect(giorno.getByRole('heading')).toHaveText(`Oggi · ${formatData(oggiRoma())}`)
  })

  test('sul telefono il timer avviato altrove compare nella barra in alto e si ferma da lì', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'setter')
    await page.goto('/tempo')
    await attendiPagina(page)
    await expect(page.getByRole('form', { name: 'Avvia un timer' })).toBeVisible()
    await expect(page.getByTestId('timer-live')).toHaveAttribute('data-stato', 'live', { timeout: 15_000 })

    // started on another device: no reload here
    await avviaTimerAltrove(ID_SETTER, progetto.id, 5)
    const barra = page.getByTestId('timer-attivo-barra')
    await expect(barra).toBeVisible({ timeout: 15_000 })
    await expect(barra).toContainText(progetto.nome)
    await expect(barra.getByTestId('cronometro')).toHaveText(/^00:0[45]:\d\d$/)
    await expect(page.getByTestId('timer-attivo-sidebar')).toBeHidden()

    await barra.getByRole('button', { name: 'Ferma' }).click()
    await page.locator('[data-slot="popover-content"]').getByRole('button', { name: 'Ferma il timer' }).click()
    await expect(page.getByText(/^Timer fermato · 5 min$/)).toBeVisible()
    await expect(barra).toHaveCount(0)
    await expect(page.getByTestId(`giorno-${oggiRoma()}`).getByTestId('voce-tempo').filter({ hasText: progetto.nome })).toContainText(
      '5 min',
    )

    // no horizontal scroll of the page at 390px
    const scorre = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(scorre).toBe(false)
  })

  test('il tempo caricato dopo entra nel suo giorno, col totale calcolato dal database', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -21)
    await accedi(page, 'setter')
    await page.goto(`/tempo?settimana=${giorno}`)
    await attendiPagina(page)

    const modulo = page.getByRole('form', { name: 'Registra tempo passato' })
    await modulo.getByLabel('Progetto').selectOption({ label: progetto.nome })
    await modulo.getByLabel('Attività (facoltativa)').selectOption({ label: 'Montaggio' })
    await modulo.getByLabel('Giorno').fill(giorno)
    await modulo.getByLabel('Durata').fill('1:30')
    await modulo.getByLabel('Nota (facoltativa)').fill('Montaggio intro')
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(page.getByText('Tempo registrato', { exact: true })).toBeVisible()

    // same project and day stay selected; a quick duration
    await modulo.getByRole('button', { name: '30 min' }).click()
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()

    const sezione = page.getByTestId(`giorno-${giorno}`)
    await expect(sezione.getByRole('heading')).toHaveText(new RegExp(`^${intestazioneGiorno(giorno, oggiRoma())}$`, 'i'))
    await expect(sezione.getByTestId('voce-tempo')).toHaveCount(2)
    await expect(sezione.getByTestId('totale-giorno')).toHaveText(/2 h$/)
    await expect(page.getByTestId('totale-periodo')).toContainText('2 h')
    await expect(page.getByTestId('totale-periodo')).toContainText(progetto.nome)

    // correcting an entry recomputes the totals
    await sezione
      .getByTestId('voce-tempo')
      .filter({ hasNotText: 'Montaggio intro' })
      .getByRole('button', { name: /^Modifica / })
      .click()
    const foglio = page.getByRole('dialog', { name: 'Correggi il tempo' })
    await foglio.getByLabel('Durata').fill('1h')
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText('Tempo aggiornato', { exact: true })).toBeVisible()
    await expect(sezione.getByTestId('totale-giorno')).toHaveText(/2 h 30 min$/)

    // and deleting one too (two taps)
    const voceDaTogliere = sezione.getByTestId('voce-tempo').filter({ hasText: 'Montaggio intro' })
    await voceDaTogliere.getByRole('button', { name: /^Elimina / }).click()
    await voceDaTogliere.getByRole('button', { name: 'Conferma' }).click()
    await expect(sezione.getByTestId('voce-tempo')).toHaveCount(1)
    await expect(sezione.getByTestId('totale-giorno')).toHaveText(/1 h$/)
  })

  test('una durata illeggibile o un giorno futuro non si salvano', async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto('/tempo')
    await attendiPagina(page)
    const modulo = page.getByRole('form', { name: 'Registra tempo passato' })
    await modulo.getByLabel('Progetto').selectOption({ label: progetto.nome })
    await modulo.getByLabel('Durata').fill('tanto')
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(modulo.getByText('Scrivi la durata, ad esempio 1:30, 90 o 1h30')).toBeVisible()

    await modulo.getByLabel('Durata').fill('1:00')
    await modulo.getByLabel('Giorno').fill(aggiungiGiorni(oggiRoma(), 1))
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(modulo.getByText('Il tempo si registra per oggi o per un giorno passato')).toBeVisible()
    await expect(page.getByText('Tempo registrato', { exact: true })).toHaveCount(0)
  })
})
