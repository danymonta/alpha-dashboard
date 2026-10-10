import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

import { aggiungiGiorni, aggiungiMesi, nomeGiorno, oggiRoma, primoDelMeseISO } from '../lib/date'
import { formatMese } from '../lib/format'
import { creaContenutoDiProva, dbLocale, leggiContenuto, pulisciContenuti } from './db'
import { accedi, type RuoloSeed } from './utenti'

/**
 * The content calendar (1.32.0): Notion's "Instagram Posts" in the app, for
 * the admin, the video editor and marketing. Rows of these tests start with
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

/** The list or the calendar: the section the container queries measure. */
function sezioneContenuti(page: Page) {
  return page.getByRole('region', { name: 'Contenuti', exact: true })
}

/** The Status button of one content: "Posted: cambia lo Status di …". */
function bottoneStatus(radice: Page | Locator, nome: string) {
  return radice.getByRole('button', { name: new RegExp(`: cambia lo Status di ${escape(nome)}$`) })
}

function vista(page: Page) {
  return page.getByRole('group', { name: 'Vista dei contenuti' })
}

/** "lunedì 06/10", as the calendar names a day. */
function giornoLungo(iso: string) {
  return `${nomeGiorno(iso)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
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

test('il marketing atterra sui contenuti: in cima quello con la Post Date più recente', async ({ page }) => {
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
  await expect(page.getByRole('heading', { level: 1, name: 'Instagram Posts' })).toBeVisible()
  await expect(vista(page).getByRole('link', { name: 'Tabella' })).toHaveAttribute('aria-current', 'page')

  // on a desktop the section is wide enough for Notion's table, with its columns in Notion's order
  const tabella = sezioneContenuti(page).getByRole('table')
  await expect(tabella.getByRole('columnheader')).toHaveText([
    'Name',
    'Reel Type',
    'Format',
    'Inspiration',
    'Status',
    'Post Date',
    'Audio',
    'URL',
    'View Count',
  ])
  await expect(tabella.locator('tbody tr').first().getByRole('link').first()).toHaveText(primo)

  // the sidebar: Contenuti lit, no Economics item
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(nav.getByRole('link', { name: 'Contenuti' })).toHaveAttribute('aria-current', 'page')
  for (const voce of ['Panoramica', 'Oggi', 'Le mie call', 'Pipeline', 'Setter', 'Closer']) {
    await expect(nav.getByRole('link', { name: voce, exact: true })).toHaveCount(0)
  }

  // the tabs of the area (1.33.0): «Contenuti» here, «Post di Instagram» next to it; the sidebar item stays lit
  const schede = page.getByRole('navigation', { name: 'Sezioni del Marketing' })
  await expect(schede.getByRole('link', { name: 'Contenuti', exact: true })).toHaveAttribute('aria-current', 'page')
  await schede.getByRole('link', { name: /^Post di Instagram/ }).click()
  await expect(page).toHaveURL(/\/marketing\/instagram$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Post di Instagram' })).toBeVisible()
  await expect(schede.getByRole('link', { name: /^Post di Instagram/ })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Contenuti' })).toHaveAttribute('aria-current', 'page')
  await schede.getByRole('link', { name: 'Contenuti', exact: true }).click()
  await expect(page).toHaveURL(/\/marketing\/contenuti$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Instagram Posts' })).toBeVisible()
})

test('nuovo Reel Topic: si apre nel pannello; Hook, Line e CTA a capo; Status, sezione e proprietà senza conflitti', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const nome = `${PREFISSO}reel nuovo`

  await accedi(page, 'marketing')
  await page.getByRole('button', { name: 'Nuovo contenuto' }).click()
  const foglio = page.getByRole('dialog', { name: 'Nuovo contenuto' })
  await expect(foglio.getByRole('radio', { name: 'Reel Topic' })).toBeChecked()
  await foglio.getByText('Carousel Topic', { exact: true }).click()
  await foglio.getByText('Reel Topic', { exact: true }).click()
  await expect(foglio.getByRole('radio', { name: 'Reel Topic' })).toBeChecked()
  await foglio.getByLabel('Name', { exact: true }).fill(nome)
  await foglio.getByLabel('Post Date').fill(oggi)
  await foglio.getByRole('button', { name: 'Crea il contenuto' }).click()

  // the content opens in the panel, the list stays behind (1.33.0)
  await expect(page).toHaveURL(/\/marketing\/contenuti\?contenuto=[0-9a-f-]{36}$/)
  await expect(toast(page, 'Contenuto creato')).toBeVisible()
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

test('il calendario va anche nei mesi avanti: «Mese successivo», e il «+» di un giorno crea il contenuto lì', async ({
  page,
}) => {
  const prossimo = aggiungiMesi(primoDelMeseISO(oggiRoma()), 1)
  const nome = `${PREFISSO}mese prossimo`
  await creaContenutoDiProva(nome, { post_date: aggiungiGiorni(prossimo, 9) })

  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti?vista=calendario')
  const mesi = page.getByRole('navigation', { name: 'Scegli il mese' })
  await expect(mesi).toContainText(formatMese(oggiRoma()))
  await mesi.getByRole('link', { name: 'Mese successivo' }).click()
  await expect(page).toHaveURL(new RegExp(`mese=${prossimo.slice(0, 7)}`))
  await expect(mesi).toContainText(formatMese(prossimo))
  await expect(sezioneContenuti(page).getByRole('link', { name: `${nome}, Not started` })).toBeVisible()
  // the plan goes on: the month after is there too
  await expect(mesi.getByRole('link', { name: 'Mese successivo' })).toBeVisible()

  // the "+" of a day: "Nuovo contenuto" with that Post Date
  const giorno = aggiungiGiorni(prossimo, 13)
  const piu = sezioneContenuti(page).getByRole('button', { name: `Nuovo contenuto per ${giornoLungo(giorno)}` })
  await piu.hover()
  await piu.click()
  const foglio = page.getByRole('dialog', { name: 'Nuovo contenuto' })
  await expect(foglio.getByLabel('Post Date')).toHaveValue(giorno)
  await foglio.getByText('Carousel Topic', { exact: true }).click()
  await foglio.getByLabel('Name', { exact: true }).fill(`${PREFISSO}carosello dal calendario`)
  await foglio.getByRole('button', { name: 'Crea il contenuto' }).click()
  // the panel opens on it, the calendar stays behind with its month
  const pannello = page.getByRole('dialog', { name: `${PREFISSO}carosello dal calendario` })
  await expect(pannello).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`mese=${prossimo.slice(0, 7)}.*contenuto=[0-9a-f-]{36}$`))
  await expect(pannello.getByLabel('Post Date')).toHaveValue(giorno)
  await expect(pannello.getByLabel('Modello')).toHaveValue('carousel')
  // a Carousel Topic: Idea/Message, Carousel, Caption, empty (no rough draft, no Comments)
  for (const titolo of ['Idea/Message', 'Carousel', 'Caption']) {
    await expect(pannello.getByRole('region', { name: titolo, exact: true })).toBeVisible()
  }
  await expect(pannello.getByRole('region', { name: 'Comments', exact: true })).toHaveCount(0)
  const id = new URL(page.url()).searchParams.get('contenuto')!
  expect(await leggiContenuto(id)).toMatchObject({ tipo: 'carousel', post_date: giorno, bozza: null })
})

test('«Complete» mostra solo i Posted, «Togli i filtri» li toglie', async ({ page }) => {
  const { count: posted, error } = await dbLocale()
    .from('marketing_contenuti')
    .select('id', { count: 'exact', head: true })
    .eq('stato', 'posted')
  if (error) throw error

  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti?vista=tabella')
  const gruppi = page.getByRole('navigation', { name: 'Gruppi di Status' })
  await expect(gruppi.getByRole('link', { name: /^Tutti/ })).toHaveAttribute('aria-current', 'page')
  await gruppi.getByRole('link', { name: new RegExp(`^Complete ${posted}$`) }).click()
  await expect(page).toHaveURL(/gruppo=complete/)
  await expect(gruppi.getByRole('link', { name: /^Complete/ })).toHaveAttribute('aria-current', 'page')

  const stati = sezioneContenuti(page).getByRole('button', { name: /: cambia lo Status di / })
  await expect(stati).toHaveCount(posted ?? 0)
  for (const nome of await stati.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) {
    expect(nome).toMatch(/^Posted: /)
  }

  // a Status of the group, from the select grouped like Notion's menu
  await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Canceled' })
  await expect(page).toHaveURL(/stato=canceled/)
  // Canceled is in To-do: the Complete chip goes, the Status stays
  await expect(page).not.toHaveURL(/gruppo=/)
  await expect(stati.first()).toHaveAccessibleName(/^Canceled: /)

  await page.getByRole('link', { name: 'Togli i filtri' }).click()
  await expect(page).not.toHaveURL(/gruppo=|stato=/)
  await expect(gruppi.getByRole('link', { name: /^Tutti/ })).toHaveAttribute('aria-current', 'page')
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

test('il numero di un gruppo è quello che apre: con lo Status di un altro gruppo il chip lo lascia, conto compreso', async ({
  page,
}) => {
  const { count: inProgress, error } = await dbLocale()
    .from('marketing_contenuti')
    .select('id', { count: 'exact', head: true })
    .in('stato', ['to_be_posted', 'to_be_edited', 'to_be_recorded'])
  if (error) throw error
  expect(inProgress).toBeGreaterThan(0)

  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti?vista=tabella&stato=posted')
  const gruppi = page.getByRole('navigation', { name: 'Gruppi di Status' })
  const chip = gruppi.getByRole('link', { name: /^In progress/ })
  // never 0 by construction: the chip counts what its tap opens
  await expect(chip).toHaveAccessibleName(`In progress ${inProgress}`)
  await chip.click()
  await expect(page).toHaveURL(/gruppo=in_progress/)
  await expect(page).not.toHaveURL(/stato=/)
  await expect(chip).toHaveAccessibleName(`In progress ${inProgress}`)
  await expect(sezioneContenuti(page).getByRole('button', { name: /: cambia lo Status di / })).toHaveCount(inProgress ?? 0)
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
  await expect(sezione.getByRole('heading', { level: 2, name: 'Contenuti' })).toBeFocused()
  await expect(annuncio).toHaveText(`«${secondo}» non è più nella lista con questi filtri: ora sei sul titolo «Contenuti».`)
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('H2')
})

test('un giorno pieno del calendario: «+N» dice le parole che si vedono e mostra gli altri lì', async ({ page }) => {
  const mese = aggiungiMesi(primoDelMeseISO(oggiRoma()), 2)
  const giorno = aggiungiGiorni(mese, 16)
  for (const n of [1, 2, 3, 4, 5]) await creaContenutoDiProva(`${PREFISSO}giorno pieno ${n}`, { post_date: giorno })
  const { count, error } = await dbLocale()
    .from('marketing_contenuti')
    .select('id', { count: 'exact', head: true })
    .eq('post_date', giorno)
  if (error) throw error
  const altri = (count ?? 0) - 3

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?vista=calendario&mese=${mese.slice(0, 7)}`)
  const piu = sezioneContenuti(page).getByRole('button', { name: new RegExp(`^\\+${altri} altri contenuti di `) })
  await expect(piu).toHaveAccessibleName(`+${altri} altri contenuti di ${giornoLungo(giorno)}`)
  await expect(piu).toHaveAttribute('aria-expanded', 'false')
  // on screen only "+N"
  expect(await piu.evaluate((el) => (el.firstChild?.textContent ?? '').trim())).toBe(`+${altri}`)
  await piu.click()
  const meno = sezioneContenuti(page).getByRole('button', { name: `Mostra meno contenuti di ${giornoLungo(giorno)}` })
  await expect(meno).toHaveAttribute('aria-expanded', 'true')
  await expect(sezioneContenuti(page).getByRole('link', { name: `${PREFISSO}giorno pieno 5, Not started` })).toBeVisible()
})

test('a 1200 px la sezione è stretta per le nove colonne: card; da 1280 px la tabella intera, nessuna colonna tagliata', async ({
  page,
}) => {
  // a Name with a word longer than any column (a pasted link, as in Notion)
  await creaContenutoDiProva(`${PREFISSO}colonne strette https://www.instagram.com/reel/unaparolalunghissimasenzaspazi_che_non_finisce_mai/`, {
    post_date: aggiungiGiorni(oggiRoma(), 120),
  })
  await page.setViewportSize({ width: 1200, height: 800 })
  await accedi(page, 'marketing')
  await page.goto('/marketing/contenuti?vista=tabella')
  const sezione = sezioneContenuti(page)
  expect((await sezione.boundingBox())!.width).toBeLessThan(960)
  await expect(sezione.getByRole('table')).toHaveCount(0)
  await expect(sezione.getByRole('list').first()).toBeVisible()
  await senzaScrollLaterale(page)

  await page.setViewportSize({ width: 1280, height: 800 })
  const tabella = sezione.getByRole('table')
  await expect(tabella).toBeVisible()
  await expect(tabella.getByRole('link', { name: /colonne strette/ })).toBeVisible()
  // the table's own box never scrolls, not even with that Name: View Count is whole
  const [scorre, visibile] = await tabella.evaluate((t) => [t.parentElement!.scrollWidth, t.parentElement!.clientWidth])
  expect(scorre).toBeLessThanOrEqual(visibile)
  await expect(tabella.getByRole('columnheader', { name: 'View Count' })).toBeInViewport({ ratio: 1 })
})

test('a 1024 px con la barra laterale: card al posto della tabella, la griglia solo se la sezione ci sta', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await accedi(page, 'marketing')

  await page.goto('/marketing/contenuti?vista=tabella')
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toBeVisible()
  const sezione = sezioneContenuti(page)
  const larghezza = (await sezione.boundingBox())!.width
  // the screen is wide, the section next to the sidebar is not: Notion's nine columns would not fit
  expect(larghezza).toBeLessThan(960)
  await expect(sezione.getByRole('table')).toHaveCount(0)
  await expect(sezione.getByRole('list').first()).toBeVisible()
  await senzaScrollLaterale(page)

  await page.goto('/marketing/contenuti?vista=calendario')
  const griglia = sezioneContenuti(page).getByRole('table', { name: /per giorno$/ })
  const miniMese = sezioneContenuti(page).getByRole('table', { name: /i giorni con un punto hanno contenuti$/ })
  if (larghezza >= 672) {
    await expect(griglia).toBeVisible()
    await expect(miniMese).toHaveCount(0)
  } else {
    await expect(griglia).toHaveCount(0)
    await expect(miniMese).toBeVisible()
  }
  await senzaScrollLaterale(page)
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('il calendario: mini mese e agenda col contenuto, senza scroll laterale; la vista resta', async ({ page }) => {
    const oggi = oggiRoma()
    const nome = `${PREFISSO}in agenda`
    await creaContenutoDiProva(nome, { post_date: oggi, reel_type: 'education', formato: 'split' })

    await accedi(page, 'marketing')
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)
    // "Contenuti" is the first item of the bottom bar
    const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
    await expect(barra.getByRole('link').first()).toHaveAccessibleName('Contenuti')
    await senzaScrollLaterale(page)

    await vista(page).getByRole('link', { name: 'Calendario' }).click()
    await expect(page).toHaveURL(/vista=calendario/)
    await expect(vista(page).getByRole('link', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page')

    // the mini month: today has a dot and leads to its day in the agenda
    const sezione = sezioneContenuti(page)
    await expect(sezione.getByRole('table', { name: /per giorno$/ })).toHaveCount(0)
    const giorno = sezione.getByRole('link', { name: new RegExp(`^${escape(giornoLungo(oggi))}, \\d+ contenut`) })
    await expect(giorno).toBeVisible()
    await giorno.click()
    await expect(page).toHaveURL(new RegExp(`#giorno-${oggi}$`))
    const agenda = sezione.getByRole('region', { name: `Oggi, ${giornoLungo(oggi)}` })
    await expect(agenda.getByRole('link', { name: nome })).toBeVisible()
    // Reel Type and Format are chips of the card, changed with one tap (1.33.0)
    await expect(agenda.getByRole('button', { name: `Education: cambia Reel Type di «${nome}»` })).toBeVisible()
    await expect(agenda.getByRole('button', { name: `Split: cambia Format di «${nome}»` })).toBeVisible()
    await senzaScrollLaterale(page)

    // the Status of a card is its own button: the tap changes it and never opens the card
    const lista = page.url()
    await bottoneStatus(agenda, nome).click()
    await page.getByRole('menuitemradio', { name: 'To be recorded' }).click()
    await expect(toast(page, 'Status: To be recorded')).toBeVisible()
    // the same list, no panel: path and query unchanged. The #giorno- fragment
    // may go: the mini month's day is a plain anchor Next's router never saw,
    // and the redraw the action brings replaces the address with its own
    expect(senzaFrammento(page.url())).toBe(senzaFrammento(lista))
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(bottoneStatus(agenda, nome)).toHaveAccessibleName(`To be recorded: cambia lo Status di ${nome}`)

    // from the menu, the calendar again (a cookie of this browser)
    const ricordata = (await page.context().cookies()).find((c) => c.name === 'alpha_vista_marketing')
    expect(ricordata).toMatchObject({ value: 'calendario', path: '/marketing', sameSite: 'Lax' })
    await page.goto('/task')
    await barra.getByRole('link', { name: 'Contenuti' }).click()
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)
    await expect(vista(page).getByRole('link', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page')
    await expect(sezioneContenuti(page).getByRole('link', { name: new RegExp(`^${escape(giornoLungo(oggi))}, `) })).toBeVisible()
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
    // the video editor still lands on his tasks; the calendar is in his bottom bar
    await expect(page).toHaveURL(/\/task$/)
    const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
    await barra.getByRole('link', { name: 'Contenuti' }).click()
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Instagram Posts' })).toBeVisible()

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
    await expect(page.getByRole('heading', { level: 1, name: 'Instagram Posts' })).toBeVisible()
    await expect(page.getByText(nome)).toHaveCount(0)
    expect(await leggiContenuto(id)).toBeNull()

    // its old address says so
    await page.goto(`/marketing/contenuti/${id}`)
    await expect(page.getByText('Questo contenuto non c’è più')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Torna ai contenuti' })).toBeVisible()
  })
})
