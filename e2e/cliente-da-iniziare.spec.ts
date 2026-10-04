import { expect, test } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { ID_ADMIN, PRODOTTO_3_MESI, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

/**
 * A client whose path starts in a week (the sale's default since 02/10/2026)
 * is "Da iniziare" (1.23.1): his own filter in Clienti, never among the ones to
 * win back in Rinnovi; "Interrompi il percorso" proposes the first day of the
 * path, never today, which comes before it (04/10/2026).
 */
const PREFISSO = 'E2EDaIniziare'

test.beforeEach(async () => {
  await pulisciVendite(PREFISSO)
})
test.afterEach(async () => {
  await pulisciVendite(PREFISSO)
})

test('chi comincia tra 7 giorni è «Da iniziare», non da recuperare; interromperlo propone il suo primo giorno', async ({ page }) => {
  test.setTimeout(120_000)
  const oggi = oggiRoma()
  const inizio = aggiungiGiorni(oggi, 7)
  const db = dbLocale()
  const { data: cliente, error } = await db
    .from('clients')
    .insert({ nome: PREFISSO, cognome: 'Settimana', fonte: 'dm_inbound', created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await db.from('sales').insert({
    client_id: cliente.id,
    product_id: PRODOTTO_3_MESI,
    tipo: 'nuovo',
    data_vendita: oggi,
    data_inizio: inizio,
    data_fine: aggiungiGiorni(inizio, 89),
    valore_contratto: 1500,
    numero_rate: 1,
    created_by: ID_ADMIN,
  })
  if (e2) throw e2
  const nome = `${PREFISSO} Settimana`

  await accedi(page, 'admin')
  await page.goto('/clients?stato=da_iniziare')
  await expect(page.getByRole('link', { name: /^Da iniziare\s*\d+$/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true })).toBeVisible()
  await page.goto('/clients?stato=scaduto')
  await expect(page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true })).toHaveCount(0)

  await page.goto('/rinnovi')
  await expect(page.getByTestId('tasso-rinnovo')).toBeVisible()
  await expect(page.getByRole('listitem', { name: nome })).toHaveCount(0)

  await page.goto(`/clients/${cliente.id}`)
  await expect(page.getByText('Da iniziare', { exact: true }).first()).toBeVisible()
  await page.getByTestId('interrompi-percorso').click()
  const foglio = page.getByRole('dialog', { name: 'Interrompi il percorso' })
  await expect(foglio.getByLabel('Ultimo giorno di percorso')).toHaveValue(inizio)
  // the database's preview answers on that day, without an error
  await expect(foglio.getByTestId('anteprima-interruzione')).toContainText('Nessuna rata cambia')
})
