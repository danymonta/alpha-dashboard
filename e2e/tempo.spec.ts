import { expect, test } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { intestazioneGiorno } from '../lib/tempo'
import { ID_ADMIN, ID_SETTER, dbLocale } from './db'
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

  test('avvio e stop del timer da /tempo, con l’indicatore in alto a destra', async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto('/tempo')
    await attendiPagina(page)

    const avvio = page.getByRole('form', { name: 'Avvia un timer' })
    await avvio.getByLabel('Progetto').selectOption({ label: progetto.nome })
    await avvio.getByLabel('Attività (facoltativa)').selectOption({ label: 'Montaggio' })
    await avvio.getByRole('button', { name: 'Avvia il timer' }).click()
    await expect(page.getByText('Timer avviato', { exact: true })).toBeVisible()

    // the indicator at the top right, next to Alfire: task and a clock that runs
    const indicatore = page.getByTestId('timer-attivo-desktop')
    await expect(indicatore).toContainText('Montaggio')
    await expect(indicatore).toHaveAccessibleName(new RegExp(progetto.nome))
    const orologio = indicatore.getByTestId('cronometro')
    await expect(orologio).toHaveText(/^00:00:\d\d$/)
    const primo = await orologio.innerText()
    await expect(orologio).not.toHaveText(primo, { timeout: 5_000 })
    await expect(page.getByRole('region', { name: 'Timer in corso' })).toBeVisible()

    // it stays there on another page
    await page.goto('/progetti')
    await expect(indicatore).toBeVisible()

    // stop with a note, from the indicator
    await indicatore.click()
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover.getByLabel('Nota (facoltativa)')).toBeFocused()
    await popover.getByLabel('Nota (facoltativa)').fill('Primo taglio del video')
    await popover.getByRole('button', { name: 'Ferma il timer' }).click()
    await expect(page.getByText(/^Timer fermato · 1 min$/)).toBeVisible()
    await expect(indicatore).toHaveCount(0)

    // the stopped timer is today's entry, with the minutes computed by the database
    await page.goto('/tempo')
    const giorno = page.getByTestId(`giorno-${oggiRoma()}`)
    const voce = giorno.getByTestId('voce-tempo').filter({ hasText: progetto.nome })
    await expect(voce).toContainText('Montaggio')
    await expect(voce).toContainText('1 min')
    await expect(voce).toContainText('Primo taglio del video')
    await expect(giorno.getByRole('heading')).toHaveText(`Oggi · ${formatData(oggiRoma())}`)
  })

  test('la pausa del timer: il cronometro si ferma, riprende e i minuti salvati non contano le pause (1.66.0)', async ({ page }) => {
    // 90 minutes ago, 10 minutes of pauses already ended, paused since 30 minutes: 50 minutes of work
    await avviaTimerAltrove(ID_SETTER, progetto.id, 90, { daMinuti: 30, secondiFiniti: 600 })
    await accedi(page, 'setter')
    await page.goto('/tempo')
    await attendiPagina(page)

    const scheda = page.getByRole('region', { name: 'Timer in corso' })
    await expect(scheda).toContainText(/Timer in pausa dalle \d\d:\d\d/)
    const orologio = scheda.getByTestId('cronometro')
    await expect(orologio).toHaveText(/^00:50:0\d$/)
    const fermo = await orologio.innerText()
    await page.waitForTimeout(2_000)
    await expect(orologio).toHaveText(fermo)

    // the indicator at the top right says it too
    const indicatore = page.getByTestId('timer-attivo-desktop')
    await expect(indicatore).toContainText('In pausa')
    await expect(indicatore).toHaveAccessibleName(/^Timer in pausa su/)

    const pausa = scheda.getByTestId('pausa-timer')
    await expect(pausa).toHaveText('Riprendi')
    await pausa.click()
    await expect(page.getByText('Timer ripreso', { exact: true })).toBeVisible()
    await expect(pausa).toHaveText('Pausa')
    await expect(pausa).toBeFocused()
    await expect(orologio).not.toHaveText(fermo, { timeout: 5_000 })

    await pausa.click()
    await expect(page.getByText('Timer in pausa', { exact: true })).toBeVisible()
    await expect(pausa).toHaveText('Riprendi')

    await scheda.getByRole('button', { name: 'Ferma il timer' }).click()
    await expect(page.getByText(/^Timer fermato · 50 min$/)).toBeVisible()
    await expect(indicatore).toHaveCount(0)

    // only the minutes it ran, without a range
    const voce = page.getByTestId(`giorno-${oggiRoma()}`).getByTestId('voce-tempo').filter({ hasText: progetto.nome })
    await expect(voce).toContainText('50 min')
    const { data } = await dbLocale()
      .from('pm_tempo')
      .select('minuti, inizio, fine, pausa_dal, pausa_secondi')
      .eq('profile_id', ID_SETTER)
      .eq('progetto_id', progetto.id)
      .single()
    expect(data).toEqual({ minuti: 50, inizio: null, fine: null, pausa_dal: null, pausa_secondi: 0 })
  })

  test('sul telefono il timer avviato altrove compare in alto accanto ad Alfire e si ferma da lì', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'setter')
    await page.goto('/tempo')
    await attendiPagina(page)
    await expect(page.getByRole('form', { name: 'Avvia un timer' })).toBeVisible()
    await expect(page.getByTestId('timer-live')).toHaveAttribute('data-stato', 'live', { timeout: 15_000 })

    // started on another device: no reload here
    await avviaTimerAltrove(ID_SETTER, progetto.id, 5)
    const barra = page.getByTestId('timer-attivo-mobile')
    await expect(barra).toBeVisible({ timeout: 15_000 })
    await expect(barra.getByTestId('cronometro')).toHaveText(/^00:0[45]:\d\d$/)
    await expect(page.getByTestId('timer-attivo-desktop')).toBeHidden()

    await barra.click()
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover).toContainText(progetto.nome)
    await popover.getByRole('button', { name: 'Ferma il timer' }).click()
    await expect(page.getByText(/^Timer fermato · 5 min$/)).toBeVisible()
    await expect(barra).toHaveCount(0)
    await expect(page.getByTestId(`giorno-${oggiRoma()}`).getByTestId('voce-tempo').filter({ hasText: progetto.nome })).toContainText(
      '5 min',
    )

    // no horizontal scroll of the page at 390px
    const scorre = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(scorre).toBe(false)
  })

  test('la sveglia accanto al task avvia il timer; fermandolo dal task chiede la nota', async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto(`/progetti/${progetto.id}/attivita`)
    await attendiPagina(page)

    await page.getByRole('button', { name: 'Avvia il timer su Montaggio' }).click()
    await expect(page.getByText('Timer avviato: lo trovi in alto a destra')).toBeVisible()
    await expect(page.getByTestId('timer-attivo-desktop')).toContainText('Montaggio')

    await page.getByRole('button', { name: 'Ferma il timer su Montaggio' }).click()
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover.getByLabel('Nota (facoltativa)')).toBeFocused()
    await popover.getByLabel('Nota (facoltativa)').fill('Tagli e colore')
    await popover.getByRole('button', { name: 'Ferma il timer' }).click()
    await expect(page.getByText(/^Timer fermato/)).toBeVisible()
    await expect(page.getByTestId('timer-attivo-desktop')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Avvia il timer su Montaggio' })).toBeVisible()
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

  test('la fascia oraria facoltativa: si scrive, i minuti li calcola il database, si corregge e si toglie', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -7)
    await accedi(page, 'setter')
    await page.goto(`/tempo?settimana=${giorno}`)
    await attendiPagina(page)

    const modulo = page.getByRole('form', { name: 'Registra tempo passato' })
    await modulo.getByLabel('Progetto').selectOption({ label: progetto.nome })
    await modulo.getByLabel('Giorno').fill(giorno)

    // only the start: the end is asked for
    await modulo.getByLabel('Dalle', { exact: true }).fill('09:00')
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(modulo.getByText('Indica sia l’inizio sia la fine, o nessuno dei due')).toBeVisible()

    // start and end: the duration comes from them and is not typed
    await modulo.getByLabel('Alle', { exact: true }).fill('10:30')
    const durata = modulo.getByLabel('Durata')
    await expect(durata).toHaveValue('1:30')
    await expect(durata).toHaveJSProperty('readOnly', true)
    await expect(modulo.getByRole('button', { name: '30 min' })).toBeDisabled()
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(page.getByText('Tempo registrato', { exact: true })).toBeVisible()
    // the form is ready for the next entry, without a range
    await expect(modulo.getByLabel('Dalle', { exact: true })).toHaveValue('')

    const sezione = page.getByTestId(`giorno-${giorno}`)
    const voce = sezione.getByTestId('voce-tempo').filter({ hasText: progetto.nome })
    await expect(voce.getByTestId('durata-voce')).toHaveText('09:00–10:30 · 1 h 30 min')
    await expect(sezione.getByTestId('totale-giorno')).toHaveText(/1 h 30 min$/)

    // correcting: the sheet shows the range, a new end gives new minutes
    await voce.getByRole('button', { name: /^Modifica / }).click()
    const foglio = page.getByRole('dialog', { name: 'Correggi il tempo' })
    await expect(foglio.getByLabel('Dalle', { exact: true })).toHaveValue('09:00')
    await expect(foglio.getByLabel('Alle', { exact: true })).toHaveValue('10:30')
    await foglio.getByLabel('Alle', { exact: true }).fill('11:15')
    await expect(foglio.getByLabel('Durata')).toHaveValue('2:15')
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(foglio).toBeHidden()
    await expect(voce.getByTestId('durata-voce')).toHaveText('09:00–11:15 · 2 h 15 min')
    await expect(sezione.getByTestId('totale-giorno')).toHaveText(/2 h 15 min$/)

    // removing the range: the minutes stay and can be typed again
    await voce.getByRole('button', { name: /^Modifica / }).click()
    await foglio.getByRole('button', { name: 'Togli la fascia' }).click()
    await expect(foglio.getByLabel('Dalle', { exact: true })).toHaveValue('')
    await expect(foglio.getByLabel('Durata')).toHaveValue('2:15')
    await expect(foglio.getByLabel('Durata')).toHaveJSProperty('readOnly', false)
    await foglio.getByLabel('Durata').fill('2:00')
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(foglio).toBeHidden()
    await expect(voce.getByTestId('durata-voce')).toHaveText('2 h')
    await expect(sezione.getByTestId('totale-giorno')).toHaveText(/2 h$/)
  })

  test('sul telefono la fascia si scrive anche dalla scheda Tempo del progetto, senza scroll orizzontale', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const giorno = aggiungiGiorni(oggiRoma(), -1)
    await accedi(page, 'setter')
    await page.goto(`/progetti/${progetto.id}/tempo?settimana=${giorno}`)
    await attendiPagina(page)

    const modulo = page.getByRole('form', { name: 'Registra tempo passato' })
    await modulo.getByLabel('Giorno').fill(giorno)
    await modulo.getByLabel('Dalle', { exact: true }).fill('14:00')
    await modulo.getByLabel('Alle', { exact: true }).fill('13:00')
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(modulo.getByText('L’ora di fine deve essere dopo quella di inizio')).toBeVisible()

    await modulo.getByLabel('Alle', { exact: true }).fill('15:45')
    await modulo.getByRole('button', { name: 'Registra il tempo' }).click()
    await expect(page.getByText('Tempo registrato', { exact: true })).toBeVisible()
    await expect(page.getByTestId(`giorno-${giorno}`).getByTestId('durata-voce')).toHaveText('14:00–15:45 · 1 h 45 min')

    const scorre = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(scorre).toBe(false)
  })

  test('il totale del periodo si divide per progetto e, sotto, per task: solo il mio tempo, dal database (03/10/2026)', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -21)
    const { error } = await dbLocale()
      .from('pm_tempo')
      .insert([
        { profile_id: ID_SETTER, progetto_id: progetto.id, task_id: progetto.task.montaggio, data: giorno, minuti: 60 },
        { profile_id: ID_SETTER, progetto_id: progetto.id, task_id: progetto.task.montaggio, data: giorno, minuti: 30 },
        { profile_id: ID_SETTER, progetto_id: progetto.id, task_id: progetto.task.revisione, data: giorno, minuti: 30 },
        { profile_id: ID_SETTER, progetto_id: progetto.id, data: giorno, minuti: 15 },
        // someone else's hour on the same task: never in my totals
        { profile_id: ID_ADMIN, progetto_id: progetto.id, task_id: progetto.task.montaggio, data: giorno, minuti: 60 },
      ])
    if (error) throw error

    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'setter')
    await page.goto(`/tempo?settimana=${giorno}`)
    await attendiPagina(page)

    const suProgetto = page.getByTestId('totale-progetto').filter({ hasText: progetto.nome })
    await expect(suProgetto.locator('dd').first()).toHaveText('2 h 15 min')
    // the most time first, the time without a task by its name
    await expect(suProgetto.getByTestId('totale-task')).toHaveText([
      /^Montaggio\s*1 h 30 min$/,
      /^Revisione cliente\s*30 min$/,
      /^Senza task\s*15 min$/,
    ])
    const scorre = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(scorre).toBe(false)
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
