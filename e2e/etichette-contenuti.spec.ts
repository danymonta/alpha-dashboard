import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  creaContenutoDiProva,
  dbLocale,
  leggiContenuto,
  opzioneDaNome,
  pulisciContenuti,
  pulisciOpzioni,
  pulisciRigheSenzaTitolo,
} from './db'
import { accedi } from './utenti'

/**
 * The labels of Reel Type and Format (21/10/2026, Dany: «uno può volendo creare
 * anche nuove etichette proprio come notion e soprattutto devono essere
 * colorate»): created from a cell, coloured, assigned again, renamed,
 * recoloured, deleted; the video editor creates and does not delete; setter
 * and closer see nothing of the Marketing; the phone has no side scroll.
 * Rows and labels of these tests start with PREFISSO and go away at the end;
 * the seed's labels and contents stay as they are.
 */
const PREFISSO = 'E2E Etichette '
// far in the future: the table is sorted from the latest Post Date, so these rows sit at the top
const DATA_A = '2030-03-02'
const DATA_B = '2030-03-01'

async function pulisci() {
  await pulisciContenuti(PREFISSO)
  await pulisciOpzioni(PREFISSO)
  await pulisciRigheSenzaTitolo()
}

test.beforeAll(pulisci)
test.afterAll(pulisci)

function escape(testo: string) {
  return testo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

/** The table's section (the container the queries measure). */
function sezione(page: Page) {
  return page.getByRole('region', { name: 'Piano editoriale', exact: true })
}

/** A row of the table, by the Name of its content. */
function riga(page: Page, nome: string) {
  return sezione(page)
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: nome, exact: true }) })
}

/** The cell of Reel Type or Format of a row (a button: the pill, or the "+" of an empty one). */
function cella(r: Locator, campo: 'reel_type' | 'formato') {
  return r.locator(`[data-cella="${campo}"]`)
}

/**
 * Opens the menu of a cell once its last save is over: a cell that is saving ignores the tap (the new value
 * stays shown, so a second change always starts from it).
 */
async function apri(r: Locator, campo: 'reel_type' | 'formato') {
  const c = cella(r, campo)
  await expect(c).not.toHaveAttribute('aria-busy', 'true')
  await c.click()
}

/** The menu a cell opens: the field to filter, the labels, «Crea». */
function menu(page: Page) {
  return page.getByRole('combobox', { name: /Cerca o crea un’etichetta/ })
}

/** An option of the open menu (the native options of the filters are not these). */
function voce(page: Page, nome: string | RegExp) {
  return page.locator('[data-slot="popover-content"]').getByRole('option', { name: nome, exact: typeof nome === 'string' })
}

async function aspettaReelType(id: string, atteso: string | null) {
  await expect.poll(async () => (await leggiContenuto(id))?.reel_type ?? null).toBe(atteso)
}

test('crea un’etichetta dalla cella, la vedi colorata, la riassegni, cambi nome e colore, la elimini: le celle si svuotano', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const uno = `${PREFISSO}uno`
  const due = `${PREFISSO}due`
  const nomeEtichetta = `${PREFISSO}Nuova`
  const rinominata = `${PREFISSO}Rinominata`
  const idUno = await creaContenutoDiProva(uno, { post_date: DATA_A })
  const idDue = await creaContenutoDiProva(due, { post_date: DATA_B })

  await accedi(page, 'admin')
  await page.goto('/marketing/contenuti')
  await expect(page.getByRole('heading', { level: 1, name: 'Piano editoriale' })).toBeVisible()

  // 1. «Create» from the cell: one tap creates the label and chooses it on this content
  await apri(riga(page, uno), 'reel_type')
  await expect(menu(page)).toBeFocused()
  await expect(page.getByText('Scegli un’etichetta o creane una')).toBeVisible()
  // the labels of the calendar are there, each a coloured pill
  const attraction = voce(page, 'Attraction')
  await expect(attraction).toBeVisible()
  await expect(attraction.locator('.pillola')).toHaveAttribute('data-colore', 'blue')
  await menu(page).fill(nomeEtichetta)
  const crea = voce(page, `Crea «${nomeEtichetta}»`)
  await expect(crea).toBeVisible()
  await crea.click()
  await expect(toast(page, `Etichetta «${nomeEtichetta}» creata`)).toBeVisible()

  const creata = await opzioneDaNome(nomeEtichetta)
  expect(creata).toMatchObject({ campo: 'reel_type', nome: nomeEtichetta })
  expect(creata?.valore).toBe('e2e_etichette_nuova')
  await aspettaReelType(idUno, 'e2e_etichette_nuova')
  // the pill: the label's name on a tinted background (never the colour alone), the colour a token
  const pillolaUno = cella(riga(page, uno), 'reel_type').locator('.pillola')
  await expect(pillolaUno).toHaveText(nomeEtichetta)
  const colore = creata?.colore ?? ''
  await expect(pillolaUno).toHaveAttribute('data-colore', colore)
  const fondo = await pillolaUno.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(fondo).not.toBe('rgba(0, 0, 0, 0)')
  await expect(cella(riga(page, uno), 'reel_type')).toHaveAccessibleName(new RegExp(`^${escape(nomeEtichetta)}: cambia Reel Type di `))

  // 2. the same label on another content: it is in the list now
  await apri(riga(page, due), 'reel_type')
  await expect(voce(page, nomeEtichetta)).toBeVisible()
  await voce(page, nomeEtichetta).click()
  await aspettaReelType(idDue, 'e2e_etichette_nuova')
  await expect(cella(riga(page, due), 'reel_type').locator('.pillola')).toHaveText(nomeEtichetta)

  // 3. recolour: the menu of the label, Rosso; the cells of both contents change
  await apri(riga(page, uno), 'reel_type')
  await page.locator('[data-opzione-menu="e2e_etichette_nuova"]').click()
  await expect(page.getByRole('radiogroup', { name: 'Colore' })).toBeVisible()
  await page.locator('[data-colore-opzione="red"]').click()
  await expect(toast(page, 'Colore: Rosso')).toBeVisible()
  await expect.poll(async () => (await opzioneDaNome(nomeEtichetta))?.colore).toBe('red')
  await expect(page.locator('[data-colore-opzione="red"]')).toHaveAttribute('aria-checked', 'true')

  // 4. rename: the code stays, the name changes everywhere
  const nome = page.getByLabel('Nome', { exact: true })
  await nome.fill(rinominata)
  await nome.press('Enter')
  await expect(toast(page, `Etichetta rinominata in «${rinominata}»`)).toBeVisible()
  await expect.poll(async () => (await opzioneDaNome(rinominata))?.valore).toBe('e2e_etichette_nuova')
  await page.getByRole('button', { name: 'Torna all’elenco delle etichette' }).click()
  await page.keyboard.press('Escape')
  await expect(cella(riga(page, uno), 'reel_type').locator('.pillola')).toHaveText(rinominata)
  await expect(cella(riga(page, uno), 'reel_type').locator('.pillola')).toHaveAttribute('data-colore', 'red')
  await expect(cella(riga(page, due), 'reel_type').locator('.pillola')).toHaveText(rinominata)

  // 5. the filter lists it, with how many contents use it
  await expect(page.getByLabel('Reel Type', { exact: true }).locator(`option`, { hasText: `${rinominata} (2)` })).toHaveCount(1)

  // 6. delete: the question says how many contents use it; the second tap deletes, the cells empty
  await apri(riga(page, uno), 'reel_type')
  await page.locator('[data-opzione-menu="e2e_etichette_nuova"]').click()
  await page.locator('[data-elimina-opzione]').click()
  await expect(page.getByText(`2 contenuti usano «${rinominata}»: perdono questa proprietà, il resto resta.`)).toBeVisible()
  await page.getByRole('button', { name: 'Elimina', exact: true }).click()
  await expect(toast(page, `Etichetta «${rinominata}» eliminata`)).toBeVisible()
  await expect.poll(async () => await opzioneDaNome(rinominata)).toBeNull()
  await aspettaReelType(idUno, null)
  await aspettaReelType(idDue, null)
  // the contents stay, with everything else
  expect((await leggiContenuto(idUno))?.post_date).toBe(DATA_A)
  await expect(cella(riga(page, uno), 'reel_type')).toHaveAccessibleName(new RegExp(`^Vuoto: scegli Reel Type di «${escape(uno)}»`))
  await expect(cella(riga(page, due), 'reel_type')).toHaveAccessibleName(new RegExp(`^Vuoto: scegli Reel Type di «${escape(due)}»`))
})

test('da tastiera: Invio crea e sceglie, le frecce e Invio scelgono, un nome che c’è non si crea due volte, la X toglie', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const tre = `${PREFISSO}tre`
  const idTre = await creaContenutoDiProva(tre, { post_date: DATA_A })
  const etichetta = `${PREFISSO}Da tastiera`

  await accedi(page, 'admin')
  await page.goto('/marketing/contenuti')
  await apri(riga(page, tre), 'formato')
  await expect(menu(page)).toBeFocused()
  await menu(page).fill(etichetta)
  await menu(page).press('Enter')
  await expect(toast(page, `Etichetta «${etichetta}» creata`)).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(idTre))?.formato ?? null).toBe('e2e_etichette_da_tastiera')
  expect(await opzioneDaNome(etichetta)).toMatchObject({ campo: 'formato' })

  // the same name, written in other case: no «Crea», the first match is chosen with Enter
  await apri(riga(page, tre), 'formato')
  await menu(page).fill(etichetta.toUpperCase())
  await expect(voce(page, /^Crea /)).toHaveCount(0)
  await expect(voce(page, etichetta)).toHaveCount(1)

  // typing highlights the first match: Enter chooses it («Split»)
  await menu(page).fill('spli')
  await expect(menu(page)).toHaveAttribute('aria-activedescendant', /-voce-0$/)
  await menu(page).press('Enter')
  await expect.poll(async () => (await leggiContenuto(idTre))?.formato ?? null).toBe('split')

  // the arrows from an empty filter: the first, the second, then Enter on «Check Caption»
  await apri(riga(page, tre), 'formato')
  await menu(page).press('ArrowDown')
  await menu(page).press('ArrowDown')
  await expect(menu(page)).toHaveAttribute('aria-activedescendant', /-voce-1$/)
  await menu(page).press('Enter')
  await expect.poll(async () => (await leggiContenuto(idTre))?.formato ?? null).toBe('check_caption')

  // the X of the chosen label empties the property
  await apri(riga(page, tre), 'formato')
  await page.getByRole('button', { name: 'Togli «Check Caption»' }).click()
  await expect.poll(async () => (await leggiContenuto(idTre))?.formato ?? null).toBe(null)
})

test('«Nuovo» crea una riga vuota con il cursore nel Name, in cima alla tabella', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const nome = `${PREFISSO}riga nuova`
  await accedi(page, 'admin')
  await page.goto('/marketing/contenuti')

  await page.getByRole('button', { name: 'Nuovo', exact: true }).click()
  const campo = page.getByRole('dialog', { name: 'Name', exact: true }).getByRole('textbox')
  await expect(campo).toBeVisible()
  await expect(campo).toBeFocused()
  await expect(campo).toHaveValue('Senza titolo')
  await campo.fill(nome)
  await campo.press('Enter')

  await expect(riga(page, nome)).toBeVisible()
  // pinned at the top whatever its (empty) Post Date
  await expect(sezione(page).getByRole('row').nth(1)).toContainText(nome)
  await expect.poll(async () => {
    const { data } = await dbLocale().from('marketing_contenuti').select('nome, stato, tipo').eq('nome', nome)
    return data
  }).toEqual([{ nome, stato: 'not_started', tipo: 'reel' }])
  // the other cells of the new row are there to fill: the labels, the Status, the date
  await expect(cella(riga(page, nome), 'reel_type')).toBeVisible()
  await expect(riga(page, nome).getByRole('button', { name: /^Not started: cambia lo Status di / })).toBeVisible()
})

test('il Status è una pillola colorata con il puntino e il nome; i gruppi come in Notion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const nome = `${PREFISSO}status`
  await creaContenutoDiProva(nome, { post_date: DATA_A, stato: 'to_be_posted' })
  await accedi(page, 'admin')
  await page.goto('/marketing/contenuti')

  const stato = riga(page, nome).getByRole('button', { name: `To be posted: cambia lo Status di ${nome}` })
  await expect(stato.locator('.pillola')).toHaveAttribute('data-colore', 'orange')
  await expect(stato.locator('.pillola-punto')).toBeVisible()
  await expect(stato.locator('.pillola')).toContainText('To be posted')
  await stato.click()
  const gruppi = page.getByRole('menu')
  await expect(gruppi.getByText('To-do', { exact: true })).toBeVisible()
  await expect(gruppi.getByText('In progress', { exact: true })).toBeVisible()
  await expect(gruppi.getByText('Complete', { exact: true })).toBeVisible()
  await expect(gruppi.getByRole('menuitemradio', { name: 'Canceled', exact: true }).locator('.pillola')).toHaveAttribute('data-colore', 'red')
  await expect(gruppi.getByRole('menuitemradio', { name: 'Posted', exact: true }).locator('.pillola')).toHaveAttribute('data-colore', 'green')
  await expect(gruppi.getByRole('menuitemradio', { name: 'To be recorded', exact: true }).locator('.pillola')).toHaveAttribute('data-colore', 'blue')
  await expect(gruppi.getByRole('menuitemradio', { name: 'To be edited', exact: true }).locator('.pillola')).toHaveAttribute('data-colore', 'purple')
  await expect(gruppi.getByRole('menuitemradio', { name: 'Not started', exact: true }).locator('.pillola')).toHaveAttribute('data-colore', 'gray')
  await page.keyboard.press('Escape')
})

test('il video editor crea, rinomina e colora un’etichetta ma non la elimina; il marketing sì', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const contenuto = `${PREFISSO}editor`
  const etichetta = `${PREFISSO}Dell'editor`
  const id = await creaContenutoDiProva(contenuto, { post_date: DATA_A })

  await accedi(page, 'editor')
  await page.goto('/marketing/contenuti')
  await apri(riga(page, contenuto), 'reel_type')
  await menu(page).fill(etichetta)
  await voce(page, `Crea «${etichetta}»`).click()
  await expect(toast(page, `Etichetta «${etichetta}» creata`)).toBeVisible()
  await aspettaReelType(id, 'e2e_etichette_dell_editor')

  // the menu of the label: rename and colours, no «Elimina l’etichetta»
  await apri(riga(page, contenuto), 'reel_type')
  await page.locator('[data-opzione-menu="e2e_etichette_dell_editor"]').click()
  await expect(page.getByLabel('Nome', { exact: true })).toBeVisible()
  await page.locator('[data-colore-opzione="green"]').click()
  await expect.poll(async () => (await opzioneDaNome(etichetta))?.colore).toBe('green')
  await expect(page.locator('[data-elimina-opzione]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // the marketing deletes it, from the same menu
  const contesto = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pagina = await contesto.newPage()
  try {
    await accedi(pagina, 'marketing')
    await pagina.goto('/marketing/contenuti')
    await apri(riga(pagina, contenuto), 'reel_type')
    await pagina.locator('[data-opzione-menu="e2e_etichette_dell_editor"]').click()
    await pagina.locator('[data-elimina-opzione]').click()
    await expect(pagina.getByText(`1 contenuto usa «${etichetta}»: perde questa proprietà, il resto resta.`)).toBeVisible()
    await pagina.getByRole('button', { name: 'Elimina', exact: true }).click()
    await expect(toast(pagina, `Etichetta «${etichetta}» eliminata`)).toBeVisible()
    await expect.poll(async () => await opzioneDaNome(etichetta)).toBeNull()
    await aspettaReelType(id, null)
  } finally {
    await contesto.close()
  }
})

test('setter e closer: del Marketing non vedono niente, nemmeno la voce nel menu', async ({ page }) => {
  for (const ruolo of ['setter', 'closer'] as const) {
    await accedi(page, ruolo)
    await page.goto('/marketing/contenuti')
    await expect(page).not.toHaveURL(/\/marketing/)
    await expect(page.getByText('Piano editoriale')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Piano editoriale' })).toHaveCount(0)
    await page.context().clearCookies()
  }
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('la tabella è a card, niente scroll di lato; le etichette si creano dal chip e il menu sta nello schermo', async ({ page }) => {
    test.setTimeout(150_000)
    const nome = `${PREFISSO}telefono`
    const etichetta = `${PREFISSO}Telefono`
    const id = await creaContenutoDiProva(nome, { post_date: DATA_A })
    await accedi(page, 'admin')
    await page.goto('/marketing/contenuti')

    const senzaScroll = async () =>
      expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await senzaScroll()
    // the cards, not the table
    await expect(sezione(page).getByRole('table')).toBeHidden()
    const card = sezione(page).locator(`li[data-nome-contenuto="${nome}"]`)
    await expect(card).toBeVisible()
    // «Nuovo» is a 44 px target
    const nuovo = page.getByRole('button', { name: 'Nuovo', exact: true })
    expect((await nuovo.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)

    const chip = card.locator('[data-cella="reel_type"]')
    expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await chip.tap()
    await expect(menu(page)).toBeVisible()
    // the menu stays inside the screen, its rows and its buttons are 44 px
    const finestra = page.locator('[data-slot="popover-content"]')
    await expect.poll(async () => (await finestra.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0)
    await expect
      .poll(async () => {
        const scatola = await finestra.boundingBox()
        return (scatola?.x ?? 0) + (scatola?.width ?? 999)
      })
      .toBeLessThanOrEqual(390)
    // the popup grows in for a moment: the sizes are read once it is still
    await expect.poll(async () => (await voce(page, 'Attraction').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    const altre = page.locator('[data-opzione-menu="attraction"]')
    await expect.poll(async () => (await altre.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44)
    await expect.poll(async () => (await altre.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await menu(page).fill(etichetta)
    await voce(page, `Crea «${etichetta}»`).tap()
    await expect(toast(page, `Etichetta «${etichetta}» creata`)).toBeVisible()
    await aspettaReelType(id, 'e2e_etichette_telefono')
    await expect(card.locator('[data-cella="reel_type"] .pillola')).toHaveText(etichetta)
    await senzaScroll()

    // the menu of a label at 390 px: colours and name, inside the screen
    await expect(card.locator('[data-cella="reel_type"]')).not.toHaveAttribute('aria-busy', 'true')
    await card.locator('[data-cella="reel_type"]').tap()
    await page.locator('[data-opzione-menu="e2e_etichette_telefono"]').tap()
    await expect(page.getByRole('radiogroup', { name: 'Colore' })).toBeVisible()
    await expect
      .poll(async () => (await page.locator('[data-colore-opzione="pink"]').boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44)
    await senzaScroll()
  })
})
