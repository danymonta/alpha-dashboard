import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { ID_ADMIN, ID_CLOSER, ID_SETTER, creaCallDiProva, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// Everything entered stays editable (Dany, 27/09/2026): one test per kind of record.
const PREFISSO = 'E2E Modifica'

test.afterAll(async () => {
  const db = dbLocale()
  await db.from('leads').delete().like('nome', `${PREFISSO}%`)
  await pulisciVendite(PREFISSO)
  await db.from('expenses').delete().like('descrizione', `${PREFISSO}%`)
  await db.from('commission_payouts').delete().like('note', `${PREFISSO}%`)
})

function nomeUnico(etichetta: string) {
  return `${PREFISSO} ${etichetta} ${Date.now()}`
}

function foglio(page: Page) {
  return page.getByRole('dialog')
}

test('il setter corregge nome e handle di un suo lead dalla pipeline', async ({ page }) => {
  const nome = nomeUnico('Lead')
  await creaCallDiProva(nome, ID_CLOSER)
  await accedi(page, 'setter')
  await page.goto(`/leads?q=${encodeURIComponent(nome)}`)

  await page.getByRole('button', { name: `Cambia stato di ${nome}` }).click()
  await foglio(page).getByRole('button', { name: 'Modifica nome, handle e fonte' }).click()
  await foglio(page).getByLabel('Nome').fill(`${nome} Bis`)
  await foglio(page).getByLabel('Handle Instagram').fill('@Nuovo.Handle')
  await foglio(page).getByRole('button', { name: 'Salva il lead' }).click()

  await expect(page.getByText('Lead aggiornato')).toBeVisible()
  await expect(page.getByRole('article', { name: `${nome} Bis` })).toContainText('@nuovo.handle')
})

test('il setter sposta la call, il closer registra com’è andata, il setter non vede l’importo', async ({ browser }) => {
  const nome = nomeUnico('Call')
  const callId = await creaCallDiProva(nome, ID_CLOSER)
  const tra2giorni = aggiungiGiorni(oggiRoma(), 2)

  const setter = await (await browser.newContext()).newPage()
  await accedi(setter, 'setter')
  await setter.goto('/calls')
  await setter.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  await foglio(setter).getByLabel('Data').fill(tra2giorni)
  await foglio(setter).getByLabel('Ora').fill('18:30')
  await foglio(setter).getByRole('button', { name: 'Salva la call' }).click()
  await expect(setter.getByText('Call aggiornata')).toBeVisible()
  await expect(setter.getByRole('article', { name: nome })).toContainText('18:30')

  const closer = await (await browser.newContext()).newPage()
  await accedi(closer, 'closer')
  await closer.goto('/calls')
  await closer.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  await foglio(closer).getByText('Buona', { exact: true }).click()
  await foglio(closer).getByLabel('Link alla registrazione').fill('https://fathom.video/share/e2e')
  await foglio(closer).getByLabel('Importo proposto').fill('1.500')
  await foglio(closer).getByRole('button', { name: 'Salva la call' }).click()
  await expect(closer.getByText('Call aggiornata')).toBeVisible()

  const { data: call } = await dbLocale()
    .from('calls')
    .select('performance, link_registrazione, pitch:call_pitch(importo_proposto)')
    .eq('id', callId)
    .single()
  expect(call).toMatchObject({ performance: 'buona', link_registrazione: 'https://fathom.video/share/e2e' })
  expect(Number((call?.pitch as { importo_proposto: number } | null)?.importo_proposto)).toBe(1500)

  // the setter can reschedule, but the amount is not even in the form
  await setter.reload()
  await setter.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  await expect(foglio(setter).getByLabel('Data')).toBeVisible()
  await expect(foglio(setter).getByLabel('Importo proposto')).toHaveCount(0)

  await setter.context().close()
  await closer.context().close()
})

test('l’admin corregge un report del setter dalla pagina Setting', async ({ page }) => {
  const db = dbLocale()
  const mese = `${oggiRoma().slice(0, 7)}-01`
  const { data: report } = await db
    .from('setter_daily_reports')
    .select('id, data, follow_up')
    .eq('setter_id', ID_SETTER)
    .gte('data', mese)
    .order('data', { ascending: false })
    .limit(1)
    .single()
  test.skip(!report, 'nessun report del mese nel seed')

  await accedi(page, 'admin')
  await page.goto('/setting')
  await page
    .getByRole('button', { name: `Correggi il report di Loris Setter del ${formatData(report!.data)}` })
    .filter({ visible: true })
    .click()
  await foglio(page).getByLabel('Follow-up del giorno').fill(String(report!.follow_up + 7))
  await foglio(page).getByRole('button', { name: 'Salva la correzione' }).click()
  await expect(page.getByText('Report corretto')).toBeVisible()

  const { data: dopo } = await db.from('setter_daily_reports').select('follow_up').eq('id', report!.id).single()
  expect(dopo?.follow_up).toBe(report!.follow_up + 7)
  await db.from('setter_daily_reports').update({ follow_up: report!.follow_up }).eq('id', report!.id)
})

test('l’admin corregge valore della vendita e importo di un incasso', async ({ page }) => {
  const nome = nomeUnico('Vendita')
  const venditaId = await creaVenditaDiProva(nome, ID_CLOSER, { valore: 900, rate: 3, giorniFa: 40 })
  const db = dbLocale()
  const { data: rata } = await db.from('payments').select('id').eq('sale_id', venditaId).eq('numero_rata', 1).single()
  await db
    .from('payments')
    .update({ stato: 'incassata', incassato_il: oggiRoma(), importo_incassato: 300 })
    .eq('id', rata!.id)

  await accedi(page, 'admin')
  await page.goto(`/sales/${venditaId}`)

  await page.getByRole('button', { name: 'Modifica', exact: true }).click()
  await foglio(page).getByLabel('Valore del contratto').fill('1.200')
  await foglio(page).getByRole('button', { name: 'Salva la vendita' }).click()
  await expect(page.getByText('Vendita aggiornata')).toBeVisible()
  // the plan does not follow by itself: the page says so
  await expect(page.getByText(/Il piano rate non torna con il contratto/)).toBeVisible()

  await page.getByRole('button', { name: 'Altre azioni sulla rata 1' }).click()
  await foglio(page).getByRole('button', { name: 'Correggi data, importo o metodo' }).click()
  await foglio(page).getByLabel('Importo incassato').fill('350')
  await foglio(page).getByRole('button', { name: 'Salva la correzione' }).click()
  await expect(page.getByText(/Incasso corretto/)).toBeVisible()

  const { data: dopo } = await db.from('payments').select('importo_incassato').eq('id', rata!.id).single()
  expect(Number(dopo?.importo_incassato)).toBe(350)
})

test('l’admin corregge un costo e corregge poi elimina un pagamento di provvigione', async ({ page }) => {
  const db = dbLocale()
  const descrizione = nomeUnico('Costo')
  await db.from('expenses').insert({ data: oggiRoma(), categoria: 'software', descrizione, importo: 49, created_by: ID_ADMIN })
  const note = nomeUnico('Pagamento')
  await db.from('commission_payouts').insert({
    profile_id: ID_SETTER,
    periodo: `${oggiRoma().slice(0, 7)}-01`,
    importo: 10,
    pagato_il: oggiRoma(),
    note,
  })

  await accedi(page, 'admin')
  await page.goto('/expenses')
  await page.getByRole('button', { name: `Modifica il costo ${descrizione}` }).click()
  await foglio(page).getByLabel('Importo').fill('59')
  await foglio(page).getByRole('button', { name: 'Salva il costo' }).click()
  await expect(page.getByText('Costo aggiornato')).toBeVisible()
  const { data: costo } = await db.from('expenses').select('importo').eq('descrizione', descrizione).single()
  expect(Number(costo?.importo)).toBe(59)

  await page.goto('/commissions')
  const modifica = page.getByRole('button', { name: `Modifica il pagamento a Loris Setter del ${formatData(oggiRoma())}` })
  await modifica.first().click()
  await foglio(page).getByLabel('Importo').fill('12,50')
  await foglio(page).getByRole('button', { name: 'Salva il pagamento' }).click()
  await expect(page.getByText('Pagamento aggiornato')).toBeVisible()

  const { data: pagamento } = await db.from('commission_payouts').select('id, importo').eq('note', note).single()
  expect(Number(pagamento?.importo)).toBe(12.5)

  await modifica.first().click()
  await foglio(page).getByRole('button', { name: 'Elimina il pagamento' }).click()
  await foglio(page).getByRole('button', { name: 'Conferma: elimina il pagamento' }).click()
  await expect(page.getByText('Pagamento eliminato')).toBeVisible()
})
