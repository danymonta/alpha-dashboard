import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, ID_SETTER, dbLocale } from './db'
import { attendiPagina, creaProgettoDiProva, pulisciProgetti, type ProgettoDiProva } from './pm-db'
import { accedi } from './utenti'

/**
 * The task opens where it lives (Dany, 05/10/2026: "voglio già da qui la
 * possibilità di aprire dentro al task, oltre che nell'altro pannello, e mi
 * dovrebbe portare direttamente lì"): from I miei task the title opens the
 * project's Attività with that task's sheet open and its row marked, also for
 * a completed task in a finished list (closed by default). The project link
 * stays. The link works on a reload; closing the sheet takes ?task out of the
 * address. A task that is gone leaves a short message; one hidden by the
 * filters offers "Togli i filtri". The timeline's task names open it too.
 */
const PREFISSO = 'E2E Apri task '

let progetto: ProgettoDiProva

test.beforeEach(async () => {
  await pulisciProgetti(PREFISSO)
  progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)
  // "Revisione cliente" is the only task of "Consegna": completed, the list is
  // finished and starts closed in Attività; it is the setter's too
  const db = dbLocale()
  const { error } = await db.from('pm_task').update({ stato: 'completato' }).eq('id', progetto.task.revisione)
  if (error) throw error
  const { error: e2 } = await db
    .from('pm_task_assegnatari')
    .insert({ task_id: progetto.task.revisione, profile_id: ID_SETTER, created_by: ID_ADMIN })
  if (e2) throw e2
})
test.afterAll(async () => {
  await pulisciProgetti(PREFISSO)
})

function linkDel(taskId: string) {
  return `/progetti/${progetto.id}/attivita?task=${taskId}`
}

/** The sheet of the task, open on its own, with its title in the field. */
async function schedaAperta(page: Page, titolo: string, nome: 'Task' | 'Sotto-task' = 'Task') {
  const scheda = page.getByRole('dialog', { name: nome, exact: true })
  await expect(scheda).toBeVisible()
  await expect(scheda.getByLabel('Titolo')).toHaveValue(titolo)
  return scheda
}

async function senzaScrollLaterale(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
}

async function apriDaIMieiTask(page: Page) {
  // a few pages compiled on the first hit by the dev server
  test.setTimeout(120_000)
  await accedi(page, 'setter')
  await page.goto('/task')
  await attendiPagina(page)

  // an open task: the title is a link of its own, the project link stays
  const riga = page.getByTestId('mio-task').filter({ hasText: progetto.nome })
  await expect(riga).toHaveCount(1)
  const titolo = riga.getByRole('link', { name: 'Montaggio' })
  await expect(titolo).toHaveAttribute('href', linkDel(progetto.task.montaggio))
  expect((await titolo.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(riga.getByRole('link', { name: progetto.nome })).toHaveAttribute('href', `/progetti/${progetto.id}/attivita`)
  // the checkbox and the alarm are still there
  await expect(riga.getByRole('checkbox', { name: 'Completa Montaggio' })).toBeVisible()
  await expect(riga.getByRole('button', { name: 'Avvia il timer su Montaggio' })).toBeVisible()
  // the project link's touch area never covers the title's words
  const angolo = await titolo.evaluate((el) => {
    const parole = document.createRange()
    parole.selectNodeContents(el)
    const r = parole.getBoundingClientRect()
    return { x: r.left + 4, y: r.bottom - 2 }
  })
  const sotto = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.textContent, angolo)
  expect(sotto).toBe('Montaggio')
  // nor the details beside the project, also when they wrap at 390 px: a tap there opens nothing
  const dettagli = riga.getByTestId('dettagli-mio-task')
  await expect(dettagli).toContainText('Scadenza')
  for (const parte of await dettagli.locator(':scope > *').all()) {
    const centro = await parte.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    const link = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
      centro,
    )
    expect(link).toBeNull()
  }
  await senzaScrollLaterale(page)

  await titolo.click()
  await expect(page).toHaveURL(linkDel(progetto.task.montaggio))
  const scheda = await schedaAperta(page, 'Montaggio')
  await expect(page.locator(`[data-task="${progetto.task.montaggio}"] > [data-evidenziato]`)).toHaveCount(1)
  await senzaScrollLaterale(page)

  // closed: ?task leaves the address, the row stays marked, the focus back on its title
  await page.keyboard.press('Escape')
  await expect(scheda).toBeHidden()
  await expect(page).toHaveURL(`/progetti/${progetto.id}/attivita`)
  await expect(page.locator(`[data-task="${progetto.task.montaggio}"] > [data-evidenziato]`)).toHaveCount(1)
  await expect(page.getByRole('listitem', { name: 'Montaggio' }).getByRole('button', { name: 'Montaggio', exact: true })).toBeFocused()
  // a reload does not open it again
  await page.reload()
  await expect(page.getByRole('listitem', { name: 'Montaggio' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Task' })).toHaveCount(0)

  // a completed task, in a finished list (closed by default): from Completati
  await page.goto('/task')
  await attendiPagina(page)
  const chiuso = page.getByTestId('mio-task-completato').filter({ hasText: progetto.nome })
  await expect(chiuso).toHaveCount(1)
  await chiuso.getByRole('link', { name: 'Revisione cliente' }).click()
  await expect(page).toHaveURL(linkDel(progetto.task.revisione))
  await schedaAperta(page, 'Revisione cliente')
  await page.keyboard.press('Escape')
  const lista = page.getByRole('region', { name: 'Consegna' })
  await expect(lista.getByRole('button', { name: 'Consegna' })).toHaveAttribute('aria-expanded', 'true')
  await expect(lista.getByRole('listitem', { name: 'Revisione cliente' })).toBeVisible()
}

test('dal computer: il titolo apre il task nel suo progetto, anche tra i completati', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await apriDaIMieiTask(page)
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('lo stesso a 390 px', async ({ page }) => {
    await apriDaIMieiTask(page)
  })

  test('un titolo lungo su tre righe: il fondo del titolo apre il task, mai il progetto', async ({ page }) => {
    test.setTimeout(120_000)
    const lungo = 'Montaggio del video di presentazione del percorso, con le interviste ai clienti, la musica e i sottotitoli'
    const { error } = await dbLocale().from('pm_task').update({ titolo: lungo }).eq('id', progetto.task.montaggio)
    if (error) throw error

    await accedi(page, 'setter')
    await page.goto('/task')
    await attendiPagina(page)
    const riga = page.getByTestId('mio-task').filter({ hasText: progetto.nome })
    await expect(riga).toHaveCount(1)
    const titolo = riga.getByRole('link', { name: lungo })
    const linkProgetto = riga.getByRole('link', { name: progetto.nome })
    // the title's words: its box without the padding, three lines of text
    const parole = await titolo.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const stile = getComputedStyle(el)
      const alto = r.top + parseFloat(stile.paddingTop)
      const basso = r.bottom - parseFloat(stile.paddingBottom)
      return { basso, righe: Math.round((basso - alto) / parseFloat(stile.lineHeight)) }
    })
    expect(parole.righe).toBe(3)

    const sotto = (x: number, y: number) =>
      page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
        { x, y },
      )
    const p = (await linkProgetto.boundingBox())!
    // the lowest 4px of the last line, across the project link and its touch area: always the task
    // (whole pixels: the hit test rounds)
    for (const y of [parole.basso - 1, parole.basso - 2, parole.basso - 3, parole.basso - 4]) {
      // (the title starts where the project starts: left of it is the gap beside the checkbox)
      for (const x of [p.x + 1, p.x + p.width / 2, p.x + p.width - 1, p.x + p.width + 3]) {
        expect(await sotto(x, y)).toBe(linkDel(progetto.task.montaggio))
      }
    }
    // right under the words the project's touch area starts, still 44px tall
    const progettoHref = `/progetti/${progetto.id}/attivita`
    expect(await sotto(p.x + p.width / 2, parole.basso + 1)).toBe(progettoHref)
    expect(await sotto(p.x + p.width / 2, parole.basso + 43)).toBe(progettoHref)
    await senzaScrollLaterale(page)

    // a tap on the bottom of the title, right above the project: the task opens
    await page.mouse.click(p.x + p.width / 2, parole.basso - 2)
    await expect(page).toHaveURL(linkDel(progetto.task.montaggio))
    await schedaAperta(page, lungo)
  })

  test('un link incollato nel titolo va a capo: mai sotto la sveglia, mai la pagina di lato', async ({ page }) => {
    test.setTimeout(120_000)
    const link = 'Caricare https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdef'
    const { error } = await dbLocale().from('pm_task').update({ titolo: link }).eq('id', progetto.task.montaggio)
    if (error) throw error

    await accedi(page, 'setter')
    await page.goto('/task')
    await attendiPagina(page)
    const riga = page.getByTestId('mio-task').filter({ hasText: progetto.nome })
    await expect(riga).toHaveCount(1)
    const titolo = (await riga.getByRole('link', { name: link }).boundingBox())!
    const sveglia = (await riga.getByRole('button', { name: /timer|sveglia|tempo/i }).first().boundingBox())!
    // the words end before the alarm button starts
    expect(titolo.x + titolo.width).toBeLessThanOrEqual(sveglia.x)
    await senzaScrollLaterale(page)
  })
})

test('il link aperto da solo: un sotto-task completato, dentro i completati chiusi', async ({ page }) => {
  test.setTimeout(90_000)
  // a sub-task of the completed "Brief e materiali": its group "Completati" opens
  const { data: sotto, error } = await dbLocale()
    .from('pm_task')
    .insert({
      progetto_id: progetto.id,
      tasklist_id: null,
      parent_id: progetto.task.brief,
      titolo: 'Raccolta foto',
      ordine: 1,
      stato: 'completato',
      created_by: ID_ADMIN,
    })
    .select('id')
    .single()
  if (error) throw error

  await accedi(page, 'admin')
  await page.goto(linkDel(sotto.id))
  await schedaAperta(page, 'Raccolta foto', 'Sotto-task')
  await page.keyboard.press('Escape')
  // its parent's group "Completati" opened to show it
  await expect(page.getByRole('listitem', { name: 'Raccolta foto' })).toBeVisible()
  await expect(page.locator(`[data-task="${sotto.id}"] > [data-evidenziato]`)).toBeVisible()
})

test('un task che non c’è più, o nascosto dai filtri: le attività con un avviso', async ({ page }) => {
  test.setTimeout(90_000)
  await accedi(page, 'setter')

  // deleted (or never there): the tab as usual, a short message that closes
  await page.goto(`/progetti/${progetto.id}/attivita?task=00000000-0000-4000-8000-000000000000`)
  const avviso = page.getByTestId('avviso-task-link')
  await expect(avviso).toContainText('Il task che cercavi non c’è più, oppure non è tra quelli che puoi vedere.')
  await expect(page.getByRole('listitem', { name: 'Montaggio' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const chiudi = avviso.getByRole('button', { name: 'Chiudi l’avviso' })
  expect((await chiudi.boundingBox())!.width).toBeGreaterThanOrEqual(44)
  await chiudi.click()
  await expect(avviso).toHaveCount(0)
  await expect(page).toHaveURL(`/progetti/${progetto.id}/attivita`)

  // hidden by the filters: "Togli i filtri" keeps the task and opens it
  await page.goto(`/progetti/${progetto.id}/attivita?stato=completato&task=${progetto.task.montaggio}`)
  await expect(page.getByTestId('avviso-task-link')).toContainText('Il task che cercavi è nascosto dai filtri.')
  await page.getByTestId('avviso-task-link').getByRole('link', { name: 'Togli i filtri' }).click()
  await expect(page).toHaveURL(linkDel(progetto.task.montaggio))
  await schedaAperta(page, 'Montaggio')
  await page.keyboard.press('Escape')

  // filters that leave nothing to show: one "Togli i filtri" only, and it keeps the task too
  await page.goto(`/progetti/${progetto.id}/attivita?stato=in_revisione&task=${progetto.task.montaggio}`)
  await expect(page.getByText('Nessun task con questi filtri')).toBeVisible()
  await expect(page.getByTestId('avviso-task-link')).toContainText('Il task che cercavi è nascosto dai filtri.')
  const togli = page.getByRole('link', { name: 'Togli i filtri' })
  await expect(togli).toHaveCount(1)
  await togli.click()
  await expect(page).toHaveURL(linkDel(progetto.task.montaggio))
  await schedaAperta(page, 'Montaggio')
})

test('salvato o eliminato dalla scheda aperta dal link: ?task esce dall’indirizzo, nessun avviso', async ({ page }) => {
  test.setTimeout(90_000)
  await accedi(page, 'admin')

  // saved: the address drops ?task, a reload does not open the sheet again
  await page.goto(linkDel(progetto.task.montaggio))
  const scheda = await schedaAperta(page, 'Montaggio')
  await scheda.getByRole('button', { name: 'Salva il task' }).click()
  await expect(page.getByText('Task salvato')).toBeVisible()
  await expect(scheda).toBeHidden()
  await expect(page).toHaveURL(`/progetti/${progetto.id}/attivita`)
  await page.reload()
  await expect(page.getByRole('listitem', { name: 'Montaggio' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // deleted: gone, and no "the task you were looking for is not there"
  await page.goto(linkDel(progetto.task.idee))
  const idee = await schedaAperta(page, 'Idee per il prossimo mese')
  await idee.getByRole('button', { name: 'Elimina il task' }).click()
  await idee.getByRole('button', { name: 'Conferma: elimina il task' }).click()
  await expect(page.getByText('Task eliminato')).toBeVisible()
  await expect(page).toHaveURL(`/progetti/${progetto.id}/attivita`)
  await expect(page.getByRole('listitem', { name: 'Idee per il prossimo mese' })).toHaveCount(0)
  await expect(page.getByTestId('avviso-task-link')).toHaveCount(0)
})

test('dalla timeline: il nome di un’attività apre il task', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const { data: p, error } = await dbLocale().from('pm_progetti').select('reparto_id').eq('id', progetto.id).single()
  if (error) throw error
  await accedi(page, 'admin')
  await page.goto(`/progetti?vista=timeline&reparto=${p.reparto_id}`)
  await attendiPagina(page)
  const grafico = page.getByTestId('timeline-grafico')
  await grafico.getByRole('button', { name: `Liste e attività di ${progetto.nome}` }).click()
  const nome = grafico.getByTestId('timeline-figlio').getByRole('link', { name: 'Montaggio' })
  expect((await nome.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await nome.click()
  await expect(page).toHaveURL(linkDel(progetto.task.montaggio))
  await schedaAperta(page, 'Montaggio')
})
