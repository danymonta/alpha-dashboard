import { expect, test, type Page } from '@playwright/test'

import { formatData, formatEuro } from '../lib/format'
import { ID_ADMIN, ID_CLOSER, PRODOTTO_3_MESI, creaCallDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// Setter and Closer in the sidebar instead of "Setting" with two tabs; the setter
// opens the closer's numbers; the badge of the outcomes still to record (07/10/2026)

// one word: the client created from the closed call keeps it as first name
const PREFISSO = 'E2ESetterCloser'
// a day with nothing else on it: the closer's numbers of that day are only this test's
const GIORNO = '2026-02-17'
const PERIODO = `da=${GIORNO}&a=${GIORNO}`
const VALORE = 1234.56
const PRIMA_RATA = 617.28

// a run stopped halfway leaves nothing behind for the next one
test.beforeAll(async () => {
  await pulisciVendite(PREFISSO)
})

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
})

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Navigazione principale' })
}

/** How many past calls of the admin still wait for their outcome, straight from the database. */
async function esitiDellAdmin(): Promise<number> {
  const { count, error } = await dbLocale()
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('closer_id', ID_ADMIN)
    .eq('stato', 'programmata')
    .lt('programmata_il', new Date().toISOString())
  if (error) throw error
  return count ?? 0
}

function nomeConEsiti(etichetta: string, numero: number): RegExp {
  return new RegExp(`^${etichetta}, ${numero} ${numero === 1 ? 'esito' : 'esiti'} da registrare$`)
}

/**
 * A discovery call booked by the admin as setter (not Loris), held and closed by
 * Lorenzo on GIORNO, with its "nuovo" sale and the first instalment paid.
 */
async function callChiusaDiUnAltroSetter() {
  const db = dbLocale()
  const nome = `${PREFISSO} ${Date.now()}`
  const { data: lead, error: e1 } = await db
    .from('leads')
    .insert({ nome, setter_id: ID_ADMIN, fonte: 'dm_outbound', stato: 'cliente', created_by: ID_ADMIN })
    .select('id')
    .single()
  if (e1) throw e1
  const { data: call, error: e2 } = await db
    .from('calls')
    .insert({
      lead_id: lead.id,
      setter_id: ID_ADMIN,
      closer_id: ID_CLOSER,
      tipo: 'discovery',
      // 15:00 in Rome, in February (UTC+1)
      programmata_il: `${GIORNO}T14:00:00Z`,
      stato: 'svolta',
      qualificata: true,
      esito: 'chiusa',
      created_by: ID_ADMIN,
      created_at: `${GIORNO}T08:00:00Z`,
    })
    .select('id')
    .single()
  if (e2) throw e2
  const { data: cliente, error: e3 } = await db
    .from('clients')
    .insert({ nome, cognome: 'Closer', lead_id: lead.id, setter_id: ID_ADMIN, closer_id: ID_CLOSER, fonte: 'dm_outbound' })
    .select('id')
    .single()
  if (e3) throw e3
  // a path already over: the paid instalment opens no project
  const { data: vendita, error: e4 } = await db
    .from('sales')
    .insert({
      client_id: cliente.id,
      product_id: PRODOTTO_3_MESI,
      tipo: 'nuovo',
      call_id: call.id,
      setter_id: ID_ADMIN,
      closer_id: ID_CLOSER,
      data_vendita: GIORNO,
      data_inizio: GIORNO,
      data_fine: '2026-05-16',
      valore_contratto: VALORE,
      numero_rate: 2,
    })
    .select('id')
    .single()
  if (e4) throw e4
  const { error: e5 } = await db
    .from('payments')
    .update({ stato: 'incassata', incassato_il: GIORNO, importo_incassato: PRIMA_RATA, metodo: 'bonifico' })
    .eq('sale_id', vendita.id)
    .eq('numero_rata', 1)
  if (e5) throw e5
}

test('l’admin ha Setter e Closer nella barra laterale, ognuna accesa sulla sua pagina', async ({ page }) => {
  await accedi(page, 'admin')
  const nav = sidebar(page)
  await expect(nav.getByRole('link', { name: 'Setting', exact: true })).toHaveCount(0)
  const setter = nav.getByRole('link', { name: 'Setter', exact: true })
  // the closer's item may carry the number of the admin's own outcomes to record
  const closer = nav.getByRole('link', { name: /^Closer(, \d+ esit[io] da registrare)?$/ })
  await expect(setter).toBeVisible()
  await expect(closer).toBeVisible()

  await setter.click()
  await expect(page).toHaveURL('/setting')
  await expect(page.getByRole('heading', { level: 1, name: 'Setter' })).toBeVisible()
  await expect(setter).toHaveAttribute('aria-current', 'page')
  await expect(closer).not.toHaveAttribute('aria-current', 'page')
  // no tabs on top any more: the two pages are two items
  await expect(page.getByRole('navigation', { name: 'Setter e closer' })).toHaveCount(0)
  // the DM insights live in a Claude artifact: a link out, in a new tab (08/10/2026)
  const insight = page.getByRole('link', { name: 'Insight delle ultime 24h (si apre in una nuova scheda)' })
  await expect(insight).toHaveAttribute('href', 'https://claude.ai/artifact/PKRVEjLi5FMv9RL1rWYHyM')
  await expect(insight).toHaveAttribute('target', '_blank')

  await closer.click()
  await expect(page).toHaveURL('/setting/closer')
  await expect(page.getByRole('heading', { level: 1, name: 'Closer' })).toBeVisible()
  await expect(closer).toHaveAttribute('aria-current', 'page')
  await expect(setter).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation', { name: 'Setter e closer' })).toHaveCount(0)

  // the day's page keeps Closer lit
  await page.getByTestId('compila-giornata').click()
  await expect(page).toHaveURL('/setting/closer/giorno')
  await expect(closer).toHaveAttribute('aria-current', 'page')
  await expect(setter).not.toHaveAttribute('aria-current', 'page')
})

test('il setter apre Closer e vede i numeri di tutti i setter, euro compresi, in sola lettura', async ({ page }) => {
  // exactly one call on that day
  await pulisciVendite(PREFISSO)
  await callChiusaDiUnAltroSetter()
  await accedi(page, 'setter')

  // from his sidebar: the item has no number, the setter records no outcome
  const voce = sidebar(page).getByRole('link', { name: 'Closer', exact: true })
  await voce.click()
  await expect(page).toHaveURL('/setting/closer')
  await expect(page.getByRole('heading', { level: 1, name: 'Closer' })).toBeVisible()
  await expect(voce).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(/di tutti i setter, giorno per giorno/).first()).toBeVisible()
  // read only: no day to fill, no calls to record, no outcome button
  await expect(page.getByTestId('compila-giornata')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Compila la giornata' })).toHaveCount(0)
  await expect(page.getByTestId('esiti-closer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Registra esito' })).toHaveCount(0)
  await expect(page.getByTestId('conteggio-esiti')).toHaveCount(0)
  // every closer, or one: Dany and Lorenzo
  await expect(page.getByLabel('Closer', { exact: true })).toHaveValue('')

  // the day of a call booked by the admin and closed by Lorenzo, with its sale
  await page.goto(`/setting/closer?${PERIODO}`)
  const kpi = page.getByTestId('kpi-closer')
  await expect(kpi).toContainText(formatEuro(PRIMA_RATA))
  await expect(kpi).toContainText(formatEuro(VALORE))
  const tabella = page.getByTestId('giornate-closer')
  const riga = tabella.locator('tbody tr')
  await expect(riga).toHaveCount(1)
  // Giorno, Svolte, Qualificate, No show, Follow up, Cancellate, Chiuse, Cash, Revenue
  await expect(riga.getByRole('rowheader')).toHaveText(formatData(GIORNO))
  await expect(riga.getByRole('cell')).toHaveText(['1', '1', '0', '0', '0', '1', formatEuro(PRIMA_RATA), formatEuro(VALORE)])
  // the days do not open "Compila la giornata": it stays the closer's and the admin's
  await expect(tabella.getByRole('link')).toHaveCount(0)
  // no name of the lead, no note: only the numbers of the day
  await expect(page.getByText(PREFISSO)).toHaveCount(0)

  // one closer at a time: Lorenzo has it, Dany has nothing that day
  await page.getByLabel('Closer', { exact: true }).selectOption({ label: 'Lorenzo Closer' })
  await expect(page).toHaveURL(new RegExp(`closer=${ID_CLOSER}`))
  await expect(riga.getByRole('cell').last()).toHaveText(formatEuro(VALORE))
  await page.getByLabel('Closer', { exact: true }).selectOption({ label: 'Dany Montagnolo' })
  await expect(page.getByText('Nessuna call o vendita in questo periodo')).toBeVisible()

  // the day's page stays closed to him
  await page.goto('/setting/closer/giorno')
  await expect(page).toHaveURL('/today')
})

test('il setter sul telefono: i giorni non aprono la giornata, niente scroll di lato', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await callChiusaDiUnAltroSetter()
  await accedi(page, 'setter')
  await page.goto(`/setting/closer?${PERIODO}`)
  const telefono = page.getByTestId('giornate-closer-telefono')
  await expect(telefono).toBeVisible()
  const giorno = telefono.getByTestId('giornata').first()
  await giorno.locator('summary').click()
  await expect(giorno.locator('details')).toHaveAttribute('open', '')
  await expect(giorno.getByRole('link', { name: 'Apri la giornata' })).toHaveCount(0)
  // "Closer" is in "Altro" on the phone
  await page.getByRole('navigation', { name: 'Navigazione' }).getByRole('button', { name: 'Altro' }).click()
  await expect(page.getByRole('dialog', { name: 'Altro' }).getByRole('link', { name: 'Closer' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '.shots/setter-closer-390.png', fullPage: true })
})

test('il coach non apre la pagina del closer', async ({ page }) => {
  await accedi(page, 'coach')
  await page.goto('/setting/closer')
  await expect(page).toHaveURL('/task')
})

test('l’admin vede quanti esiti deve registrare: in cima a Closer e nel menu, e il numero cala', async ({ page }) => {
  // two pages and an outcome on a busy dev server
  test.setTimeout(60_000)
  const firma = Date.now()
  const vecchia = `${PREFISSO} Ieri ${firma}`
  const recente = `${PREFISSO} Stamattina ${firma}`
  await creaCallDiProva(vecchia, ID_ADMIN, 26)
  await creaCallDiProva(recente, ID_ADMIN, 1)

  await accedi(page, 'admin')
  await page.goto('/setting/closer')
  const quante = await esitiDellAdmin()
  expect(quante).toBeGreaterThanOrEqual(2)

  // the number next to "Le mie call" and "Closer", said in words to screen readers
  const nav = sidebar(page)
  await expect(nav.getByRole('link', { name: nomeConEsiti('Le mie call', quante) })).toBeVisible()
  await expect(nav.getByRole('link', { name: nomeConEsiti('Closer', quante) })).toBeVisible()
  await expect(nav.getByTestId('conteggio-esiti').first()).toHaveText(String(quante))

  // on top of the page, his calls to record, the oldest first
  const sezione = page.getByTestId('da-registrare')
  await expect(sezione.getByRole('heading', { name: `Da registrare (${quante})` })).toBeVisible()
  await expect(sezione.getByRole('article')).toHaveCount(Math.min(quante, 50))
  const testi = await sezione.getByRole('article').allInnerTexts()
  const iVecchia = testi.findIndex((t) => t.includes(vecchia))
  const iRecente = testi.findIndex((t) => t.includes(recente))
  expect(iVecchia).toBeGreaterThanOrEqual(0)
  expect(iRecente).toBeGreaterThan(iVecchia)

  // a no show in two taps: the call leaves the list and the number goes down
  const scheda = sezione.getByRole('article', { name: recente })
  await scheda.getByRole('button', { name: 'Registra esito' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'No show', exact: true }).click()
  await expect(page.getByText(`${recente}: no show`)).toBeVisible()
  await expect(sezione.getByRole('article', { name: recente })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: nomeConEsiti('Le mie call', quante - 1) })).toBeVisible()
  await expect(nav.getByRole('link', { name: nomeConEsiti('Closer', quante - 1) })).toBeVisible()

  // another closer chosen: never his calls on top, never his number, and the description says so
  await page.goto(`/setting/closer?closer=${ID_CLOSER}`)
  await expect(page.getByTestId('esiti-closer')).toHaveCount(0)
  await expect(page.getByText('Le call e le vendite del closer scelto, giorno per giorno')).toBeVisible()
  await expect(page.getByText('Le tue call da registrare in cima')).toHaveCount(0)
  await page.goto(`/setting/closer?closer=${ID_ADMIN}`)
  await expect(page.getByTestId('da-registrare')).toBeVisible()
})

test('una call che passa con l’app aperta: al cambio di pagina il numero coincide con «Da registrare»', async ({ page }) => {
  test.setTimeout(60_000)
  await accedi(page, 'admin')
  await page.goto('/sales')
  const nav = sidebar(page)
  const prima = await esitiDellAdmin()
  // the layout's count, when the app opened
  await expect(nav.getByRole('link', { name: prima > 0 ? nomeConEsiti('Closer', prima) : /^Closer$/ })).toBeVisible()

  // one of his calls passes while the app is open (the clock, or a call booked from another device)
  await creaCallDiProva(`${PREFISSO} Durante ${Date.now()}`, ID_ADMIN, 1)
  const dopo = prima + 1

  // a client navigation: the shared layout does not render again, the browser counts again
  await nav.getByRole('link', { name: /^Closer/ }).click()
  await expect(page).toHaveURL(/\/setting\/closer$/)
  await expect(page.getByTestId('da-registrare').getByRole('heading', { name: `Da registrare (${dopo})` })).toBeVisible()
  await expect(nav.getByRole('link', { name: nomeConEsiti('Closer', dopo) })).toBeVisible()
  await expect(nav.getByRole('link', { name: nomeConEsiti('Le mie call', dopo) })).toBeVisible()
  await expect(nav.getByTestId('conteggio-esiti').first()).toHaveText(String(dopo))
})

test('a 390px il numero sta su «Le mie call» e su «Altro», e la pagina non scorre di lato', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await creaCallDiProva(`${PREFISSO} Telefono ${Date.now()}`, ID_ADMIN, 3)
  await accedi(page, 'admin')
  await page.goto('/setting/closer')
  const quante = await esitiDellAdmin()

  const barra = page.getByRole('navigation', { name: 'Navigazione' })
  await expect(barra.getByRole('link', { name: nomeConEsiti('Le mie call', quante) })).toBeVisible()
  // "Closer" sits in "Altro": the button carries the number too
  const altro = barra.getByRole('button', { name: nomeConEsiti('Altro', quante) })
  await expect(altro).toBeVisible()
  const box = await barra.getByRole('link', { name: /^Le mie call/ }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '.shots/admin-closer-esiti-390.png', fullPage: true })

  await altro.click()
  const foglio = page.getByRole('dialog', { name: 'Altro' })
  await expect(foglio.getByRole('link', { name: nomeConEsiti('Closer', quante) })).toHaveAttribute('aria-current', 'page')
})

test('il closer: le sue call da registrare in cima a I miei numeri, mai quelle dell’admin', async ({ page }) => {
  const nome = `${PREFISSO} Lorenzo ${Date.now()}`
  const dellAdmin = `${PREFISSO} DiDany ${Date.now()}`
  await creaCallDiProva(nome, ID_CLOSER, 2)
  await creaCallDiProva(dellAdmin, ID_ADMIN, 2)
  await accedi(page, 'closer')
  await page.goto('/setting/closer')

  await expect(page.getByRole('heading', { level: 1, name: 'I miei numeri' })).toBeVisible()
  await expect(page.getByTestId('esiti-closer').getByRole('article', { name: nome })).toBeVisible()
  await expect(page.getByText(dellAdmin)).toHaveCount(0)
  await expect(sidebar(page).getByRole('link', { name: /^I miei numeri, \d+ esit[io] da registrare$/ })).toBeVisible()
})
