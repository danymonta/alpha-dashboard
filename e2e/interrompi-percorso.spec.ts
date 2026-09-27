import { expect, test } from '@playwright/test'

import { dbLocale, ID_ADMIN } from './db'
import { accedi } from './utenti'

const NOME = 'Cliente Che Smette'

function oggiRoma() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

test.afterEach(async () => {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').eq('nome', NOME)
  for (const c of clienti ?? []) {
    await db.from('sales').delete().eq('client_id', c.id)
    await db.from('clients').delete().eq('id', c.id)
  }
})

test('interrompi il percorso: finisce oggi e le rate non pagate dopo oggi spariscono, gli incassi restano', async ({ page }) => {
  // 6 × 250 started 3 months ago, the first 3 paid
  const db = dbLocale()
  const oggi = oggiRoma()
  const inizio = new Date(`${oggi}T12:00:00Z`)
  inizio.setUTCMonth(inizio.getUTCMonth() - 3)
  const dataInizio = inizio.toISOString().slice(0, 10)
  const { data: prodotto } = await db.from('products').select('id').eq('nome', 'Percorso Alpha 6 mesi').single()
  const { data: cliente } = await db.from('clients').insert({ nome: NOME, created_by: ID_ADMIN }).select('id').single()
  const { data: vendita } = await db
    .from('sales')
    .insert({
      client_id: cliente!.id,
      product_id: prodotto!.id,
      tipo: 'nuovo',
      data_vendita: dataInizio,
      data_inizio: dataInizio,
      data_fine: '2099-01-01',
      valore_contratto: 1500,
      numero_rate: 6,
      created_by: ID_ADMIN,
    })
    .select('id')
    .single()
  const { data: rate } = await db.from('payments').select('id, scadenza, importo_previsto').eq('sale_id', vendita!.id).order('numero_rata')
  for (const r of rate!.slice(0, 3)) {
    await db
      .from('payments')
      .update({ stato: 'incassata', incassato_il: r.scadenza, importo_incassato: r.importo_previsto, metodo: 'bonifico' })
      .eq('id', r.id)
  }

  await accedi(page, 'admin')
  await page.goto(`/clients/${cliente!.id}`)
  await page.getByTestId('interrompi-percorso').click()
  const foglio = page.getByRole('dialog')
  await expect(foglio.getByTestId('anteprima-interruzione')).toContainText('Nessuna rata cambia')
  await foglio.getByText('Le tolgo').click()
  await expect(foglio.getByTestId('anteprima-interruzione')).toContainText('Tolgo')
  await foglio.getByRole('button', { name: 'Interrompi il percorso' }).click()
  await expect(page.getByText('Percorso interrotto')).toBeVisible()

  const { data: dopo } = await db.from('sales').select('data_fine, valore_contratto, payments(stato, scadenza, importo_previsto)').eq('id', vendita!.id).single()
  expect(dopo!.data_fine).toBe(oggi)
  expect(dopo!.payments.filter((p) => p.stato === 'incassata')).toHaveLength(3)
  expect(dopo!.payments.filter((p) => p.stato === 'prevista' && p.scadenza > oggi)).toHaveLength(0)
  expect(Number(dopo!.valore_contratto)).toBe(dopo!.payments.reduce((s, p) => s + Number(p.importo_previsto), 0))
})
