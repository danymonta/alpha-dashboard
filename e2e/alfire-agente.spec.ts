import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, PRODOTTO_3_MESI, creaCallDiProva, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// Alfire as an agent on the entity tools (cliente, rata, lead): the card reads
// the database before the tap, and nothing is written without it. Runs against
// the fake model (e2e/llm-finto.mjs): start the dev server with
// ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and E2E_ALFIRE_FINTO=1.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

const LLM_FINTO = `http://127.0.0.1:${process.env.PORTA_LLM_FINTO ?? 4010}`

test.afterEach(async () => {
  await pulisciVendite('E2EAlfire')
})

async function chiedi(page: Page, testo: string) {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill(testo)
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  return pannello
}

/** A client with a two-instalment sale, the first one already cashed. */
async function clienteConIncasso(cognome: string) {
  const db = dbLocale()
  const { data: cliente, error: e1 } = await db
    .from('clients')
    .insert({ nome: 'E2EAlfire', cognome, fonte: 'referral', closer_id: ID_ADMIN })
    .select('id')
    .single()
  if (e1) throw e1
  const oggi = new Date().toISOString().slice(0, 10)
  const { data: vendita, error: e2 } = await db
    .from('sales')
    .insert({
      client_id: cliente.id,
      product_id: PRODOTTO_3_MESI,
      tipo: 'nuovo',
      closer_id: ID_ADMIN,
      data_vendita: oggi,
      data_inizio: oggi,
      data_fine: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
      valore_contratto: 1000,
      numero_rate: 2,
    })
    .select('id')
    .single()
  if (e2) throw e2
  const { error: e3 } = await db
    .from('payments')
    .update({ stato: 'incassata', incassato_il: oggi, importo_incassato: 500, metodo: 'bonifico' })
    .eq('sale_id', vendita.id)
    .eq('numero_rata', 1)
  if (e3) throw e3
  return cliente.id as string
}

test('eliminare un cliente: la scheda dice cosa si porta dietro; annullando resta tutto', async ({ page }) => {
  const id = await clienteConIncasso('Cancellabile')
  const pannello = await chiedi(page, 'Elimina il cliente E2EAlfire Cancellabile')

  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Elimino il cliente E2EAlfire Cancellabile')
  // counted by public.anteprima_eliminazione, the same words as the app's own question
  await expect(scheda).toContainText('Si eliminano anche 1 vendita e 2 rate, con 500,00 € già incassati.')
  await expect(scheda).toContainText('I numeri dei mesi passati cambiano di conseguenza.')
  await expect(scheda.getByRole('button', { name: 'Elimina' })).toBeEnabled()

  await scheda.getByRole('button', { name: 'Annulla' }).click()
  await expect(scheda).toContainText('Annullato: non ho scritto niente.')
  const { data: cliente } = await dbLocale().from('clients').select('id').eq('id', id).maybeSingle()
  expect(cliente).not.toBeNull()
  const { data: vendite } = await dbLocale().from('sales').select('id').eq('client_id', id)
  expect(vendite).toHaveLength(1)
})

test('un nome che vale per due clienti: niente scheda da confermare, Alfire chiede quale', async ({ page }) => {
  const uno = await clienteConIncasso('Doppio Uno')
  const due = await clienteConIncasso('Doppio Due')
  const pannello = await chiedi(page, 'Elimina il cliente E2EAlfire Doppio')

  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Non l’ho fatto: Più clienti possibili')
  await expect(scheda.getByRole('button', { name: 'Elimina' })).toHaveCount(0)
  await expect(pannello.getByText(/^Quale intendi\? Più clienti possibili/)).toBeVisible()
  // the card shows the person's words; how to ask is the model's, in the reason it gets back
  await expect(scheda).not.toContainText('Chiedi quale')
  const { chat } = (await (await fetch(`${LLM_FINTO}/__ultime`)).json()) as { chat: { messages: { role: string; content: unknown }[] } }
  expect(JSON.stringify(chat.messages.at(-1))).toContain('Chiedi quale, con nome e cognome.')
  const { data } = await dbLocale().from('clients').select('id').in('id', [uno, due])
  expect(data).toHaveLength(2)
})

test('aggiungere una rata: la scheda mostra la vendita vera, dopo la conferma la rata c’è', async ({ page }) => {
  const venditaId = await creaVenditaDiProva('E2EAlfire Rata', ID_ADMIN, { valore: 900, rate: 3 })
  const pannello = await chiedi(page, 'Aggiungi una rata a E2EAlfire Rata da 300')

  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Aggiungo una rata alla vendita di E2EAlfire Rata Incassi')
  await expect(scheda).toContainText('Nuova rata: 300,00 €')
  await expect(scheda).toContainText('Oggi 3 rate sommano 900,00 € su un contratto di 900,00 €.')
  // nothing written before the tap
  const prima = await dbLocale().from('payments').select('id').eq('sale_id', venditaId)
  expect(prima.data).toHaveLength(3)

  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: rata.')).toBeVisible()
  const { data: rate } = await dbLocale().from('payments').select('importo_previsto, stato').eq('sale_id', venditaId)
  expect(rate).toHaveLength(4)
  expect(rate).toContainEqual({ importo_previsto: 300, stato: 'prevista' })
})

test('spostare un lead nella pipeline: prima → dopo nella scheda, poi il nuovo stato', async ({ page }) => {
  await creaCallDiProva('E2EAlfire Neri', ID_ADMIN)
  const pannello = await chiedi(page, 'Sposta il lead E2EAlfire Neri in follow-up')

  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Sposto E2EAlfire Neri in «Follow-up»')
  await expect(scheda).toContainText('Ora: Call da fare')
  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: lead.')).toBeVisible()
  const { data: lead } = await dbLocale().from('leads').select('stato').eq('nome', 'E2EAlfire Neri').single()
  expect(lead).toEqual({ stato: 'follow_up' })
})
