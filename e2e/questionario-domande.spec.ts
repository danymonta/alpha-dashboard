import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

/**
 * Impostazioni › Domande del questionario and the clearer contents (1.88.0, Dany 25/11/2026:
 * «modificare tutto anche domande eventuali così non devo farlo da codice e anche link ai video etc
 * in modo però super chiaro e preciso»). The admin adds a question with more choices, sees its
 * column of the sheet, changes the words of a question of the form, moves it, takes it away and
 * puts it back; the contents say what is still to write and check the YouTube link at once.
 * Everything the test changes goes back as it was (other tests count the 26 questions).
 * With GUIDA=<folder> it also saves the screenshots of the guide for Dany.
 */

const GUIDA = process.env.GUIDA

async function foto(page: Page, nome: string) {
  if (!GUIDA) return
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.screenshot({ path: `${GUIDA}/${nome}.png` })
}

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  const db = dbLocale()
  await db.from('onboarding_domande').delete().like('chiave', 'quali_sport_fai_%')
  await db
    .from('onboarding_domande')
    .update({ testo: 'Ti senti pronto e motivato?', aiuto: null, attiva: true, ordine: 26 })
    .eq('chiave', 'pronto')
  await db.from('onboarding_domande').update({ ordine: 25 }).eq('chiave', 'note')
})

test('l’admin aggiunge, cambia, sposta, toglie e rimette una domanda', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await accedi(page, 'admin')
  await page.goto('/settings')
  await page.getByTestId('voce-questionario').click()
  await expect(page).toHaveURL(/\/settings\/onboarding\/questionario$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Domande del questionario' })).toBeVisible()
  await expect(page.getByTestId('parte-1').locator('[data-domanda-admin]')).toHaveCount(7)
  await foto(page, '01-elenco')

  // a new question with more choices, in part 4
  await page.getByTestId('aggiungi-domanda-4').click()
  await expect(page.getByTestId('scegli-tipo')).toBeVisible()
  await foto(page, '02-tipo')
  await page.locator('[data-tipo="scelte"]').click()
  const foglio = page.getByTestId('foglio-domanda')
  await foglio.getByRole('textbox', { name: 'La domanda', exact: true }).fill('Quali sport fai?')
  await foglio.getByRole('textbox', { name: 'Risposta 1', exact: true }).fill('Calcio')
  await foglio.getByRole('button', { name: 'Aggiungi una risposta' }).click()
  await foglio.getByRole('textbox', { name: 'Risposta 2', exact: true }).fill('Nuoto')
  // the preview is the client's own field
  await expect(page.getByTestId('anteprima-domanda')).toContainText('Quali sport fai?')
  await expect(page.getByTestId('anteprima-domanda').getByRole('checkbox', { name: 'Nuoto' })).toBeVisible()
  await foto(page, '03-nuova')
  await page.getByTestId('salva-domanda').click()
  await expect(page.getByText('Domanda aggiunta in fondo alla sua parte.')).toBeVisible()
  const nuova = page.getByTestId('parte-4').locator('[data-domanda-admin^="quali_sport_fai_"]')
  await expect(nuova).toContainText('Colonna AI del foglio')
  await expect(nuova).toContainText('Più scelte')

  // the words of a question of the form
  await page.getByRole('button', { name: 'Modifica la domanda «Ti senti pronto e motivato?»' }).click()
  await expect(page.getByTestId('foglio-domanda')).toContainText('È una delle domande del tuo modulo Google')
  await page.getByTestId('foglio-domanda').getByRole('textbox', { name: 'La domanda', exact: true }).fill('Ti senti pronto?')
  await foto(page, '04-modifica')
  await page.getByTestId('salva-domanda').click()
  await expect(page.getByText('Domanda salvata: i clienti la vedono già così.')).toBeVisible()
  await expect(page.locator('[data-domanda-admin="pronto"]')).toContainText('Ti senti pronto?')

  // up one place: it swaps with the one before
  const parte4 = page.getByTestId('parte-4').locator('[data-domanda-admin]')
  const prima = await parte4.evaluateAll((li) => li.map((x) => x.getAttribute('data-domanda-admin')))
  const i = prima.indexOf('pronto')
  await page.getByRole('button', { name: 'Sposta su «Ti senti pronto?»' }).click()
  await expect(parte4.nth(i - 1)).toHaveAttribute('data-domanda-admin', 'pronto')

  // away and back
  await page.getByRole('button', { name: 'Togli la domanda «Ti senti pronto?»' }).click()
  await foto(page, '05-togli')
  await page.getByTestId('conferma-togli').click()
  await expect(page.getByTestId('domande-tolte')).toContainText('Ti senti pronto?')
  await page.getByRole('button', { name: 'Rimetti la domanda «Ti senti pronto?»' }).click()
  await expect(page.getByTestId('domande-tolte')).toHaveCount(0)
})

test('dal telefono la pagina sta nello schermo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto('/settings/onboarding/questionario')
  await expect(page.getByTestId('parte-1')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('i contenuti dicono cosa manca e controllano il link di YouTube', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await accedi(page, 'admin')
  await page.goto('/settings/onboarding/contenuti')
  const daCompletare = page.getByTestId('da-completare')
  await expect(daCompletare).toBeVisible()
  await foto(page, '06-da-completare')
  // the example video of the welcome: «Completa» opens it ready to edit
  const riga = daCompletare.locator('li', { hasText: 'Video da caricare' }).first()
  await riga.getByRole('button', { name: /^Completa/ }).click()
  const campo = page.getByLabel('Link del video su YouTube')
  await expect(page.locator('[data-youtube="segnaposto"]')).toBeVisible()
  await campo.fill('https://www.google.com/watch?v=1')
  await expect(page.locator('[data-youtube="non-valido"]')).toBeVisible()
  await campo.fill('https://youtu.be/dQw4w9WgXcQ')
  await expect(page.locator('[data-youtube="ok"]')).toBeVisible()
  await foto(page, '07-youtube')
  // nothing saved: the example stays for the other tests
  await page.getByRole('button', { name: 'Annulla' }).click()
})

test('il setter non apre la pagina', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/settings/onboarding/questionario')
  await expect(page).not.toHaveURL(/questionario/)
})
