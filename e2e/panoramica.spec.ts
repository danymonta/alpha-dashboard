import { expect, test } from '@playwright/test'

import { LEGENDA_CLOSER, LEGENDA_ECONOMICS, LEGENDA_SETTING } from '../lib/metriche/legenda'
import { accedi } from './utenti'

test('la panoramica risponde alla domanda del mese', async ({ page }) => {
  await accedi(page, 'admin')
  await expect(page).toHaveURL('/')

  const kpi = page.getByTestId('kpi')
  for (const voce of [
    LEGENDA_ECONOMICS.cash_incassato,
    LEGENDA_ECONOMICS.revenue_firmata,
    LEGENDA_ECONOMICS.nuovi_clienti,
    LEGENDA_ECONOMICS.rinnovi,
    LEGENDA_ECONOMICS.margine_operativo,
  ]) {
    await expect(kpi.getByText(voce.etichetta, { exact: true }).first()).toBeVisible()
    // every tile explains itself
    await expect(kpi.getByRole('button', { name: `Cosa conta «${voce.etichetta}»` }).first()).toBeVisible()
  }
  await kpi.getByRole('button', { name: 'Cosa conta «Nuovi clienti»' }).click()
  await expect(page.getByRole('dialog', { name: 'Nuovi clienti' })).toContainText(LEGENDA_ECONOMICS.nuovi_clienti.spiegazione)
  await page.keyboard.press('Escape')

  // "quanto è nuovo e quanto è rinnovo": the cash split, not the count of sales
  await expect(page.getByTestId('cash-per-tipo')).toContainText('da nuovi')
  await expect(page.getByTestId('cash-per-tipo')).toContainText('da rinnovi')
  await expect(page.getByText('Tasse escluse.')).toBeVisible()
  // the margin box keeps the cents on every line, so its subtraction adds up at a glance
  await expect(page.getByTestId('conto-margine').locator('dd').first()).toHaveText(/^\d{1,3}(\.\d{3})*,\d{2}\s€$/)

  // today: every number says where it comes from
  const oggi = page.getByTestId('oggi-team')
  for (const fonte of ['Dai report di oggi', 'Dalle call in agenda oggi', 'Dagli incassi']) {
    await expect(oggi.getByText(fonte, { exact: true })).toBeVisible()
  }
  for (const voce of [LEGENDA_SETTING.dm_totali, LEGENDA_ECONOMICS.call_da_fare, LEGENDA_CLOSER.call, LEGENDA_ECONOMICS.cash_oggi]) {
    await expect(oggi.getByRole('button', { name: `Cosa conta «${voce.etichetta}»` })).toBeVisible()
  }

  // funnel: conversations are not a part of DM totali, so no "passa" there
  const funnel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funnel del mese' }) })
  await expect(funnel.getByText('Dal report giornaliero dei setter', { exact: true })).toBeVisible()
  await expect(funnel.getByText('Dalle call registrate nell’app', { exact: true })).toBeVisible()
  const conversazioni = funnel.getByRole('listitem').filter({ hasText: 'Conversazioni' })
  await expect(conversazioni).toContainText(/tasso conv\. \d/)
  await expect(conversazioni).not.toContainText('passa')
  await expect(funnel.getByRole('listitem').filter({ hasText: 'Call prenotate' })).toContainText('passa')
  await funnel.getByRole('button', { name: 'Cosa conta «Call svolte»' }).click()
  await expect(page.getByRole('dialog', { name: 'Call svolte' })).toContainText('Dalle call registrate nell’app.')
  await page.keyboard.press('Escape')
  // the calls held come from another source than the bookings above: no "passa"
  // between them, the show rate instead, the same SQL value as the indicators
  const svolte = funnel.getByRole('listitem').filter({ hasText: 'Call svolte' })
  await expect(svolte).not.toContainText('passa')
  const indicatori = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Indicatori' }) })
  const showRate = (await indicatori.locator('div').filter({ has: page.getByText('Show rate', { exact: true }) }).locator('dd').innerText()).trim()
  await expect(svolte).toContainText(`show rate ${showRate}`)
  await svolte.getByRole('button', { name: /^Cosa conta «show rate/ }).click()
  await expect(page.getByRole('dialog', { name: /^show rate/ })).toContainText(LEGENDA_CLOSER.show_rate.spiegazione)
  await page.keyboard.press('Escape')
  await expect(funnel.getByRole('listitem').filter({ hasText: 'Chiuse' })).toContainText('passa')

  // what is still to collect: the legend's labels; a list row keeps its cents
  const incassare = page.getByTestId('da-incassare')
  for (const voce of [LEGENDA_ECONOMICS.in_ritardo, LEGENDA_ECONOMICS.prossimi_30, LEGENDA_ECONOMICS.oltre_30]) {
    await expect(incassare.getByRole('button', { name: `Cosa conta «${voce.etichetta}»` })).toBeVisible()
  }
  await expect(page.getByTestId('per-fonte').getByRole('listitem').first()).toContainText(/\d,\d{2}\s€/)

  // all the definitions at the bottom, closed until tapped
  const legenda = page.getByTestId('legenda')
  await expect(legenda.getByText(LEGENDA_ECONOMICS.cash_per_call_svolta.spiegazione)).toBeHidden()
  await legenda.getByText('Cosa significa ogni numero').click()
  for (const voce of [LEGENDA_ECONOMICS.margine_operativo, LEGENDA_ECONOMICS.cash_per_call_svolta, LEGENDA_CLOSER.close_rate_qualificate]) {
    await expect(legenda.getByText(voce.spiegazione, { exact: true })).toBeVisible()
  }

  await page.getByText('Vedi come tabella').click()
  await expect(page.getByRole('table', { name: 'Cash incassato per mese e tipo' })).toBeVisible()
})

test('sul telefono i tre importi da incassare stanno sulla stessa riga', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  const importi = ['in_ritardo', 'prossimi_30', 'oltre'].map((fascia) => page.getByTestId(`da-incassare-${fascia}`))
  // "Entro 30 giorni" goes on two lines at 390px: the amounts stay aligned
  await expect(page.getByTestId('da-incassare').getByText(LEGENDA_ECONOMICS.prossimi_30.etichetta, { exact: true })).toBeVisible()
  const alti = await Promise.all(importi.map(async (i) => Math.round((await i.boundingBox())!.y)))
  expect(new Set(alti).size).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('un mese passato si apre dal selettore e non mostra i numeri di oggi', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('link', { name: 'Mese precedente' }).click()
  await expect(page).toHaveURL(/\?mese=/)
  await expect(page.getByTestId('oggi-team')).toHaveCount(0)
  await expect(page.getByTestId('stato-live')).toHaveCount(0)
})

test('tempo reale: il setter salva, la panoramica dell’admin si aggiorna da sola', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage()
  const setter = await (await browser.newContext()).newPage()

  await accedi(admin, 'admin')
  await expect(admin.getByTestId('stato-live')).toHaveAttribute('data-stato', 'live', { timeout: 15_000 })
  const dmPrima = Number((await admin.getByTestId('oggi-DM').innerText()).replace(/\D/g, ''))

  await accedi(setter, 'setter')
  await setter.goto('/today')
  await setter.getByRole('button', { name: 'DM outbound: più 5' }).click()
  await expect(setter.getByTestId('stato-salvato')).toBeVisible()
  await expect(setter.getByText('Salvataggio…')).toHaveCount(0)

  // no reload on the admin side: the number changes on its own
  await expect(admin.getByTestId('oggi-DM')).toHaveText(String(dmPrima + 5), { timeout: 15_000 })
  await expect(admin.getByTestId('stato-live')).toContainText('aggiornato alle')

  await admin.context().close()
  await setter.context().close()
})

test('setter e closer non raggiungono la panoramica', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/')
  await expect(page).toHaveURL('/today')
})
