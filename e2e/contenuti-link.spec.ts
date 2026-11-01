import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { creaContenutoDiProva, leggiContenuto, pulisciContenuti } from './db'
import { accedi } from './utenti'

/**
 * The links of the sections (01/11/2026, Dany: link cliccabili «stile Google
 * Drive»): a click in a link puts the cursor there and shows the popup under
 * it (the address, Apri, Copia, Modifica, Togli il link); Ctrl/⌘+K adds a link
 * to a selection; the Markdown stays `[testo](url)` and a bare address stays bare.
 */
const PREFISSO = 'E2E Link '

test.beforeAll(async () => {
  await pulisciContenuti(PREFISSO)
})

test.afterAll(async () => {
  await pulisciContenuti(PREFISSO)
})

function campoFinale(page: Page) {
  return page.getByRole('region', { name: 'Script (Final)', exact: true }).getByRole('textbox', { name: 'Script (Final)', exact: true })
}

test('un clic nel link mostra il popup: Apri sicuro, Modifica e Togli si salvano; l’indirizzo nudo resta nudo', async ({ page }) => {
  const nome = `${PREFISSO}popup`
  const id = await creaContenutoDiProva(nome, {
    post_date: aggiungiGiorni(oggiRoma(), 341),
    finale: 'Vedi [il reel](https://www.instagram.com/reel/ABC_def/) e https://esempio.it/x_y fine',
  })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)
  const campo = campoFinale(page)
  await expect(campo.getByRole('link', { name: 'il reel' })).toBeVisible()

  await campo.getByText('il reel').click()
  const popup = page.getByRole('toolbar', { name: 'Link' })
  await expect(popup).toBeVisible()
  await expect(popup).toContainText('instagram.com/reel/ABC_def')
  const apri = popup.getByRole('link', { name: 'Apri il link in una nuova scheda' })
  await expect(apri).toHaveAttribute('href', 'https://www.instagram.com/reel/ABC_def/')
  await expect(apri).toHaveAttribute('target', '_blank')
  await expect(apri).toHaveAttribute('rel', 'noopener noreferrer')
  // the cursor is in the link: the text can still be written
  await expect(campo).toBeFocused()

  await popup.getByRole('button', { name: 'Modifica il link' }).click()
  const indirizzo = page.getByRole('textbox', { name: 'Indirizzo del link' })
  await expect(indirizzo).toBeFocused()
  await indirizzo.fill('javascript:alert(1)')
  await indirizzo.press('Enter')
  await expect(page.getByRole('alert')).toHaveText('Scrivi un indirizzo http o https, per esempio https://www.instagram.com/…')
  await indirizzo.fill('www.instagram.com/reel/NUOVO/')
  await indirizzo.press('Enter')
  await expect
    .poll(async () => (await leggiContenuto(id))?.finale)
    .toBe('Vedi [il reel](https://www.instagram.com/reel/NUOVO/) e https://esempio.it/x_y fine')

  await campo.getByText('il reel').click()
  await popup.getByRole('button', { name: 'Togli il link' }).click()
  await expect.poll(async () => (await leggiContenuto(id))?.finale).toBe('Vedi il reel e https://esempio.it/x_y fine')
})

test('Ctrl/⌘+K su una selezione aggiunge il link; Esc torna al testo', async ({ page }) => {
  const nome = `${PREFISSO}scorciatoia`
  const id = await creaContenutoDiProva(nome, { post_date: aggiungiGiorni(oggiRoma(), 342), finale: 'Guarda qui il reel' })
  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti/${id}`)
  const campo = campoFinale(page)
  await campo.click()
  await page.keyboard.press('Home')
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Guarda')
  await page.keyboard.press('ControlOrMeta+K')
  const indirizzo = page.getByRole('textbox', { name: 'Indirizzo del link' })
  await expect(indirizzo).toBeFocused()
  await indirizzo.fill('https://esempio.it/guarda')
  await indirizzo.press('Enter')
  await expect.poll(async () => (await leggiContenuto(id))?.finale).toBe('[Guarda](https://esempio.it/guarda) qui il reel')

  await campo.getByText('Guarda').click()
  await page.keyboard.press('Alt+F10')
  await expect(page.getByRole('toolbar', { name: 'Link' }).getByRole('link', { name: 'Apri il link in una nuova scheda' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(campo).toBeFocused()
})
