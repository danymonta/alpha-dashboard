import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

const larghezzaSidebar = (page: import('@playwright/test').Page) =>
  page.locator('aside').evaluate((el) => el.getBoundingClientRect().width)

test('la sidebar si riduce a sole icone, resta così dopo il ricaricamento e si riapre', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await accedi(page, 'admin')
  expect(await larghezzaSidebar(page)).toBe(240)

  const bottone = page.getByRole('button', { name: 'Riduci la barra laterale' })
  await expect(bottone).toHaveAttribute('aria-expanded', 'true')
  const scatola = await bottone.boundingBox()
  expect(scatola!.height).toBeGreaterThanOrEqual(44)
  await bottone.click()

  const aperto = page.getByRole('button', { name: 'Espandi la barra laterale' })
  await expect(aperto).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => larghezzaSidebar(page)).toBe(64)

  // the items keep their name for screen readers and for the tutorial
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(nav.getByRole('link', { name: 'Clienti' })).toBeVisible()
  await expect(page.locator('[data-tour="nav-/clients"]')).toBeVisible()
  await expect(page.locator('[data-tour="profilo"]:visible')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Notifiche' })).toBeVisible()

  // it is the same on another page and after a reload, with no flash: the server renders it narrow
  await nav.getByRole('link', { name: 'Clienti' }).click()
  await expect(page).toHaveURL(/\/clients/)
  expect(await larghezzaSidebar(page)).toBe(64)
  const html = await (await page.request.get('/clients')).text()
  expect(html).toContain('data-sidebar="ridotta"')
  await page.reload()
  expect(await larghezzaSidebar(page)).toBe(64)

  // the content takes the room
  const contenuto = await page.locator('main').evaluate((el) => el.getBoundingClientRect().width)
  expect(contenuto).toBeGreaterThan(1100)

  await page.getByRole('button', { name: 'Espandi la barra laterale' }).click()
  await expect.poll(() => larghezzaSidebar(page)).toBe(240)
  await page.reload()
  expect(await larghezzaSidebar(page)).toBe(240)
})

test('sotto i 768px la sidebar non c’è e non cambia niente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await expect(page.locator('aside')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Riduci la barra laterale' })).toHaveCount(0)
  const scorrimento = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(scorrimento).toBeLessThanOrEqual(0)
})
