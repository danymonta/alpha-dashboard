import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

// 1.33.0, Dany: "il quanto più smooth possibile in qualsiasi click e transizione".
// The prefetch on intent does not exist in dev: the production measures prove it
// (spec 1.33.0 A12). Here: the page cache of 30 s never hides what one wrote,
// the overview refreshes itself, motion follows "Riduci movimento", sheets are
// made for the finger and Alfire arrives when it is needed.

const PREFISSO = 'E2EFluidita'

test.afterEach(async () => {
  await dbLocale().from('expenses').delete().like('descrizione', `${PREFISSO}%`)
})

function oggiRoma() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
}

/** A click on an item of the sidebar, as a person does it (never page.goto: the cache counts). */
async function vaiCon(page: Page, href: string) {
  await page.locator(`nav[aria-label="Navigazione principale"] a[href="${href}"]`).click()
  await expect(page).toHaveURL(href)
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
}

test('la Panoramica riaperta con un clic mostra quello che è cambiato mentre eri altrove', async ({ page }) => {
  await accedi(page, 'admin')
  // a plain load, as opening the app: the page enters the browser cache like any visit
  await page.goto('/')
  const margine = page.getByTestId('conto-margine')
  await expect(page.getByTestId('stato-live')).toHaveAttribute('data-stato', 'live')
  const prima = await margine.textContent()

  await vaiCon(page, '/payments')
  // a cost of today, written by someone else while Dany is on Incassi
  const { error } = await dbLocale()
    .from('expenses')
    .insert({ data: oggiRoma(), categoria: 'software', descrizione: `${PREFISSO} Panoramica`, importo: 1234.56, ricorrente: false })
  expect(error).toBeNull()

  // back within 30 s: the page comes from the browser cache, then reads its numbers again
  await vaiCon(page, '/')
  await expect.poll(() => margine.textContent(), { timeout: 15_000 }).not.toBe(prima)
})

test('dopo una scrittura di Alfire le pagine viste da poco mostrano il dato nuovo', async ({ page }) => {
  test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')
  await dbLocale().from('expenses').delete().like('descrizione', 'E2EAlfire%')
  await accedi(page, 'admin')
  await vaiCon(page, '/expenses')
  await expect(page.getByText('E2EAlfire Canva')).toHaveCount(0)
  await vaiCon(page, '/payments')

  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill('Registra un costo di Canva da 12,99')
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  const scheda = pannello.getByTestId('alfire-conferma')
  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: costo.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pannello).toBeHidden()

  // Costi was seen less than 30 s ago: without rivalidaTutto it would come back old
  await vaiCon(page, '/expenses')
  await expect(page.getByText('E2EAlfire Canva').first()).toBeVisible()
  await dbLocale().from('expenses').delete().like('descrizione', 'E2EAlfire%')
})

test('Alfire si apre al primo tocco e la conversazione resta cambiando pagina', async ({ page }) => {
  test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await expect(pannello).toBeVisible()
  // the focus is inside the panel, as before the chat was downloaded on demand
  await expect.poll(() => pannello.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  await pannello.getByRole('button', { name: 'Quanto ho incassato questo mese, e quanto è rinnovo?' }).click()
  await expect(pannello.getByText('Questo mese hai incassato 6.950,00 €.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pannello).toBeHidden()

  await vaiCon(page, '/clients')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  await expect(page.getByTestId('alfire').getByText('Questo mese hai incassato 6.950,00 €.')).toBeVisible()
})

test.describe('con «Riduci movimento»', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })

  test('i fogli non scorrono e la X è grande quanto un dito', async ({ page }) => {
    await accedi(page, 'admin')
    await page.getByRole('button', { name: /^Altro/ }).click()
    const foglio = page.locator('[data-slot="sheet-content"]')
    await expect(foglio).toBeVisible()

    const durata = await foglio.evaluate((el) => {
      const s = getComputedStyle(el)
      return Math.max(...s.transitionDuration.split(',').map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000)))
    })
    expect(durata).toBeLessThan(1)

    const chiudi = foglio.getByRole('button', { name: 'Chiudi' })
    const x = (await chiudi.boundingBox())!
    expect(x.width).toBeGreaterThanOrEqual(44)
    expect(x.height).toBeGreaterThanOrEqual(44)
    // the title wraps before the X: they never overlap
    const titolo = (await foglio.getByRole('heading', { name: 'Altro' }).boundingBox())!
    expect(titolo.x + titolo.width).toBeLessThanOrEqual(x.x)
    await chiudi.click()
    await expect(foglio).toBeHidden()
  })
})

test('la navigazione dice dove sei e il tutorial la trova', async ({ page }) => {
  await accedi(page, 'admin')
  const nav = page.locator('nav[aria-label="Navigazione principale"]')
  await expect(nav.locator('a[href="/"]')).toHaveAttribute('aria-current', 'page')
  await expect(nav.locator('a[href="/"]')).toHaveAttribute('data-tour', 'nav-/')
  await vaiCon(page, '/clients')
  await expect(nav.locator('a[href="/clients"]')).toHaveAttribute('aria-current', 'page')
  await expect(nav.locator('a[href="/"]')).not.toHaveAttribute('aria-current', 'page')
})

test('a 390 px nessuna pagina scorre di lato', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  for (const percorso of ['/', '/clients', '/payments', '/setting', '/setting/closer', '/rinnovi', '/task', '/progetti']) {
    await page.goto(percorso)
    await expect(page.locator('main h1').first()).toBeVisible()
    const largo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(largo, percorso).toBeLessThanOrEqual(0)
  }
})
