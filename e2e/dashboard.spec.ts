import { expect, test } from '@playwright/test'

import { oggiRoma } from '../lib/date'
import { ID_ADMIN, ID_SETTER, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

const PREFISSO = 'E2EDashboard'

test.afterAll(async () => {
  const db = dbLocale()
  await pulisciVendite(PREFISSO)
  await db.from('commission_payouts').delete().eq('note', PREFISSO)
})

test('incassi: la rata in ritardo si incassa dall’elenco e passa tra le incassate', async ({ page }) => {
  const nome = `${PREFISSO}${Date.now()}`
  await creaVenditaDiProva(nome, ID_ADMIN, { valore: 600, rate: 2, giorniFa: 40 })
  await accedi(page, 'admin')

  await page.goto('/payments')
  const rata = page.getByRole('listitem', { name: `${nome} Incassi rata 1` })
  await expect(rata).toContainText('giorni di ritardo')

  await rata.getByRole('button', { name: 'Segna incassata' }).click()
  await expect(page.getByText('Rata 1 incassata · 300,00')).toBeVisible()
  await expect(page.getByRole('listitem', { name: `${nome} Incassi rata 1` })).toHaveCount(0)

  await page.getByRole('link', { name: /Incassate nel mese/ }).click()
  await expect(page.getByRole('listitem', { name: `${nome} Incassi rata 1` })).toBeVisible()
})

test('setting: metriche per setter e report del mese', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/setting')
  const metriche = page.getByTestId('metriche-setter')
  const card = metriche.getByRole('region', { name: 'Loris Setter' })
  await expect(card.getByRole('heading', { name: 'Loris Setter' })).toBeVisible()
  // two sources, never mixed: the daily report and the calls recorded in the app
  const dalReport = card.getByRole('heading', { name: 'Dal report' }).locator('..')
  const dalleCall = card.getByRole('heading', { name: 'Dalle call' }).locator('..')
  for (const etichetta of ['DM outbound', 'DM inbound', 'Follow up', 'DM totali', 'Conversazioni', 'Tasso conv.', 'Call prenotate', 'Tasso pren.', 'DM per call']) {
    await expect(dalReport.getByText(etichetta, { exact: true })).toBeVisible()
  }
  // the legend's labels, in full: the bookings by source say they come from DM
  for (const etichetta of ['Prenotate da DM inbound', 'Prenotate da DM outbound', 'Call svolte', 'Show rate', 'Close rate']) {
    await expect(dalleCall.getByText(etichetta, { exact: true })).toBeVisible()
  }
  await expect(dalReport).not.toContainText('Prenotate da')
  await expect(dalleCall).toContainText('il giorno in cui la call è stata fissata')

  // one setter: his card takes the whole row, DM totali is its big number
  if ((await metriche.getByRole('region').count()) === 1) {
    expect(Math.round((await card.boundingBox())!.width)).toBe(Math.round((await metriche.boundingBox())!.width))
  }
  await expect(card.getByTestId('dm-totali')).toHaveCSS('font-size', '30px')

  // the setter books discovery calls; strategy calls of past days (history) are
  // inside "Call prenotate", and the page says how many only when there are some
  const oggi = oggiRoma()
  const { data: report, error } = await dbLocale()
    .from('setter_daily_reports')
    .select('setter_id, data, strategy_prenotate')
    .gte('data', `${oggi.slice(0, 7)}-01`)
    .lte('data', oggi)
  if (error) throw error
  const strategyTutti = report.reduce((s, r) => s + r.strategy_prenotate, 0)
  const strategyLoris = report.filter((r) => r.setter_id === ID_SETTER).reduce((s, r) => s + r.strategy_prenotate, 0)
  if (strategyLoris > 0) {
    await expect(card.getByTestId('nota-strategy')).toHaveText(`di cui ${strategyLoris} strategy dallo storico`)
  } else {
    await expect(card).not.toContainText(/strategy/i)
  }

  const tabella = page.getByRole('table', { name: 'Report giornalieri del mese' })
  await expect(tabella).toBeVisible()
  // the report's fields in the setter's order, full names; DM totali right after its parts,
  // the strategy calls of the history next to the discovery ones, only when there are some
  await expect(tabella.locator('thead th')).toHaveText([
    'Giorno',
    'Setter',
    'DM outbound',
    'DM inbound',
    'Follow up',
    'DM totali',
    'Conversazioni',
    'Call proposte',
    'Discovery prenotate',
    ...(strategyTutti > 0 ? ['Strategy (storico)'] : []),
    'Discovery svolte',
    'Call qualificate',
    'Contenuto',
    'Correggi',
  ])
  // the totals come from SQL (giornate_setter): they match the rows, and DM totali its parts
  const numero = (testo: string) => Number(testo.replace(/\./g, '').trim())
  const colonna = async (indice: number) =>
    (await tabella.locator('tbody tr').evaluateAll((righe, i) => righe.map((r) => r.children[i]?.textContent ?? ''), indice)).map(numero)
  const piede = tabella.locator('tfoot tr').first()
  await expect(piede.locator('th')).toHaveText('Totale')
  const totali = (await piede.locator('th, td').allTextContents()).map(numero)
  for (const indice of [2, 3, 4, 5, 6, ...(strategyTutti > 0 ? [9] : [])]) {
    expect(totali[indice]).toBe((await colonna(indice)).reduce((a, b) => a + b, 0))
  }
  expect(totali[5]).toBe(totali[2] + totali[3] + totali[4])
  if (strategyTutti > 0) expect(totali[9]).toBe(strategyTutti)

  // every number explains itself: its "i", then all of them at the bottom
  await card.getByRole('button', { name: 'Cosa conta «DM totali»' }).click()
  await expect(page.getByRole('dialog', { name: 'DM totali' })).toContainText('DM inbound + DM outbound + follow up')
  await page.keyboard.press('Escape')
  const legenda = page.getByTestId('legenda')
  await legenda.getByText('Cosa significa ogni numero').click()
  await expect(legenda.getByText('Prenotate da DM inbound', { exact: true })).toBeVisible()

  // Loris's phone: one card per day, DM totali first
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('listitem').filter({ hasText: 'DM totali' }).first()).toHaveText(
    /DM totali \d+ · conv\. \d+ · prenotate \d+ · svolte \d+/,
  )

  // a day without strategy calls: no column, no "di cui", anywhere
  const conStrategy = new Set(report.filter((r) => r.strategy_prenotate > 0).map((r) => r.data))
  const senza = report.find((r) => !conStrategy.has(r.data))
  if (senza) {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(`/setting?da=${senza.data}&a=${senza.data}`)
    await expect(metriche).toBeVisible()
    await expect(metriche).not.toContainText(/strategy/i)
    await expect(page.getByRole('table', { name: 'Report giornalieri del periodo' }).locator('thead')).not.toContainText(/strategy/i)
  }
})

test('provvigioni: saldo, registrazione del pagamento, storico', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/commissions')
  await expect(page.getByTestId(`saldo-${ID_SETTER}`)).toContainText('€')

  await page.getByRole('button', { name: 'Registra pagamento' }).first().click()
  const foglio = page.getByRole('dialog')
  await foglio.getByLabel('Importo').fill('12,34')
  await foglio.getByLabel('Note (facoltative)').fill(PREFISSO)
  await foglio.getByRole('button', { name: 'Registra pagamento' }).click()

  await expect(page.getByText('Pagamento a Loris Setter registrato')).toBeVisible()
  await expect(page.getByText('12,34 €').filter({ visible: true }).first()).toBeVisible()
})

test('i miei numeri: il setter vede i suoi totali', async ({ page }) => {
  await accedi(page, 'setter')
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'I miei numeri' }).click()

  await expect(page.getByTestId('mie-provvigioni')).toContainText('€')
  // the commissions card points to the per-client detail
  await expect(page.getByTestId('mie-provvigioni').getByRole('link', { name: 'vedi i tuoi clienti' })).toHaveAttribute(
    'href',
    '#titolo-miei-clienti',
  )

  // two blocks, each naming its source: his report and the calls in the app
  const setting = page.getByTestId('miei-numeri-setting')
  const call = page.getByTestId('miei-numeri-call')
  await expect(setting.getByTestId('fonte')).toContainText('Dal tuo report')
  await expect(call.getByTestId('fonte')).toContainText('Dalle call in agenda')
  const dalReport = [
    'DM outbound',
    'DM inbound',
    'Follow up',
    'DM totali',
    'Conversazioni',
    'Tasso di conversazione',
    'Call proposte',
    'Call prenotate',
    'Tasso di prenotazione',
    'DM per call prenotata',
  ]
  const dalleCall = [
    'Prenotate da DM inbound',
    'Prenotate da DM outbound',
    'In agenda nel periodo',
    'Call svolte',
    'No show',
    'Show rate',
    'Chiuse',
    'Close rate',
  ]
  for (const etichetta of dalReport) await expect(setting.getByText(etichetta, { exact: true })).toBeVisible()
  for (const etichetta of dalleCall) await expect(call.getByText(etichetta, { exact: true })).toBeVisible()
  // bookings by source are not a split of "Call prenotate": they sit with the calls, by booking day
  await expect(setting).not.toContainText('Prenotate da')
  await expect(call).toContainText('Per giorno di prenotazione')
  await expect(call).toContainText('Per giorno della call')
  // every number keeps its "i"
  for (const etichetta of [...dalReport, ...dalleCall]) {
    const blocco = dalReport.includes(etichetta) ? setting : call
    await expect(blocco.getByRole('button', { name: `Cosa conta «${etichetta}»` })).toHaveCount(1)
  }

  // the DM split, then the total: the page only formats what SQL adds up
  const numero = async (id: string) => Number((await setting.getByTestId(`numero-${id}`).innerText()).replace(/\D/g, ''))
  expect(await numero('dm_totali')).toBe((await numero('dm_outbound')) + (await numero('dm_inbound')) + (await numero('follow_up')))
  // the setter books discovery calls; strategy calls of past days (history) are
  // in "Call prenotate", and the page says how many, only when there are some
  const mese = oggiRoma().slice(0, 7)
  const { data: report, error } = await dbLocale()
    .from('setter_daily_reports')
    .select('strategy_prenotate')
    .eq('setter_id', ID_SETTER)
    .gte('data', `${mese}-01`)
    .lte('data', oggiRoma())
  if (error) throw error
  const strategy = (report ?? []).reduce((s, r) => s + r.strategy_prenotate, 0)
  const tabellaReport = page.getByTestId('mie-giornate').getByRole('table', { name: 'Il tuo report' })
  if (strategy > 0) {
    await expect(setting.getByTestId('nota-call_prenotate')).toHaveText(`di cui ${strategy} strategy dallo storico`)
    await expect(tabellaReport.locator('thead')).toContainText('Strategy (storico)')
  } else {
    await expect(setting).not.toContainText(/strategy/i)
    await expect(tabellaReport.locator('thead')).not.toContainText(/strategy/i)
  }

  // every number explains itself: the "i" of DM totali says what it adds up
  await setting.getByRole('button', { name: 'Cosa conta «DM totali»' }).click()
  await expect(page.getByRole('dialog', { name: 'DM totali' })).toContainText('DM inbound + DM outbound + follow up')

  // and all of them together at the bottom of the page: the link under the title
  // jumps there and opens it
  await page.keyboard.press('Escape')
  const legenda = page.getByTestId('legenda')
  await expect(legenda).not.toHaveAttribute('open')
  await page.getByRole('link', { name: 'Cosa significa ogni numero' }).click()
  await expect(page).toHaveURL(/#legenda-miei-numeri$/)
  await expect(legenda).toHaveAttribute('open', '')
  await expect(legenda).toBeInViewport()
  await expect(legenda.getByText('Prenotate da DM outbound', { exact: true })).toBeVisible()
  await expect(legenda.getByText('Show rate', { exact: true })).toBeVisible()
  // his own clients are listed below (setting-e-clienti.spec.ts), never anyone else's
})
