import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

/**
 * Il punteggio dei contenuti (1.39.0): la colonna e i filtri, la sezione «Punteggio» del pannello di un reel
 * (criteri, penalità, «Come rifarlo», «Aggiungi al calendario»), «Non valutato», «Valuta i reel non valutati»,
 * il video editor che legge soltanto, a 390 px, e le pagine che non parlano più di automatismi (Spunti,
 * Fathom). Sui reel inventati del seme (supabase/seeds/45_analisi_reel.sql): Claude non viene mai chiamato qui.
 * La strada intera, dal click ai passi, è in analisi-pipeline.spec.ts, contro i server finti.
 */

const REEL_82 = '17900000000000001' // SeedDemo01: punteggio 82, «Pubblicare dopo ritocchi»
const REEL_41 = '17900000000000113' // SeedReel13: punteggio 41, «Scartare o ripartire»
const REEL_ANALIZZATO_SENZA_PUNTEGGIO = '17900000000000002' // SeedPost02: analisi fatta prima del punteggio
const REEL_SENZA_ANALISI = '17900000000000008' // SeedPost08
const ANALISI_82 = 'a1000000-0000-4000-8000-000000000001'

const pannello = (page: Page) => page.getByTestId('pannello-reel')

async function apri(page: Page, url = '/marketing/analisi') {
  await page.goto(url)
  await expect(page.getByTestId('analisi-tessere')).toBeVisible({ timeout: 60_000 })
}

test('la lista: colonna «Cosa fare» con il punteggio, Da valutare, filtri per fascia e ordine per punteggio', async ({ page }) => {
  await accedi(page, 'admin')
  await apri(page)
  const elenco = page.getByTestId('elenco-reel')
  // verdict, score and analysis are one column: what to do with the reel (1.39.1)
  await expect(elenco.locator('thead').getByRole('columnheader', { name: 'Cosa fare' })).toBeVisible()
  await expect(elenco.locator('thead').getByRole('columnheader', { name: 'Punteggio' })).toHaveCount(0)
  const riga82 = elenco.locator(`tr[data-riga-reel="${REEL_82}"]`)
  await expect(riga82.getByTestId('colonna-cosa-fare')).toContainText('82')
  await expect(riga82.getByTestId('colonna-cosa-fare')).toContainText('Rifallo con qualche ritocco')
  await expect(riga82.locator('[data-punteggio="pubblicare_dopo_ritocchi"]')).toBeVisible()
  await expect(elenco.locator(`tr[data-riga-reel="${REEL_ANALIZZATO_SENZA_PUNTEGGIO}"]`).getByTestId('colonna-cosa-fare')).toContainText('Da valutare')

  const filtri = page.getByRole('region', { name: 'Filtri dell’analisi' })
  await filtri.getByRole('combobox', { name: 'Punteggio' }).selectOption({ label: 'Rifallo da capo (0-49)' })
  await expect(page).toHaveURL(/punteggio=scartare/)
  await expect(elenco.locator('tr[data-riga-reel]')).toHaveCount(1)
  await expect(elenco.locator(`tr[data-riga-reel="${REEL_41}"]`).getByTestId('colonna-cosa-fare')).toContainText('Rifallo da capo')
  await expect(elenco.locator(`tr[data-riga-reel="${REEL_41}"]`).getByTestId('punteggio-numero')).toHaveText('41')

  await filtri.getByRole('combobox', { name: 'Punteggio' }).selectOption({ label: 'Non valutati' })
  await expect(page).toHaveURL(/punteggio=non_valutato/)
  await expect(elenco.locator(`tr[data-riga-reel="${REEL_82}"]`)).toHaveCount(0)
  await expect(elenco.locator(`tr[data-riga-reel="${REEL_ANALIZZATO_SENZA_PUNTEGGIO}"]`)).toBeVisible()
  expect(await elenco.locator('tr[data-riga-reel]').count()).toBeGreaterThan(3)

  await page.goto('/marketing/analisi?ordine=punteggio')
  await expect(page.getByTestId('analisi-tessere')).toBeVisible({ timeout: 60_000 })
  const prime = await page.getByTestId('elenco-reel').locator('tr[data-riga-reel]').evaluateAll((righe) => righe.slice(0, 2).map((r) => r.getAttribute('data-riga-reel')))
  expect(prime).toEqual([REEL_82, REEL_41])
})

test('il pannello: «Cosa fare» è in cima, con la frase, il punteggio, le cose da sistemare; poi «Come rifarlo», «Perché», «Numeri»', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await accedi(page, 'admin')
  await apri(page, `/marketing/analisi?reel=${REEL_82}`)
  const p = pannello(page)
  const blocco = p.getByTestId('reel-cosa-fare')
  await expect(blocco).toBeVisible()
  await expect(blocco.getByTestId('punteggio-totale')).toHaveText('82')
  await expect(blocco.getByTestId('cosa-fare-titolo-breve')).toHaveText('Rifallo con qualche ritocco')
  // one sentence that joins the score's band and the verdict of the numbers, without saying the title twice
  await expect(blocco.getByTestId('cosa-fare-frase')).toHaveText('Un criterio sotto 7. Il pubblico l’ha premiato: spingilo.')
  await expect(blocco.getByTestId('punteggio-problemi')).toContainText('fino a')
  expect(await blocco.getByTestId('punteggio-problemi').locator('li').count()).toBeLessThanOrEqual(3)
  // the touch-ups: the action is to look at how, never the calendar; «Analizza di nuovo» is the quiet one at the bottom
  await expect(blocco.getByTestId('vedi-rifacimento')).toBeVisible()
  await expect(blocco.getByTestId('analizza-reel')).toHaveText('Analizza di nuovo')
  // the block is the first thing, before the tabs and the numbers
  const y = async (id: string) => (await p.getByTestId(id).boundingBox())?.y ?? 0
  expect(await y('reel-cosa-fare')).toBeLessThan(await y('punteggio-rifacimento'))

  // the tabs, «Come rifarlo» first: instructions, three hooks with «Copia», the script, the caption, the expected score
  const schede = p.getByRole('tablist', { name: 'Dettagli del reel' })
  await expect(schede.getByRole('tab')).toHaveText(['Come rifarlo', 'Perché', 'Numeri'])
  await expect(schede.getByRole('tab', { name: 'Come rifarlo' })).toHaveAttribute('aria-selected', 'true')
  const rifacimento = p.getByTestId('punteggio-rifacimento')
  await expect(rifacimento.getByTestId('punteggio-hook')).toHaveCount(3)
  await expect(rifacimento.getByTestId('punteggio-script')).toContainText('Hook:')
  await expect(rifacimento.getByTestId('punteggio-atteso')).toContainText('Punteggio atteso dopo il rifacimento: 90 su 100.')
  // the ideas of the analysis say they are others: not the rewrite of this reel
  await expect(p.getByTestId('reel-idee')).toContainText('Altre idee dallo stesso tema')
  const copia = rifacimento.getByTestId('punteggio-hook').first().locator('button')
  // the first tap may come before the page is hydrated (a development server compiles on the first visit): tap again
  await expect(copia).toHaveAccessibleName(/^Copia l’hook: /)
  await expect(async () => {
    await copia.click()
    await expect(copia).toHaveAttribute('data-esito', 'copiato', { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Schiena forte senza sbarra, con tre oggetti.')
  await expect(rifacimento.getByRole('button', { name: 'Copia lo script riscritto' })).toBeVisible()
  await expect(rifacimento.getByRole('button', { name: 'Copia la caption riscritta' })).toBeVisible()

  // «Perché»: the criteria, the weakest first and open, with the passage, the reason and the correction; the others closed
  await schede.getByRole('tab', { name: 'Perché' }).click()
  await expect(page).toHaveURL(/scheda=perche/)
  const criteri = p.getByTestId('punteggio-criteri')
  await expect(criteri.getByTestId('punteggio-criterio')).toHaveCount(10)
  const primo = criteri.getByTestId('punteggio-criterio').first()
  await expect(primo.locator('details')).toHaveAttribute('open', '')
  await expect(primo).toContainText('Peso')
  const hook = criteri.locator('[data-criterio="H"]')
  await expect(hook).toContainText('8/10')
  await expect(hook.locator('details')).not.toHaveAttribute('open', '')
  await hook.locator('summary').click()
  await expect(hook).toContainText('Peso 20 · 16 punti')
  await expect(hook).toContainText('«Niente sbarra? Nessun problema.»')
  await expect(hook).toContainText('Correzione:')
  await expect(p.getByTestId('reel-perche')).toContainText('Valutato come Consapevolezza (MOF), dal Reel Type del calendario')
  await expect(p.getByTestId('reel-perche')).toContainText('Fascia della guida: Pubblicare dopo ritocchi (80-89)')

  // «Numeri»: the figures, the verdict of the numbers, the leads
  await schede.getByRole('tab', { name: 'Numeri' }).click()
  await expect(p.getByTestId('reel-numeri')).toContainText('12.480')
  await expect(p.getByTestId('reel-verdetto')).toContainText('Spingere')

  // the touch-up button leads to «Come rifarlo»
  await blocco.getByTestId('vedi-rifacimento').click()
  await expect(schede.getByRole('tab', { name: 'Come rifarlo' })).toHaveAttribute('aria-selected', 'true')
  await expect(p.getByTestId('punteggio-rifacimento')).toBeVisible()
})

test('un reel da rifare (41): la fascia, la frase unica e l’azione «Aggiungi il rifacimento al calendario» in cima', async ({ page }) => {
  await accedi(page, 'admin')
  await apri(page, `/marketing/analisi?reel=${REEL_41}`)
  const blocco = pannello(page).getByTestId('reel-cosa-fare')
  await expect(blocco.getByTestId('cosa-fare-titolo-breve')).toHaveText('Rifallo da capo')
  await expect(blocco.getByTestId('cosa-fare-frase')).toHaveText('L’idea non è allineata a fase, ICP o tono. I numeri confermano: sotto la mediana.')
  await expect(blocco.getByTestId('aggiungi-rifacimento')).toHaveText('Aggiungi il rifacimento al calendario')
  await expect(blocco.getByTestId('vedi-rifacimento')).toHaveCount(0)
  await expect(blocco.getByTestId('punteggio-problemi').locator('li')).toHaveCount(3)
})

test('«Aggiungi al calendario» dal rifacimento crea un Reel Topic con lo script riscritto, una volta sola', async ({ page }) => {
  const db = dbLocale()
  const tolgo = async () => {
    await db.from('marketing_contenuti').delete().eq('da_analisi', ANALISI_82).eq('da_idea', 9)
  }
  await tolgo()
  try {
    await accedi(page, 'marketing')
    await apri(page, `/marketing/analisi?reel=${REEL_82}`)
    const p = pannello(page)
    // a touch-up (82): the button closes «Come rifarlo», the first tab; for the bands that ask to redo it is in the block on top
    await p.getByTestId('punteggio-rifacimento').getByTestId('aggiungi-rifacimento').click()
    await expect(page.locator('[data-sonner-toast]').getByText(/^«Rifacimento: .*» è nel calendario, da girare\.$/)).toBeVisible()
    await expect(p.getByTestId('punteggio-rifacimento').getByRole('link', { name: 'Già nel calendario' })).toBeVisible()
    await expect(p.getByTestId('aggiungi-rifacimento')).toHaveCount(0)

    const { data } = await db
      .from('marketing_contenuti')
      .select('id, nome, tipo, stato, post_date, reel_type, bozza, messaggio, commenti, da_analisi, da_idea')
      .eq('da_analisi', ANALISI_82)
      .eq('da_idea', 9)
      .single()
    expect(data).toMatchObject({ tipo: 'reel', stato: 'not_started', post_date: null, reel_type: 'education' })
    expect(data?.nome).toMatch(/^Rifacimento: /)
    expect(data?.bozza).toContain('Hook: Schiena forte senza sbarra')
    expect(data?.messaggio).toContain('punteggio 82 su 100')
    expect(data?.commenti).toContain('Punteggio atteso dopo il rifacimento: 90.')

    // after a reload it is still «Già nel calendario» (read from the database), and the database refuses a second one
    await page.reload()
    await expect(pannello(page).getByTestId('aggiungi-rifacimento')).toHaveCount(0)
    const doppio = await db.from('marketing_contenuti').insert({ tipo: 'reel', nome: 'Doppione', da_analisi: ANALISI_82, da_idea: 9 })
    expect(doppio.error?.code).toBe('23505')
  } finally {
    await tolgo()
  }
})

test('«Non valutato»: un reel analizzato prima del punteggio dice «Dai il punteggio», uno senza analisi «Analizza»; il video editor legge soltanto', async ({ page, browser }) => {
  await accedi(page, 'admin')
  await apri(page, `/marketing/analisi?reel=${REEL_ANALIZZATO_SENZA_PUNTEGGIO}`)
  let p = pannello(page)
  await expect(p.getByTestId('cosa-fare-titolo-breve')).toHaveText('Da valutare')
  await expect(p.getByTestId('punteggio-vuoto')).toContainText('analizzato prima del punteggio')
  await expect(p.getByTestId('analizza-reel')).toHaveText('Dai il punteggio')

  await page.goto(`/marketing/analisi?reel=${REEL_SENZA_ANALISI}`)
  p = pannello(page)
  await expect(p.getByTestId('punteggio-vuoto')).toContainText('Premendo «Analizza» Claude guarda il video')
  await expect(p.getByTestId('punteggio-vuoto')).toContainText('costo stimato circa 0,30 $')
  await expect(p.getByTestId('analizza-reel')).toHaveText('Analizza')

  await page.goto(`/marketing/analisi?reel=${REEL_82}`)
  await expect(pannello(page).getByTestId('analizza-reel')).toHaveText('Analizza di nuovo')

  const contesto = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', locale: 'it-IT' })
  const editor = await contesto.newPage()
  await accedi(editor, 'editor')
  await editor.goto(`/marketing/analisi?reel=${REEL_82}`)
  await expect(editor.getByTestId('analisi-tessere')).toBeVisible({ timeout: 60_000 })
  const pe = pannello(editor)
  await expect(pe.getByTestId('punteggio-totale')).toHaveText('82')
  await expect(pe.getByTestId('analizza-reel')).toHaveCount(0)
  await expect(editor.getByTestId('valuta-tutti')).toHaveCount(0)
  await editor.goto(`/marketing/analisi?reel=${REEL_ANALIZZATO_SENZA_PUNTEGGIO}`)
  await expect(pannello(editor).getByTestId('punteggio-vuoto')).toContainText('Le analisi le chiedono l’admin e il marketing')
  await contesto.close()
})

test('«Valuta i reel non valutati»: la conferma dice quanti, il costo stimato e quanto resta del giorno; annullare non parte niente', async ({ page }) => {
  const db = dbLocale()
  const inizio = new Date().toISOString()
  const pulisci = async () => {
    await db.from('marketing_analisi').delete().eq('stato', 'in_coda').gte('created_at', inizio)
    await db.from('instagram_letture').delete().eq('stato', 'in_coda').eq('motivo', 'richiesta').gte('created_at', inizio)
  }
  await pulisci()
  try {
    await accedi(page, 'admin')
    await apri(page)
    const blocco = page.getByTestId('valuta-tutti')
    await expect(blocco.getByTestId('valuta-tutti-apri')).toContainText('Valuta i reel non valutati (')
    // the reels of the list (30 days) with no score, the most recent first, at most the day's ten
    const n = Number(/\((\d+)\)/.exec((await blocco.getByTestId('valuta-tutti-apri').innerText()) ?? '')?.[1])
    expect(n).toBeGreaterThan(3)
    const quanti = Math.min(n, 10)
    await blocco.getByTestId('valuta-tutti-apri').click()
    const conferma = blocco.getByTestId('valuta-tutti-conferma')
    await expect(conferma).toContainText(`Claude analizzerà e darà il punteggio a ${quanti} reel`)
    await expect(conferma).toContainText(`circa ${(quanti * 0.3).toLocaleString('it-IT', { minimumFractionDigits: 2 })} $`)
    await expect(conferma).toContainText('Oggi restano 10 richieste su 10')
    await conferma.getByRole('button', { name: 'Annulla' }).click()
    await expect(conferma).toHaveCount(0)
    const { count: nulla } = await db.from('marketing_analisi').select('id', { count: 'exact', head: true }).eq('stato', 'in_coda').gte('created_at', inizio)
    expect(nulla).toBe(0)

    await blocco.getByTestId('valuta-tutti-apri').click()
    await blocco.getByTestId('valuta-tutti-conferma-bottone').click()
    await expect(page.locator('[data-sonner-toast]').getByText(`${quanti} reel in coda`)).toBeVisible()
    await expect.poll(async () => (await db.from('marketing_analisi').select('id', { count: 'exact', head: true }).eq('stato', 'in_coda').gte('created_at', inizio)).count).toBe(quanti)

    // what is queued no longer counts as «non valutato»: the page offers only the rest, and what the day still allows
    await page.reload()
    await expect(page.getByTestId('analisi-tessere')).toBeVisible({ timeout: 60_000 })
    if (n > quanti) {
      await page.getByTestId('valuta-tutti-apri').click()
      await expect(page.getByTestId('valuta-tutti-conferma')).toContainText(`Oggi restano ${10 - quanti} richieste su 10`)
    } else {
      await expect(page.getByTestId('valuta-tutti')).toHaveCount(0)
    }
  } finally {
    await pulisci()
  }
})

test('a 390 px: il punteggio, i criteri e il rifacimento non allargano la pagina e hanno bottoni da 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await apri(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const card = page.getByTestId('elenco-reel').locator(`li[data-riga-reel="${REEL_82}"]`)
  await expect(card).toContainText('82')
  await expect(card).toContainText('Rifallo con qualche ritocco')
  // at 390 px the filters are one button, not four rows
  await expect(page.getByTestId('filtri-apri')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Periodo' })).toHaveCount(0)
  await page.getByTestId('filtri-apri').click()
  const foglio = page.getByTestId('filtri-foglio')
  await foglio.getByRole('combobox', { name: 'Verdetto' }).selectOption('cambiare')
  await expect(page).toHaveURL(/verdetto=cambiare/)
  await expect(page.getByTestId('filtri-apri')).toContainText('Filtri (1)')
  await foglio.getByRole('button', { name: 'Fatto' }).click()
  await expect(foglio).toBeHidden()
  await expect(page.getByTestId('filtri-apri')).toBeFocused()
  await page.goto('/marketing/analisi')
  await page.goto(`/marketing/analisi?reel=${REEL_82}`)
  const p = pannello(page)
  await expect(p.getByTestId('punteggio-totale')).toBeVisible({ timeout: 60_000 })
  await expect(p.getByTestId('punteggio-rifacimento')).toBeVisible()
  await p.getByRole('tab', { name: 'Perché' }).click()
  await expect(p.getByTestId('punteggio-criteri')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await p.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  for (const b of await p.getByRole('button').all()) {
    if (!(await b.isVisible())) continue
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
  }
})

test('Post di Instagram e il blocco del contenuto: il punteggio del reel collegato, il link all’analisi, niente per un carosello', async ({ page }) => {
  await accedi(page, 'editor')
  await page.goto('/marketing/instagram')
  await expect(page.getByRole('heading', { level: 1, name: 'Post di Instagram' })).toBeVisible({ timeout: 60_000 })
  const collegati = page.locator('section[aria-labelledby="titolo-collegati"]')
  const riga = collegati.locator('[data-post="SeedDemo01"]')
  await expect(riga.getByTestId('punteggio-post')).toContainText('82 · Rifallo con qualche ritocco')
  await expect(riga.getByTestId('punteggio-post').getByRole('link', { name: 'Apri l’analisi' })).toHaveAttribute('href', new RegExp(`reel=${REEL_82}`))
  // a linked reel never scored: «Non valutato», with the link to its analysis
  await expect(collegati.locator('[data-post="SeedPost02"]').getByTestId('punteggio-post')).toContainText('Non valutato')

  // the content panel's block
  const { data: contenuto } = await dbLocale().from('marketing_contenuti').select('id').eq('instagram_shortcode', 'SeedDemo01').single()
  await page.goto(`/marketing/contenuti?contenuto=${contenuto?.id}`)
  const blocco = page.getByRole('dialog').getByTestId('punteggio-post')
  await expect(blocco).toContainText('82 · Rifallo con qualche ritocco', { timeout: 60_000 })
})

test('Spunti e Fathom non parlano più di automatismi: nessun lunedì, un solo interruttore', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/marketing/spunti')
  await expect(page.getByRole('heading', { level: 1, name: 'Spunti' })).toBeVisible({ timeout: 60_000 })
  const testo = await page.locator('main').innerText()
  expect(testo).toContain('Non partono mai da soli')
  expect(testo).not.toMatch(/lunedì/i)
  await page.goto('/settings/fathom')
  await expect(page.getByTestId('fathom-analisi')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('fathom-spunti')).toHaveCount(0)
  expect(await page.locator('main').innerText()).not.toMatch(/Spunti automatici|ogni lunedì/i)
})
