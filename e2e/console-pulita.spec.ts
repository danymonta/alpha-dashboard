import { expect, test } from '@playwright/test'

import { pagineDinamiche } from './db'
import { PAGINE, accedi, type RuoloSeed } from './utenti'

// Every page of every role, at phone width: no console error, no uncaught
// exception. Catches what the dev overlay shows and a screenshot hides.
test.use({ viewport: { width: 390, height: 844 } })

// the Economics roles, and those of the Marketing area (the content calendar, 1.32.0)
for (const ruolo of ['admin', 'setter', 'closer', 'editor', 'marketing'] as RuoloSeed[]) {
  test(`nessun errore in console: ${ruolo}`, async ({ page }) => {
    // one test walks every page of the role: the admin has twenty
    test.setTimeout(120_000)
    const errori: string[] = []
    page.on('console', (m) => {
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
