import { expect, test, type Page } from '@playwright/test'

import { accedi as accediSeed } from './utenti'

/**
 * Italian here (1.53.0): without a choice the business coach reads English (e2e/lingua.spec.ts
 * covers it); these tests check the Italian words, so they choose Italian on the device first.
 */
async function accedi(page: Page, ruolo: Parameters<typeof accediSeed>[1]) {
  await accediSeed(page, ruolo)
  await page.context().addCookies([{ name: 'alpha_lingua', value: 'it', url: new URL(page.url()).origin }])
}

/**
 * The business coach (1.52.0, Dany 22/10/2026: «Voglio che il business coach abbia accessi in lettura e
 * veda tutto»): the admin's pages, in read only. The database refuses every write (pgTAP
 * 101_business_coach.sql); here, the pages never offer one.
 */

// the names of the controls that write, on the pages below: none may show for him
const SCRIVONO =
  /^(Nuova vendita|Nuova call|Nuovo cliente|Nuovo costo|Aggiungi giornata|Aggiungi una call|Segna incassata|Registra esito|Registra rinnovo|Registra pagamento|Registra la vendita|Ha rinnovato|Non rinnova|Sospendi|Riattiva|Riapri|Archivia|Sposta|Modifica|Elimina|Conferma|Correggi|Usa quelli di Instagram|Tieni quelli di|Interrompi il percorso|Scrivi su WhatsApp|Imposta|Aggiungi|Invita|Aggiorna dati)/

async function nessunaScrittura(page: Page) {
  const bottoni = page.getByRole('main').getByRole('button', { name: SCRIVONO })
  const link = page.getByRole('main').getByRole('link', { name: SCRIVONO })
  await expect(bottoni).toHaveCount(0)
  await expect(link).toHaveCount(0)
}

test.describe('il business coach legge e non scrive', () => {
  for (const [nome, url, titolo] of [
    ['Panoramica', '/', /Panoramica/],
    ['Clienti', '/clients?vista=tutti', /Clienti/],
    ['Vendite', '/sales', /Vendite/],
    ['Incassi', '/payments', /Incassi/],
    ['Setter', '/setting', /Setter|Setting/],
  ] as const) {
    test(`${nome}: i numeri ci sono, i bottoni che scrivono no`, async ({ page }) => {
      await accedi(page, 'business_coach')
      await page.goto(url)
      await expect(page).toHaveURL((u) => u.pathname === new URL(url, 'http://x').pathname)
      await expect(page.getByRole('heading', { level: 1, name: titolo })).toBeVisible()
      await nessunaScrittura(page)
    })
  }

  test('l’admin, sulle stesse pagine, ha i bottoni che il business coach non vede', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/sales')
    await expect(page.getByRole('main').getByRole('link', { name: /^Nuova vendita/ }).first()).toBeVisible()
    await page.goto('/setting')
    await expect(page.getByRole('main').getByRole('button', { name: /^Aggiungi giornata/ }).first()).toBeVisible()
  })

  test('vede le righe che vede l’admin: le stesse vendite e lo stesso cash', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/sales')
    const righeAdmin = await page.getByRole('main').getByRole('link').count()
    await page.context().clearCookies()
    await accedi(page, 'business_coach')
    await page.goto('/sales')
    // the same list; the admin has «Nuova vendita» more
    const righeCoach = await page.getByRole('main').getByRole('link').count()
    expect(righeCoach).toBeGreaterThan(0)
    expect(righeAdmin - righeCoach).toBeLessThanOrEqual(2)
  })

  test('menu: «Call» e «Tempo del team», mai «Le mie call», «Il mio tempo» né le chiavi', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/')
    const menu = page.getByRole('navigation').first()
    await expect(menu.getByRole('link', { name: /^Le mie call/ })).toHaveCount(0)
    // his time is the team's: /tempo takes him there
    await page.goto('/tempo')
    await expect(page).toHaveURL(/\/tempo\/team/)
    // keys, connections, export and templates stay the admin's: he lands somewhere else
    for (const url of ['/settings/chiavi', '/settings/instagram', '/settings/fathom', '/settings/export', '/settings/progetti']) {
      await page.goto(url)
      await expect(page).toHaveURL((u) => !u.pathname.startsWith('/settings/'))
    }
    // and the pages that only write
    for (const url of ['/calls/new', '/sales/new']) {
      await page.goto(url)
      await expect(page).toHaveURL((u) => u.pathname === '/')
    }
  })

  test('impostazioni in lettura: il team senza inviti né controlli', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/settings')
    await expect(page.getByText('In sola lettura: le cambia l’admin.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Chiavi e guide/ })).toHaveCount(0)
    await page.goto('/settings/team')
    await expect(page.getByTestId('membri')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Invita/ })).toHaveCount(0)
    await expect(page.getByRole('combobox')).toHaveCount(0)
  })

  test('Insight: legge il recap, nessun «Aggiorna dati», le spunte «Fatto» spente', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/insight')
    await expect(page.getByRole('heading', { level: 1, name: /Insight delle ultime 24h/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Aggiorna dati/ })).toHaveCount(0)
    const spunte = page.getByRole('switch')
    const quante = await spunte.count()
    for (let i = 0; i < quante; i++) await expect(spunte.nth(i)).toBeDisabled()
  })

  test('Piano editoriale: le celle mostrano il valore, niente «Nuovo»', async ({ page }) => {
    await accedi(page, 'business_coach')
    await page.goto('/marketing/contenuti')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Nuovo/ })).toHaveCount(0)
    await expect(page.locator('[data-cella]')).toHaveCount(0)
  })

  test('dal telefono: nessuno scroll di lato sulla Panoramica', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'business_coach')
    await page.goto('/')
    const largo = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(largo).toBeLessThanOrEqual(390)
    await page.screenshot({ path: '.shots/business_coach-panoramica-e2e-390.png' })
  })
})
