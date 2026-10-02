import { expect, test, type Locator, type Page } from '@playwright/test'

import { aggiungiGiorni, formatOra, oggiRoma } from '../lib/date'
import { formatData, formatEuro, formatNumero } from '../lib/format'
import { ID_ADMIN, ID_CLOSER, ID_SETTER, creaCallDiProva, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// Every lead created here starts with this name: removed at the end (calls cascade)
const PREFISSO = 'E2E Giornata'
// A closed call becomes a client: one word, so the client's first name keeps it too
const PREFISSO_VENDITA = 'E2EGiornataChiusa'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
  await pulisciVendite(PREFISSO_VENDITA)
})

/** Tap the visible chip, as a person would: the radio itself is visually hidden. */
async function scegli(page: Page, gruppo: string, etichetta: string) {
  const insieme = page.getByRole('group', { name: gruppo })
  await insieme
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: etichetta, exact: true }) })
    .click()
  await expect(insieme.getByRole('radio', { name: etichetta, exact: true })).toBeChecked()
}

/** One number of the day's row, read as the page shows it. */
async function conto(page: Page, campo: string): Promise<number> {
  const testo = await page.getByTestId(`conto-${campo}`).locator('dd').innerText()
  return Number(testo.replace(/\./g, ''))
}

/** What the closer's day should say for the seed setter's calls of that day, straight from the database. */
async function esitiDelSetter(giorno: string) {
  const { data, error } = await dbLocale()
    .from('calls')
    .select('stato, esito, qualificata, programmata_il')
    .eq('setter_id', ID_SETTER)
    .gte('programmata_il', `${aggiungiGiorni(giorno, -1)}T12:00:00Z`)
    .lt('programmata_il', `${aggiungiGiorni(giorno, 1)}T12:00:00Z`)
  if (error) throw error
  const delGiorno = data.filter((c) => oggiRoma(new Date(c.programmata_il)) === giorno)
  const svolte = delGiorno.filter((c) => c.stato === 'svolta')
  return {
    svolte: svolte.length,
    qualificate: svolte.filter((c) => c.qualificata).length,
    followUp: svolte.filter((c) => c.esito === 'follow_up').length,
  }
}

/** An amount of the day's row, as the page writes it. */
function euro(page: Page, campo: string) {
  return page.getByTestId(`conto-${campo}`).locator('dd')
}

async function cella(tabella: Locator, indice: number) {
  return tabella.locator('tfoot tr').getByRole('cell').nth(indice)
}

test('giornata: l’admin aggiunge una call passata per il setter, ne registra l’esito e la riga si compila', async ({
  page,
  browser,
}) => {
  // two people, two logins, five pages: more than the default 30 s on a busy dev server
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const giorno = aggiungiGiorni(oggi, -2)
  const firma = Date.now()
  const nome = `${PREFISSO} ${firma}`

  await accedi(page, 'admin')

  // from the Closer tab: one primary button, then two days back with the arrows
  await page.goto('/setting/closer')
  await page.getByTestId('compila-giornata').click()
  await expect(page).toHaveURL('/setting/closer/giorno')
  await expect(page.getByRole('heading', { level: 1, name: 'Compila la giornata' })).toBeVisible()
  await expect(page.getByTestId('giorno')).toContainText('Oggi')
  await page.getByRole('link', { name: 'Giorno precedente' }).click()
  await expect(page).toHaveURL(`/setting/closer/giorno?data=${aggiungiGiorni(oggi, -1)}`)
  await page.getByRole('link', { name: 'Giorno precedente' }).click()
  await expect(page).toHaveURL(`/setting/closer/giorno?data=${giorno}`)
  await expect(page.getByTestId('giorno')).toContainText(formatData(giorno))

  const prima = {
    call: await conto(page, 'call'),
    qualificate: await conto(page, 'qualificate'),
    follow_up: await conto(page, 'follow_up'),
  }

  // "Aggiungi una call": the form opens on that day and comes back here
  await page.getByRole('link', { name: 'Aggiungi una call' }).first().click()
  await expect(page).toHaveURL(/\/calls\/new\?/)
  await expect(page.getByLabel('Data')).toHaveValue(giorno)
  await page.getByLabel('Nome del lead').fill(nome)
  await page.getByLabel(/Handle Instagram/).fill(`e2e.giornata.${firma}`)
  await scegli(page, 'Fonte', 'DM inbound')
  await page.getByLabel('Ora').fill('10:30')
  // the admin books for himself unless he picks a setter; he runs the call himself
  await expect(page.getByRole('group', { name: 'Setter' }).getByRole('radio', { name: 'Io' })).toBeChecked()
  await scegli(page, 'Setter', 'Loris Setter')
  await expect(page.getByRole('group', { name: 'Closer' }).getByRole('radio', { name: 'Dany Montagnolo' })).toBeChecked()
  await page.getByRole('button', { name: 'Fissa la call' }).click()

  await expect(page).toHaveURL(`/setting/closer/giorno?data=${giorno}`)
  const scheda = page.getByRole('article', { name: nome })
  await expect(scheda).toBeVisible()

  const { data: call } = await dbLocale()
    .from('calls')
    .select('id, setter_id, closer_id, created_by, tipo, stato, programmata_il, lead:leads!inner(nome, setter_id, fonte)')
    .eq('lead.nome', nome)
    .single()
  expect(call).toMatchObject({
    setter_id: ID_SETTER,
    closer_id: ID_ADMIN,
    created_by: ID_ADMIN,
    tipo: 'discovery',
    stato: 'programmata',
    lead: { setter_id: ID_SETTER, fonte: 'dm_inbound' },
  })
  expect(oggiRoma(new Date(call!.programmata_il))).toBe(giorno)
  expect(formatOra(call!.programmata_il)).toBe('10:30')

  // the outcome from the day's page: held, qualified, follow up
  await scheda.getByRole('button', { name: 'Registra esito' }).click()
  const foglio = page.getByRole('dialog', { name: nome })
  await foglio.getByRole('button', { name: 'Follow-up' }).click()
  // the reason for not closing is required (Dany, 30/09/2026)
  await foglio.getByLabel(/Motivo di non chiusura/).fill('Vuole provare da solo')
  await foglio.getByRole('button', { name: 'Sì' }).click()
  await expect(page.getByText(`${nome}: follow-up`)).toBeVisible()

  // the day's row fills up, from SQL
  await expect(page.getByTestId('conto-call').locator('dd')).toHaveText(formatNumero(prima.call + 1))
  await expect(page.getByTestId('conto-qualificate').locator('dd')).toHaveText(formatNumero(prima.qualificate + 1))
  await expect(page.getByTestId('conto-follow_up').locator('dd')).toHaveText(formatNumero(prima.follow_up + 1))
  await expect(scheda.getByRole('button', { name: 'Cambia esito' })).toBeVisible()

  const { data: dopo } = await dbLocale().from('calls').select('stato, qualificata, esito, obiezione_principale').eq('id', call!.id).single()
  expect(dopo).toEqual({ stato: 'svolta', qualificata: true, esito: 'follow_up', obiezione_principale: 'Vuole provare da solo' })

  // the setter sees the outcome of the call booked for him in "Giorno per giorno"
  const attesi = await esitiDelSetter(giorno)
  expect(attesi.followUp).toBeGreaterThanOrEqual(1)
  const setter = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await accedi(setter, 'setter')
  await setter.goto(`/my-numbers?da=${giorno}&a=${giorno}`)
  const tabella = setter.getByTestId('mie-giornate').getByRole('table', { name: 'Le call che hai fissato' })
  await expect(tabella).toBeVisible()
  // Svolte, Qualif. closer, Follow up closer: the period is that one day, the total is its row
  await expect(await cella(tabella, 2)).toHaveText(formatNumero(attesi.svolte))
  await expect(await cella(tabella, 3)).toHaveText(formatNumero(attesi.qualificate))
  await expect(await cella(tabella, 5)).toHaveText(formatNumero(attesi.followUp))

  // and he still cannot open the closer's pages
  await setter.goto('/setting/closer')
  await expect(setter).toHaveURL('/today')
  await setter.goto(`/setting/closer/giorno?data=${giorno}`)
  await expect(setter).toHaveURL('/today')
  await setter.context().close()
})

test('giornata: una call chiusa su un giorno passato porta la vendita su quel giorno, e si torna lì', async ({ page }) => {
  test.setTimeout(90_000)
  const lead = `${PREFISSO_VENDITA}${Date.now()} Rossi`
  // held two days ago: the sale must land on that day, not today
  const callId = await creaCallDiProva(lead, ID_ADMIN, 50)
  const giorno = oggiRoma(new Date(Date.now() - 50 * 3_600_000))
  const { data: prima, error } = await dbLocale()
    .from('sales')
    .select('valore_contratto')
    .eq('closer_id', ID_ADMIN)
    .eq('tipo', 'nuovo')
    .eq('data_vendita', giorno)
  if (error) throw error
  const revenuePrima = prima.reduce((somma, v) => somma + Number(v.valore_contratto), 0)

  await accedi(page, 'admin')
  await page.goto(`/setting/closer/giorno?data=${giorno}`)
  const chiusePrima = await conto(page, 'chiuse')
  await expect(euro(page, 'revenue')).toHaveText(formatEuro(revenuePrima))

  const scheda = page.getByRole('article', { name: lead })
  await scheda.getByRole('button', { name: 'Registra esito' }).click()
  await page.getByRole('dialog', { name: lead }).getByRole('button', { name: 'Chiusa' }).click()

  // the prefilled sale: dated on the call's day, with the way back to the day;
  // the path usually starts a week after the payment (02/10/2026)
  await expect(page).toHaveURL(new RegExp(`/sales/new\\?call=${callId}&da=`))
  await expect(page.getByLabel('Data vendita')).toHaveValue(giorno)
  await expect(page.getByLabel('Inizio percorso')).toHaveValue(aggiungiGiorni(giorno, 7))
  await expect(page.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', `/setting/closer/giorno?data=${giorno}`)
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: /Percorso Alpha 3 mesi/ }) })
    .click()
  await expect(page.getByLabel('Valore del contratto')).toHaveValue('1.500,00')
  await page.getByRole('button', { name: 'Registra vendita' }).click()

  // back on the same day: the close and the revenue on one row
  await expect(page).toHaveURL(`/setting/closer/giorno?data=${giorno}`)
  await expect(page.getByTestId('conto-chiuse').locator('dd')).toHaveText(formatNumero(chiusePrima + 1))
  await expect(euro(page, 'revenue')).toHaveText(formatEuro(revenuePrima + 1500))

  const { data: vendita } = await dbLocale()
    .from('sales')
    .select('tipo, closer_id, data_vendita, data_inizio')
    .eq('call_id', callId)
    .single()
  expect(vendita).toEqual({ tipo: 'nuovo', closer_id: ID_ADMIN, data_vendita: giorno, data_inizio: aggiungiGiorni(giorno, 7) })
})

test('giornata: un «da» che porta fuori dall’app non diventa mai il ritorno', async ({ page }) => {
  await accedi(page, 'admin')
  // a tab or a newline turns "/\t/x" into "//x", another site, for the browser
  for (const da of ['/%09/example.com', '/%0A/example.com', '/%0D%0A/example.com/login', '//example.com']) {
    await page.goto(`/calls/new?da=${da}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Nuova call' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Indietro' })).toHaveCount(0)
  }
})

test('giornata a 390px: frecce e bottoni da 44px, nessuno scroll orizzontale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  const giorno = aggiungiGiorni(oggiRoma(), -3)
  await page.goto(`/setting/closer/giorno?data=${giorno}`)

  for (const nome of ['Giorno precedente', 'Giorno successivo']) {
    const box = await page.getByRole('link', { name: nome }).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  const aggiungi = await page.getByRole('link', { name: 'Aggiungi una call' }).first().boundingBox()
  expect(aggiungi!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('riga-giorno')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // the date picker opens any day
  await page.getByLabel('Scegli il giorno da compilare').fill(aggiungiGiorni(giorno, -1))
  await expect(page).toHaveURL(`/setting/closer/giorno?data=${aggiungiGiorni(giorno, -1)}`)
})

test('giornata: un giorno senza call lo dice, e offre di aggiungerne una', async ({ page }) => {
  await accedi(page, 'admin')
  // far enough back that the seed has nothing there
  const vuoto = '2025-01-15'
  await page.goto(`/setting/closer/giorno?data=${vuoto}`)
  await expect(page.getByText('Nessuna call in questo giorno')).toBeVisible()
  await expect(page.getByTestId('conto-call').locator('dd')).toHaveText('0')
  const aggiungi = page.getByRole('link', { name: 'Aggiungi una call' })
  await expect(aggiungi).toHaveCount(2)
  await expect(aggiungi.last()).toHaveAttribute('href', new RegExp(`^/calls/new\\?data=${vuoto}&da=`))
})

test('giornata: il closer compila la sua, senza aggiungere call', async ({ page }) => {
  const nome = `${PREFISSO} Closer ${Date.now()}`
  await creaCallDiProva(nome, ID_CLOSER, 2)
  const giorno = oggiRoma(new Date(Date.now() - 2 * 3_600_000))

  await accedi(page, 'closer')
  await page.goto('/setting/closer')
  await page.getByTestId('compila-giornata').click()
  await expect(page).toHaveURL('/setting/closer/giorno')
  await expect(page.getByRole('heading', { level: 1, name: 'Compila la giornata' })).toBeVisible()
  await page.goto(`/setting/closer/giorno?data=${giorno}`)

  await expect(page.getByRole('article', { name: nome })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Aggiungi una call' })).toHaveCount(0)
  await expect(page.getByLabel('Closer', { exact: true })).toHaveCount(0)
  // someone else's closer id in the URL changes nothing: always his own day
  await page.goto(`/setting/closer/giorno?data=${giorno}&closer=${ID_ADMIN}`)
  await expect(page.getByRole('article', { name: nome })).toBeVisible()

  // "Nuova call" stays the setter's and the admin's
  await page.goto('/calls/new')
  await expect(page).toHaveURL('/calls')
})

test('giornata: dopo l’esito la matita apre le note aggiuntive appena salvate, e il solo link non le cancella', async ({
  page,
}) => {
  const nome = `${PREFISSO} Note ${Date.now()}`
  const id = await creaCallDiProva(nome, ID_CLOSER, 2)
  const giorno = oggiRoma(new Date(Date.now() - 2 * 3_600_000))

  await accedi(page, 'closer')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/setting/closer/giorno?data=${giorno}`)
  const scheda = page.getByRole('article', { name: nome })

  // the outcome with the closer's notes, then the pencil on the same page, without reloading
  await scheda.getByRole('button', { name: 'Registra esito' }).click()
  const esito = page.getByRole('dialog')
  await esito.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await esito.getByLabel(/Motivo di non chiusura/).fill('Deve parlarne con la compagna')
  await esito.getByLabel(/Note aggiuntive/).fill('Richiamare lunedì')
  await esito.getByRole('button', { name: 'Sì', exact: true }).click()
  await expect(scheda.getByText('Follow-up')).toBeVisible()

  await scheda.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  const matita = page.getByRole('dialog')
  await expect(matita.getByLabel(/Note aggiuntive/)).toHaveValue('Richiamare lunedì')
  await matita.getByLabel('Link alla registrazione').fill('https://fathom.video/share/e2e')
  await matita.getByRole('button', { name: 'Salva la call' }).click()
  await expect(page.getByText('Call aggiornata')).toBeVisible()
  await expect(matita).toHaveCount(0)

  // a new outcome with new notes: the pencil opens on those, not on the first ones
  await scheda.getByRole('button', { name: 'Cambia esito' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Persa', exact: true }).click()
  await page.getByRole('dialog').getByLabel(/Note aggiuntive/).fill('Ha scelto un altro coach')
  await page.getByRole('dialog').getByRole('button', { name: 'No', exact: true }).click()
  await expect(scheda.getByText('Persa')).toBeVisible()
  await scheda.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  await expect(page.getByRole('dialog').getByLabel(/Note aggiuntive/)).toHaveValue('Ha scelto un altro coach')
  await expect(page.getByRole('dialog').getByLabel('Link alla registrazione')).toHaveValue('https://fathom.video/share/e2e')

  const { data } = await dbLocale()
    .from('calls')
    .select('note_closer, link_registrazione, esito')
    .eq('id', id)
    .single()
  expect(data).toEqual({
    note_closer: 'Ha scelto un altro coach',
    link_registrazione: 'https://fathom.video/share/e2e',
    esito: 'persa',
  })
})
