import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

/**
 * Impostazioni from the profile photo and the index by topic (1.87.0, Dany 25/11/2026: «il pulsante
 * impostazioni spostalo sull'icona del profilo… organizzale meglio… a sezioni»).
 */
test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('l’admin apre le impostazioni dalla foto: sezioni, stato e «Da sistemare»', async ({ page }) => {
    await accedi(page, 'admin')
    // not in the menu any more
    await page.getByRole('button', { name: 'Altro' }).click()
    await expect(page.getByRole('link', { name: 'Impostazioni', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Il tuo profilo/ }).click()
    const menu = page.getByTestId('menu-profilo')
    await expect(menu.getByRole('menuitem', { name: /Profilo e account/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Esci/ })).toBeVisible()
    await menu.getByRole('menuitem', { name: /Impostazioni/ }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible()

    for (const sezione of ['Percorso dei clienti', 'Team e vendite', 'Collegamenti', 'Progetti', 'Dati e backup']) {
      await expect(page.getByRole('heading', { level: 2, name: sezione })).toBeVisible()
    }
    await expect(page.getByTestId('voce-onboarding')).toContainText(/(Chiusa|Aperta) ai clienti/)

    // the seed has contents still to write: the row goes straight to them
    const daSistemare = page.getByTestId('da-sistemare')
    await expect(daSistemare).toBeVisible()
    await daSistemare.getByRole('link', { name: /Contenuti del percorso/ }).click()
    await expect(page).toHaveURL(/\/settings\/onboarding\/contenuti$/)

    await page.goto('/settings')
    const larghezza = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(larghezza).toBeLessThanOrEqual(390)
  })

  test('il setter ha profilo ed esci, non le impostazioni', async ({ page }) => {
    await accedi(page, 'setter')
    await page.getByRole('button', { name: /Il tuo profilo/ }).click()
    const menu = page.getByTestId('menu-profilo')
    await expect(menu.getByRole('menuitem', { name: /Profilo e account/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Impostazioni/ })).toHaveCount(0)
    await menu.getByRole('menuitem', { name: /Profilo e account/ }).click()
    await expect(page).toHaveURL(/\/account$/)
  })
})

test('dal computer la foto in fondo alla barra apre lo stesso menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await accedi(page, 'admin')
  await page.getByRole('complementary').getByRole('button', { name: /Il tuo profilo/ }).click()
  await page.getByTestId('menu-profilo').getByRole('menuitem', { name: /Impostazioni/ }).click()
  await expect(page).toHaveURL(/\/settings$/)
  // the index of the sections, a tap to each group
  await page.getByRole('navigation', { name: 'Impostazioni' }).getByRole('link', { name: 'Collegamenti' }).click()
  await expect(page).toHaveURL(/#gruppo-collegamenti$/)
})
