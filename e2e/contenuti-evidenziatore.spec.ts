import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { creaContenutoDiProva, leggiContenuto, pulisciContenuti } from './db'
import { accedi } from './utenti'

/**
 * The highlighter of the sections (01/11/2026, Dany: «imposta la possibilità
 * di evidenziare i testi dalla mia dashboard come fa notion con i colori del
 * testo e dello sfondo evidenziatore»): a selection shows the menu, «Colore»
 * opens the text colours and the backgrounds, the choice is saved as the
 * Markdown tags of lib/marketing/evidenziatore.ts and stays after a reload.
 */
const PREFISSO = 'E2E Evidenziatore '

test.beforeAll(async () => {
  await pulisciContenuti(PREFISSO)
})

test.afterAll(async () => {
  await pulisciContenuti(PREFISSO)
})

function sezioneFinale(page: Page) {
  return page.getByRole('region', { name: 'Script (Final)', exact: true })
}

function campoFinale(page: Page) {
  return sezioneFinale(page).getByRole('textbox', { name: 'Script (Final)', exact: true })
}

test('si seleziona un testo, si sceglie Rosso e Sfondo giallo: salvato, e dopo il ricaricamento il colore resta', async ({ page }) => {
  const nome = `${PREFISSO}colori`
  const id = await creaContenutoDiProva(nome, { post_date: aggiungiGiorni(oggiRoma(), 331), finale: 'Una frase da colorare' })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)

  const campo = campoFinale(page)
  await expect(campo).toHaveText('Una frase da colorare')
  await campo.click()
  await page.keyboard.press('ControlOrMeta+A')

  const barra = page.getByRole('toolbar', { name: 'Formato del testo' })
  await expect(barra).toBeVisible()
  await barra.getByRole('button', { name: 'Colore' }).click()
  await expect(barra.getByRole('button', { name: 'Colore' })).toHaveAttribute('aria-expanded', 'true')
  const testo = barra.getByRole('group', { name: 'Colore del testo' })
  const sfondo = barra.getByRole('group', { name: 'Sfondo' })
  // ten choices each, named in words
  await expect(testo.getByRole('button')).toHaveCount(10)
  await expect(sfondo.getByRole('button')).toHaveCount(10)
  await expect(testo.getByRole('button', { name: 'Predefinito' })).toHaveAttribute('aria-pressed', 'true')

  await testo.getByRole('button', { name: 'Rosso' }).click()
  await sfondo.getByRole('button', { name: 'Giallo' }).click()
  await expect(testo.getByRole('button', { name: 'Rosso' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sfondo.getByRole('button', { name: 'Giallo' })).toHaveAttribute('aria-pressed', 'true')

  // the editor's own save, a moment after the change: the Markdown with the two tags
  await expect
    .poll(async () => (await leggiContenuto(id))?.finale)
    .toBe('<span data-colore="rosso"><mark data-sfondo="giallo">Una frase da colorare</mark></span>')

  await page.reload()
  const colorato = campoFinale(page).locator('span.ev-colore[data-colore="rosso"] mark.ev-sfondo[data-sfondo="giallo"]')
  await expect(colorato).toHaveText('Una frase da colorare')
  // the text has the colour of the token, not the page's own
  const [colore, fondo] = await colorato.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor])
  expect(fondo).not.toBe('rgba(0, 0, 0, 0)')
  expect(colore).not.toBe(fondo)
})

test('dalla tastiera: Alt+F10 porta al menu, le frecce lo percorrono, Predefinito toglie il colore, Esc torna al testo', async ({ page }) => {
  const nome = `${PREFISSO}tastiera`
  const id = await creaContenutoDiProva(nome, {
    post_date: aggiungiGiorni(oggiRoma(), 332),
    finale: 'Prima <span data-colore="blu">frase blu</span> dopo',
  })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)

  const campo = campoFinale(page)
  await expect(campo.locator('span.ev-colore[data-colore="blu"]')).toHaveText('frase blu')
  await campo.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Alt+F10')
  const barra = page.getByRole('toolbar', { name: 'Formato del testo' })
  await expect(barra.getByRole('button', { name: 'Grassetto' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(barra.getByRole('button', { name: 'Corsivo' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(barra.getByRole('button', { name: 'Colore' })).toBeFocused()
  await page.keyboard.press('Enter')
  const predefinito = barra.getByRole('group', { name: 'Colore del testo' }).getByRole('button', { name: 'Predefinito' })
  await predefinito.focus()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await leggiContenuto(id))?.finale).toBe('Prima frase blu dopo')

  // Esc closes the colours, a second Esc goes back to the text with the selection
  await page.keyboard.press('Escape')
  await expect(barra.getByRole('button', { name: 'Colore' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(campo).toBeFocused()
})

test.describe('sul telefono', () => {
  // a phone: the pointer is coarse, the buttons of the menu are 44 px
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('bersagli da 44 px e nessuno scroll di lato', async ({ page }) => {
    const nome = `${PREFISSO}telefono`
    const id = await creaContenutoDiProva(nome, { post_date: aggiungiGiorni(oggiRoma(), 333), finale: 'Testo sul telefono' })
    await accedi(page, 'marketing')
    await page.goto(`/marketing/contenuti/${id}`)
    const campo = campoFinale(page)
    await campo.tap()
    await page.keyboard.press('ControlOrMeta+A')
    const barra = page.getByRole('toolbar', { name: 'Formato del testo' })
    await barra.getByRole('button', { name: 'Colore' }).tap()
    await expect(barra.getByRole('group', { name: 'Sfondo' })).toBeVisible()
    for (const bottone of await barra.getByRole('button').all()) {
      const box = await bottone.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    }
    const [pagina, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(pagina).toBeLessThanOrEqual(finestra)
  })
})
