import { test } from '@playwright/test'

import { pagineDinamiche } from './db'
import { PAGINE, UTENTI, accedi, type RuoloSeed } from './utenti'

const RUOLI = Object.keys(UTENTI) as RuoloSeed[]

for (const ruolo of RUOLI) {
  test.describe(ruolo, () => {
    test(`screenshot ${ruolo}`, async ({ page }, testInfo) => {
      const larghezza = page.viewportSize()?.width ?? 0

      await accedi(page, ruolo)

      for (const pagina of [...PAGINE[ruolo], ...(await pagineDinamiche(ruolo))]) {
        await page.goto(pagina.url)
        await page.waitForLoadState('networkidle')
        await page.screenshot({
          path: `.shots/${ruolo}-${pagina.nome}-${larghezza}.png`,
          fullPage: true,
        })
      }

      testInfo.annotations.push({
        type: 'shots',
        description: `${PAGINE[ruolo].length} pagine a ${larghezza}px`,
      })
    })
  })
}

test('screenshot login', async ({ page }) => {
  const larghezza = page.viewportSize()?.width ?? 0
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `.shots/pubblico-login-${larghezza}.png`, fullPage: true })
})
