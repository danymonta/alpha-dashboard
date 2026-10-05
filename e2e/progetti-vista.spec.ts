import { expect, test, type Page } from '@playwright/test'

import { attendiPagina } from './pm-db'
import { accedi } from './utenti'

/**
 * Progetti remembers the view (Dany, 05/10/2026): the tap on Elenco or
 * Timeline is kept in a cookie of the browser; /progetti from the menu opens
 * the view chosen last, ?vista in the address always wins.
 */
function vista(page: Page) {
  return page.getByRole('group', { name: 'Vista dei progetti' })
}

async function vistaAttiva(page: Page, nome: 'Elenco' | 'Timeline') {
  await expect(vista(page).getByRole('link', { name: nome })).toHaveAttribute('aria-current', 'page')
}

async function cookieVista(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === 'alpha_vista_progetti')
}

test('la vista scelta resta: dal menu torna la timeline, ?vista=elenco vince', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await accedi(page, 'admin')
  await page.goto('/progetti')
  await attendiPagina(page)
  // nothing remembered yet: the cards
  await vistaAttiva(page, 'Elenco')
  expect(await cookieVista(page)).toBeUndefined()

  await vista(page).getByRole('link', { name: 'Timeline' }).click()
  await expect(page).toHaveURL(/\/progetti\?vista=timeline$/)
  await vistaAttiva(page, 'Timeline')
  const ricordata = await cookieVista(page)
  expect(ricordata).toMatchObject({ value: 'timeline', path: '/progetti', sameSite: 'Lax' })
  // about a year
  expect(ricordata!.expires * 1000 - Date.now()).toBeGreaterThan(360 * 86_400_000)

  // somewhere else, then Progetti from the menu: the timeline again
  await page.goto('/task')
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Progetti' }).click()
  await expect(page).toHaveURL(/\/progetti$/)
  await attendiPagina(page)
  await vistaAttiva(page, 'Timeline')
  await expect(page.getByTestId('timeline-grafico').or(page.getByText('Nessun progetto', { exact: false })).first()).toBeVisible()

  // the address wins over the memory, and the filters keep it
  await page.goto('/progetti?vista=elenco')
  await attendiPagina(page)
  await vistaAttiva(page, 'Elenco')
  await page.getByLabel('Stato').selectOption('tutti')
  await expect(page).toHaveURL(/stato=tutti/)
  expect(new URL(page.url()).searchParams.get('vista')).toBe('elenco')
  await vistaAttiva(page, 'Elenco')
  // a link to the address only does not change the memory
  expect((await cookieVista(page))?.value).toBe('timeline')

  // from the remembered timeline, "Elenco" switches back and is remembered
  await page.goto('/progetti')
  await attendiPagina(page)
  await vistaAttiva(page, 'Timeline')
  await vista(page).getByRole('link', { name: 'Elenco' }).click()
  await expect(page).toHaveURL(/\/progetti\?vista=elenco$/)
  await vistaAttiva(page, 'Elenco')
  expect((await cookieVista(page))?.value).toBe('elenco')
  await page.goto('/progetti')
  await attendiPagina(page)
  await vistaAttiva(page, 'Elenco')
})

test.describe('dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('la timeline ricordata si riapre anche lì, senza scroll laterale della pagina', async ({ page }) => {
    test.setTimeout(90_000)
    await accedi(page, 'coach')
    await page.goto('/progetti')
    await attendiPagina(page)
    await vista(page).getByRole('link', { name: 'Timeline' }).click()
    await expect(page).toHaveURL(/vista=timeline/)
    await page.goto('/progetti')
    await attendiPagina(page)
    await vistaAttiva(page, 'Timeline')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
