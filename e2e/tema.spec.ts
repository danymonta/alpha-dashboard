import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

const html = (page: import('@playwright/test').Page) => page.locator('html')

test('il tema di base è scuro: nessuna classe, nessun cambio non chiesto', async ({ page }) => {
  await accedi(page, 'admin')
  await expect(html(page)).not.toHaveClass(/\blight\b/)
  const sfondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(sfondo).toBe('rgb(18, 18, 20)')
})

test('il tocco rapido cambia tema e la scelta resta dopo il ricaricamento', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Passa al tema chiaro' }).click()
  await expect(html(page)).toHaveClass(/\blight\b/)
  const sfondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(sfondo).toBe('rgb(245, 239, 232)')
  await page.reload()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect(page.getByRole('button', { name: 'Passa al tema scuro' })).toBeVisible()
  // and back
  await page.getByRole('button', { name: 'Passa al tema scuro' }).click()
  await expect(html(page)).not.toHaveClass(/\blight\b/)
})

test('nessun lampeggio: la classe è già nel primo HTML, prima di ogni script', async ({ page, context, baseURL }) => {
  await accedi(page, 'admin')
  await context.addCookies([{ name: 'alpha_tema', value: 'chiaro', url: baseURL! }])
  const risposta = await page.request.get('/account')
  const testo = await risposta.text()
  expect(testo).toMatch(/<html[^>]*class="[^"]*\blight\b/)
  await context.addCookies([{ name: 'alpha_tema', value: 'scuro', url: baseURL! }])
  const scuro = await (await page.request.get('/account')).text()
  expect(scuro).not.toMatch(/<html[^>]*class="[^"]*\blight\b/)
})

test('il login rispetta il tema, anche senza sessione', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'alpha_tema', value: 'chiaro', url: baseURL! }])
  await page.goto('/login')
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible()
})

test('Profilo: la scelta a tre voci vale subito, anche Sistema', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/account')
  const gruppo = page.getByRole('radiogroup', { name: 'Tema' })
  await expect(gruppo.getByRole('radio', { name: /Scuro/ })).toHaveAttribute('aria-checked', 'true')
  await gruppo.getByRole('radio', { name: /Chiaro/ }).click()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect(gruppo.getByRole('radio', { name: /Chiaro/ })).toHaveAttribute('aria-checked', 'true')

  await gruppo.getByRole('radio', { name: /Sistema/ }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html(page)).toHaveClass(/\blight\b/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).not.toHaveClass(/\blight\b/)
  await page.reload()
  await expect(gruppo.getByRole('radio', { name: /Sistema/ })).toHaveAttribute('aria-checked', 'true')
  await gruppo.getByRole('radio', { name: /Scuro/ }).click()
})

test('Sistema con un dispositivo chiaro: la classe c’è prima del primo paint', async ({ page, context, baseURL }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await context.addCookies([{ name: 'alpha_tema', value: 'sistema', url: baseURL! }])
  await page.goto('/login', { waitUntil: 'commit' })
  await page.waitForSelector('html')
  await expect(html(page)).toHaveClass(/\blight\b/)
})
