import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

/**
 * «Analisi» (1.36.0): the reels with their numbers, the verdict, the panel with
 * Claude's analysis and the ideas for the calendar. On the seed's invented
 * reels (supabase/seeds/28 and 45); Claude and Instagram are never called here
 * (the request of an analysis is only queued: the steps are driven by
 * analisi-pipeline.spec.ts against the fake servers).
 */

const REEL_SPINGERE = '17900000000000001' // SeedDemo01: ready analysis, 2 ideas, the first already in the calendar
const REEL_SENZA_ANALISI = '17900000000000008' // SeedPost08: read from the cover, no analysis
const CONTENUTO_IDEA_GIA = 'ccccccc2-0000-4000-8000-000000000001'
const NOME_IDEA_NUOVA = 'Parte 2: la sbarra in casa, quale comprare'

const pannello = (page: Page) => page.getByTestId('pannello-reel')

async function apri(page: Page, url = '/marketing/analisi') {
  await page.goto(url)
  // the page's own content: with the panel open the rest of the page is aria-hidden (a heading would not be found)
  await expect(page.getByTestId('analisi-tessere')).toBeVisible({ timeout: 60_000 })
}

test('la scheda «Analisi», le tessere, i filtri e la lista dei reel', async ({ page }) => {
  await accedi(page, 'admin')
  await apri(page)
  const schede = page.getByRole('navigation', { name: 'Sezioni del Marketing' })
  await expect(schede.getByRole('link', { name: 'Analisi' })).toHaveAttribute('aria-current', 'page')

  const tessere = page.getByTestId('analisi-tessere')
  await expect(tessere).toContainText('Reel del periodo')
  await expect(tessere).toContainText('Views a 3 giorni')
  await expect(tessere).toContainText('Lead dai DM')
  await expect(tessere).toContainText('Da cambiare')

  const elenco = page.getByTestId('elenco-reel')
  await expect(elenco.getByText('Trazioni senza sbarra: tre alternative con quello che hai in casa').first()).toBeVisible()
  // the verdict has words and an icon, never colour alone
  await expect(elenco.locator('[data-verdetto="spingere"]').first()).toContainText('Spingere')
  await expect(elenco.locator('[data-verdetto="cambiare"]').first()).toContainText('Cambiare')

  // the filters have visible labels and live in the address
  const filtri = page.getByRole('region', { name: 'Filtri dell’analisi' })
  for (const etichetta of ['Periodo', 'Verdetto', 'Punteggio', 'Ordina per']) await expect(filtri.getByRole('combobox', { name: etichetta })).toBeVisible()
  await filtri.getByRole('combobox', { name: 'Verdetto' }).selectOption('cambiare')
  await expect(page).toHaveURL(/verdetto=cambiare/)
  await expect(elenco.locator('[data-verdetto="spingere"]')).toHaveCount(0)
  await expect(elenco.locator('[data-verdetto="cambiare"]').first()).toBeVisible()
  await filtri.getByRole('button', { name: 'Togli i filtri' }).click()
  await expect(page).toHaveURL(/\/marketing\/analisi$/)
})

test('il pannello di un reel: numeri, verdetto, analisi di Claude, idee, parlato; Esc e Indietro lo chiudono', async ({ page }) => {
  await accedi(page, 'admin')
  await apri(page)
  await page.getByTestId('elenco-reel').getByRole('link', { name: /Trazioni senza sbarra/ }).first().click()
  await expect(page).toHaveURL(new RegExp(`reel=${REEL_SPINGERE}`))
  const p = pannello(page)
  await expect(p.getByRole('heading', { name: /Trazioni senza sbarra/ })).toBeVisible()
  // the answer comes first: what to do with the reel, with the score
  await expect(p.getByTestId('reel-cosa-fare')).toContainText('Rifallo con qualche ritocco')
  await expect(p.getByTestId('reel-cosa-fare')).toContainText('Il pubblico l’ha premiato: spingilo.')

  // «Come rifarlo» is open first: the ideas of the analysis, the one already in the calendar says so, the other can be added
  const idee = p.getByTestId('reel-idea')
  await expect(idee).toHaveCount(2)
  await expect(idee.nth(0).getByRole('link', { name: 'Già nel calendario' })).toHaveAttribute('href', `/marketing/contenuti/${CONTENUTO_IDEA_GIA}`)
  await expect(idee.nth(1).getByTestId('aggiungi-idea')).toBeVisible()

  // «Perché»: Claude's analysis; «Numeri»: the figures, the verdict, the leads, what Claude saw and what is said
  await p.getByTestId('scheda-perche').click()
  await expect(page).toHaveURL(/scheda=perche/)
  const analisi = p.getByTestId('reel-analisi-pronta')
  await expect(p.getByTestId('reel-perche')).toContainText('Cosa ha funzionato')
  await expect(p.getByTestId('reel-perche')).toContainText('Da migliorare')
  await expect(analisi).toBeVisible()
  await p.getByTestId('scheda-numeri').click()
  await expect(p.getByTestId('reel-numeri')).toContainText('12.480')
  await expect(p.getByTestId('reel-numeri')).toContainText('della mediana')
  await expect(p.getByTestId('reel-verdetto')).toContainText('Spingere')
  await expect(p.getByTestId('reel-lead-valore')).toContainText('4 DM · 3 in target · 1 call')
  await expect(p.getByTestId('reel-fonti')).toContainText('31 fotogrammi')
  await p.getByTestId('reel-parlato-blocco').locator('summary').click()
  await expect(p.getByTestId('reel-parlato')).toBeVisible()
  await p.getByTestId('reel-scheda-visiva').locator('summary').click()
  await expect(p.getByTestId('reel-scheda-visiva')).toContainText('Gancio')

  // Esc closes and the focus goes back to the link that opened it
  await page.keyboard.press('Escape')
  await expect(p).toBeHidden()
  await expect(page).not.toHaveURL(/reel=|scheda=/)
  await expect(page.getByTestId('elenco-reel').getByRole('link', { name: /Trazioni senza sbarra/ }).first()).toBeFocused()

  // Back after opening closes too, Forward opens it again; the direct link opens it at once
  await page.getByTestId('elenco-reel').getByRole('link', { name: /Trazioni senza sbarra/ }).first().click()
  await expect(p).toBeVisible()
  await page.goBack()
  await expect(p).toBeHidden()
  await page.goForward()
  await expect(p).toBeVisible()
  await page.goto(`/marketing/analisi?reel=${REEL_SPINGERE}`)
  await expect(p.getByRole('heading', { name: /Trazioni senza sbarra/ })).toBeVisible()
})

test('«Aggiungi al calendario» crea un Reel Topic con lo script e l’origine, e il contenuto dice da dove viene', async ({ page }) => {
  const db = dbLocale()
  const tolgo = async () => {
    await db.from('marketing_contenuti').delete().eq('nome', NOME_IDEA_NUOVA)
  }
  await tolgo()
  try {
    await accedi(page, 'marketing')
    await apri(page, `/marketing/analisi?reel=${REEL_SPINGERE}`)
    const p = pannello(page)
    const idea = p.getByTestId('reel-idea').nth(1)
    await idea.getByTestId('aggiungi-idea').click()
    await expect(page.locator('[data-sonner-toast]').getByText(`«${NOME_IDEA_NUOVA}» è nel calendario, da girare.`)).toBeVisible()
    await expect(idea.getByRole('link', { name: 'Già nel calendario' })).toBeVisible()

    const { data } = await db
      .from('marketing_contenuti')
      .select('id, tipo, stato, post_date, bozza, commenti, reel_type, formato, da_analisi, da_idea')
      .eq('nome', NOME_IDEA_NUOVA)
      .single()
    expect(data).toMatchObject({ tipo: 'reel', stato: 'not_started', post_date: null, reel_type: 'education', formato: 'show_and_tell', da_idea: 1 })
    expect(data?.bozza).toContain('Hook:')
    expect(data?.bozza).toContain('CTA:')
    expect(data?.commenti).toContain('Idea di Claude')

    // the content says where it was born
    await page.goto(`/marketing/contenuti/${data?.id}`)
    await expect(page.getByTestId('nato-da-idea')).toContainText('Nato da un’idea di Claude')
    await page.getByTestId('nato-da-idea').getByRole('link', { name: 'Apri l’analisi' }).click()
    await expect(pannello(page).getByRole('heading', { name: /Trazioni senza sbarra/ })).toBeVisible()
  } finally {
    await tolgo()
  }
})

test('chi può chiedere un’analisi: admin e marketing sì, il video editor la legge soltanto; gli altri ruoli non vedono la pagina', async ({ page, browser }) => {
  await accedi(page, 'marketing')
  await apri(page, `/marketing/analisi?reel=${REEL_SENZA_ANALISI}`)
  await expect(pannello(page).getByTestId('analizza-reel')).toBeVisible()
  await expect(pannello(page).getByTestId('reel-senza-analisi')).toBeVisible()

  for (const [ruolo, nega] of [['editor', false], ['setter', true], ['closer', true], ['coach', true]] as const) {
    const contesto = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', locale: 'it-IT' })
    const altra = await contesto.newPage()
    await accedi(altra, ruolo)
    await altra.goto(`/marketing/analisi?reel=${REEL_SENZA_ANALISI}`)
    if (nega) {
      await expect(altra.getByTestId('analisi-tessere')).toHaveCount(0)
      const api = await altra.request.get(`/api/marketing/analisi/${REEL_SENZA_ANALISI}`)
      expect(api.status()).toBe(403)
    } else {
      await expect(altra.getByTestId('analisi-tessere')).toBeVisible({ timeout: 60_000 })
      await expect(altra.getByTestId('pannello-reel')).toBeVisible()
      await expect(altra.getByTestId('analizza-reel')).toHaveCount(0)
      await expect(altra.getByTestId('pannello-reel')).toContainText('Le analisi le chiedono l’admin e il marketing')
    }
    await contesto.close()
  }
})

test('«Analizza» mette il reel in coda: lettura e analisi, con le frasi della coda; due volte no', async ({ page }) => {
  const db = dbLocale()
  const prima = await db.from('instagram_letture').select('*').eq('media_id', REEL_SENZA_ANALISI).maybeSingle()
  const pulisci = async () => {
    await db.from('marketing_analisi').delete().eq('media_id', REEL_SENZA_ANALISI).neq('stato', 'pronta')
    if (prima.data) await db.from('instagram_letture').upsert(prima.data)
  }
  await pulisci()
  try {
    await accedi(page, 'admin')
    await apri(page, `/marketing/analisi?reel=${REEL_SENZA_ANALISI}`)
    const p = pannello(page)
    await p.getByTestId('analizza-reel').click()
    await expect(page.locator('[data-sonner-toast]').getByText(/^Analisi e punteggio in coda/)).toBeVisible()
    await expect(p.getByTestId('reel-in-corso')).toContainText('In coda')
    // the button is gone while it is at work: a second request is never offered
    await expect(p.getByTestId('analizza-reel')).toHaveCount(0)
    const { data } = await db.from('marketing_analisi').select('stato, motivo').eq('media_id', REEL_SENZA_ANALISI)
    expect(data?.filter((a) => a.stato === 'in_coda')).toHaveLength(1)
    // and the database says no to the same request made by hand
    const doppia = await page.request.post('/api/marketing/analisi/richiedi', {
      data: { media_id: REEL_SENZA_ANALISI },
      headers: { origin: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
    })
    expect(doppia.status()).toBe(422)
    expect((await doppia.json()).errore).toBe('Claude sta già analizzando questo reel.')
  } finally {
    await pulisci()
  }
})

test('«Parlato» in Post di Instagram, aperto solo al tocco', async ({ page }) => {
  await accedi(page, 'editor')
  await page.goto('/marketing/instagram')
  await expect(page.getByRole('heading', { level: 1, name: 'Post di Instagram' })).toBeVisible({ timeout: 60_000 })
  const collegati = page.locator('section[aria-labelledby="titolo-collegati"]')
  const riga = collegati.locator('[data-post="SeedDemo01"]')
  await expect(riga).toBeVisible()
  await expect(riga.getByTestId('parlato')).toHaveCount(0)
  await riga.getByTestId('parlato-apri').click()
  await expect(riga.getByTestId('parlato')).toBeVisible()
  await expect(riga.getByTestId('parlato')).not.toContainText('Carico il parlato')
  await expect(riga.getByTestId('parlato').getByRole('link', { name: 'Apri l’analisi del reel' })).toHaveAttribute('href', /reel=17900000000000001/)
})

test('a 390 px: niente scroll di lato, bottoni da 44 px, il pannello a tutto schermo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await apri(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const schede = page.getByRole('navigation', { name: 'Sezioni del Marketing' })
  for (const link of await schede.getByRole('link').all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
  }
  await page.getByTestId('elenco-reel').getByRole('link', { name: /Trazioni senza sbarra/ }).first().click()
  const p = pannello(page)
  await expect(p.getByTestId('reel-cosa-fare')).toBeVisible()
  await expect(p.getByRole('tab', { name: 'Come rifarlo' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  for (const t of await p.getByRole('tab').all()) expect((await t.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
  const chiudi = page.getByRole('button', { name: 'Chiudi' })
  expect((await chiudi.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
  for (const b of await p.getByRole('button').all()) {
    if (!(await b.isVisible())) continue
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
  }
  await chiudi.click()
  await expect(p).toBeHidden()
})
