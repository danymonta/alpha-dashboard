import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, aggiungiMesi, oggiRoma, primoDelMeseISO } from '../lib/date'
import { formatData, formatMese } from '../lib/format'
import { ID_CLOSER, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2EPeriodo'
const oggi = oggiRoma()

/** 'dd/mm/yyyy' back to 'yyyy-mm-dd', to compare dates as strings. */
function iso(data: string): string {
  const [gg, mm, aaaa] = data.trim().split('/')
  return `${aaaa}-${mm}-${gg}`
}

async function scegliIntervallo(page: Page, da: string, a: string) {
  await page.getByRole('button', { name: /^Periodo:/ }).click()
  const foglio = page.getByRole('dialog', { name: 'Periodo' })
  await foglio.getByLabel('Da', { exact: true }).fill(da)
  await foglio.getByLabel('A', { exact: true }).fill(a)
  await foglio.getByRole('button', { name: 'Mostra il periodo' }).click()
}

// One sale of our own, 50 days ago: the range filters must find it.
let nome = ''
let dataVendita = ''

test.beforeAll(async () => {
  nome = `${PREFISSO}${Date.now()}`
  const id = await creaVenditaDiProva(nome, ID_CLOSER, { valore: 700, rate: 1, giorniFa: 50 })
  const { data, error } = await dbLocale().from('sales').select('data_vendita').eq('id', id).single()
  if (error) throw error
  dataVendita = data.data_vendita
})

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
})

test('panoramica: intervallo personalizzato, KPI e confronto col periodo precedente', async ({ page }) => {
  // 40 days in the past: never a whole month, never today
  const da = aggiungiGiorni(oggi, -44)
  const a = aggiungiGiorni(oggi, -5)
  await accedi(page, 'admin')
  await expect(page).toHaveURL('/')

  await scegliIntervallo(page, da, a)
  await expect(page).toHaveURL(`/?da=${da}&a=${a}`)

  const etichetta = `${formatData(da)} – ${formatData(a)}`
  await expect(page.getByRole('button', { name: `Periodo: ${etichetta}` })).toBeVisible()

  const kpi = page.getByTestId('kpi')
  for (const voce of ['Cash incassato', 'Revenue firmata', 'Nuovi clienti', 'Rinnovi']) {
    await expect(kpi.getByText(voce, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByTestId('conto-margine')).toContainText('Margine operativo')
  await expect(kpi.getByText('vs periodo precedente').first()).toBeVisible()
  // the new clients of the chosen range, apart from the instalments of the clients already in
  await expect(page.getByTestId('cash-per-tipo')).toContainText('Nuovi clienti del periodo')
  await expect(page.getByTestId('cash-per-tipo')).toContainText('Rate di clienti già entrati')
  await expect(page.getByRole('heading', { name: 'Funnel del periodo' })).toBeVisible()
  // a past range: no live numbers of today
  await expect(page.getByTestId('oggi-team')).toHaveCount(0)

  // the sheet says what the comparison is
  await page.getByRole('button', { name: /^Periodo:/ }).click()
  const precedente = `${formatData(aggiungiGiorni(da, -40))} – ${formatData(aggiungiGiorni(da, -1))}`
  await expect(page.getByRole('dialog', { name: 'Periodo' })).toContainText(precedente)
  await page.keyboard.press('Escape')

  // the arrows move the range by its own length
  await page.getByRole('link', { name: 'Periodo precedente' }).click()
  await expect(page).toHaveURL(`/?da=${aggiungiGiorni(da, -40)}&a=${aggiungiGiorni(da, -1)}`)
  await page.getByRole('link', { name: 'Periodo successivo' }).click()
  await expect(page).toHaveURL(`/?da=${da}&a=${a}`)
})

test('panoramica: scelte rapide, stato attivo, ritorno al mese', async ({ page }) => {
  await accedi(page, 'admin')

  await page.getByRole('button', { name: /^Periodo:/ }).click()
  await page.getByRole('dialog', { name: 'Periodo' }).getByRole('link', { name: 'Oggi', exact: true }).click()
  await expect(page).toHaveURL(`/?da=${oggi}&a=${oggi}`)
  // the range includes today: the live block is there
  await expect(page.getByTestId('oggi-team')).toBeVisible()

  await page.getByRole('button', { name: /^Periodo:/ }).click()
  const foglio = page.getByRole('dialog', { name: 'Periodo' })
  await expect(foglio.getByRole('link', { name: 'Oggi', exact: true })).toHaveAttribute('aria-current', 'true')
  await foglio.getByRole('link', { name: 'Mese scorso' }).click()

  const meseScorso = aggiungiMesi(primoDelMeseISO(oggi), -1)
  await expect(page).toHaveURL(`/?mese=${meseScorso.slice(0, 7)}`)
  await expect(page.getByRole('button', { name: `Periodo: ${formatMese(meseScorso)}` })).toBeVisible()
  // a single month keeps the month arrows and names the month before
  await expect(page.getByRole('link', { name: 'Mese precedente' })).toBeVisible()
  await expect(page.getByTestId('kpi').getByText(/^vs /).first()).not.toHaveText('vs periodo precedente')
})

test('panoramica: date sbagliate restano nel foglio, URL non validi tornano al mese corrente', async ({ page }) => {
  await accedi(page, 'admin')

  await page.getByRole('button', { name: /^Periodo:/ }).click()
  const foglio = page.getByRole('dialog', { name: 'Periodo' })
  await foglio.getByLabel('Da', { exact: true }).fill(aggiungiGiorni(oggi, -1))
  await foglio.getByLabel('A', { exact: true }).fill(aggiungiGiorni(oggi, -10))
  await foglio.getByRole('button', { name: 'Mostra il periodo' }).click()
  await expect(foglio.getByRole('alert')).toHaveText('La data di inizio non può venire dopo la fine.')
  await expect(page).toHaveURL('/')
  await page.keyboard.press('Escape')

  await page.goto('/?da=2026-02-30&a=2026-03-10')
  await expect(page.getByRole('button', { name: `Periodo: ${formatMese(primoDelMeseISO(oggi))}` })).toBeVisible()
})

test('vendite: filtro per intervallo, i filtri tengono il periodo', async ({ page }) => {
  const da = aggiungiGiorni(dataVendita, -3)
  const a = aggiungiGiorni(dataVendita, 3)
  await accedi(page, 'admin')
  await page.goto('/sales')

  await scegliIntervallo(page, da, a)
  await expect(page).toHaveURL(`/sales?da=${da}&a=${a}`)

  const tabella = page.getByRole('table', { name: 'Vendite' })
  await expect(tabella.getByRole('link', { name: `${nome} Incassi` })).toBeVisible()
  // every sale listed is inside the range
  for (const cella of await tabella.locator('tbody tr td:nth-child(3)').allInnerTexts()) {
    expect(iso(cella) >= da && iso(cella) <= a, `${cella} dentro ${da} – ${a}`).toBe(true)
  }

  // the filter form keeps the range
  await page.getByLabel('Tipo', { exact: true }).selectOption('nuovo')
  await page.getByRole('button', { name: 'Filtra' }).click()
  await expect(page).toHaveURL(new RegExp(`/sales\\?da=${da}&a=${a}&tipo=nuovo`))
  await expect(tabella.getByRole('link', { name: `${nome} Incassi` })).toBeVisible()

  // the next range (same length, right after) does not contain it
  await page.getByRole('link', { name: 'Periodo successivo' }).click()
  await expect(page).toHaveURL(new RegExp(`da=${aggiungiGiorni(a, 1)}&a=${aggiungiGiorni(a, 7)}`))
  await expect(page.getByRole('link', { name: `${nome} Incassi` })).toHaveCount(0)
})

test('export CSV con intervallo: link, nome file e righe nel periodo', async ({ page }) => {
  const da = aggiungiGiorni(dataVendita, -3)
  const a = aggiungiGiorni(dataVendita, 3)
  await accedi(page, 'admin')
  await page.goto('/settings/export')

  await scegliIntervallo(page, da, a)
  await expect(page).toHaveURL(`/settings/export?da=${da}&a=${a}`)

  const link = page.getByRole('link', { name: `Vendite dal ${formatData(da)} al ${formatData(a)}` })
  await expect(link).toHaveAttribute('href', `/api/export/vendite?da=${da}&a=${a}`)

  const risposta = await page.request.get(`/api/export/vendite?da=${da}&a=${a}`)
  expect(risposta.status()).toBe(200)
  expect(risposta.headers()['content-disposition']).toContain(`vendite-${da}_${a}.csv`)
  const righe = (await risposta.text()).split('\r\n').filter(Boolean)
  expect(righe[0]).toContain('Data vendita;Cliente;Tipo')
  expect(righe.some((r) => r.includes(`${nome} Incassi`))).toBe(true)
  for (const riga of righe.slice(1)) {
    const data = iso(riga.split(';')[0])
    expect(data >= da && data <= a, `${riga} dentro ${da} – ${a}`).toBe(true)
  }

  // the monthly form still works, with the monthly file name
  const mese = oggi.slice(0, 7)
  const mensile = await page.request.get(`/api/export/costi?mese=${mese}`)
  expect(mensile.headers()['content-disposition']).toContain(`costi-${mese}.csv`)
})
