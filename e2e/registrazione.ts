import type { Locator } from '@playwright/test'

/**
 * La registrazione di Fathom chiesta con l'esito di una call svolta (1.37.0, CLAUDE.md sezione 31):
 * per le call di oggi in poi il foglio chiede il link o «Call non registrata». I test che non
 * provano la registrazione scelgono l'uscita; per una call di prima del 16/10/2026 il passo non
 * c'è e il tocco non serve.
 */
export async function nonRegistrata(foglio: Locator) {
  const bottone = foglio.getByRole('button', { name: 'Call non registrata' })
  try {
    await bottone.waitFor({ state: 'visible', timeout: 1500 })
  } catch {
    return
  }
  await bottone.click()
}
