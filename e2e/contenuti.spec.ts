import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { creaContenutoDiProva, dbLocale, leggiContenuto, pulisciContenuti } from './db'
import { accedi, type RuoloSeed } from './utenti'

/**
 * The content calendar (1.32.0), the Piano editoriale since 21/10/2026: Notion's
 * "Instagram Posts" in the app, for the admin, the video editor and marketing. Rows of these tests start with
 * PREFISSO and go away at the end; the seed's twelve contents stay as they are.
 */
const PREFISSO = 'E2E Contenuti '

const CAMPO_CAMBIATO = (campo: string) =>
  `Il campo «${campo}» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.`
const SEZIONE_CAMBIATA =
  'Questa parte è cambiata da un’altra parte: ricarico il testo salvato. Il tuo testo resta qui sotto: copialo se ti serve.'
const LINK_CONDIVISIONE = 'Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.'

test.beforeAll(async () => {
  await pulisciContenuti(PREFISSO)
})

test.afterAll(async () => {
  await pulisciContenuti(PREFISSO)
})

function escape(testo: string) {
  return testo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The toast (sonner's region), not other text with the same words. */
function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

/** The list: the section the container queries measure. */
function sezioneContenuti(page: Page) {
  return page.getByRole('region', { name: 'Piano editoriale', exact: true })
}

/** The Status button of one content: "Posted: cambia lo Status di …". */
function bottoneStatus(radice: Page | Locator, nome: string) {
  return radice.getByRole('button', { name: new RegExp(`: cambia lo Status di ${escape(nome)}$`) })
}

/** An address without its #fragment. */
function senzaFrammento(url: string) {
  return url.split('#')[0]
}

/** Nothing scrolls sideways: the page is never wider than the window. */
async function senzaScrollLaterale(page: Page) {
  const [pagina, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(pagina, 'scroll orizzontale della pagina').toBeLessThanOrEqual(finestra)
}

/** A second person, in a browser of their own. */
async function altraPersona(browser: Browser, ruolo: RuoloSeed) {
  const pagina = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await accedi(pagina, ruolo)
  return pagina
}

/**
 * "Modifica" on a section, then its text. The field takes the focus on the
 * next frame, with the caret at the end: typing before that frame would land
 * after the old text (a page in a second browser draws later).
 */
async function scriviSezione(radice: Page | Locator, titolo: string, testo: string, atteso?: string) {
  await radice.getByRole('button', { name: `Modifica ${titolo}` }).click()
  const campo = radice.getByRole('textbox', { name: titolo, exact: true })
  await expect(campo).toBeFocused()
  if (atteso !== undefined) await expect(campo).toHaveValue(atteso)
  await campo.fill(testo)
  await radice.getByRole('button', { name: 'Salva', exact: true }).click()
}

/** The top of each word on screen: words on separate lines have different tops. */
async function altezzeDelleParole(elemento: Locator, parole: string[]) {
  return elemento.evaluate((el, cercate) => {
    const alto: Record<string, number> = {}
    const giro = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let nodo = giro.nextNode(); nodo; nodo = giro.nextNode()) {
      const testo = nodo.textContent ?? ''
      for (const parola of cercate) {
        const i = testo.indexOf(parola)
        if (alto[parola] !== undefined || i < 0) continue
        const intervallo = document.createRange()
        intervallo.setStart(nodo, i)
        intervallo.setEnd(nodo, i + parola.length)
        alto[parola] = intervallo.getBoundingClientRect().top
      }
    }
    return cercate.map((parola) => alto[parola] ?? null)
  }, parole)
}

test('il marketing atterra sul Piano editoriale: in cima quello con la Post Date più recente', async ({ page }) => {
  // the same order as the page: Post Date newest first (undated last), then the newest created
  const { data, error } = await dbLocale()
    .from('marketing_contenuti')
    .select('nome')
    .order('post_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id')
    .limit(1)
  if (error) throw error
  const primo = data[0].nome

  await accedi(page, 'marketing')
  await expect(page).toHaveURL(/\/marketing\/contenuti$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Piano editoriale' })).toBeVisible()
  // one view only: the table (no «Tabella | Calendario» any more)
  await expect(page.getByRole('group', { name: 'Vista dei contenuti' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Calendario' })).toHaveCount(0)

  // on a desktop the section is wide enough for the table: seven columns, Inspiration and Audio are in the panel
  const tabella = sezioneContenuti(page).getByRole('table')
  await expect(tabella.getByRole('columnheader')).toHaveText(['Name', 'Reel Type', 'Format', 'Status', 'Post Date', 'URL', 'Views'])
  await expect(tabella.locator('tbody tr').first().getByRole('link').first()).toHaveText(primo)

  // the filters on one row: the search, Status, Reel Type, Format
  await expect(page.getByRole('searchbox', { name: 'Cerca per Name' })).toBeVisible()
  for (const campo of ['Status', 'Reel Type', 'Format']) await expect(page.getByLabel(campo, { exact: true })).toBeVisible()

  // the sidebar: Piano editoriale lit, no Economics item
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(nav.getByRole('link', { name: 'Piano editoriale' })).toHaveAttribute('aria-current', 'page')
  for (const voce of ['Panoramica', 'Oggi', 'Le mie call', 'Pipeline', 'Setter', 'Closer']) {
    await expect(nav.getByRole('link', { name: voce, exact: true })).toHaveCount(0)
  }

  // the sidebar groups the area under «Marketing» with its three pages as items (1.38.0; «Pubblicati» replaced «Post di
  // Instagram» and «Analisi» on 25/10/2026), each lit on its own page, none with a number
  const gruppoMarketing = nav.getByRole('group', { name: 'Marketing' })
  await expect(gruppoMarketing.getByRole('link')).toHaveText(['Piano editoriale', 'Pubblicati', 'Spunti'])
  // the tabs of the area (1.33.0): «Piano editoriale» here, «Pubblicati» next to it
  const schede = page.getByRole('navigation', { name: 'Sezioni del Marketing' })
  await expect(schede.getByRole('link', { name: 'Piano editoriale', exact: true })).toHaveAttribute('aria-current', 'page')
  await schede.getByRole('link', { name: 'Pubblicati', exact: true }).click()
  await expect(page).toHaveURL(/\/marketing\/pubblicati$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Pubblicati' })).toBeVisible()
  await expect(schede.getByRole('link', { name: 'Pubblicati', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Pubblicati', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Piano editoriale' })).not.toHaveAttribute('aria-current', 'page')
  await schede.getByRole('link', { name: 'Piano editoriale', exact: true }).click()
  await expect(page).toHaveURL(/\/marketing\/contenuti$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Piano editoriale' })).toBeVisible()
})

test('«Nuovo»: la riga si rinomina sul posto; il Name apre il pannello con Hook, Line e CTA a capo; Status, sezione e proprietà senza conflitti', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const nome = `${PREFISSO}reel nuovo`

  await accedi(page, 'marketing')
  await page.getByRole('button', { name: 'Nuovo', exact: true }).click()
  // an empty row at the top of the table, the cursor in its Name
  const campoNome = page.getByRole('dialog', { name: 'Name', exact: true }).getByRole('textbox')
  await expect(campoNome).toBeFocused()
  await expect(campoNome).toHaveValue('Senza titolo')
  await campoNome.fill(nome)
  await campoNome.press('Enter')
  await expect(toast(page, 'Name salvato')).toBeVisible()
  const riga = sezioneContenuti(page).getByRole('row').filter({ has: page.getByRole('link', { name: nome, exact: true }) })
  await expect(riga).toBeVisible()
  // the row is a Reel Topic, Not started, with the labels and the date to fill in its cells
  await expect(riga.getByRole('button', { name: `Not started: cambia lo Status di ${nome}` })).toBeVisible()
  await riga.getByRole('button', { name: `Vuoto: scegli Post Date di «${nome}»` }).click()
  const data = page.getByRole('dialog', { name: 'Post Date', exact: true }).getByLabel('Post Date')
  await data.fill(oggi)
  await data.press('Enter')
  await expect(toast(page, `Post Date: ${oggi.slice(8, 10)}/${oggi.slice(5, 7)}/${oggi.slice(0, 4)}`)).toBeVisible()

  // the Name opens the content in the panel, the list stays behind (1.33.0)
  await riga.getByRole('link', { name: nome, exact: true }).click()
  await expect(page).toHaveURL(/contenuto=[0-9a-f-]{36}/)
  const pannello = page.getByRole('dialog', { name: nome })
  await expect(pannello).toBeVisible()
  const id = new URL(page.url()).searchParams.get('contenuto')!
  await expect(pannello.getByLabel('Modello')).toHaveValue('reel')
  await expect(pannello.getByLabel('Post Date')).toHaveValue(oggi)

  // the rough draft of the template, one line each, as in Notion
  const bozza = pannello.getByRole('region', { name: 'Script (Rough Draft)', exact: true })
  await expect(bozza.getByText(/Hook:/)).toBeVisible()
  const [hook, line, cta] = await altezzeDelleParole(bozza, ['Hook:', 'Line:', 'CTA:'])
  expect(hook).not.toBeNull()
  expect(line!).toBeGreaterThan(hook!)
  expect(cta!).toBeGreaterThan(line!)

  // Status with one tap
  await bottoneStatus(pannello, nome).click()
  await page.getByRole('menuitemradio', { name: 'To be edited' }).click()
  await expect(toast(page, 'Status: To be edited')).toBeVisible()
  await expect(pannello.getByRole('button', { name: `To be edited: cambia lo Status di ${nome}` })).toBeVisible()

  // a section written in place
  const finale = pannello.getByRole('region', { name: 'Script (Final)', exact: true })
  await scriviSezione(finale, 'Script (Final)', 'Hook: Allenati a casa.\nCTA: Scrivimi ALPHA.', '')
  await expect(toast(page, 'Salvato')).toBeVisible()
  await expect(finale.getByText(/Allenati a casa\./)).toBeVisible()
  await expect(finale.getByRole('textbox')).toHaveCount(0)

  // a property, right after the person's own Status tap and section save: never a conflict
  await pannello.getByLabel('Audio').fill('Audio originale di prova')
  await pannello.getByLabel('Audio').press('Tab')
  await expect(toast(page, 'Audio salvato')).toBeVisible()
  await expect(toast(page, CAMPO_CAMBIATO('Audio'))).toHaveCount(0)
  await expect.poll(async () => (await leggiContenuto(id))?.audio).toBe('Audio originale di prova')

  // everything is there after a reload: the panel opens again from the address
  await page.reload()
  const dopo = page.getByRole('dialog', { name: nome })
  await expect(dopo.getByRole('button', { name: `To be edited: cambia lo Status di ${nome}` })).toBeVisible()
  await expect(dopo.getByRole('region', { name: 'Script (Final)', exact: true }).getByText(/Allenati a casa\./)).toBeVisible()
  await expect(dopo.getByLabel('Audio')).toHaveValue('Audio originale di prova')
  const salvato = await leggiContenuto(id)
  expect(salvato).toMatchObject({
    tipo: 'reel',
    stato: 'to_be_edited',
    post_date: oggi,
    finale: 'Hook: Allenati a casa.\nCTA: Scrivimi ALPHA.',
    bozza: 'Hook:\nLine:\nLine:\n…\nCTA:',
  })
})

test('un elenco annidato e un elenco largo: niente righe vuote, il numero sulla riga del suo testo', async ({ page }) => {
  // as the Notion import writes them: a bullet with children is a nested list
  const messaggio = '- primo\n  - annidato\n- secondo\n\n1. alfa\n\n   continua\n2. beta'
  const id = await creaContenutoDiProva(`${PREFISSO}elenchi`, { messaggio })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)
  const sezione = page.getByRole('region', { name: 'Topic / Main Message', exact: true })
  await expect(sezione.getByText('annidato', { exact: true })).toBeVisible()

  const riga = await sezione.locator('li').first().evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  const [primo, annidato, secondo] = await altezzeDelleParole(sezione, ['primo', 'annidato', 'secondo'])
  // one line after the other: never an empty line around the nested list
  expect(annidato! - primo!).toBeLessThan(riga * 1.6)
  expect(secondo! - annidato!).toBeLessThan(riga * 1.6)

  // a loose list: "1." and "2." on the line of their text, never alone above it
  const voci = sezione.locator('ol > li')
  await expect(voci).toHaveCount(2)
  for (const voce of await voci.all()) {
    const scarto = await voce.evaluate((el) => {
      const giro = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let nodo = giro.nextNode(); nodo; nodo = giro.nextNode()) {
        if (!nodo.textContent?.trim()) continue
        const intervallo = document.createRange()
        intervallo.selectNodeContents(nodo)
        return intervallo.getBoundingClientRect().top - el.getBoundingClientRect().top
      }
      return null
    })
    expect(scarto).not.toBeNull()
    expect(scarto!).toBeLessThan(riga / 2)
  }
})

test('due persone sulla stessa sezione: il secondo salvataggio non sovrascrive, il suo testo resta da copiare', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  const id = await creaContenutoDiProva(`${PREFISSO}sezione contesa`, { finale: 'Testo di partenza' })

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)
  const editor = await altraPersona(browser, 'editor')
  await editor.goto(`/marketing/contenuti/${id}`)

  // A saves first
  await scriviSezione(page.getByRole('region', { name: 'Script (Final)', exact: true }), 'Script (Final)', 'La versione di Giulia')
  await expect(toast(page, 'Salvato')).toBeVisible()

  // B wrote from the text the page showed him: refused, Giulia's text shown, his to copy
  const sezioneB = editor.getByRole('region', { name: 'Script (Final)', exact: true })
  await scriviSezione(sezioneB, 'Script (Final)', 'La versione di Sara', 'Testo di partenza')
  await expect(toast(editor, SEZIONE_CAMBIATA)).toBeVisible()
  await expect(sezioneB.getByText('La versione di Giulia', { exact: true })).toBeVisible()
  await expect(sezioneB.getByRole('textbox', { name: 'Il tuo testo, non salvato' })).toHaveValue('La versione di Sara')
  await expect(sezioneB.getByRole('button', { name: 'Copia il mio testo' })).toBeVisible()
  expect((await leggiContenuto(id))?.finale).toBe('La versione di Giulia')

  // editing again starts from the saved text, and goes through
  await scriviSezione(sezioneB, 'Script (Final)', 'La versione di Giulia, rivista da Sara', 'La versione di Giulia')
  await expect(toast(editor, 'Salvato')).toBeVisible()
  await expect(sezioneB.getByRole('textbox', { name: 'Il tuo testo, non salvato' })).toHaveCount(0)
  expect((await leggiContenuto(id))?.finale).toBe('La versione di Giulia, rivista da Sara')

  await editor.context().close()
})

test('due persone sulle proprietà: per campo, chi salva per secondo vede quello salvato; un altro campo passa', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const prima = aggiungiGiorni(oggi, 20)
  const dopo = aggiungiGiorni(oggi, 21)
  const id = await creaContenutoDiProva(`${PREFISSO}proprietà contese`, { post_date: prima, audio: 'Audio iniziale' })

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)
  const admin = await altraPersona(browser, 'admin')
  await admin.goto(`/marketing/contenuti/${id}`)

  // A moves the Post Date on the content's page, saved by itself
  await page.getByLabel('Post Date').fill(dopo)
  await page.getByLabel('Post Date').press('Enter')
  await expect.poll(async () => (await leggiContenuto(id))?.post_date).toBe(dopo)

  // B moves it from the date he saw: nothing written, his field shows A's date
  await expect(admin.getByLabel('Post Date')).toHaveValue(prima)
  await admin.getByLabel('Post Date').fill(aggiungiGiorni(oggi, 25))
  await admin.getByLabel('Post Date').press('Enter')
  await expect(toast(admin, CAMPO_CAMBIATO('Post Date'))).toBeVisible()
  await expect(admin.getByLabel('Post Date')).toHaveValue(dopo)
  expect((await leggiContenuto(id))?.post_date).toBe(dopo)

  // his Audio goes through: another field is never blocked by a change elsewhere
  await admin.getByLabel('Audio').fill('Audio di Dany')
  await admin.getByLabel('Audio').press('Enter')
  await expect(toast(admin, 'Audio salvato')).toBeVisible()
  expect(await leggiContenuto(id)).toMatchObject({ post_date: dopo, audio: 'Audio di Dany' })

  await admin.context().close()
})

test('un link di condivisione di Instagram nell’URL: il campo lo spiega e non salva niente', async ({ page }) => {
  const id = await creaContenutoDiProva(`${PREFISSO}link del post`, { stato: 'posted' })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)

  const url = page.getByLabel('URL', { exact: true })
  await url.fill('https://www.instagram.com/share/reel/BAbCdEf123/')
  await url.press('Enter')
  await expect(page.getByText(LINK_CONDIVISIONE)).toBeVisible()
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  expect((await leggiContenuto(id))?.url).toBeNull()

  // a View Count with a decimal is refused too
  const visualizzazioni = page.getByLabel('View Count')
  await visualizzazioni.fill('1,5')
  await visualizzazioni.press('Enter')
  await expect(page.getByText('View Count: scrivi un numero intero, senza decimali.')).toBeVisible()
  expect(await leggiContenuto(id)).toMatchObject({ url: null, view_count: null })

  // the post's own address, pasted without https://, and the views as Notion shows them: saved
  await url.fill('www.instagram.com/reel/E2eProva01/')
  await url.press('Enter')
  await expect(toast(page, 'URL salvato')).toBeVisible()
  await visualizzazioni.fill('12.480')
  await visualizzazioni.press('Enter')
  await expect(toast(page, 'View Count: 12.480')).toBeVisible()
  await expect
    .poll(async () => {
      const c = await leggiContenuto(id)
      return [c?.url, c?.instagram_shortcode, c?.view_count]
    })
    .toEqual(['https://www.instagram.com/reel/E2eProva01/', 'E2eProva01', 12480])
  await expect(page.getByRole('link', { name: 'Apri il post' })).toHaveAttribute('href', 'https://www.instagram.com/reel/E2eProva01/')
  await expect(visualizzazioni).toHaveValue('12.480')
})

test('il filtro Status mostra solo i Posted, «Togli i filtri» li toglie; la ricerca e le etichette', async ({ page }) => {
  const { count: posted, error } = await dbLocale()
    .from('marketing_contenuti')
    .select('id', { count: 'exact', head: true })
    .eq('stato', 'posted')
  if (error) throw error

  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti')
  // no filter at first, no «Togli i filtri»; the group chips are gone (the filters are one row)
  await expect(page.getByRole('navigation', { name: 'Gruppi di Status' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Togli i filtri' })).toHaveCount(0)

  // a Status, from the select grouped like Notion's menu
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Posted' })
  await expect(page).toHaveURL(/stato=posted/)
  const stati = sezioneContenuti(page).getByRole('button', { name: /: cambia lo Status di / })
  await expect(stati).toHaveCount(posted ?? 0)
  for (const nome of await stati.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) {
    expect(nome).toMatch(/^Posted: /)
  }
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Canceled' })
  await expect(page).toHaveURL(/stato=canceled/)
  await expect(stati.first()).toHaveAccessibleName(/^Canceled: /)

  // Reel Type: the labels with how many contents use each
  const reelType = page.getByLabel('Reel Type', { exact: true })
  await expect(reelType.locator('option', { hasText: /^Education \(\d+\)$/ })).toHaveCount(1)
  await page.getByRole('link', { name: 'Togli i filtri' }).click()
  await expect(page).not.toHaveURL(/stato=/)
  await expect(sezioneContenuti(page).getByRole('button', { name: /^Not started: cambia lo Status di / }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Togli i filtri' })).toHaveCount(0)

  // the search on the Name, then nothing found: the empty state clears it
  const cerca = page.getByRole('search').getByRole('searchbox', { name: 'Cerca per Name' })
  await cerca.fill('sbarra')
  await cerca.press('Enter')
  await expect(page).toHaveURL(/q=sbarra/)
  await expect(stati).toHaveCount(1)
  await expect(sezioneContenuti(page).getByRole('link', { name: /^Trazioni senza sbarra/ })).toBeVisible()
  await cerca.fill('nessun contenuto si chiama così')
  await cerca.press('Enter')
  await expect(sezioneContenuti(page).getByText('Nessun contenuto con questi filtri', { exact: true })).toBeVisible()
  await sezioneContenuti(page).getByRole('link', { name: 'Togli i filtri' }).click()
  await expect(page).not.toHaveURL(/q=/)
  await expect(cerca).toHaveValue('')
})

test('la ricerca prende ogni carattere com’è: l’asterisco non è un jolly', async ({ page }) => {
  const nome = `${PREFISSO}stella a*b`
  await creaContenutoDiProva(nome)
  const { data, error } = await dbLocale().from('marketing_contenuti').select('nome')
  if (error) throw error
  const conAsterisco = data.filter((r) => r.nome.includes('*')).length
  const conPercento = data.filter((r) => r.nome.includes('%')).length

  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti?vista=tabella')
  const stati = sezioneContenuti(page).getByRole('button', { name: /: cambia lo Status di / })
  const cerca = page.getByRole('search').getByRole('searchbox', { name: 'Cerca per Name' })

  await cerca.fill('A*B')
  await cerca.press('Enter')
  await expect(page).toHaveURL(/q=A\*B/)
  await expect(stati).toHaveCount(1)
  await expect(bottoneStatus(page, nome)).toBeVisible()

  // "*" alone: only the names with an asterisk, never every content
  await cerca.fill('*')
  await cerca.press('Enter')
  await expect(page).toHaveURL(/q=\*$/)
  await expect(stati).toHaveCount(conAsterisco)

  await cerca.fill('%')
  await cerca.press('Enter')
  await expect(page).toHaveURL(/q=%25/)
  if (conPercento === 0) {
    await expect(sezioneContenuti(page).getByText('Nessun contenuto con questi filtri', { exact: true })).toBeVisible()
  } else {
    await expect(stati).toHaveCount(conPercento)
  }
})

test('uno Status che fa uscire il contenuto dalla lista: il focus va sulla riga dopo, poi sul titolo, mai su body', async ({
  page,
}) => {
  const oggi = oggiRoma()
  const primo = `${PREFISSO}focus primo`
  const secondo = `${PREFISSO}focus secondo`
  // the newest Post Date first: primo, then secondo
  await creaContenutoDiProva(primo, { stato: 'to_be_edited', post_date: aggiungiGiorni(oggi, 41) })
  await creaContenutoDiProva(secondo, { stato: 'to_be_edited', post_date: aggiungiGiorni(oggi, 40) })

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?vista=tabella&gruppo=in_progress&q=${encodeURIComponent(`${PREFISSO}focus`)}`)
  const sezione = sezioneContenuti(page)
  await expect(sezione.getByRole('button', { name: /: cambia lo Status di / })).toHaveCount(2)
  const annuncio = page.getByTestId('annuncio-contenuti')

  // from the keyboard: the first row's Status to Posted, out of "In progress"
  await bottoneStatus(sezione, primo).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitemradio', { name: 'Posted', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Status: Posted')).toBeVisible()
  await expect(bottoneStatus(sezione, primo)).toHaveCount(0)
  await expect(bottoneStatus(sezione, secondo)).toBeFocused()
  await expect(annuncio).toHaveText(`«${primo}» non è più nella lista con questi filtri: ora sei sullo Status di «${secondo}».`)

  // the last one: the list is empty, the focus on the section's heading
  await page.keyboard.press('Enter')
  await page.getByRole('menuitemradio', { name: 'Posted', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(sezione.getByText('Nessun contenuto con questi filtri', { exact: true })).toBeVisible()
  await expect(sezione.getByRole('heading', { level: 2, name: 'Piano editoriale' })).toBeFocused()
  await expect(annuncio).toHaveText(`«${secondo}» non è più nella lista con questi filtri: ora sei sul titolo «Piano editoriale».`)
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('H2')
})

test('a 1200 px la sezione è stretta per la tabella: card; da 1280 px la tabella intera, nessuna colonna tagliata', async ({
  page,
}) => {
  // a Name with a word longer than any column (a pasted link, as in Notion)
  await creaContenutoDiProva(`${PREFISSO}colonne strette https://www.instagram.com/reel/unaparolalunghissimasenzaspazi_che_non_finisce_mai/`, {
    post_date: aggiungiGiorni(oggiRoma(), 120),
  })
  await page.setViewportSize({ width: 1200, height: 800 })
  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti')
  const sezione = sezioneContenuti(page)
  expect((await sezione.boundingBox())!.width).toBeLessThan(960)
  await expect(sezione.getByRole('table')).toHaveCount(0)
  await expect(sezione.getByRole('list').first()).toBeVisible()
  await senzaScrollLaterale(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  const tabella = sezione.getByRole('table')
  await expect(tabella).toBeVisible()
  await expect(tabella.getByRole('link', { name: /colonne strette/ })).toBeVisible()
  // the table's own box never scrolls, not even with that Name: Views is whole
  const [scorre, visibile] = await tabella.evaluate((t) => [t.parentElement!.scrollWidth, t.parentElement!.clientWidth])
  expect(scorre).toBeLessThanOrEqual(visibile)
  await expect(tabella.getByRole('columnheader', { name: 'Views' })).toBeInViewport({ ratio: 1 })
  // the pills are never cut: the longest labels and Statuses are whole in their cells
  for (const cella of await tabella.locator('.pillola').all()) {
    const [scorre, largo] = await cella.evaluate((el) => {
      const testo = el.querySelector('.truncate')
      return [testo?.scrollWidth ?? 0, testo?.clientWidth ?? 0]
    })
    expect(scorre).toBeLessThanOrEqual(largo)
  }
})

test('a 1024 px con la barra laterale: card al posto della tabella', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await accedi(page, 'marketing')

  await page.goto('/marketing/contenuti')
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toBeVisible()
  const sezione = sezioneContenuti(page)
  const larghezza = (await sezione.boundingBox())!.width
  // the screen is wide, the section next to the sidebar is not: the table would not fit
  expect(larghezza).toBeLessThan(960)
  await expect(sezione.getByRole('table')).toHaveCount(0)
  await expect(sezione.getByRole('list').first()).toBeVisible()
  await senzaScrollLaterale(page)
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('il Piano editoriale: card con le etichette colorate, senza scroll laterale; il menu in basso', async ({ page }) => {
    const nome = `${PREFISSO}in agenda`
    await creaContenutoDiProva(nome, { post_date: aggiungiGiorni(oggiRoma(), 300), reel_type: 'education', formato: 'split' })

    await accedi(page, 'marketing')
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)
    // "Piano editoriale" is the first item of the bottom bar
    const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
    await expect(barra.getByRole('link').first()).toHaveAccessibleName('Piano editoriale')
    await senzaScrollLaterale(page)

    // no view switch: one list of cards
    await expect(page.getByRole('group', { name: 'Vista dei contenuti' })).toHaveCount(0)
    const card = sezioneContenuti(page).locator(`li[data-nome-contenuto="${nome}"]`)
    await expect(card).toBeVisible()
    // Reel Type and Format are chips of the card with the label's colour, changed with one tap (1.33.0)
    await expect(card.getByRole('button', { name: `Education: cambia Reel Type di «${nome}»` }).locator('.pillola')).toHaveAttribute('data-colore', 'yellow')
    await expect(card.getByRole('button', { name: `Split: cambia Format di «${nome}»` }).locator('.pillola')).toHaveAttribute('data-colore', 'purple')
    await senzaScrollLaterale(page)

    // the Status of a card is its own button: the tap changes it and never opens the card
    const lista = page.url()
    await bottoneStatus(card, nome).click()
    await page.getByRole('menuitemradio', { name: 'To be recorded' }).click()
    await expect(toast(page, 'Status: To be recorded')).toBeVisible()
    expect(senzaFrammento(page.url())).toBe(senzaFrammento(lista))
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(bottoneStatus(card, nome)).toHaveAccessibleName(`To be recorded: cambia lo Status di ${nome}`)
    await senzaScrollLaterale(page)
  })

  test('un Name lungo, con una parola senza spazi: il titolo va a capo, la pagina non scorre di lato', async ({ page }) => {
    const nome = `${PREFISSO}un nome davvero lunghissimo con unaparolasenzaspazicheèmoltolungaperdavvero_e_continua_ancora_di_piu`
    const id = await creaContenutoDiProva(nome)
    await accedi(page, 'marketing')
    await page.goto(`/marketing/contenuti/${id}`)
    const titolo = page.getByRole('heading', { level: 1, name: nome })
    await expect(titolo).toBeVisible()
    await senzaScrollLaterale(page)
    const destra = await titolo.evaluate((el) => el.getBoundingClientRect().right)
    expect(destra).toBeLessThanOrEqual(390)
  })

  test('il video editor cambia lo Status ma non elimina; il marketing elimina', async ({ page }) => {
    test.setTimeout(90_000)
    const nome = `${PREFISSO}da eliminare`
    const id = await creaContenutoDiProva(nome, { post_date: oggiRoma() })

    await accedi(page, 'editor')
    // the video editor still lands on his tasks; the Piano editoriale is in his bottom bar
    await expect(page).toHaveURL(/\/task$/)
    const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
    await barra.getByRole('link', { name: 'Piano editoriale' }).click()
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Piano editoriale' })).toBeVisible()

    await page.goto(`/marketing/contenuti/${id}`)
    await bottoneStatus(page, nome).click()
    await page.getByRole('menuitemradio', { name: 'Canceled' }).click()
    await expect(toast(page, 'Status: Canceled')).toBeVisible()
    await expect.poll(async () => (await leggiContenuto(id))?.stato).toBe('canceled')

    // no "Modifica" any more: the properties are on the page, and at the bottom the sentence, never "Elimina"
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toHaveCount(0)
    await expect(page.getByText(/Un contenuto lo eliminano l’admin e il marketing/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Elimina/ })).toHaveCount(0)

    // marketing deletes it, from the bottom of the page
    await page.context().clearCookies()
    await accedi(page, 'marketing')
    await page.goto(`/marketing/contenuti/${id}`)
    await page.getByRole('button', { name: 'Elimina il contenuto' }).click()
    const domanda = page.getByRole('dialog', { name: `Eliminare il contenuto «${nome}»?` })
    await expect(domanda).toContainText('Si perdono anche il messaggio, gli script e i commenti.')
    await expect(domanda).toContainText('Su Instagram e su Notion non cambia niente.')
    await domanda.getByRole('button', { name: 'Elimina', exact: true }).click()
    await expect(toast(page, 'Contenuto eliminato')).toBeVisible()
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Piano editoriale' })).toBeVisible()
    await expect(page.getByText(nome)).toHaveCount(0)
    expect(await leggiContenuto(id)).toBeNull()

    // its old address says so
    await page.goto(`/marketing/contenuti/${id}`)
    await expect(page.getByText('Questo contenuto non c’è più')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Torna al Piano editoriale' })).toBeVisible()
  })
})
