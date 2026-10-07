import { expect, test } from '@playwright/test'

import { LEGENDA_CLOSER } from '../lib/metriche/legenda'
import { ID_CLOSER } from './db'
import { accedi } from './utenti'

// the seed has calls and sales from April to September 2026
const ANNO = 'da=2026-01-01&a=2026-12-31'

test('closer: l’admin apre Closer dalla barra laterale e vede le giornate', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/setting?${ANNO}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Setter' })).toBeVisible()

  // no tabs on top (07/10/2026): Setter and Closer are two items of the sidebar
  await expect(page.getByRole('navigation', { name: 'Setter e closer' })).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  await nav.getByRole('link', { name: /^Closer(, \d+ esit[io] da registrare)?$/ }).click()
  await expect(page).toHaveURL('/setting/closer')
  await page.goto(`/setting/closer?${ANNO}`)

  await expect(page.getByRole('heading', { level: 1, name: 'Closer' })).toBeVisible()
  await expect(nav.getByRole('link', { name: /^Closer/ })).toHaveAttribute('aria-current', 'page')

  const kpi = page.getByTestId('kpi-closer')
  for (const etichetta of ['Cash', 'Revenue', 'Call svolte', 'Qualificate', 'No show', 'Show rate', 'Close rate', 'Chiuse']) {
    await expect(kpi.getByText(etichetta, { exact: true })).toBeVisible()
  }
  await expect(kpi).toContainText('€')

  // every tile explains itself: its "i" opens the definition
  await kpi.getByRole('button', { name: 'Cosa conta «Show rate»' }).click()
  await expect(page.getByRole('dialog', { name: 'Show rate' })).toContainText(LEGENDA_CLOSER.show_rate.spiegazione)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Show rate' })).toHaveCount(0)

  const tabella = page.getByTestId('giornate-closer')
  const intestazioni = tabella.locator('thead th')
  await expect(intestazioni).toHaveText([
    'Giorno',
    'Svolte',
    'Qualificate',
    'No show',
    // the legend's label: not the setter's follow up in DM
    LEGENDA_CLOSER.follow_up.etichetta,
    'Cancellate',
    'Chiuse',
    'Cash',
    'Revenue',
  ])
  await expect(tabella.locator('tbody tr').first()).toBeVisible()
  await expect(tabella.locator('tbody')).toContainText('€')
  await expect(tabella.locator('tfoot')).toContainText('Totale')
  // short headers ("Svolte", as the tile's "Call svolte"), the full name and definition on hover
  await expect(intestazioni.nth(1)).toHaveAttribute('title', `Call svolte: ${LEGENDA_CLOSER.call.spiegazione}`)

  // all the definitions together at the bottom, closed until tapped
  const legenda = page.getByTestId('legenda')
  await expect(legenda.getByText(LEGENDA_CLOSER.cancellate.spiegazione)).toBeHidden()
  await legenda.getByText('Cosa significa ogni numero').click()
  for (const voce of [LEGENDA_CLOSER.cash, LEGENDA_CLOSER.no_show, LEGENDA_CLOSER.follow_up, LEGENDA_CLOSER.cancellate]) {
    await expect(legenda.getByText(voce.spiegazione, { exact: true })).toBeVisible()
  }

  // more than one closer in the seed (Dany and Lorenzo): the filter is there and keeps the period
  await page.getByLabel('Closer', { exact: true }).selectOption({ label: 'Lorenzo Closer' })
  await expect(page).toHaveURL(new RegExp(`/setting/closer\\?.*closer=${ID_CLOSER}`))
  await expect(page).toHaveURL(/da=2026-01-01&a=2026-12-31/)
  await expect(tabella.locator('tbody tr').first()).toBeVisible()

  // the day is filled from its calls: the button opens today, every day opens its own page
  await expect(page.getByTestId('compila-giornata')).toHaveAttribute('href', `/setting/closer/giorno?closer=${ID_CLOSER}`)
  const giorno = tabella.locator('tbody tr').first().getByRole('rowheader').getByRole('link')
  const data = (await giorno.innerText()).trim().split('/').reverse().join('-')
  await giorno.click()
  await expect(page).toHaveURL(`/setting/closer/giorno?data=${data}&closer=${ID_CLOSER}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Compila la giornata' })).toBeVisible()
  await expect(page.getByLabel('Closer', { exact: true })).toHaveValue(ID_CLOSER)
  // the footnote says where the numbers come from
  await page.goto(`/setting/closer?${ANNO}`)
  await expect(page.getByText(/dall’esito registrato su ogni call/)).toBeVisible()
})

test('closer: sul telefono un giorno è una riga chiusa, il totale viene prima ed è aperto', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto(`/setting/closer?${ANNO}`)

  const telefono = page.getByTestId('giornate-closer-telefono')
  await expect(telefono).toBeVisible()
  await expect(page.getByTestId('giornate-closer')).toBeHidden()

  // the total first, open, with every column (zeros too) and the full labels
  const totale = telefono.getByTestId('giornata-totale')
  await expect(totale).toHaveAttribute('open', '')
  const C = LEGENDA_CLOSER
  for (const voce of [C.call, C.qualificate, C.no_show, C.follow_up, C.cancellate, C.chiuse, C.cash, C.revenue]) {
    await expect(totale.getByText(voce.etichetta, { exact: true })).toBeVisible()
  }
  // money in a row keeps its cents
  await expect(totale.getByRole('definition').last()).toHaveText(/^-?\d{1,3}(\.\d{3})*,\d{2}\s€$/)

  // one closed line per day: date · svolte · chiuse · cash, said in full to screen readers
  const giorni = telefono.getByTestId('giornata')
  const primo = giorni.first()
  await expect(primo.locator('details')).not.toHaveAttribute('open')
  const riassunto = primo.locator('summary')
  await expect(riassunto).toHaveText(/^\d{2}\/\d{2}\/\d{4}Call svolte: \d+Chiuse: \d+Cash: -?[\d.]+,\d{2}\s€$/)
  const box = await riassunto.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeLessThan(60)

  // opened: its numbers, the zeros left out, and the way to that day's page
  await riassunto.click()
  await expect(primo.locator('details')).toHaveAttribute('open', '')
  const valori = await primo.locator('details > div dd').allTextContents()
  expect(valori.length).toBeGreaterThan(0)
  for (const v of valori) expect(v.trim()).not.toMatch(/^0(,00\s€)?$/)
  const data = (await primo.getAttribute('aria-label'))!.split('/').reverse().join('-')
  await expect(primo.getByRole('link', { name: 'Apri la giornata' })).toHaveAttribute(
    'href',
    `/setting/closer/giorno?data=${data}`,
  )

  // the page never scrolls sideways at 390px
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('closer: il closer vede i suoi numeri, senza la scheda Setter, e non apre il setting', async ({ page }) => {
  await accedi(page, 'closer')
  await page.goto(`/setting/closer?${ANNO}`)

  await expect(page.getByRole('heading', { level: 1, name: 'I miei numeri' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Setter e closer' })).toHaveCount(0)
  await expect(page.getByLabel('Closer', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('kpi-closer')).toBeVisible()
  await expect(page.getByTestId('giornate-closer').locator('tbody tr').first()).toBeVisible()
  await expect(page.getByTestId('compila-giornata')).toHaveAttribute('href', '/setting/closer/giorno')
  // the page is in his navigation
  await expect(page.getByRole('link', { name: 'I miei numeri' }).first()).toBeVisible()

  await page.goto('/setting')
  await expect(page).toHaveURL('/calls')
})

test('closer: il setter legge la pagina del closer, ma non apre la giornata', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto(`/setting/closer?${ANNO}`)
  // every setter's calls, read only (07/10/2026): no day to fill
  await expect(page.getByRole('heading', { level: 1, name: 'Closer' })).toBeVisible()
  await expect(page.getByTestId('kpi-closer')).toBeVisible()
  await expect(page.getByTestId('compila-giornata')).toHaveCount(0)
  await page.goto('/setting/closer/giorno')
  await expect(page).toHaveURL('/today')
})
