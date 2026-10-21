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

  test('il setter lo vede una volta, tocca i pulsanti veri e il tour continua nella pagina', async ({ page }) => {
    await primoAccesso(UTENTI.setter.email, false)
    await accedi(page, 'setter')
    await page.goto('/calls')

    const tour = page.getByTestId('tutorial')
    await expect(tour.getByRole('dialog', { name: 'Benvenuto in Alpha Management' })).toBeVisible()
    await expect(tour).toContainText('1/12')
    // nothing can be closed before the reading time
    await expect(tour.getByRole('button', { name: 'Chiudi il tutorial' })).toBeDisabled()
    await page.screenshot({ path: '.shots/tutorial-setter-1-390.png' })

    await avanti(page, tour)
    await expect(tour.getByRole('dialog', { name: 'Oggi' })).toBeVisible()
    await expect(page.getByTestId('tutorial-tocca')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: '.shots/tutorial-setter-2-390.png' })

    // the real "Oggi" of the bottom bar: the page opens and the tour follows
    await page.getByRole('navigation', { name: 'Navigazione' }).getByRole('link', { name: 'Oggi' }).click()
    await expect(page).toHaveURL(/\/today/)
    await expect(tour.getByRole('dialog', { name: 'I contatori' })).toBeVisible()
    await expect(tour).toContainText('3/12')

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

  test('il marketing parte dal Piano editoriale: tocca «Piano editoriale» anche se è già lì, poi la tabella', async ({ page }) => {
    await primoAccesso(UTENTI.marketing.email, false)
    await accedi(page, 'marketing')
    await expect(page).toHaveURL(/\/marketing\/contenuti$/)

    const tour = page.getByTestId('tutorial')
    await expect(tour.getByRole('dialog', { name: 'Benvenuto in Alpha Management' })).toBeVisible()
    await expect(tour).toContainText('1/10')
    await avanti(page, tour)
    await expect(tour.getByRole('dialog', { name: 'Piano editoriale' })).toBeVisible()
    await expect(page.getByTestId('tutorial-tocca')).toBeVisible()

    // the first item of the bottom bar: the tap advances even on the page he is on
    await page.getByRole('navigation', { name: 'Navigazione', exact: true }).getByRole('link', { name: 'Piano editoriale' }).click()
    await expect(tour.getByRole('dialog', { name: 'La tabella dei contenuti' })).toBeVisible()
    await expect(tour).toContainText('3/10')
    // the step has its target: the list of contents, not a card in the middle of the screen
    await expect(tour.locator('div.ring-2')).toHaveCount(1)
    await page.waitForTimeout(400)
    await page.screenshot({ path: '.shots/tutorial-marketing-3-390.png' })

    // his daily page is the Piano editoriale: «I miei task» says what it holds, never «la tua pagina di tutti i giorni»
    await avanti(page, tour)
    const task = tour.getByRole('dialog', { name: 'I miei task' })
    await expect(task).toContainText('Tocca «I miei task»: i task dei progetti assegnati a te.')
    await expect(task).not.toContainText('pagina di tutti i giorni')
    await expect(tour).toContainText('4/10')

    await expect(tour.getByRole('button', { name: 'Chiudi il tutorial' })).toBeEnabled({ timeout: 4000 })
    await tour.getByRole('button', { name: 'Chiudi il tutorial' }).click()
    await expect(tour).toHaveCount(0)
    await expect
      .poll(async () => {
        const { data } = await dbLocale().from('profiles').select('tutorial_visto').eq('email', UTENTI.marketing.email).single()
        return data?.tutorial_visto
      })
      .toBe(true)
  })
})

test('chi l’ha già visto non lo rivede, ma può riaprirlo dal profilo', async ({ page }) => {
  await accedi(page, 'coach')
  await page.waitForTimeout(800)
  await expect(page.getByTestId('tutorial')).toHaveCount(0)
  await page.goto('/account?scheda=account')
  await page.getByRole('button', { name: 'Rivedi il tutorial' }).click()
  const tour = page.getByTestId('tutorial')
  await expect(tour).toContainText('1/8')
  await avanti(page, tour)
  await expect(tour.getByRole('dialog', { name: 'I miei task' })).toBeVisible()
  // on desktop the sidebar link is the one highlighted
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'I miei task' }).click()
  await expect(page).toHaveURL(/\/task$/)
  await expect(tour.getByRole('dialog', { name: 'Un task' })).toBeVisible()
})

test('l’admin prova il tour di ogni ruolo da “Testa il tutorial”', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Testa il tutorial' }).click()
  await page.getByRole('menuitem', { name: 'Video editor' }).click()
  const tour = page.getByTestId('tutorial')
  // the video editor passes through the content calendar too (1.32.0)
  await expect(tour).toContainText('Video editor · 1/10')
  await avanti(page, tour)
  // a preview never asks to tap: it walks with "Avanti"
  await expect(tour.getByRole('dialog', { name: 'Piano editoriale' })).toBeVisible()
  await expect(page.getByTestId('tutorial-tocca')).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: '.shots/tutorial-admin-anteprima-1440.png' })
  await expect(tour.getByRole('button', { name: 'Chiudi il tutorial' })).toBeEnabled({ timeout: 4000 })
  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)

  // a preview marks nothing as seen
  await page.getByRole('button', { name: 'Testa il tutorial' }).click()
  await page.getByRole('menuitem', { name: 'Setter' }).click()
  await expect(tour).toContainText('Setter · 1/12')
})

test('l’anteprima del tour del marketing passa dal «Piano editoriale», evidenziato nella barra laterale', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Testa il tutorial' }).click()
  await page.getByRole('menuitem', { name: 'Marketing', exact: true }).click()
  const tour = page.getByTestId('tutorial')
  await expect(tour).toContainText('Marketing · 1/10')
  await expect(tour.getByRole('dialog', { name: 'Benvenuto in Alpha Management' })).toBeVisible()

  await avanti(page, tour)
  await expect(tour).toContainText('Marketing · 2/10')
  await expect(tour.getByRole('dialog', { name: 'Piano editoriale' })).toBeVisible()
  // the admin has the "Piano editoriale" too: the step finds it, no "not on your account" note
  await expect(tour.getByText(/Anteprima: sul tuo account questo elemento non c’è/)).toHaveCount(0)
  const voce = page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Piano editoriale' })
  const alone = tour.locator('div.ring-2')
  await expect(alone).toHaveCount(1)
  // the highlight sits on the sidebar item, 6px around it
  await expect
    .poll(async () => {
      const [a, v] = await Promise.all([alone.boundingBox(), voce.boundingBox()])
      if (!a || !v) return null
      return [Math.round(a.x - v.x), Math.round(a.y - v.y), Math.round(a.width - v.width), Math.round(a.height - v.height)]
    })
    .toEqual([-6, -6, 12, 12])

  // then the calendar page itself
  await avanti(page, tour)
  await expect(tour.getByRole('dialog', { name: 'La tabella dei contenuti' })).toBeVisible()
  await expect(tour).toContainText('Marketing · 3/10')
})

test('il tour del setter mostra la scheda «Insight 24h» di Oggi, subito dopo i passi di Oggi (1.38.0)', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await primoAccesso(UTENTI.setter.email, false)
  await accedi(page, 'setter')
  await page.goto('/calls')
  const tour = page.getByTestId('tutorial')
  await expect(tour).toContainText('1/12')
  await avanti(page, tour)
  // the real "Oggi" of the sidebar: the page opens and the tour follows
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Oggi' }).click()
  await expect(tour.getByRole('dialog', { name: 'I contatori' })).toBeVisible()
  await avanti(page, tour)
  await expect(tour.getByRole('dialog', { name: 'Si salva da solo' })).toBeVisible()
  await avanti(page, tour)
  const insight = tour.getByRole('dialog', { name: 'Insight 24h' })
  await expect(insight).toBeVisible()
  await expect(insight).toContainText('i DM del giorno letti da Claude')
  await expect(tour).toContainText('5/12')

  // the highlight sits on the tab, which is a link of the page and not an item of the menu
  const scheda = page.getByRole('navigation', { name: 'Sezioni di Oggi' }).getByRole('link', { name: 'Insight 24h', exact: true })
  const alone = tour.locator('div.ring-2')
  await expect(alone).toHaveCount(1)
  await expect
    .poll(async () => {
      const [a, v] = await Promise.all([alone.boundingBox(), scheda.boundingBox()])
      if (!a || !v) return null
      return [Math.round(a.x - v.x), Math.round(a.y - v.y)]
    })
    .toEqual([-6, -6])
  // the menu has no Insight item at all
  await expect(
    page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Insight/ }),
  ).toHaveCount(0)
  await avanti(page, tour)
  await expect(tour.getByRole('dialog', { name: 'Nuova call' })).toBeVisible()
})
