import { expect, test } from '@playwright/test'

import { ID_COACH, pagineDinamiche } from './db'
import { avviaTimerAltrove, fermaTimerAltrove } from './pm-db'
import { PAGINE, PROGETTO_PERCORSO_CLIENTE, UTENTI, accedi, type RuoloSeed } from './utenti'

const RUOLI = Object.keys(UTENTI) as RuoloSeed[]

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
          await page.screenshot({
            path: `.shots/${ruolo}-${pagina.nome}-${larghezza}.png`,
            fullPage: true,
          })
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

test('screenshot login', async ({ page }) => {
  const larghezza = page.viewportSize()?.width ?? 0
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `.shots/pubblico-login-${larghezza}.png`, fullPage: true })
  const scorre = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(scorre, `scroll orizzontale del login a ${larghezza}px`).toBe(false)
})
