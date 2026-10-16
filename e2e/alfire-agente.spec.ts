import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { aggiungiGiorni, formatOra, giornoEsteso, lunediDellaSettimana, oggiRoma } from '../lib/date'
import type { Database } from '../lib/supabase/database.types'
import { ID_ADMIN, ID_CLOSER, ID_SETTER, PRODOTTO_3_MESI, creaCallDiProva, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { PASSWORD_SEED, UTENTI, accedi, type RuoloSeed } from './utenti'

// Alfire as an agent on the entity tools (cliente, rata, lead): the card reads
// the database before the tap, and nothing is written without it. Runs against
// the fake model (e2e/llm-finto.mjs): start the dev server with
// ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and E2E_ALFIRE_FINTO=1.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

const LLM_FINTO = `http://127.0.0.1:${process.env.PORTA_LLM_FINTO ?? 4010}`

test.afterEach(async () => {
  await pulisciVendite('E2EAlfire')
})

async function chiedi(page: Page, testo: string, ruolo: RuoloSeed = 'admin') {
  await accedi(page, ruolo)
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

// ---------------------------------------------------------------------------
// 07/10/2026: the closer's follow-up call from the chat, and the setter who
// reads the closer's numbers of every setter (the Closer page)
// ---------------------------------------------------------------------------

type Richiesta = { messages: { role: string; content?: unknown; tool_call_id?: string }[]; tools?: { function?: { name?: string } }[] }

async function ultimaRichiesta(): Promise<Richiesta> {
  const { chat } = (await (await fetch(`${LLM_FINTO}/__ultime`)).json()) as { chat: Richiesta | null }
  if (!chat) throw new Error('Il modello finto non ha ricevuto richieste')
  return chat
}

/** What a tool read, as the model received it. */
function letto(r: Richiesta, strumento: string): Record<string, unknown> {
  const m = r.messages.find((x) => x.role === 'tool' && x.tool_call_id === `call_${strumento}`)
  if (!m) throw new Error(`Nessun risultato di ${strumento}`)
  const testo = typeof m.content === 'string' ? m.content : ((m.content as { text?: string }[]) ?? []).map((p) => p.text ?? '').join('')
  return JSON.parse(testo) as Record<string, unknown>
}

/** A seed user's own session on the local database: the RPCs as that person calls them. */
async function sessioneDi(ruolo: RuoloSeed) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI[ruolo].email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

test('il closer segna follow-up con la call già fissata: la scheda dice quando, e dopo la conferma la call nuova c’è, collegata', async ({ page }) => {
  const db = dbLocale()
  // one word before the surname: the lead is found by its own name among the closer's
  const nome = `E2EAlfireFollow${Date.now()} Neri`
  const callId = await creaCallDiProva(nome, ID_CLOSER, 2)
  const domani = aggiungiGiorni(oggiRoma(), 1)
  const pannello = await chiedi(page, `Segna follow-up per ${nome} con una call domani alle 18`, 'closer')

  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText(`Registro l’esito della call con ${nome}`)
  // first the sentence from the input, then the preview read from the database (before → after)
  await expect(scheda).toContainText(/Motivo di non chiusura: (– → )?Ne parla con la compagna/)
  // the follow-up call with its day, and who keeps a sale: the first call's setter
  await expect(scheda).toContainText(`Call di follow-up: ${giornoEsteso(domani)} alle 18:00, stesso lead e stesso setter (${UTENTI.setter.nome})`)
  await expect(scheda).toContainText('Registrazione: call non registrata')
  // nothing written before the tap
  const prima = await db.from('calls').select('id').eq('follow_up_di', callId)
  expect(prima.data).toHaveLength(0)

  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: call.')).toBeVisible()
  const { data: partenza, error: e1 } = await db.from('calls').select('stato, esito, obiezione_principale, lead_id').eq('id', callId).single()
  if (e1) throw e1
  expect(partenza).toMatchObject({ stato: 'svolta', esito: 'follow_up', obiezione_principale: 'Ne parla con la compagna' })
  // a new call on its day, linked to the first one: the same lead, setter, closer and type, still to be held
  const { data: seguito, error: e2 } = await db
    .from('calls')
    .select('lead_id, setter_id, closer_id, tipo, stato, programmata_il')
    .eq('follow_up_di', callId)
  if (e2) throw e2
  expect(seguito).toHaveLength(1)
  expect(seguito[0]).toMatchObject({ lead_id: partenza.lead_id, setter_id: ID_SETTER, closer_id: ID_CLOSER, tipo: 'discovery', stato: 'programmata' })
  expect(oggiRoma(new Date(seguito[0].programmata_il))).toBe(domani)
  expect(formatOra(seguito[0].programmata_il)).toBe('18:00')
})

test('una call svolta senza la registrazione di Fathom: la scheda si ferma e dice cosa manca', async ({ page }) => {
  const nome = `E2EAlfireSenzaReg${Date.now()} Neri`
  const callId = await creaCallDiProva(nome, ID_CLOSER, 2)
  const pannello = await chiedi(page, `Segna persa per ${nome} senza dire la registrazione`, 'closer')
  await expect(pannello).toContainText('Manca la registrazione della call: incolla il link di Fathom, oppure dimmi che la call non è stata registrata.')
  // the indication for the model stays out of the person's card
  await expect(pannello).not.toContainText('proponi_risposte')
  await expect(pannello.getByRole('button', { name: 'Conferma' })).toHaveCount(0)
  const { data } = await dbLocale().from('calls').select('stato, esito').eq('id', callId).single()
  expect(data).toMatchObject({ stato: 'programmata', esito: null })
})

test('il setter chiede i numeri del closer della settimana: arrivano da giornate_closer, di tutti i setter, come li legge l’admin', async ({ page }) => {
  const db = dbLocale()
  // a call booked by the admin as setter and closed by the closer a minute ago: not the setter's call,
  // yet in the closer's numbers he reads (Dany, 07/10/2026: "massima trasparenza verso i setter")
  const { data: lead, error: e1 } = await db
    .from('leads')
    .insert({ nome: `E2EAlfireCloser${Date.now()} Bianchi`, setter_id: ID_ADMIN, fonte: 'dm_inbound', created_by: ID_ADMIN })
    .select('id')
    .single()
  if (e1) throw e1
  const { error: e2 } = await db.from('calls').insert({
    lead_id: lead.id,
    setter_id: ID_ADMIN,
    closer_id: ID_CLOSER,
    tipo: 'discovery',
    programmata_il: new Date(Date.now() - 60_000).toISOString(),
    created_by: ID_ADMIN,
    stato: 'svolta',
    qualificata: true,
    esito: 'chiusa',
  })
  if (e2) throw e2

  const pannello = await chiedi(page, 'Come sono andati i numeri del closer questa settimana?', 'setter')
  await expect(pannello.getByText('Ho letto i numeri del closer')).toBeVisible()
  await expect(pannello.getByText(/^Numeri del closer \(tutti i closer\): \d+ call svolte\.$/)).toBeVisible()

  const richiesta = await ultimaRichiesta()
  expect((richiesta.tools ?? []).map((t) => t.function?.name)).toContain('giornate_closer')
  const numeri = letto(richiesta, 'giornate_closer') as { numeri_di: string; di_chi: string; periodo: unknown; totale: Record<string, unknown> }
  // whose numbers, first: the closer's, never the setter's own
  expect(Object.keys(numeri).slice(0, 2)).toEqual(['numeri_di', 'di_chi'])
  expect(numeri.numeri_di).toBe('tutti i closer')
  expect(numeri.di_chi).toContain(`non sono i numeri di ${UTENTI.setter.nome}`)
  const periodo = { da: lunediDellaSettimana(oggiRoma()), a: oggiRoma() }
  expect(numeri.periodo).toEqual(periodo)

  // the same totals the admin reads for every closer: every setter's calls, not only his
  const admin = await sessioneDi('admin')
  const { data: righe, error: e3 } = await admin.rpc('giornate_closer', { p_da: periodo.da, p_a: periodo.a })
  if (e3) throw e3
  const totale = righe.find((r) => r.data === null)
  if (!totale) throw new Error('Nessun totale per l’admin')
  expect(totale.call).toBeGreaterThanOrEqual(1)
  expect(numeri.totale).toEqual({
    'Call svolte': totale.call,
    Qualificate: totale.qualificate,
    'No show': totale.no_show,
    'Follow up (esito call)': totale.follow_up,
    Cancellate: totale.cancellate,
    Chiuse: totale.chiuse,
    'Cash (prima rata dei clienti nuovi)': totale.cash,
    'Revenue (contratti dei clienti nuovi)': totale.revenue,
    'Show rate': totale.show_rate,
    'Close rate': totale.close_rate,
  })
})
