import { expect, test, type Page } from '@playwright/test'

import { ID_COACH, pagineDinamiche } from './db'
import { avviaTimerAltrove, fermaTimerAltrove } from './pm-db'
import { PAGINE, PAGINE_CLIENTE, PROGETTO_PERCORSO_CLIENTE, UTENTI, accedi, accediCliente, type RuoloSeed } from './utenti'

const RUOLI = Object.keys(UTENTI) as RuoloSeed[]

/**
 * The phone's bottom bar (components/shell/bottom-bar.tsx) is fixed: in a
 * full-page shot it lands on top of rows in the middle of the page. Put back in
 * the flow, it sits after the content and every row stays readable.
 */
const BARRA_IN_BASSO_NEL_FLUSSO = 'nav[aria-label="Navigazione"].fixed { position: static !important; }'

async function fotografa(page: Page, path: string) {
  await page.addStyleTag({ content: BARRA_IN_BASSO_NEL_FLUSSO })
  await page.screenshot({ path, fullPage: true })
}

/** Who has a running timer in the screenshots: the shell indicator must show up somewhere. */
const CON_TIMER: RuoloSeed = 'coach'

for (const ruolo of RUOLI) {
  test.describe(ruolo, () => {
    test(`screenshot ${ruolo}`, async ({ page }, testInfo) => {
      const larghezza = page.viewportSize()?.width ?? 0
      // pages that scroll sideways at this width: collected, the test fails at the end
      const scorrimentoOrizzontale: string[] = []

      if (ruolo === CON_TIMER) await avviaTimerAltrove(ID_COACH, PROGETTO_PERCORSO_CLIENTE, 25)
      try {
        await accedi(page, ruolo)

        for (const pagina of [...PAGINE[ruolo], ...(await pagineDinamiche(ruolo))]) {
          await page.goto(pagina.url)
          await page.waitForLoadState('networkidle')
          await fotografa(page, `.shots/${ruolo}-${pagina.nome}-${larghezza}.png`)
          const misure = await page.evaluate(() => ({
            pagina: document.documentElement.scrollWidth,
            finestra: window.innerWidth,
          }))
          if (misure.pagina > misure.finestra) {
            scorrimentoOrizzontale.push(`${pagina.nome} (${misure.pagina}px su ${misure.finestra}px)`)
          }
        }
      } finally {
        if (ruolo === CON_TIMER) await fermaTimerAltrove(ID_COACH)
      }

      testInfo.annotations.push({
        type: 'shots',
        description: `${PAGINE[ruolo].length} pagine a ${larghezza}px`,
      })
      expect(scorrimentoOrizzontale, `scroll orizzontale della pagina a ${larghezza}px`).toEqual([])
    })
  })
}

// the client's area (1.79.0): the test client of the seed, waiting for the team
test('screenshot cliente', async ({ page }) => {
  const larghezza = page.viewportSize()?.width ?? 0
  const scorrimentoOrizzontale: string[] = []
  await accediCliente(page)
  for (const pagina of PAGINE_CLIENTE) {
    await page.goto(pagina.url)
    await page.waitForLoadState('networkidle')
    await fotografa(page, `.shots/cliente-${pagina.nome}-${larghezza}.png`)
    const misure = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth, finestra: window.innerWidth }))
    if (misure.pagina > misure.finestra) scorrimentoOrizzontale.push(`${pagina.nome} (${misure.pagina}px su ${misure.finestra}px)`)
  }
  expect(scorrimentoOrizzontale, `scroll orizzontale della pagina a ${larghezza}px`).toEqual([])
})

test('screenshot login', async ({ page }) => {
  const larghezza = page.viewportSize()?.width ?? 0
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await fotografa(page, `.shots/pubblico-login-${larghezza}.png`)
  const scorre = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(scorre, `scroll orizzontale del login a ${larghezza}px`).toBe(false)
})

/** States that are not pages: the Alfire panel, a product sheet with its plan, a tour step. */
test('stati: Alfire, prodotto con piano rate, tutorial', async ({ page }) => {
  const larghezza = page.viewportSize()?.width ?? 0
  await accedi(page, 'admin')

  await page.goto('/')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `.shots/admin-stato-alfire-${larghezza}.png` })
  await page.keyboard.press('Escape')

  await page.goto('/settings/products')
  await page.getByRole('button', { name: /^Modifica / }).first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `.shots/admin-stato-prodotto-${larghezza}.png` })
  await page.keyboard.press('Escape')

  // phone: "Testa il tutorial" lives in the profile; desktop: top right
  await page.goto(larghezza < 768 ? '/account?scheda=account' : '/')
  await page.getByRole('button', { name: 'Testa il tutorial' }).first().click()
  await page.getByRole('menuitem', { name: 'Admin' }).click()
  const tour = page.getByTestId('tutorial')
  await expect(tour.getByRole('button', { name: 'Avanti' })).toBeEnabled({ timeout: 5000 })
  await tour.getByRole('button', { name: 'Avanti' }).click()
  // the step lives on the Panoramica: on the phone the tour has just opened it
  await expect(page.getByTestId('kpi')).toBeVisible()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `.shots/admin-stato-tutorial-${larghezza}.png` })
})
