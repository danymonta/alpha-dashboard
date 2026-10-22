import { expect, test } from '@playwright/test'

import { pagineDinamiche } from './db'
import { PAGINE, accedi, type RuoloSeed } from './utenti'

// Every page of every role, at phone width: no console error, no uncaught
// exception. Catches what the dev overlay shows and a screenshot hides.
test.use({ viewport: { width: 390, height: 844 } })

// the Economics roles, those of the Marketing area (the content calendar, 1.32.0) and the business coach (1.52.0)
for (const ruolo of ['admin', 'setter', 'closer', 'editor', 'marketing', 'business_coach'] as RuoloSeed[]) {
  test(`nessun errore in console: ${ruolo}`, async ({ page }) => {
    // one test walks every page of the role: the admin has twenty
    test.setTimeout(120_000)
    const errori: string[] = []
    page.on('console', (m) => {
      // the email of a notification (1.41.0) is shown in a sandboxed iframe with no scripts, on purpose:
      // Playwright injects its own init script in every frame, and Chromium says it blocked it. A real
      // browser has nothing to block there.
      if (m.text().startsWith("Blocked script execution in 'about:srcdoc'")) return
      if (m.type() === 'error') errori.push(`${new URL(page.url()).pathname}: ${m.text().split('\n')[0]}`)
    })
    page.on('pageerror', (e) => errori.push(`${new URL(page.url()).pathname}: ${e.message}`))

    await accedi(page, ruolo)
    for (const pagina of [...PAGINE[ruolo], ...(await pagineDinamiche(ruolo))]) {
      await page.goto(pagina.url)
      await page.waitForLoadState('networkidle')
    }

    expect(errori).toEqual([])
  })
}
