import { expect, test } from '@playwright/test'

import { dbLocale } from './db'
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

test('rinnovi: chi scade a 30 e 60 giorni e chi recuperare, con WhatsApp e rinnovo a un tocco', async ({ page }) => {
  await page.goto('/rinnovi')
  await expect(page.getByTestId('tasso-rinnovo')).toContainText('Tasso di rinnovo di')
  const scadenza = page.getByTestId('elenco-in-scadenza')
  const filippo = scadenza.getByRole('listitem', { name: 'Filippo Mancini' })
  await expect(filippo).toBeVisible()
  await expect(filippo.getByTestId('whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/393100205894\?text=Ciao%20Filippo/)
  await expect(filippo.getByRole('link', { name: 'Registra rinnovo' })).toHaveAttribute('href', /tipo=rinnovo/)
  await expect(page.getByTestId('elenco-da-recuperare').getByRole('listitem', { name: 'Gabriele Testa' })).toBeVisible()

  // 60 days: more names, the 30-day ones included
  await page.getByRole('link', { name: '60 giorni' }).click()
  await expect(page).toHaveURL(/entro=60/)
  await expect(page.getByTestId('elenco-in-scadenza').getByRole('listitem')).not.toHaveCount(0)
  await expect(page.getByTestId('elenco-in-scadenza').getByRole('listitem', { name: 'Filippo Mancini' })).toBeVisible()
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
