import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

import { aggiungiGiorni, nomeGiorno, oggiRoma, primoDelMeseISO } from '../lib/date'
import { formatData } from '../lib/format'
import { creaContenutoDiProva, dbLocale, leggiContenuto, pulisciContenuti } from './db'
import { accedi, type RuoloSeed } from './utenti'

/**
 * The content panel and the cells of the table (1.33.0, Dany: "se clicco su un
 * contenuto non mi apre una nuova pagina ma me la apre in sidebar da
 * modificare; ogni campo deve essere modificabile direttamente dalla
 * tabella"). Rows of these tests start with PREFISSO, with Post Dates far
 * ahead so they come first in the table, and go away at the end.
 */
const PREFISSO = 'E2E Pannello '

const CAMPO_CAMBIATO = (campo: string) =>
  `Il campo «${campo}» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.`

test.beforeAll(async () => {
  await pulisciContenuti(PREFISSO)
})

test.afterAll(async () => {
  await pulisciContenuti(PREFISSO)
})

function escape(testo: string) {
  return testo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

function sezioneContenuti(page: Page) {
  return page.getByRole('region', { name: 'Contenuti', exact: true })
}

function pannello(page: Page, nome: string) {
  return page.getByRole('dialog', { name: nome, exact: true })
}

/** The table's row of a content (the cards are hidden from 960 px of section). */
function riga(page: Page, nome: string) {
  return sezioneContenuti(page).getByRole('row').filter({ has: page.getByRole('link', { name: nome, exact: true }) })
}

/** A day far ahead: these contents come first in the table, newest Post Date first. */
function avanti(giorni: number) {
  return aggiungiGiorni(oggiRoma(), giorni)
}

/** Only these tests' rows: the search on their Name. */
function listaDi(parte: string, altro = '') {
  return `/marketing/contenuti?vista=tabella&q=${encodeURIComponent(`${PREFISSO}${parte}`)}${altro}`
}

async function senzaScrollLaterale(page: Page) {
  const [pagina, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(pagina, 'scroll orizzontale della pagina').toBeLessThanOrEqual(finestra)
}

async function altraPersona(browser: Browser, ruolo: RuoloSeed) {
  const pagina = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await accedi(pagina, ruolo)
  return pagina
}

async function altezza(el: Locator) {
  return (await el.boundingBox())?.height ?? 0
}

/** The box of an element once it stops moving (the panel slides in for 200 ms): where a person taps. */
async function fermo(el: Locator) {
  let prima = await el.boundingBox()
  await expect
    .poll(
      async () => {
        const ora = await el.boundingBox()
        const uguale = !!ora && !!prima && Math.abs(ora.x - prima.x) < 0.5 && Math.abs(ora.y - prima.y) < 0.5
        prima = ora
        return uguale
      },
      { intervals: [100] },
    )
    .toBe(true)
  return prima!
}

test.use({ viewport: { width: 1280, height: 800 } })

test('Indietro dopo un salvataggio nel pannello: il pannello si chiude e la riga ha lo Status nuovo; Avanti lo riapre', async ({
  page,
}) => {
  const nome = `${PREFISSO}indietro`
  await creaContenutoDiProva(nome, { post_date: avanti(310) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('indietro'))

  await sezioneContenuti(page).getByRole('link', { name: nome, exact: true }).click()
  const foglio = pannello(page, nome)
  await expect(foglio).toBeVisible()
  await foglio.getByRole('button', { name: `Not started: cambia lo Status di ${nome}` }).click()
  await page.getByRole('menuitemradio', { name: 'To be edited' }).click()
  await expect(toast(page, 'Status: To be edited')).toBeVisible()
  // the save and the redraw it brings are done (Back sooner than that is Next's race: its pending push)
  await expect(foglio.getByRole('button', { name: `To be edited: cambia lo Status di ${nome}` })).not.toHaveAttribute('aria-busy')

  await page.goBack()
  await expect(foglio).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)
  await expect(riga(page, nome).getByRole('button', { name: /: cambia lo Status di / })).toHaveAccessibleName(
    `To be edited: cambia lo Status di ${nome}`,
  )

  await page.goForward()
  await expect(foglio).toBeVisible()
  await expect(foglio.getByRole('button', { name: `To be edited: cambia lo Status di ${nome}` })).toBeVisible()
})

test('Esc subito dopo un salvataggio: il pannello si chiude e non si riapre, l’indirizzo torna alla lista', async ({ page }) => {
  const nome = `${PREFISSO}esc subito`
  await creaContenutoDiProva(nome, { post_date: avanti(315) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('esc subito'))
  const lista = page.url()

  await sezioneContenuti(page).getByRole('link', { name: nome, exact: true }).click()
  const foglio = pannello(page, nome)
  await foglio.getByLabel('Format').selectOption({ label: 'Split' })
  // at once, while the save is still on its way
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(toast(page, 'Format: Split')).toBeVisible()
  await expect.poll(() => page.url()).toBe(lista)
  await page.waitForTimeout(800)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(page.url()).toBe(lista)
  await expect(riga(page, nome).getByRole('button', { name: `Split: cambia Format di «${nome}»` })).toBeVisible()
})

test('il tocco sul Name apre il pannello senza cambiare pagina; Esc lo chiude e il focus torna sul Name', async ({ page }) => {
  const nome = `${PREFISSO}apri`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(311), messaggio: 'Il messaggio del pannello' })
  await accedi(page, 'marketing')
  await page.goto(listaDi('apri'))

  const link = sezioneContenuti(page).getByRole('link', { name: nome, exact: true })
  // the link is the page: Cmd/Ctrl-click opens it in another tab
  await expect(link).toHaveAttribute('href', `/marketing/contenuti/${id}`)
  await link.click()
  const foglio = pannello(page, nome)
  await expect(foglio).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/marketing/contenuti\\?.*contenuto=${id}`))
  // the list is still there, under the panel (inert while the panel is open)
  await expect(page.locator('h1', { hasText: 'Instagram Posts' })).toBeAttached()
  await expect(foglio.getByRole('region', { name: 'Topic / Main Message', exact: true }).getByText('Il messaggio del pannello')).toBeVisible()
  await expect(foglio.getByText('Ogni modifica si salva da sola.')).toBeVisible()
  await expect(foglio.getByRole('heading', { name: nome })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)
  await expect(link).toBeFocused()
})

test('Cmd o Ctrl e clic apre la pagina intera in un’altra scheda; dal pannello «Copia il link» e «Apri a tutta pagina»', async ({
  page,
}) => {
  const nome = `${PREFISSO}pagina intera`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(316) })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await accedi(page, 'marketing')
  await page.goto(listaDi('pagina intera'))
  const link = sezioneContenuti(page).getByRole('link', { name: nome, exact: true })

  // the link is the page: with the modifier the browser opens it in another tab, no panel here
  const [scheda] = await Promise.all([page.context().waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })])
  await expect(scheda).toHaveURL(new RegExp(`/marketing/contenuti/${id}$`))
  await expect(scheda.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  await scheda.close()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).not.toHaveURL(/contenuto=/)

  // «Copia il link»: the list with this content open, without the filters
  await link.click()
  const foglio = pannello(page, nome)
  await foglio.getByRole('button', { name: `Altre azioni su «${nome}»` }).click()
  await page.getByRole('menuitem', { name: 'Copia il link' }).click()
  await expect(toast(page, 'Link copiato')).toBeVisible()
  const copiato = await page.evaluate(() => navigator.clipboard.readText())
  expect(copiato).toBe(`${new URL(page.url()).origin}/marketing/contenuti?contenuto=${id}`)

  // «Apri a tutta pagina»: the content's own page, the panel gone
  await foglio.getByRole('button', { name: `Altre azioni su «${nome}»` }).click()
  await page.getByRole('menuitem', { name: 'Apri a tutta pagina' }).click()
  await expect(page).toHaveURL(new RegExp(`/marketing/contenuti/${id}$`))
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('un link diretto con ?contenuto apre il pannello; la X lo chiude; un contenuto eliminato lo dice', async ({ page }) => {
  const nome = `${PREFISSO}diretto`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(312), finale: 'Lo script finale' })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  const foglio = pannello(page, nome)
  await expect(foglio).toBeVisible()
  await expect(foglio.getByRole('region', { name: 'Script (Final)', exact: true }).getByText('Lo script finale')).toBeVisible()
  await foglio.getByRole('button', { name: 'Chiudi il contenuto' }).click()
  await expect(foglio).toBeHidden()
  await expect(page).toHaveURL(/\/marketing\/contenuti$/)

  await page.goto(`/marketing/contenuti?contenuto=${'ccccccc1-0000-4000-8000-0000000000ff'}`)
  const sparito = page.getByRole('dialog', { name: 'Questo contenuto non c’è più' })
  await expect(sparito).toBeVisible()
  await sparito.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await expect(sparito).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)
})

test('eliminato da un altro col pannello aperto: il salvataggio lo dice, il pannello pure, la riga se ne va', async ({ page }) => {
  const nome = `${PREFISSO}eliminato altrove`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(317) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('eliminato altrove'))
  await sezioneContenuti(page).getByRole('link', { name: nome, exact: true }).click()
  const foglio = pannello(page, nome)
  // the panel has read the content (its sections are there): only then it goes away
  await expect(foglio.getByRole('region', { name: 'Topic / Main Message', exact: true })).toBeVisible()
  const { error } = await dbLocale().from('marketing_contenuti').delete().eq('id', id)
  if (error) throw error

  await foglio.getByLabel('Audio').fill('Nessuno lo salverà')
  await foglio.getByLabel('Audio').press('Enter')
  await expect(toast(page, 'Questo contenuto non c’è più.')).toBeVisible()
  const sparito = page.getByRole('dialog', { name: 'Questo contenuto non c’è più' })
  await expect(sparito).toBeVisible()
  await sparito.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).not.toHaveURL(/contenuto=/)
  await expect(riga(page, nome)).toHaveCount(0)
  // the focus is never lost on <body>
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
})

test('precedente e successivo: titolo e annuncio cambiano, un solo Indietro chiude', async ({ page }) => {
  const [primo, secondo, terzo] = ['vicini uno', 'vicini due', 'vicini tre'].map((n) => `${PREFISSO}${n}`)
  // newest Post Date first: uno, due, tre
  await creaContenutoDiProva(primo, { post_date: avanti(323) })
  await creaContenutoDiProva(secondo, { post_date: avanti(322) })
  await creaContenutoDiProva(terzo, { post_date: avanti(321) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('vicini'))
  const lista = page.url()

  await sezioneContenuti(page).getByRole('link', { name: secondo, exact: true }).click()
  await expect(pannello(page, secondo)).toBeVisible()
  await expect(pannello(page, secondo).getByText('2 di 3', { exact: true })).toBeVisible()
  // from the keyboard: the arrow keeps the focus, also on the last content, where it has nowhere to go
  await pannello(page, secondo).getByRole('button', { name: 'Contenuto successivo' }).focus()
  await page.keyboard.press('Enter')
  const ultimo = pannello(page, terzo)
  await expect(ultimo).toBeVisible()
  await expect(page.getByTestId('annuncio-pannello')).toHaveText(`«${terzo}», 3 di 3`)
  const successivo = ultimo.getByRole('button', { name: 'Contenuto successivo' })
  await expect(successivo).toBeDisabled()
  await expect(successivo).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(ultimo).toBeVisible()
  await expect(successivo).toBeFocused()
  await ultimo.getByRole('button', { name: 'Contenuto precedente' }).click()
  await pannello(page, secondo).getByRole('button', { name: 'Contenuto precedente' }).focus()
  await page.keyboard.press('Enter')
  await expect(pannello(page, primo)).toBeVisible()
  await expect(page.getByTestId('annuncio-pannello')).toHaveText(`«${primo}», 1 di 3`)
  const precedente = pannello(page, primo).getByRole('button', { name: 'Contenuto precedente' })
  await expect(precedente).toBeDisabled()
  await expect(precedente).toBeFocused()
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')

  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(page.url()).toBe(lista)
})

test('una sezione in modifica: Esc annulla e il pannello resta; un testo non salvato chiede prima di chiudere', async ({
  page,
}) => {
  const nome = `${PREFISSO}bozza`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(313), finale: 'Testo salvato' })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  const foglio = pannello(page, nome)
  const finale = foglio.getByRole('region', { name: 'Script (Final)', exact: true })
  // the panel opened: its title has the focus
  await expect(foglio.getByRole('heading', { name: nome })).toBeFocused()

  // Esc in the textarea cancels the edit; the panel stays
  await finale.getByRole('button', { name: 'Modifica Script (Final)' }).click()
  const campo = finale.getByRole('textbox', { name: 'Script (Final)', exact: true })
  await expect(campo).toBeFocused()
  await campo.fill('Un testo nuovo')
  await page.keyboard.press('Escape')
  await expect(campo).toHaveCount(0)
  await expect(foglio).toBeVisible()
  await expect(finale.getByText('Testo salvato')).toBeVisible()
  // a second Esc closes the panel
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()

  // a text not saved, then the X: the question
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  await expect(foglio.getByRole('heading', { name: nome })).toBeFocused()
  await finale.getByRole('button', { name: 'Modifica Script (Final)' }).click()
  await expect(campo).toBeFocused()
  await campo.fill('Un testo da non perdere')
  await foglio.getByRole('button', { name: 'Chiudi il contenuto' }).click()
  const domanda = page.getByRole('alertdialog', { name: 'Hai un testo non salvato in «Script (Final)»: chiudere lo stesso?' })
  await expect(domanda).toBeVisible()
  await expect(domanda.getByRole('button', { name: 'Continua a scrivere' })).toBeFocused()
  await domanda.getByRole('button', { name: 'Continua a scrivere' }).click()
  await expect(domanda).toBeHidden()
  await expect(foglio).toBeVisible()
  await expect(campo).toBeFocused()
  await expect(campo).toHaveValue('Un testo da non perdere')

  // a tap outside the panel asks the same
  await page.mouse.click(100, 400)
  await expect(domanda).toBeVisible()
  await domanda.getByRole('button', { name: 'Continua a scrivere' }).click()
  await expect(foglio).toBeVisible()
  await expect(campo).toHaveValue('Un testo da non perdere')

  await foglio.getByRole('button', { name: 'Chiudi il contenuto' }).click()
  await domanda.getByRole('button', { name: 'Chiudi senza salvare' }).click()
  await expect(foglio).toBeHidden()
  expect((await leggiContenuto(id))?.finale).toBe('Testo salvato')
})

test('le proprietà nel pannello si salvano da sole; Esc in un campo cambiato lo rimette e il pannello resta', async ({ page }) => {
  const nome = `${PREFISSO}proprietà`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(314) })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  const foglio = pannello(page, nome)

  await foglio.getByLabel('Reel Type').selectOption({ label: 'Education' })
  await expect(toast(page, 'Reel Type: Education')).toBeVisible()
  await foglio.getByLabel('Audio').fill('Audio dal pannello')
  await foglio.getByLabel('Audio').press('Tab')
  await expect(toast(page, 'Audio salvato')).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(id))?.audio).toBe('Audio dal pannello')

  // Esc on a changed field: the saved value comes back, the panel stays
  await foglio.getByLabel('View Count').fill('99')
  await page.keyboard.press('Escape')
  await expect(foglio.getByLabel('View Count')).toHaveValue('')
  await expect(foglio).toBeVisible()

  // a share link: the error under the field, nothing saved; then the post's own address
  const url = foglio.getByLabel('URL', { exact: true })
  await url.fill('https://www.instagram.com/share/reel/BAbCdEf123/')
  await url.press('Enter')
  await expect(foglio.getByText('Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.')).toBeVisible()
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  await url.fill('www.instagram.com/reel/E2ePanProp1/')
  await url.press('Enter')
  await expect(toast(page, 'URL salvato')).toBeVisible()
  await expect(foglio.getByRole('link', { name: 'Apri il post' })).toHaveAttribute('href', 'https://www.instagram.com/reel/E2ePanProp1/')
  expect(await leggiContenuto(id)).toMatchObject({ reel_type: 'education', url: 'https://www.instagram.com/reel/E2ePanProp1/' })
})

test('nel pannello Esc chiude prima il riquadro o il menu aperto, poi il pannello', async ({ page }) => {
  const nome = `${PREFISSO}esc a strati`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(318) })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  const foglio = pannello(page, nome)
  await expect(foglio).toBeVisible()

  // «Rinomina»: Esc drops the new Name, the panel stays
  await foglio.getByRole('button', { name: `Modifica il Name di «${nome}»` }).click()
  const campo = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(campo).toBeFocused()
  await campo.fill('Un nome da non salvare')
  await page.keyboard.press('Escape')
  await expect(campo).toBeHidden()
  await expect(foglio).toBeVisible()

  // the Status menu and «Altre azioni»: Esc closes the menu only
  await foglio.getByRole('button', { name: `Not started: cambia lo Status di ${nome}` }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Posted', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitemradio', { name: 'Posted', exact: true })).toBeHidden()
  await expect(foglio).toBeVisible()
  await foglio.getByRole('button', { name: `Altre azioni su «${nome}»` }).click()
  await expect(page.getByRole('menuitem', { name: 'Copia il link' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: 'Copia il link' })).toBeHidden()
  await expect(foglio).toBeVisible()

  // nothing open, nothing changed: Esc closes the panel
  await foglio.getByLabel('Audio').focus()
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)
  expect(await leggiContenuto(id)).toMatchObject({ nome, stato: 'not_started', audio: null })
})

test('le celle della tabella: Reel Type da tastiera, Post Date con Invio, Audio con Esc, URL, View Count, Name', async ({ page }) => {
  test.setTimeout(120_000)
  const nome = `${PREFISSO}celle`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(330) })
  await creaContenutoDiProva(`${PREFISSO}celle dopo`, { post_date: avanti(329) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('celle'))
  const r = riga(page, nome)

  // Reel Type from the keyboard: the menu opens, an item, Enter
  await r.getByRole('button', { name: `Vuoto: scegli Reel Type di «${nome}»` }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitemradio', { name: 'Education' }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Reel Type: Education')).toBeVisible()
  await expect(r.getByRole('button', { name: `Education: cambia Reel Type di «${nome}»` })).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(id))?.reel_type).toBe('education')

  // Audio with Esc: nothing saved
  await r.getByRole('button', { name: `Vuoto: scrivi Audio di «${nome}»` }).click()
  const audio = page.getByRole('dialog').getByLabel('Audio')
  await expect(audio).toBeFocused()
  await audio.fill('Da non salvare')
  await page.keyboard.press('Escape')
  await expect(audio).toBeHidden()
  expect((await leggiContenuto(id))?.audio).toBeNull()

  // URL: a share link is refused in the popover, then a real one
  await r.getByRole('button', { name: `Vuoto: aggiungi URL di «${nome}»` }).click()
  const url = page.getByRole('dialog').getByLabel('URL')
  await url.fill('https://www.instagram.com/share/p/Xyz12345/')
  await url.press('Enter')
  await expect(page.getByRole('dialog').getByText('Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.')).toBeVisible()
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  expect((await leggiContenuto(id))?.url).toBeNull()
  await url.fill('www.instagram.com/reel/E2ePanCella1/')
  await url.press('Enter')
  await expect(toast(page, 'URL salvato')).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(id))?.instagram_shortcode).toBe('E2ePanCella1')

  // View Count as Notion shows it
  await r.getByRole('button', { name: `Vuoto: scrivi View Count di «${nome}»` }).click()
  await page.getByRole('dialog').getByLabel('View Count').fill('12.480')
  await page.getByRole('dialog').getByRole('button', { name: 'Salva' }).click()
  await expect(toast(page, 'View Count: 12.480')).toBeVisible()
  await expect(r.getByRole('button', { name: `12.480: cambia View Count di «${nome}»` })).toBeVisible()

  // the Name with the pencil: empty is refused
  await r.hover()
  await r.getByRole('button', { name: `Modifica il Name di «${nome}»` }).click()
  const nomeCampo = page.getByRole('dialog').getByLabel('Name')
  await nomeCampo.fill('   ')
  await nomeCampo.press('Enter')
  await expect(page.getByRole('dialog').getByText('Scrivi il nome.')).toBeVisible()
  await page.keyboard.press('Escape')
  expect((await leggiContenuto(id))?.nome).toBe(nome)

  // Post Date with Enter: the row moves after the other one, the focus stays on its cell
  const dopo = avanti(328)
  await r.getByRole('button', { name: new RegExp(`: cambia Post Date di «${escape(nome)}»$`) }).click()
  await page.getByRole('dialog').getByLabel('Post Date').fill(dopo)
  await page.getByRole('dialog').getByLabel('Post Date').press('Enter')
  await expect(toast(page, `Post Date: ${formatData(dopo)}`)).toBeVisible()
  const cella = r.getByRole('button', { name: `${formatData(dopo)}: cambia Post Date di «${nome}»` })
  await expect(cella).toBeFocused()
  await expect(sezioneContenuti(page).getByRole('row').nth(2)).toContainText(nome)
  expect(await leggiContenuto(id)).toMatchObject({ post_date: dopo, view_count: 12480, audio: null })
})

test('le altre celle: Format, Inspiration, Status, la data tolta e il Name rinominato; tutto resta ricaricando', async ({ page }) => {
  test.setTimeout(120_000)
  const nome = `${PREFISSO}altre celle`
  const rinominato = `${PREFISSO}altre celle, rinominato`
  const giorno = avanti(335)
  const id = await creaContenutoDiProva(nome, { post_date: giorno })
  await accedi(page, 'marketing')
  await page.goto(listaDi('altre celle'))
  const r = riga(page, nome)

  // Format with the mouse, from Notion's options
  await r.getByRole('button', { name: `Vuoto: scegli Format di «${nome}»` }).click()
  await page.getByRole('menuitemradio', { name: 'Green Screen' }).click()
  await expect(toast(page, 'Format: Green Screen')).toBeVisible()
  await expect(r.getByRole('button', { name: `Green Screen: cambia Format di «${nome}»` })).toBeVisible()

  // Inspiration: a link pasted without https://; then its popover opens it
  await r.getByRole('button', { name: `Vuoto: aggiungi Inspiration di «${nome}»` }).click()
  const ispirazione = page.getByRole('dialog').getByLabel('Inspiration')
  await expect(ispirazione).toBeFocused()
  await ispirazione.fill('www.instagram.com/reel/AltroCreator01/')
  await ispirazione.press('Enter')
  await expect(toast(page, 'Inspiration salvata')).toBeVisible()
  // a cell reopens once its save is back (spec R13): until then it is dimmed and busy
  const cellaIspirazione = r.getByRole('button', { name: `Inspiration: apri o cambia il link di «${nome}»` })
  await expect(cellaIspirazione).not.toHaveAttribute('aria-busy')
  await cellaIspirazione.click()
  await expect(page.getByRole('dialog').getByRole('link', { name: /^Apri l’ispirazione/ })).toHaveAttribute(
    'href',
    'https://www.instagram.com/reel/AltroCreator01/',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // the Status from its cell, one tap
  await r.getByRole('button', { name: `Not started: cambia lo Status di ${nome}` }).click()
  await page.getByRole('menuitemradio', { name: 'To be recorded' }).click()
  await expect(toast(page, 'Status: To be recorded')).toBeVisible()

  // the Post Date taken away: «Togli la data»
  await r.getByRole('button', { name: `${formatData(giorno)}: cambia Post Date di «${nome}»` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Togli la data' }).click()
  await expect(toast(page, 'Post Date tolta')).toBeVisible()
  await expect(r.getByRole('button', { name: `Vuoto: scegli Post Date di «${nome}»` })).toBeVisible()

  // the Name with the pencil, last: the row is then named after it
  await r.hover()
  await r.getByRole('button', { name: `Modifica il Name di «${nome}»` }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(rinominato)
  await page.getByRole('dialog').getByLabel('Name').press('Enter')
  await expect(toast(page, 'Name salvato')).toBeVisible()
  await expect(sezioneContenuti(page).getByRole('link', { name: rinominato, exact: true })).toBeVisible()

  // a reload reads everything back from the database
  await page.reload()
  const dopo = riga(page, rinominato)
  await expect(dopo.getByRole('button', { name: `Green Screen: cambia Format di «${rinominato}»` })).toBeVisible()
  await expect(dopo.getByRole('button', { name: `Inspiration: apri o cambia il link di «${rinominato}»` })).toBeVisible()
  await expect(dopo.getByRole('button', { name: `To be recorded: cambia lo Status di ${rinominato}` })).toBeVisible()
  await expect(dopo.getByRole('button', { name: `Vuoto: scegli Post Date di «${rinominato}»` })).toBeVisible()
  expect(await leggiContenuto(id)).toMatchObject({
    nome: rinominato,
    formato: 'green_screen',
    inspiration: 'https://www.instagram.com/reel/AltroCreator01/',
    stato: 'to_be_recorded',
    post_date: null,
  })
})

test('due browser, la tabella e il pannello: Reel Type e Name contesi; lo Status lo vince l’ultimo tocco', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  const nome = `${PREFISSO}tabella e pannello`
  const diDany = `${PREFISSO}tabella e pannello, di Dany`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(342) })
  await accedi(page, 'editor')
  await page.goto(listaDi('tabella e pannello'))
  const admin = await altraPersona(browser, 'admin')
  await admin.goto(`/marketing/contenuti?contenuto=${id}`)
  await expect(pannello(admin, nome)).toBeVisible()

  // the video editor picks a Reel Type from the table
  await riga(page, nome).getByRole('button', { name: `Vuoto: scegli Reel Type di «${nome}»` }).click()
  await page.getByRole('menuitemradio', { name: 'Converting' }).click()
  await expect(toast(page, 'Reel Type: Converting')).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(id))?.reel_type).toBe('converting')

  // Dany, in the panel opened before, picks another one from «Vuoto»: nothing written, the panel shows the saved one
  await pannello(admin, nome).getByLabel('Reel Type').selectOption({ label: 'Attraction' })
  await expect(toast(admin, CAMPO_CAMBIATO('Reel Type'))).toBeVisible()
  await expect(pannello(admin, nome).getByLabel('Reel Type')).toHaveValue('converting')
  expect((await leggiContenuto(id))?.reel_type).toBe('converting')

  // Dany renames it in the panel
  await pannello(admin, nome).getByRole('button', { name: `Modifica il Name di «${nome}»` }).click()
  // the pencil sits inside the panel's dialog too: the field by its role
  const campoNome = admin.getByRole('textbox', { name: 'Name', exact: true })
  await campoNome.fill(diDany)
  await campoNome.press('Enter')
  await expect(toast(admin, 'Name salvato')).toBeVisible()
  await expect(pannello(admin, diDany)).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(id))?.nome).toBe(diDany)

  // the video editor renames it from the Name his table still shows: refused, his row shows Dany's
  await riga(page, nome).hover()
  await riga(page, nome).getByRole('button', { name: `Modifica il Name di «${nome}»` }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(`${PREFISSO}tabella e pannello, di Sara`)
  await page.getByRole('dialog').getByLabel('Name').press('Enter')
  await expect(toast(page, CAMPO_CAMBIATO('Name'))).toBeVisible()
  await expect(sezioneContenuti(page).getByRole('link', { name: diDany, exact: true })).toBeVisible()
  expect((await leggiContenuto(id))?.nome).toBe(diDany)

  // the Status is one tap without a comparison, as in Notion: the last tap wins, no conflict
  await riga(page, diDany).getByRole('button', { name: `Not started: cambia lo Status di ${diDany}` }).click()
  await page.getByRole('menuitemradio', { name: 'To be edited' }).click()
  await expect(toast(page, 'Status: To be edited')).toBeVisible()
  await pannello(admin, diDany).getByRole('button', { name: `Not started: cambia lo Status di ${diDany}` }).click()
  await admin.getByRole('menuitemradio', { name: 'To be posted' }).click()
  await expect(toast(admin, 'Status: To be posted')).toBeVisible()
  await expect.poll(async () => (await leggiContenuto(id))?.stato).toBe('to_be_posted')
  await admin.context().close()
})

test('due persone sullo stesso campo: chi salva per secondo vede quello salvato; su un altro campo passa', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  const nome = `${PREFISSO}conteso`
  const prima = avanti(340)
  const id = await creaContenutoDiProva(nome, { post_date: prima })
  await accedi(page, 'marketing')
  await page.goto(listaDi('conteso'))
  const admin = await altraPersona(browser, 'admin')
  await admin.goto(listaDi('conteso'))

  // A moves the Post Date
  const dataA = avanti(341)
  await riga(page, nome).getByRole('button', { name: new RegExp(`: cambia Post Date di «${escape(nome)}»$`) }).click()
  await page.getByRole('dialog').getByLabel('Post Date').fill(dataA)
  await page.getByRole('dialog').getByLabel('Post Date').press('Enter')
  await expect.poll(async () => (await leggiContenuto(id))?.post_date).toBe(dataA)

  // B moves it from the date he saw: nothing written, his cell shows A's
  await riga(admin, nome).getByRole('button', { name: `${formatData(prima)}: cambia Post Date di «${nome}»` }).click()
  await admin.getByRole('dialog').getByLabel('Post Date').fill(avanti(345))
  await admin.getByRole('dialog').getByLabel('Post Date').press('Enter')
  await expect(
    toast(admin, 'Il campo «Post Date» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.'),
  ).toBeVisible()
  await expect(riga(admin, nome).getByRole('button', { name: `${formatData(dataA)}: cambia Post Date di «${nome}»` })).toBeVisible()
  expect((await leggiContenuto(id))?.post_date).toBe(dataA)

  // another field of the same row: never blocked
  await riga(admin, nome).getByRole('button', { name: `Vuoto: scrivi Audio di «${nome}»` }).click()
  await admin.getByRole('dialog').getByLabel('Audio').fill('Audio di Dany')
  await admin.getByRole('dialog').getByLabel('Audio').press('Enter')
  await expect(toast(admin, 'Audio salvato')).toBeVisible()
  expect(await leggiContenuto(id)).toMatchObject({ post_date: dataA, audio: 'Audio di Dany' })
  await admin.context().close()
})

test('il server rifiuta (lo stesso post su un altro contenuto): il toast lo dice e la cella torna com’era', async ({ page }) => {
  const nome = `${PREFISSO}post doppio`
  await creaContenutoDiProva(`${PREFISSO}post doppio già`, {
    post_date: avanti(350),
    url: 'https://www.instagram.com/reel/E2ePanDopp1/',
  })
  const id = await creaContenutoDiProva(nome, { post_date: avanti(351) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('post doppio'))

  await riga(page, nome).getByRole('button', { name: `Vuoto: aggiungi URL di «${nome}»` }).click()
  await page.getByRole('dialog').getByLabel('URL').fill('https://www.instagram.com/reel/E2ePanDopp1/')
  await page.getByRole('dialog').getByLabel('URL').press('Enter')
  await expect(toast(page, 'Questo post è già collegato a un altro contenuto.')).toBeVisible()
  await expect(riga(page, nome).getByRole('button', { name: `Vuoto: aggiungi URL di «${nome}»` })).toBeVisible()
  expect((await leggiContenuto(id))?.url).toBeNull()
})

test('una cella che fa uscire il contenuto dai filtri: il focus va sulla stessa cella della riga dopo, con un annuncio', async ({
  page,
}) => {
  const primo = `${PREFISSO}uscita uno`
  const secondo = `${PREFISSO}uscita due`
  await creaContenutoDiProva(primo, { post_date: avanti(361), reel_type: 'radio' })
  await creaContenutoDiProva(secondo, { post_date: avanti(360), reel_type: 'radio' })
  await accedi(page, 'marketing')
  await page.goto(listaDi('uscita', '&reel_type=radio'))

  await riga(page, primo).getByRole('button', { name: `RADIO: cambia Reel Type di «${primo}»` }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitemradio', { name: 'Workshop' }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Reel Type: Workshop')).toBeVisible()
  await expect(riga(page, primo)).toHaveCount(0)
  await expect(riga(page, secondo).getByRole('button', { name: `RADIO: cambia Reel Type di «${secondo}»` })).toBeFocused()
  await expect(page.getByTestId('annuncio-contenuti')).toHaveText(
    `«${primo}» non è più nella lista con questi filtri: ora sei su Reel Type di «${secondo}».`,
  )
})

test('uno Status cambiato nel pannello porta il contenuto fuori dai filtri: chiuso, il focus va sul Name dopo, con un annuncio', async ({
  page,
}) => {
  const primo = `${PREFISSO}fuori dal gruppo uno`
  const secondo = `${PREFISSO}fuori dal gruppo due`
  await creaContenutoDiProva(primo, { post_date: avanti(363), stato: 'to_be_edited' })
  await creaContenutoDiProva(secondo, { post_date: avanti(362), stato: 'to_be_edited' })
  await accedi(page, 'marketing')
  await page.goto(listaDi('fuori dal gruppo', '&gruppo=in_progress'))

  await sezioneContenuti(page).getByRole('link', { name: primo, exact: true }).click()
  const foglio = pannello(page, primo)
  await foglio.getByRole('button', { name: `To be edited: cambia lo Status di ${primo}` }).click()
  await page.getByRole('menuitemradio', { name: 'Posted', exact: true }).click()
  await expect(toast(page, 'Status: Posted')).toBeVisible()
  // the panel keeps it while open: the content is still the one being read
  await expect(foglio.getByRole('button', { name: `Posted: cambia lo Status di ${primo}` })).not.toHaveAttribute('aria-busy')

  await foglio.getByRole('button', { name: 'Chiudi il contenuto' }).click()
  await expect(foglio).toBeHidden()
  await expect(riga(page, primo)).toHaveCount(0)
  await expect(sezioneContenuti(page).getByRole('link', { name: secondo, exact: true })).toBeFocused()
  await expect(page.getByTestId('annuncio-contenuti')).toHaveText(
    `«${primo}» non è più nella lista con questi filtri: ora sei su «${secondo}».`,
  )
})

test('il video editor modifica dalla cella e dal pannello, e non elimina', async ({ page }) => {
  const nome = `${PREFISSO}editor`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(370) })
  await accedi(page, 'editor')
  await page.goto(listaDi('editor'))

  await riga(page, nome).getByRole('button', { name: `Vuoto: scegli Format di «${nome}»` }).click()
  await page.getByRole('menuitemradio', { name: 'Split' }).click()
  await expect(toast(page, 'Format: Split')).toBeVisible()

  await sezioneContenuti(page).getByRole('link', { name: nome, exact: true }).click()
  const foglio = pannello(page, nome)
  await foglio.getByLabel('Audio').fill('Audio del video editor')
  await foglio.getByLabel('Audio').press('Enter')
  await expect(toast(page, 'Audio salvato')).toBeVisible()
  await expect(foglio.getByText(/Un contenuto lo eliminano l’admin e il marketing/)).toBeVisible()
  await expect(foglio.getByRole('button', { name: /Elimina/ })).toHaveCount(0)
  expect(await leggiContenuto(id)).toMatchObject({ formato: 'split', audio: 'Audio del video editor' })
})

test('un contenuto nuovo che i filtri non mostrano: il pannello si apre coi suoi dati; chiuso, il focus torna su «Nuovo contenuto»', async ({
  page,
}) => {
  const nome = `${PREFISSO}nuovo fuori dai filtri`
  await accedi(page, 'marketing')
  await page.goto(listaDi('nessuno si chiama così'))
  await expect(sezioneContenuti(page).getByText('Nessun contenuto con questi filtri', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Nuovo contenuto' }).click()
  const modulo = page.getByRole('dialog', { name: 'Nuovo contenuto' })
  await modulo.getByLabel('Name', { exact: true }).fill(nome)
  await modulo.getByRole('button', { name: 'Crea il contenuto' }).click()
  const foglio = pannello(page, nome)
  await expect(foglio).toBeVisible()
  await expect(toast(page, 'Contenuto creato')).toBeVisible()
  await expect(page).toHaveURL(/contenuto=[0-9a-f-]{36}/)
  await expect(foglio.getByRole('heading', { name: nome })).toBeFocused()
  // its sections come with the GET: a Reel Topic starts with the template's rough draft
  await expect(foglio.getByRole('region', { name: 'Script (Rough Draft)', exact: true }).getByText(/Hook:/)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)
  // the focus goes back to the button that started it all, never <body>
  await expect(page.getByRole('button', { name: 'Nuovo contenuto' })).toBeFocused()
})

test('il marketing elimina dal pannello: si chiude, la riga se ne va e il focus va sul Name dopo', async ({ page }) => {
  const nome = `${PREFISSO}elimina uno`
  const dopo = `${PREFISSO}elimina due`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(381) })
  await creaContenutoDiProva(dopo, { post_date: avanti(380) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('elimina'))

  await sezioneContenuti(page).getByRole('link', { name: nome, exact: true }).click()
  await pannello(page, nome).getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domanda = page.getByRole('dialog', { name: `Eliminare il contenuto «${nome}»?` })
  await domanda.getByRole('button', { name: 'Elimina', exact: true }).click()
  await expect(toast(page, 'Contenuto eliminato')).toBeVisible()
  await expect(pannello(page, nome)).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)
  await expect(riga(page, nome)).toHaveCount(0)
  await expect(sezioneContenuti(page).getByRole('link', { name: dopo, exact: true })).toBeFocused()
  expect(await leggiContenuto(id)).toBeNull()
})

test('il mouse che passa sulle righe senza fermarsi non legge niente; fermo su una riga, sì', async ({ page }) => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) await creaContenutoDiProva(`${PREFISSO}passaggio ${n}`, { post_date: avanti(390 + n) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('passaggio'))
  await expect(sezioneContenuti(page).getByRole('link', { name: new RegExp(`^${escape(PREFISSO)}passaggio`) })).toHaveCount(10)

  const letture: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/marketing/contenuti/')) letture.push(r.url())
  })
  const link = sezioneContenuti(page).getByRole('link', { name: new RegExp(`^${escape(PREFISSO)}passaggio`) })
  const primo = (await link.first().boundingBox())!
  const ultimo = (await link.last().boundingBox())!
  // across the ten Names in a few milliseconds each
  await page.mouse.move(primo.x + 10, primo.y - 20)
  await page.mouse.move(ultimo.x + 10, ultimo.y + ultimo.height + 20, { steps: 10 })
  await page.waitForTimeout(400)
  expect(letture).toEqual([])

  // at rest on one: it starts reading
  await link.nth(3).hover()
  await expect.poll(() => letture.length).toBe(1)
})

test('chiuso dopo un salvataggio, il focus torna sul Name senza rileggere il contenuto; il focus da tastiera sì, dopo un attimo', async ({
  page,
}) => {
  const [nome, altro] = ['ritorno uno', 'ritorno due'].map((n) => `${PREFISSO}${n}`)
  await creaContenutoDiProva(nome, { post_date: avanti(405) })
  await creaContenutoDiProva(altro, { post_date: avanti(404) })
  await accedi(page, 'marketing')
  await page.goto(listaDi('ritorno'))
  const link = sezioneContenuti(page).getByRole('link', { name: nome, exact: true })
  await link.click()
  const foglio = pannello(page, nome)
  await foglio.getByLabel('Reel Type').selectOption({ label: 'Education' })
  await expect(toast(page, 'Reel Type: Education')).toBeVisible()
  await expect(foglio.getByLabel('Reel Type')).not.toHaveAttribute('aria-busy')

  const letture: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/marketing/contenuti/')) letture.push(r.url())
  })
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(link).toBeFocused()
  // the focus given back is not an intent to open it again: no read of the content just closed
  await page.waitForTimeout(500)
  expect(letture).toEqual([])

  // the keyboard on another Name (the last input was a key: :focus-visible): its intent, after 80 ms at rest
  await sezioneContenuti(page).getByRole('link', { name: altro, exact: true }).focus()
  await expect.poll(() => letture.length).toBe(1)
})

test('con «Riduci movimento» il pannello non scorre', async ({ page }) => {
  const nome = `${PREFISSO}movimento`
  const id = await creaContenutoDiProva(nome, { post_date: avanti(400) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  const foglio = pannello(page, nome)
  await expect(foglio).toBeVisible()
  const durata = await foglio.evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(Math.max(...durata.split(',').map((d) => parseFloat(d)))).toBeLessThan(0.001)
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('le card hanno Status, Post Date, Reel Type e Format da 44 px; una data cambiata sposta la card; il pannello a tutto schermo', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const mese = primoDelMeseISO(oggiRoma())
    const giorno = aggiungiGiorni(mese, 9)
    const nuovoGiorno = aggiungiGiorni(mese, 19)
    const nome = `${PREFISSO}telefono`
    // a long Script (Final): the panel scrolls well past one screen
    const finale = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: una riga dello script.`).join('\n')
    const id = await creaContenutoDiProva(nome, { post_date: giorno, reel_type: 'education', finale })
    await accedi(page, 'marketing')
    await page.goto(`/marketing/contenuti?vista=calendario&q=${encodeURIComponent(nome)}`)
    const sezione = sezioneContenuti(page)
    const card = sezione.getByRole('listitem').filter({ has: page.getByRole('link', { name: nome, exact: true }) })
    await expect(card).toBeVisible()

    for (const chip of [
      card.getByRole('button', { name: `Not started: cambia lo Status di ${nome}` }),
      card.getByRole('button', { name: `${formatData(giorno)}: cambia Post Date di «${nome}»` }),
      card.getByRole('button', { name: `Education: cambia Reel Type di «${nome}»` }),
      card.getByRole('button', { name: `Vuoto: scegli Format di «${nome}»` }),
    ]) {
      await expect(chip).toBeVisible()
      expect(await altezza(chip)).toBeGreaterThanOrEqual(44)
    }
    await expect(card.getByText('Format', { exact: true })).toBeVisible()
    await senzaScrollLaterale(page)

    // the Post Date from the chip: the card goes to its new day
    await card.getByRole('button', { name: `${formatData(giorno)}: cambia Post Date di «${nome}»` }).click()
    await page.getByRole('dialog').getByLabel('Post Date').fill(nuovoGiorno)
    await page.getByRole('dialog').getByRole('button', { name: 'Salva' }).click()
    await expect(toast(page, `Post Date: ${formatData(nuovoGiorno)}`)).toBeVisible()
    const giornoNuovo = `${nomeGiorno(nuovoGiorno)} ${nuovoGiorno.slice(8, 10)}/${nuovoGiorno.slice(5, 7)}`
    await expect(
      sezione.getByRole('region', { name: new RegExp(`${escape(giornoNuovo)}$`, 'i') }).getByRole('link', { name: nome, exact: true }),
    ).toBeVisible()
    expect((await leggiContenuto(id))?.post_date).toBe(nuovoGiorno)

    // the panel: the whole screen, nothing sideways, a 44 px X
    await sezione.getByRole('link', { name: nome, exact: true }).click()
    const foglio = pannello(page, nome)
    await expect(foglio).toBeVisible()
    expect((await foglio.boundingBox())!.width).toBeGreaterThanOrEqual(389)
    const x = foglio.getByRole('button', { name: 'Chiudi il contenuto' })
    expect(await altezza(x)).toBeGreaterThanOrEqual(44)
    expect((await x.boundingBox())!.width).toBeGreaterThanOrEqual(44)
    const largo = await foglio.evaluate((el) => [el.scrollWidth, el.clientWidth])
    expect(largo[0]).toBeLessThanOrEqual(largo[1])
    await senzaScrollLaterale(page)

    // scrolled to the end, the header (Name, Status, the X) is still on screen
    await expect(foglio.getByText('Line 60: una riga dello script.')).toBeVisible()
    await foglio.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(foglio.getByRole('button', { name: 'Elimina il contenuto' })).toBeInViewport()
    expect((await x.boundingBox())!.y).toBeGreaterThanOrEqual(0)
    await expect(x).toBeInViewport({ ratio: 1 })
  })

  test('un salvataggio nel pannello: il toast va in basso, mai sopra la X, la matita e «Altre azioni»; la X lo chiude subito', async ({
    page,
  }) => {
    const nome = `${PREFISSO}toast in basso`
    const id = await creaContenutoDiProva(nome, { post_date: avanti(415) })
    await accedi(page, 'marketing')
    await page.goto(`/marketing/contenuti?contenuto=${id}`)
    const foglio = pannello(page, nome)
    await expect(foglio).toBeVisible()
    await foglio.getByLabel('Reel Type').selectOption({ label: 'Education' })
    await expect(toast(page, 'Reel Type: Education')).toBeVisible()

    const scatola = (await page.locator('[data-sonner-toast]').first().boundingBox())!
    const x = foglio.getByRole('button', { name: 'Chiudi il contenuto' })
    for (const controllo of [
      x,
      foglio.getByRole('button', { name: `Modifica il Name di «${nome}»` }),
      foglio.getByRole('button', { name: `Altre azioni su «${nome}»` }),
      foglio.getByRole('button', { name: `Not started: cambia lo Status di ${nome}` }),
    ]) {
      const b = (await controllo.boundingBox())!
      const sopraIlToast = b.y + b.height <= scatola.y || b.y >= scatola.y + scatola.height
      expect(sopraIlToast, 'il toast copre un controllo della testata').toBe(true)
    }
    // the tap where the X is, while the toast is still there (a locator's click would wait for it to go)
    const b = (await x.boundingBox())!
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await expect(foglio).toBeHidden()
    await expect(page).not.toHaveURL(/contenuto=/)
  })

  test('chiuso il pannello dopo un salvataggio, il toast resta sopra la barra in basso: il tocco su «I miei task» arriva subito', async ({
    page,
  }) => {
    const nome = `${PREFISSO}toast e barra`
    await creaContenutoDiProva(nome, { post_date: avanti(416) })
    await accedi(page, 'marketing')
    await page.goto(listaDi('toast e barra'))
    await sezioneContenuti(page).getByRole('link', { name: nome, exact: true }).click()
    const foglio = pannello(page, nome)
    await expect(foglio).toBeVisible()
    await foglio.getByLabel('Reel Type').selectOption({ label: 'Education' })
    await expect(toast(page, 'Reel Type: Education')).toBeVisible()
    const x = await fermo(foglio.getByRole('button', { name: 'Chiudi il contenuto' }))
    await page.mouse.click(x.x + x.width / 2, x.y + x.height / 2)
    await expect(foglio).toBeHidden()

    // the toast is still there, and above the bar: none of its items under it
    await expect(toast(page, 'Reel Type: Education')).toBeVisible()
    const scatola = (await page.locator('[data-sonner-toast]').first().boundingBox())!
    const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
    const fondo = (await barra.boundingBox())!
    expect(scatola.y + scatola.height, 'il toast copre la barra in basso').toBeLessThanOrEqual(fondo.y)
    const voce = (await barra.getByRole('link', { name: 'I miei task', exact: true }).boundingBox())!
    await page.mouse.click(voce.x + voce.width / 2, voce.y + voce.height / 2)
    await expect(page).toHaveURL(/\/task(\?|$)/, { timeout: 5000 })
  })

  test('«Crea il contenuto»: il pannello si apre col toast in basso, e la X lo chiude subito', async ({ page }) => {
    const nome = `${PREFISSO}nuovo dal telefono`
    await accedi(page, 'marketing')
    await page.goto(listaDi('nuovo dal telefono'))
    await page.getByRole('button', { name: 'Nuovo contenuto', exact: true }).first().click()
    const modulo = page.getByRole('dialog', { name: 'Nuovo contenuto' })
    await modulo.getByLabel('Name', { exact: true }).fill(nome)
    await modulo.getByRole('button', { name: 'Crea il contenuto' }).click()
    const foglio = pannello(page, nome)
    await expect(foglio).toBeVisible()
    await expect(toast(page, 'Contenuto creato')).toBeVisible()

    // the tap where the X is, once the panel is in place, while the toast is still there
    const x = await fermo(foglio.getByRole('button', { name: 'Chiudi il contenuto' }))
    await expect(toast(page, 'Contenuto creato')).toBeVisible()
    const scatola = (await page.locator('[data-sonner-toast]').first().boundingBox())!
    expect(x.y + x.height <= scatola.y || x.y >= scatola.y + scatola.height, 'il toast copre la X').toBe(true)
    await page.mouse.click(x.x + x.width / 2, x.y + x.height / 2)
    await expect(foglio).toBeHidden({ timeout: 1500 })
  })

  test('la Tabella sul telefono: card coi chip, il tocco sulla card apre il pannello, niente scroll di lato', async ({ page }) => {
    test.setTimeout(90_000)
    const nome = `${PREFISSO}card della tabella`
    const id = await creaContenutoDiProva(nome, { post_date: avanti(410), view_count: 3200 })
    await accedi(page, 'marketing')
    await page.goto(listaDi('card della tabella'))
    const sezione = sezioneContenuti(page)
    // 390 px: no table, the cards
    await expect(sezione.getByRole('table')).toHaveCount(0)
    const card = sezione.getByRole('listitem').filter({ has: page.getByRole('link', { name: nome, exact: true }) })
    await expect(card).toBeVisible()
    await expect(card.getByText('3.200', { exact: true })).toBeVisible()
    await senzaScrollLaterale(page)

    // a chip changes its property and never opens the card
    await card.getByRole('button', { name: `Vuoto: scegli Format di «${nome}»` }).click()
    await page.getByRole('menuitemradio', { name: 'Storytelling' }).click()
    await expect(toast(page, 'Format: Storytelling')).toBeVisible()
    await expect(page).not.toHaveURL(/contenuto=/)
    await expect(card.getByRole('button', { name: `Storytelling: cambia Format di «${nome}»` })).toBeVisible()
    expect((await leggiContenuto(id))?.formato).toBe('storytelling')

    // a tap on the card away from its chips: the panel, the whole screen, nothing sideways
    const scatola = (await card.boundingBox())!
    await page.mouse.click(scatola.x + scatola.width - 12, scatola.y + 12)
    const foglio = pannello(page, nome)
    await expect(foglio).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`contenuto=${id}`))
    expect((await foglio.boundingBox())!.width).toBeGreaterThanOrEqual(389)
    await expect(foglio.getByLabel('Format')).toHaveValue('storytelling')
    await senzaScrollLaterale(page)
    const largo = await foglio.evaluate((el) => [el.scrollWidth, el.clientWidth])
    expect(largo[0]).toBeLessThanOrEqual(largo[1])

    // Back closes it, the list is still there
    await page.goBack()
    await expect(foglio).toBeHidden()
    await expect(page).not.toHaveURL(/contenuto=/)
    await expect(card).toBeVisible()
    await senzaScrollLaterale(page)
  })
})
