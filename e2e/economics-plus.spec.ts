import { expect, test } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { PRODOTTO_3_MESI, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

function primoDelMese() {
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  return `${oggi.slice(0, 7)}-01`
}

test.afterEach(async () => {
  await dbLocale().from('obiettivi_mese').delete().eq('mese', primoDelMese())
})

test.beforeEach(async ({ page }) => {
  await accedi(page, 'admin')
})

/**
 * Two clients of its own, dated from today: the seed's paths are tied to the
 * month, so who ends within 30 days changes with the day of the month.
 */
async function clienteConPercorso(cognome: string, telefono: string, inizio: string, fine: string) {
  const db = dbLocale()
  const { data: cliente, error } = await db
    .from('clients')
    .insert({ nome: 'E2ERinnovi', cognome, telefono, fonte: 'referral' })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await db.from('sales').insert({
    client_id: cliente.id,
    product_id: PRODOTTO_3_MESI,
    tipo: 'nuovo',
    data_vendita: inizio,
    data_inizio: inizio,
    data_fine: fine,
    valore_contratto: 900,
    numero_rate: 1,
  })
  if (e2) throw e2
}

test('rinnovi: chi scade a 30 e 60 giorni e chi recuperare, con WhatsApp e rinnovo a un tocco', async ({ page }) => {
  const oggi = oggiRoma()
  await pulisciVendite('E2ERinnovi')
  // ends in 10 days, and ended 20 days ago without a renewal
  await clienteConPercorso('Scade', '+39 310 020 5894', aggiungiGiorni(oggi, -80), aggiungiGiorni(oggi, 10))
  await clienteConPercorso('Finito', '3100205895', aggiungiGiorni(oggi, -110), aggiungiGiorni(oggi, -20))

  try {
    await page.goto('/rinnovi')
    await expect(page.getByTestId('tasso-rinnovo')).toContainText('Tasso di rinnovo di')
    const scadenza = page.getByTestId('elenco-in-scadenza')
    const scade = scadenza.getByRole('listitem', { name: 'E2ERinnovi Scade' })
    await expect(scade).toBeVisible()
    await expect(scade.getByTestId('whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/393100205894\?text=Ciao%20E2ERinnovi/)
    await expect(scade.getByRole('link', { name: 'Registra rinnovo' })).toHaveAttribute('href', /tipo=rinnovo/)
    await expect(page.getByTestId('elenco-da-recuperare').getByRole('listitem', { name: 'E2ERinnovi Finito' })).toBeVisible()

    // 60 days: more names, the 30-day ones included
    await page.getByRole('link', { name: '60 giorni' }).click()
    await expect(page).toHaveURL(/entro=60/)
    await expect(page.getByTestId('elenco-in-scadenza').getByRole('listitem', { name: 'E2ERinnovi Scade' })).toBeVisible()
  } finally {
    await pulisciVendite('E2ERinnovi')
  }
})

test('panoramica: obiettivi del mese impostati e barre, soldi per fonte', async ({ page }) => {
  await page.goto('/')
  const obiettivi = page.getByTestId('obiettivi')
  await expect(obiettivi).toContainText('Nessun obiettivo per questo mese')
  await obiettivi.getByRole('button', { name: 'Imposta' }).click()
  const foglio = page.getByRole('dialog', { name: /Obiettivi di/ })
  await foglio.getByLabel('Cash da incassare').fill('10.000')
  await foglio.getByLabel('Nuovi clienti').fill('5')
  await foglio.getByRole('button', { name: 'Salva gli obiettivi' }).click()
  await expect(page.getByText('Obiettivi salvati')).toBeVisible()
  await expect(obiettivi.getByRole('progressbar', { name: 'Cash incassato' })).toBeVisible()
  await expect(obiettivi).toContainText(/di 10\.000\s€/)
  await expect(obiettivi.getByRole('progressbar', { name: 'Nuovi clienti' })).toBeVisible()

  const fonti = page.getByTestId('per-fonte')
  await expect(fonti.getByRole('listitem').first()).toBeVisible()
  await expect(fonti).toContainText('close rate')
})

test('incassi: previsione dei prossimi 3 mesi e promemoria WhatsApp sulle rate da pagare', async ({ page }) => {
  await page.goto('/payments')
  const previsione = page.getByTestId('previsione-cassa')
  await expect(previsione.getByRole('term')).toHaveCount(3)
  await expect(previsione).toContainText('già entrati')
  const rate = page.getByTestId('elenco-rate')
  await expect(rate.getByTestId('whatsapp').first()).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=Ciao/)
})
