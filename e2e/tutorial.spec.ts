import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { UTENTI, accedi } from './utenti'

async function primoAccesso(email: string, visto: boolean) {
  await dbLocale().from('profiles').update({ tutorial_visto: visto }).eq('email', email)
}

async function avanti(page: Page, tour: ReturnType<Page['getByTestId']>) {
  // the reading bar runs 2 seconds before "Avanti" wakes up
  await expect(tour.getByRole('button', { name: /Avanti|Fine/ })).toBeEnabled({ timeout: 4000 })
  await tour.getByRole('button', { name: /Avanti|Fine/ }).click()
}

test.afterEach(async () => {
  for (const u of Object.values(UTENTI)) await primoAccesso(u.email, true)
})

test.describe('tutorial al primo accesso, dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('il setter lo vede una volta, passo per passo, con l’elemento evidenziato', async ({ page }) => {
    await primoAccesso(UTENTI.setter.email, false)
    await accedi(page, 'setter')

    const tour = page.getByTestId('tutorial')
    await expect(tour.getByRole('dialog', { name: 'Benvenuto in Alpha Management' })).toBeVisible()
    await expect(tour).toContainText('1/7')
    // nothing can be closed before the reading time
    await expect(tour.getByRole('button', { name: 'Chiudi il tutorial' })).toBeDisabled()
    await page.screenshot({ path: '.shots/tutorial-setter-1-390.png' })

    await avanti(page, tour)
    await expect(tour.getByRole('dialog', { name: 'Oggi' })).toBeVisible()
    await expect(tour).toContainText('2/7')
    await page.waitForTimeout(400)
    await page.screenshot({ path: '.shots/tutorial-setter-2-390.png' })

    await expect(tour.getByRole('button', { name: 'Chiudi il tutorial' })).toBeEnabled({ timeout: 4000 })
    await tour.getByRole('button', { name: 'Chiudi il tutorial' }).click()
    await expect(tour).toHaveCount(0)

    await expect
      .poll(async () => {
        const { data } = await dbLocale().from('profiles').select('tutorial_visto').eq('email', UTENTI.setter.email).single()
        return data?.tutorial_visto
      })
      .toBe(true)
    await page.reload()
    await page.waitForTimeout(800)
    await expect(page.getByTestId('tutorial')).toHaveCount(0)
  })
})

test('chi l’ha già visto non lo rivede, ma può riaprirlo dal profilo', async ({ page }) => {
  await accedi(page, 'coach')
  await page.waitForTimeout(800)
  await expect(page.getByTestId('tutorial')).toHaveCount(0)
  await page.goto('/account?scheda=account')
  await page.getByRole('button', { name: 'Rivedi il tutorial' }).click()
  const tour = page.getByTestId('tutorial')
  await expect(tour).toContainText('1/6')
  for (let i = 0; i < 5; i++) await avanti(page, tour)
  await expect(tour.getByRole('dialog', { name: 'Il tuo profilo' })).toBeVisible()
  await avanti(page, tour)
  await expect(tour).toHaveCount(0)
})

test('l’admin prova il tour di ogni ruolo da “Testa il tutorial”', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Testa il tutorial' }).click()
  await page.getByRole('menuitem', { name: 'Video editor' }).click()
  const tour = page.getByTestId('tutorial')
  await expect(tour).toContainText('Video editor · 1/6')
  await avanti(page, tour)
  await expect(tour.getByRole('dialog', { name: 'I miei task' })).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: '.shots/tutorial-admin-anteprima-1440.png' })
  await expect(tour.getByRole('button', { name: 'Chiudi il tutorial' })).toBeEnabled({ timeout: 4000 })
  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)

  // a preview marks nothing as seen
  await page.getByRole('button', { name: 'Testa il tutorial' }).click()
  await page.getByRole('menuitem', { name: 'Setter' }).click()
  await expect(tour).toContainText('Setter · 1/7')
})
