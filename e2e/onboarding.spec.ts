import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, ID_COACH, creaCallDiProva, creaVenditaDiProva, chiudiCall, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// The guided onboarding, release A (1.77.0, docs/onboarding/rilascio-a.md): the wizard «Nuovo cliente»,
// the section Onboarding, the card of a client, the settings page and the hooks on the call, the sale
// and the client. The team's side only: nobody can use a link yet (aperto_ai_clienti is off).
const PREFISSO = 'E2EOnb'

/** A client of this file, by name: the wizard writes it, the tests read what was born with it. */
async function clienteDiNome(nome: string) {
  const { data } = await dbLocale().from('clients').select('id').eq('nome', nome).maybeSingle()
  return data?.id ?? null
}

async function invitoDi(clientId: string) {
  const { data } = await dbLocale()
    .from('onboarding_inviti')
    .select('id, stato, attivato_da, sale_id, revocato_motivo')
    .eq('client_id', clientId)
    .maybeSingle()
  return data
}

/** Tap the visible chip, as a person would: the radio itself is visually hidden. */
async function scegli(page: Page, nome: string | RegExp) {
  const radio = page.getByRole('radio', { name: nome, exact: typeof nome === 'string' })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

const avanti = (page: Page) => page.getByTestId('wizard-avanti')
/** «Avanti», and the screen it leads to: a step is checked before the wizard moves. */
async function avantiFino(page: Page, schermata: 'vendita' | 'team' | 'riepilogo') {
  await avanti(page).click()
  await expect(page.getByTestId('wizard')).toHaveAttribute('data-schermata', schermata)
}
const titoloSchermata = (page: Page, nome: string) => page.getByTestId('wizard').getByRole('heading', { level: 2, name: nome })

test.afterAll(async () => {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').like('nome', `${PREFISSO}%`)
  for (const { id } of clienti ?? []) {
    // the notification of a confirmed payment, and the memory that it was sent
    await db.from('notifiche').delete().like('chiave', `onboarding/${id}/%`)
    await db.from('notifiche_avvisi_emessi').delete().like('chiave', `onboarding/${id}/%`)
  }
  // projects, sales and clients; the onboarding goes with the client (cascade)
  await pulisciVendite(PREFISSO)
})

test('l’admin apre il wizard dal menu, crea un cliente nuovo, conferma il pagamento e vede scheda e notifica', async ({
  page,
}) => {
  const nome = `${PREFISSO}Nuovo${Date.now().toString().slice(-6)}`
  await accedi(page, 'admin')

  // from the menu: the section, then «Nuovo cliente»
  await page.getByRole('link', { name: 'Onboarding', exact: true }).first().click()
  await expect(page).toHaveURL('/onboarding')
  await expect(page.getByRole('heading', { level: 1, name: 'Onboarding' })).toBeVisible()
  await page.getByTestId('nuovo-cliente').click()
  await expect(page).toHaveURL('/onboarding/nuovo')

  // the three steps are in view from the first screen
  const indicatore = page.getByTestId('indicatore-passi')
  await expect(indicatore.locator('li')).toHaveCount(3)
  await expect(indicatore.locator('li[data-passo="cliente"]')).toHaveAttribute('aria-current', 'step')

  // an empty screen does not move on: the error sits under its field
  await avanti(page).click()
  await expect(page.getByText('Scrivi il nome del cliente')).toBeVisible()
  await expect(page.getByTestId('wizard')).toHaveAttribute('data-schermata', 'cliente')

  await page.getByLabel('Nome', { exact: true }).fill(nome)
  await expect(page.getByText('Scrivi il nome del cliente')).toHaveCount(0)
  await page.getByLabel('Cognome').fill('Wizard')
  await page.getByLabel(/^Email/).fill('e2e.onboarding@example.test')
  await page.getByLabel(/^Username Telegram/).fill('@E2E_Onboarding')
  await avanti(page).click()

  // the sale: the focus goes to the title of the screen, the rules are the ones of «Nuova vendita»
  await expect(titoloSchermata(page, 'Vendita')).toBeFocused()
  await expect(indicatore.locator('li[data-passo="cliente"]')).toHaveAttribute('data-stato', 'fatto')
  await avanti(page).click()
  await expect(page.getByText('Scegli il prodotto')).toBeVisible()
  await scegli(page, /Percorso Alpha 6 mesi/)
  await expect(page.getByText('Scegli il prodotto')).toHaveCount(0)
  await expect(page.getByLabel('Valore del contratto')).toHaveValue('2.400,00')
  await scegli(page, '3')
  await expect(page.getByTestId('anteprima-rate').locator('tbody tr')).toHaveCount(3)
  await avanti(page).click()

  // the team: the responsible is whoever uses the wizard, the coach is chosen
  await expect(titoloSchermata(page, 'Team')).toBeFocused()
  await expect(page.getByLabel(/^Responsabile/)).toHaveValue(ID_ADMIN)
  await page.getByLabel('Coach', { exact: true }).selectOption(ID_COACH)
  await avanti(page).click()

  // the summary, then the confirmation: nothing was written before it
  const riepilogo = page.getByTestId('riepilogo')
  await expect(titoloSchermata(page, 'Riepilogo')).toBeFocused()
  await expect(riepilogo).toContainText(`${nome} Wizard`)
  await expect(riepilogo).toContainText('Percorso Alpha 6 mesi')
  await expect(riepilogo).toContainText('2.400,00 €')
  await expect(riepilogo).toContainText('3 rate')
  await expect(riepilogo).toContainText('Marco Coach')
  expect(await clienteDiNome(nome)).toBeNull()

  // back to a finished step from the indicator, and forward again: what was written stays
  await indicatore.getByRole('button', { name: /Cliente: fatto/ }).click()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(nome)
  await avantiFino(page, 'vendita')
  await expect(page.getByLabel('Valore del contratto')).toHaveValue('2.400,00')
  await avantiFino(page, 'team')
  await avantiFino(page, 'riepilogo')
  await expect(riepilogo).toBeVisible()
  await avanti(page).click()

  // the last screen: started, waiting for the payment, the client area not open yet
  const fine = page.getByTestId('onboarding-avviato')
  await expect(fine.getByRole('heading', { level: 1, name: `Onboarding avviato per ${nome} Wizard` })).toBeVisible()
  await expect(fine.getByTestId('stato-link')).toHaveAttribute('data-stato', 'in_attesa_pagamento')
  await expect(fine.getByTestId('area-non-aperta')).toBeVisible()
  await expect(fine.getByTestId('copia-link')).toHaveCount(0)
  await expect(fine.getByTestId('apri-progetto')).toBeVisible()

  // everything was born together: client, sale with its plan, link, path, steps, project with the list
  const clientId = await clienteDiNome(nome)
  expect(clientId).not.toBeNull()
  const db = dbLocale()
  const invito = await invitoDi(clientId!)
  expect(invito?.stato).toBe('in_attesa_pagamento')
  const { data: vendita } = await db.from('sales').select('id, tipo, numero_rate').eq('client_id', clientId!).single()
  expect(vendita).toMatchObject({ tipo: 'nuovo', numero_rate: 3 })
  expect(invito?.sale_id).toBe(vendita!.id)
  const { count: passi } = await db.from('onboarding_passi').select('*', { count: 'exact', head: true }).eq('client_id', clientId!)
  expect(passi).toBe(9)
  const { data: progetto } = await db.from('pm_progetti').select('id').eq('client_id', clientId!).single()
  const { count: task } = await db
    .from('pm_task')
    .select('*', { count: 'exact', head: true })
    .eq('progetto_id', progetto!.id)
    .not('chiave_onboarding', 'is', null)
  expect(task).toBe(10)
  const { data: telegram } = await db.from('clienti_telegram').select('username').eq('client_id', clientId!).single()
  expect(telegram?.username).toBe('e2e_onboarding')

  // «Conferma pagamento»: a question first, then the link is active (no cash-in is registered)
  await fine.getByTestId('conferma-pagamento').click()
  const domanda = page.getByRole('dialog')
  await expect(domanda).toContainText('senza registrare nessun incasso')
  await domanda.getByTestId('conferma-pagamento-si').click()
  await expect(page.getByText('Pagamento confermato: l’onboarding è pronto')).toBeVisible()
  await expect(fine.getByTestId('stato-link')).toHaveAttribute('data-stato', 'attivo')
  await expect(fine.getByTestId('conferma-pagamento')).toHaveCount(0)
  expect(await invitoDi(clientId!)).toMatchObject({ stato: 'attivo', attivato_da: 'manuale' })
  const { count: incassate } = await db
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .eq('sale_id', vendita!.id)
    .eq('stato', 'incassata')
  expect(incassate).toBe(0)

  // the card of the client in onboarding
  await fine.getByRole('link', { name: 'Apri la scheda' }).click()
  await expect(page).toHaveURL(`/onboarding/${clientId}`)
  const scheda = page.getByTestId('scheda-onboarding')
  await expect(scheda.getByRole('heading', { level: 1, name: `Onboarding di ${nome} Wizard` })).toBeVisible()
  await expect(scheda.getByTestId('stato-scheda')).toContainText('Pagamento confermato')
  await expect(scheda.getByTestId('riquadro-link')).toContainText('con il pagamento confermato a mano')
  await expect(scheda.getByTestId('riquadro-link').getByTestId('area-non-aperta')).toBeVisible()
  await expect(scheda.getByTestId('copia-link')).toHaveCount(0)
  await expect(scheda.getByTestId('riquadro-team')).toContainText('Marco Coach')
  await expect(scheda.getByTestId('riquadro-telegram')).toContainText('@e2e_onboarding')
  await expect(scheda.getByTestId('riquadro-passi').locator('li')).toHaveCount(9)
  await expect(scheda.getByTestId('riquadro-registro')).toContainText('Link attivo: pagamento confermato a mano')
  await expect(scheda.getByTestId('riquadro-registro')).toContainText('Onboarding avviato')

  // the notification of the confirmed payment, in the app: never an amount
  await page.goto('/notifiche')
  const notifica = page.getByRole('link', { name: new RegExp(`Pagamento confermato per ${nome} Wizard`) })
  await expect(notifica).toBeVisible()
  await expect(notifica).not.toContainText('€')

  // and the client is in the list, with his state in words
  await page.goto('/onboarding')
  const riga = page.getByTestId('riga-onboarding').filter({ hasText: `${nome} Wizard` })
  await expect(riga).toContainText('Pagamento confermato')
  await expect(riga).toContainText('Coach: Marco Coach')
})

test('«Avvia onboarding» su una vendita che c’è già, poi revoca con motivo e seconda conferma, e riattiva', async ({ page }) => {
  const nome = `${PREFISSO}Avvia${Date.now().toString().slice(-6)}`
  const saleId = await creaVenditaDiProva(nome, ID_ADMIN, { giorniFa: 2 })
  const clientId = (await clienteDiNome(nome))!
  await accedi(page, 'admin')

  // the sale is among the «nuovo» sales without onboarding, without an amount
  await page.goto('/onboarding')
  const senza = page.getByTestId('senza-onboarding')
  await expect(senza.getByText(`${nome} Incassi`)).toBeVisible()
  await expect(senza).not.toContainText('€')

  // the hook on the sale's page
  await page.goto(`/sales/${saleId}`)
  const aggancio = page.getByTestId('aggancio-onboarding')
  await expect(aggancio).toHaveAttribute('data-avviato', 'no')
  await aggancio.getByRole('link', { name: 'Avvia onboarding' }).click()
  await expect(page).toHaveURL(`/onboarding/nuovo?vendita=${saleId}`)

  // the wizard without the screen of the sale: client, team, summary
  const wizard = page.getByTestId('wizard')
  await expect(wizard.getByRole('heading', { level: 1, name: 'Avvia onboarding' })).toBeVisible()
  await expect(page.getByTestId('indicatore-passi').locator('li[data-passo="vendita"]')).toHaveAttribute('data-stato', 'fatto')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(nome)
  await page.getByTestId('minorenne').click()
  await expect(page.getByText('Il link resta fermo finché non registri il consenso di un genitore.')).toBeVisible()
  await page.getByTestId('minorenne').click()
  await avantiFino(page, 'team')
  await expect(titoloSchermata(page, 'Team')).toBeFocused()
  await avantiFino(page, 'riepilogo')
  await expect(page.getByTestId('riepilogo')).toContainText('Percorso Alpha 3 mesi')
  await expect(page.getByTestId('riepilogo')).not.toContainText('€')
  await avanti(page).click()
  await expect(page.getByTestId('onboarding-avviato')).toBeVisible()
  expect((await invitoDi(clientId))?.stato).toBe('in_attesa_pagamento')

  // the sale's page and the client's card now lead to the onboarding
  await page.goto(`/sales/${saleId}`)
  await expect(page.getByTestId('aggancio-onboarding')).toHaveAttribute('data-avviato', 'si')
  await page.goto(`/clients/${clientId}`)
  await page.getByTestId('aggancio-onboarding').click()
  await expect(page).toHaveURL(`/onboarding/${clientId}`)

  // «Revoca»: the reason is required, and the first tap never revokes
  const scheda = page.getByTestId('scheda-onboarding')
  await scheda.getByTestId('revoca-link').click()
  const domanda = page.getByRole('dialog')
  await domanda.getByTestId('revoca-link-si').click()
  await expect(domanda.getByText('Scrivi il motivo della revoca')).toBeVisible()
  await domanda.getByLabel('Motivo').fill('Prova e2e: il cliente ci ripensa')
  await domanda.getByTestId('revoca-link-si').click()
  await expect(domanda.getByTestId('revoca-seconda-conferma')).toBeVisible()
  expect((await invitoDi(clientId))?.stato).toBe('in_attesa_pagamento')
  await domanda.getByTestId('revoca-link-si').click()
  await expect(page.getByText('Link revocato', { exact: true }).first()).toBeVisible()
  await expect(scheda.getByTestId('stato-scheda')).toContainText('Link revocato')
  await expect(scheda.getByTestId('riquadro-link')).toContainText('Motivo: Prova e2e: il cliente ci ripensa')
  await expect(scheda.getByTestId('riquadro-registro')).toContainText('Link revocato: Prova e2e: il cliente ci ripensa')
  expect(await invitoDi(clientId)).toMatchObject({ stato: 'revocato', revocato_motivo: 'Prova e2e: il cliente ci ripensa' })

  // «Riattiva»: back to what it was
  await scheda.getByTestId('riattiva-link').click()
  await expect(page.getByText('Link riattivato: in attesa di pagamento').first()).toBeVisible()
  await expect(scheda.getByTestId('stato-scheda')).toContainText('In attesa di pagamento')
  expect((await invitoDi(clientId))?.stato).toBe('in_attesa_pagamento')

  // the team from the card
  await scheda.getByTestId('modifica-team').click()
  const foglio = page.getByRole('dialog')
  await foglio.getByLabel('Revisore video').selectOption(ID_COACH)
  await foglio.getByRole('button', { name: 'Salva il team' }).click()
  await expect(page.getByText('Team aggiornato', { exact: true })).toBeVisible()
  await expect(scheda.getByTestId('riquadro-team').locator('[data-incarico="revisore"]')).toContainText('Marco Coach')

  // a client already started is never started twice
  await page.goto(`/onboarding/nuovo?vendita=${saleId}`)
  await expect(page.getByTestId('wizard-impossibile')).toHaveAttribute('data-motivo', 'gia_avviato')
  await expect(page.getByRole('link', { name: 'Apri l’onboarding' })).toHaveAttribute('href', `/onboarding/${clientId}`)
})

test('dalla call chiusa l’admin arriva al wizard con i dati del lead; la sola vendita resta a un tocco', async ({ page }) => {
  const nome = `${PREFISSO}Call${Date.now().toString().slice(-6)}`
  const callId = await creaCallDiProva(`${nome} Lead`, ID_ADMIN, 3)
  await chiudiCall(callId)
  await accedi(page, 'admin')

  // the card of the closed call without its sale: «Nuovo cliente» first, the sale alone second
  await page.goto('/calls')
  const nuovo = page.locator(`a[href="/onboarding/nuovo?call=${callId}"]`)
  await expect(nuovo).toBeVisible()
  await expect(nuovo).toHaveText('Nuovo cliente')
  await expect(page.locator(`a[data-testid="solo-vendita-dalla-call"][href="/sales/new?call=${callId}"]`)).toHaveText(
    'Registra solo la vendita',
  )
  await nuovo.click()
  await expect(page).toHaveURL(`/onboarding/nuovo?call=${callId}`)

  // the lead's name is already there, and the way to the sale alone
  await expect(page.getByTestId('dalla-call')).toBeVisible()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(nome)
  await expect(page.getByLabel('Cognome')).toHaveValue('Lead')
  await expect(page.getByTestId('solo-vendita')).toHaveAttribute('href', `/sales/new?call=${callId}`)

  await avantiFino(page, 'vendita')
  await expect(page.getByTestId('vendita-dalla-call')).toBeVisible()
  await scegli(page, /Percorso Alpha 3 mesi/)
  await avantiFino(page, 'team')
  await avantiFino(page, 'riepilogo')
  await avanti(page).click()
  await expect(page.getByTestId('onboarding-avviato')).toBeVisible()

  // the sale is the call's, and the page under the last screen never started a second one
  const clientId = (await clienteDiNome(nome))!
  const { data: vendite } = await dbLocale().from('sales').select('id, call_id').eq('client_id', clientId)
  expect(vendite).toHaveLength(1)
  expect(vendite![0].call_id).toBe(callId)

  // the address says the wizard is done: a reload opens the way to his card, never an empty wizard
  await expect(page).toHaveURL(`/onboarding/nuovo?avviato=${clientId}`)
  await page.reload()
  const avviato = page.getByTestId('wizard-avviato')
  await expect(avviato).toBeVisible()
  await expect(avviato.locator(`a[href="/onboarding/${clientId}"]`)).toBeVisible()
})

test('il setter non ha la voce Onboarding e le sue pagine lo rimandano', async ({ page }) => {
  await accedi(page, 'setter')
  await expect(page.getByRole('link', { name: 'Onboarding', exact: true })).toHaveCount(0)
  for (const indirizzo of ['/onboarding', '/onboarding/nuovo', '/onboarding/0b0a0000-0000-4000-8000-000000000001', '/settings/onboarding']) {
    await page.goto(indirizzo)
    await expect(page).toHaveURL('/today')
  }
  await expect(page.getByRole('heading', { name: 'Onboarding' })).toHaveCount(0)
})

test('Impostazioni › Onboarding: i giorni del link si salvano, l’area clienti si legge soltanto', async ({ page }) => {
  const db = dbLocale()
  const { data: prima } = await db.from('onboarding_impostazioni').select('giorni_validita_link').single()
  await accedi(page, 'admin')
  try {
    await page.goto('/settings')
    await page.getByRole('link', { name: /Onboarding/ }).last().click()
    await expect(page).toHaveURL('/settings/onboarding')
    await expect(page.getByTestId('area-clienti')).toContainText('Non ancora aperta')

    const giorni = page.getByLabel('Giorni di validità del link')
    await giorni.fill('120')
    await page.getByRole('button', { name: 'Salva le impostazioni' }).click()
    await expect(page.getByText('I giorni di validità del link vanno da 1 a 90')).toBeVisible()
    await giorni.fill('21')
    await page.getByRole('button', { name: 'Salva le impostazioni' }).click()
    await expect(page.getByText('Impostazioni salvate')).toBeVisible()
    const { data: dopo } = await db.from('onboarding_impostazioni').select('giorni_validita_link, aperto_ai_clienti').single()
    expect(dopo).toMatchObject({ giorni_validita_link: 21, aperto_ai_clienti: false })
  } finally {
    await db
      .from('onboarding_impostazioni')
      .update({ giorni_validita_link: prima?.giorni_validita_link ?? 14 })
      .eq('id', true)
  }
})

test('a 390 px wizard, lista, scheda e impostazioni non scorrono di lato', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  for (const indirizzo of [
    '/onboarding',
    '/onboarding/nuovo',
    '/onboarding/0b0a0000-0000-4000-8000-000000000001',
    '/settings/onboarding',
  ]) {
    await page.goto(indirizzo)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const larghezza = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(larghezza, indirizzo).toBeLessThanOrEqual(390)
  }

  // the screen of the sale is the widest of the wizard
  await page.goto('/onboarding/nuovo')
  await page.getByLabel('Nome', { exact: true }).fill('Prova')
  await avanti(page).click()
  await expect(titoloSchermata(page, 'Vendita')).toBeVisible()
  await scegli(page, /Percorso Alpha 6 mesi/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  // every tap of the wizard is at least 44 px high
  for (const bottone of await page.getByTestId('wizard').getByRole('button').all()) {
    const riquadro = await bottone.boundingBox()
    if (riquadro) expect(riquadro.height).toBeGreaterThanOrEqual(44)
  }
})
