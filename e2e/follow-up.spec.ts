import { expect, test, type Page } from '@playwright/test'

import { FOLLOW_UP, VENDITA_DA_REGISTRARE, dettaglioVendita, quandoFollowUpDa } from '../lib/call/follow-up'
import { quandoBreve } from '../lib/call/spostamento'
import { aggiungiGiorni, formatOra, oggiRoma } from '../lib/date'
import { formatData, formatEuro } from '../lib/format'
import { ETICHETTA_TIPO_VENDITA } from '../lib/validation/vendita'
import { MOTIVO_NON_CHIUSURA } from '../lib/setting/commento'
import { ID_ADMIN, ID_CLOSER, ID_SETTER, PRODOTTO_3_MESI, creaCallDiProva, dbLocale, pulisciVendite } from './db'
import { nonRegistrata } from './registrazione'
import { accedi, UTENTI } from './utenti'

// The follow-up call (Dany, 07/10/2026): "Follow-up" asks whether a follow-up
// call was booked. "Sì, call fissata" asks its day and time and books a new
// call there, linked to the first one (same lead, setter, closer and type);
// "No, follow-up in chat" asks nothing, and the card offers «Fissa la call di
// follow-up» later. A closed call without its sale asks for it.
const PREFISSO = 'E2E FollowUp'

test.afterAll(async () => {
  // the clients of the sale tests with their sales, then the leads with their calls (on delete cascade)
  await pulisciVendite(PREFISSO)
})

function nomeUnico(etichetta: string) {
  return `${PREFISSO} ${etichetta} ${Date.now()}`
}

/** The card of the first call: the follow-up call has the same lead's name, and its badge. */
function primaCall(page: Page, nome: string) {
  return page.getByRole('article', { name: nome }).filter({ hasNot: page.getByTestId('follow-up-di') })
}

function callDiFollowUp(page: Page, nome: string) {
  return page.getByRole('article', { name: nome }).filter({ has: page.getByTestId('follow-up-di') })
}

/** A Europe/Rome day and time as a timestamptz, summer or winter time. */
function istanteRoma(giorno: string, ora: string): string {
  for (const fuso of ['+02:00', '+01:00']) {
    const istante = new Date(`${giorno}T${ora}:00${fuso}`)
    if (oggiRoma(istante) === giorno && formatOra(istante) === ora) return istante.toISOString()
  }
  throw new Error(`${giorno} ${ora} non esiste a Roma`)
}

async function leggi(id: string) {
  const { data, error } = await dbLocale()
    .from('calls')
    .select('id, lead_id, setter_id, closer_id, tipo, stato, esito, programmata_il, follow_up_di')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

async function followUpDi(id: string) {
  const { data, error } = await dbLocale()
    .from('calls')
    .select('id, lead_id, setter_id, closer_id, tipo, stato, esito, programmata_il, follow_up_di, created_by')
    .eq('follow_up_di', id)
  if (error) throw error
  return data
}

/** A held call of the seed setter that ended in follow-up, by chat, `oreFa` hours ago. */
async function callInFollowUp(nome: string, closerId: string, oreFa = 3) {
  const id = await creaCallDiProva(nome, closerId, oreFa)
  const { error } = await dbLocale()
    .from('calls')
    .update({ stato: 'svolta', esito: 'follow_up', qualificata: true, obiezione_principale: 'Ci pensa' })
    .eq('id', id)
  if (error) throw error
  return id
}

test('l’admin come closer: Follow-up, «Sì, call fissata» domani alle 18:00 fissa una call nuova, collegata', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const domani = aggiungiGiorni(oggi, 1)
  const nome = nomeUnico('Fissata')
  const id = await creaCallDiProva(nome, ID_ADMIN, 2)
  const prima = await leggi(id)

  await accedi(page, 'admin')
  await page.goto('/calls')
  await primaCall(page, nome).getByRole('button', { name: 'Registra esito' }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await nonRegistrata(foglio)

  // the question first, with its two big choices
  await expect(foglio.getByRole('group', { name: FOLLOW_UP.domanda })).toBeVisible()
  const si = foglio.getByRole('button', { name: FOLLOW_UP.si })
  const no = foglio.getByRole('button', { name: FOLLOW_UP.no })
  for (const bottone of [si, no]) expect((await bottone.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // nothing is asked about the reason yet
  await expect(foglio.getByLabel(/Motivo di non chiusura/)).toHaveCount(0)
  await si.click()

  // day and time as "Sposta", and whose sale a close on it is
  await expect(foglio.getByRole('group', { name: FOLLOW_UP.quando })).toBeVisible()
  await expect(foglio.getByTestId('follow-up-stesso-setter')).toHaveText(FOLLOW_UP.stessoSetter(UTENTI.setter.nome))
  await foglio.getByRole('button', { name: 'Domani', exact: true }).click()
  await expect(foglio.getByRole('button', { name: 'Domani', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await foglio.getByLabel('Ora').fill('18:00')
  await foglio.getByRole('button', { name: FOLLOW_UP.avanti }).click()

  // the reason step, with the choice on top and the way back
  const quando = quandoFollowUpDa(domani, '18:00', oggi)
  const scelta = foglio.getByTestId('scelta-follow-up')
  await expect(scelta).toHaveText(`${FOLLOW_UP.sceltaCall(quando)}: ${FOLLOW_UP.cambia}`)
  // back to the day, and forward again: the day stays the chosen one
  await scelta.click()
  await expect(foglio.getByLabel('Giorno')).toHaveValue(domani)
  await expect(foglio.getByLabel('Ora')).toHaveValue('18:00')
  await foglio.getByRole('button', { name: FOLLOW_UP.avanti }).click()

  // without the reason nothing is saved
  await foglio.getByRole('button', { name: 'Sì', exact: true }).click()
  await expect(foglio.getByText(MOTIVO_NON_CHIUSURA.manca, { exact: true })).toBeVisible()
  expect(await followUpDi(id)).toHaveLength(0)

  await foglio.getByLabel(/Motivo di non chiusura/).fill('Deve sentire il commercialista')
  await foglio.getByRole('button', { name: 'Sì', exact: true }).click()
  await expect(page.getByText(`${nome}: follow-up`)).toBeVisible()
  await expect(foglio).toHaveCount(0)

  // the database: the first call in follow-up, a new call linked to it, same lead, setter, closer and type
  expect(await leggi(id)).toMatchObject({ stato: 'svolta', esito: 'follow_up', follow_up_di: null })
  const nuove = await followUpDi(id)
  expect(nuove).toHaveLength(1)
  expect(nuove[0]).toMatchObject({
    lead_id: prima.lead_id,
    setter_id: ID_SETTER,
    closer_id: ID_ADMIN,
    tipo: prima.tipo,
    stato: 'programmata',
    esito: null,
    created_by: ID_ADMIN,
  })
  expect(new Date(nuove[0].programmata_il).toISOString()).toBe(istanteRoma(domani, '18:00'))

  // the cards: the first one says when its follow-up call is, the new one whose follow-up it is
  await expect(primaCall(page, nome).getByTestId('call-di-follow-up')).toHaveText(FOLLOW_UP.diCall(quando))
  await expect(callDiFollowUp(page, nome).getByTestId('badge-follow-up')).toHaveText(FOLLOW_UP.etichetta)
  await expect(callDiFollowUp(page, nome).getByTestId('follow-up-di')).toHaveText(
    FOLLOW_UP.della(quandoBreve(prima.programmata_il, oggi)),
  )
  await expect(callDiFollowUp(page, nome)).toContainText('18:00')

  // the first call already has its follow-up call: "Follow-up" asks no question again
  await primaCall(page, nome).getByRole('button', { name: 'Cambia esito' }).click()
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await nonRegistrata(foglio)
  await expect(foglio.getByTestId('follow-up-gia-fissata')).toHaveText(FOLLOW_UP.giaFissata(quando))
  await expect(foglio.getByRole('group', { name: FOLLOW_UP.domanda })).toHaveCount(0)
  await expect(foglio.getByLabel(/Motivo di non chiusura/)).toHaveValue('Deve sentire il commercialista')
  await page.keyboard.press('Escape')

  // the follow-up call counts in its own day, like every call
  await page.goto(`/setting/closer/giorno?data=${domani}`)
  await expect(callDiFollowUp(page, nome).getByTestId('follow-up-di')).toBeVisible()
})

test('a 390 px: «No, follow-up in chat» non fissa niente; poi «Fissa la call di follow-up» dalla scheda', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const oggi = oggiRoma()
  const domani = aggiungiGiorni(oggi, 1)
  const nome = nomeUnico('Chat')
  const id = await creaCallDiProva(nome, ID_CLOSER, 2)

  await accedi(page, 'closer')
  await page.goto('/calls')
  await primaCall(page, nome).getByRole('button', { name: 'Registra esito' }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await nonRegistrata(foglio)
  await foglio.getByRole('button', { name: FOLLOW_UP.no }).click()

  // the reason step says the choice; the sheet never scrolls sideways
  await expect(foglio.getByTestId('scelta-follow-up')).toHaveText(`${FOLLOW_UP.inChat}: ${FOLLOW_UP.cambia}`)
  const senzaScrollLaterale = () =>
    page.evaluate(() => {
      const dialogo = document.querySelector('[role="dialog"]')
      return (
        document.documentElement.scrollWidth <= window.innerWidth &&
        (!dialogo || dialogo.scrollWidth <= dialogo.clientWidth)
      )
    })
  expect(await senzaScrollLaterale()).toBe(true)
  // back to the question: the day step is wide too
  await foglio.getByTestId('scelta-follow-up').click()
  await expect(foglio.getByRole('group', { name: FOLLOW_UP.domanda })).toBeVisible()
  await foglio.getByRole('button', { name: FOLLOW_UP.si }).click()
  await expect(foglio.getByRole('group', { name: FOLLOW_UP.quando })).toBeVisible()
  expect(await senzaScrollLaterale()).toBe(true)
  await foglio.getByRole('button', { name: `${FOLLOW_UP.si}: ${FOLLOW_UP.cambia}` }).click()
  await foglio.getByRole('button', { name: FOLLOW_UP.no }).click()

  await foglio.getByLabel(/Motivo di non chiusura/).fill('Ci pensa e mi scrive')
  await foglio.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.getByText(`${nome}: follow-up`)).toBeVisible()

  // no new call
  expect(await leggi(id)).toMatchObject({ stato: 'svolta', esito: 'follow_up' })
  expect(await followUpDi(id)).toHaveLength(0)

  // the card: follow-up by chat, and the button to book the call later
  const card = primaCall(page, nome)
  await expect(card.getByTestId('follow-up-in-chat')).toHaveText(FOLLOW_UP.inChat)
  const fissa = card.getByRole('button', { name: FOLLOW_UP.nomeBottone(nome) })
  await expect(fissa).toHaveText(FOLLOW_UP.bottone)
  expect((await fissa.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await senzaScrollLaterale()).toBe(true)

  await fissa.click()
  await expect(foglio.getByRole('heading', { name: FOLLOW_UP.titolo(nome) })).toBeVisible()
  await expect(foglio.getByTestId('follow-up-stesso-setter')).toHaveText(FOLLOW_UP.stessoSetter(UTENTI.setter.nome))
  // the closer never books it in the past
  await foglio.getByLabel('Giorno').fill(aggiungiGiorni(oggi, -1))
  await foglio.getByRole('button', { name: FOLLOW_UP.salva }).click()
  await expect(foglio.getByText(FOLLOW_UP.soloAvanti)).toBeVisible()
  expect(await followUpDi(id)).toHaveLength(0)

  await foglio.getByRole('button', { name: 'Domani', exact: true }).click()
  await foglio.getByLabel('Ora').fill('18:00')
  await foglio.getByRole('button', { name: FOLLOW_UP.salva }).click()
  await expect(page.getByText(FOLLOW_UP.fatto(nome))).toBeVisible()
  // the button that opened the sheet is gone: the focus goes to the card's title, never <body>
  await expect(primaCall(page, nome).getByRole('heading', { name: nome })).toBeFocused()

  const nuove = await followUpDi(id)
  expect(nuove).toHaveLength(1)
  expect(nuove[0]).toMatchObject({ setter_id: ID_SETTER, closer_id: ID_CLOSER, stato: 'programmata', created_by: ID_CLOSER })
  expect(new Date(nuove[0].programmata_il).toISOString()).toBe(istanteRoma(domani, '18:00'))
  await expect(card.getByTestId('call-di-follow-up')).toHaveText(FOLLOW_UP.diCall(quandoFollowUpDa(domani, '18:00', oggi)))
  await expect(card.getByRole('button', { name: FOLLOW_UP.nomeBottone(nome) })).toHaveCount(0)
  await expect(callDiFollowUp(page, nome)).toBeVisible()
  expect(await senzaScrollLaterale()).toBe(true)
})

test('il setter della call vede la call di follow-up e le righe, mai i bottoni', async ({ page }) => {
  const oggi = oggiRoma()
  const domani = aggiungiGiorni(oggi, 1)
  const db = dbLocale()

  // a follow-up with its call, one by chat, a closed call without its sale
  const nomeFissata = nomeUnico('Setter fissata')
  const fissata = await callInFollowUp(nomeFissata, ID_CLOSER)
  const prima = await leggi(fissata)
  const { error } = await db.from('calls').insert({
    lead_id: prima.lead_id,
    setter_id: ID_SETTER,
    closer_id: ID_CLOSER,
    tipo: prima.tipo,
    programmata_il: istanteRoma(domani, '18:00'),
    follow_up_di: fissata,
    created_by: ID_CLOSER,
  })
  if (error) throw error
  const nomeChat = nomeUnico('Setter chat')
  await callInFollowUp(nomeChat, ID_CLOSER)
  const nomeChiusa = nomeUnico('Setter chiusa')
  const chiusa = await creaCallDiProva(nomeChiusa, ID_CLOSER, 3)
  await db.from('calls').update({ stato: 'svolta', esito: 'chiusa', qualificata: true }).eq('id', chiusa)

  await accedi(page, 'setter')
  await page.goto('/calls')

  await expect(callDiFollowUp(page, nomeFissata).getByTestId('follow-up-di')).toHaveText(
    FOLLOW_UP.della(quandoBreve(prima.programmata_il, oggi)),
  )
  await expect(primaCall(page, nomeFissata).getByTestId('call-di-follow-up')).toHaveText(
    FOLLOW_UP.diCall(quandoFollowUpDa(domani, '18:00', oggi)),
  )
  await expect(primaCall(page, nomeChat).getByTestId('follow-up-in-chat')).toHaveText(FOLLOW_UP.inChat)

  // never the buttons: the follow-up call is booked by the closer, the sale is the closer's
  await expect(page.getByRole('button', { name: new RegExp(FOLLOW_UP.bottone) })).toHaveCount(0)
  await expect(page.getByRole('link', { name: new RegExp(VENDITA_DA_REGISTRARE.bottone) })).toHaveCount(0)
  await expect(page.getByTestId('vendita-da-registrare')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Registra esito|Cambia esito/ })).toHaveCount(0)
  await expect(primaCall(page, nomeChiusa)).toBeVisible()
})

test('una call chiusa senza vendita chiede «Registra la vendita», che apre la vendita col setter della call', async ({
  page,
}) => {
  const nome = nomeUnico('Senza vendita')
  const id = await creaCallDiProva(nome, ID_CLOSER, 3)
  await dbLocale().from('calls').update({ stato: 'svolta', esito: 'chiusa', qualificata: true }).eq('id', id)

  await accedi(page, 'closer')
  await page.goto('/calls')

  const sezione = page.locator('section').filter({ hasText: VENDITA_DA_REGISTRARE.descrizioneSezione })
  await expect(sezione.getByRole('article', { name: nome })).toBeVisible()
  const card = primaCall(page, nome)
  await expect(card.getByTestId('vendita-da-registrare')).toHaveText(VENDITA_DA_REGISTRARE.etichetta)
  const registra = card.getByRole('link', { name: VENDITA_DA_REGISTRARE.nomeBottone(nome) })
  await expect(registra).toHaveText(VENDITA_DA_REGISTRARE.bottone)
  expect((await registra.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // the closer never ties a sale: the card says to ask the admin
  await expect(card.getByTestId('vendita-chiedi-admin')).toHaveText(VENDITA_DA_REGISTRARE.chiediAdmin)
  await expect(card.getByRole('button', { name: new RegExp(VENDITA_DA_REGISTRARE.collega) })).toHaveCount(0)
  // the card shows it once: the call is not repeated among the recorded ones
  await expect(page.getByRole('article', { name: nome })).toHaveCount(1)

  await registra.click()
  await expect(page).toHaveURL(`/sales/new?call=${id}`)
  // no sale of this lead registered without the call: no warning
  await expect(page.getByTestId('vendita-gia-registrata')).toHaveCount(0)
  await expect(page.getByTestId('precompilata')).toContainText(UTENTI.setter.nome)
  await expect(page.getByTestId('precompilata')).toContainText(UTENTI.closer.nome)

  // from the closer's day the sale comes back there
  const giorno = oggiRoma(new Date((await leggi(id)).programmata_il))
  await page.goto(`/setting/closer/giorno?data=${giorno}`)
  const link = primaCall(page, nome).getByRole('link', { name: VENDITA_DA_REGISTRARE.nomeBottone(nome) })
  await expect(link).toHaveAttribute('href', new RegExp(`^/sales/new\\?call=${id}&da=`))
})

/** A client named like the lead (the whole name as first name) with a "nuovo" sale, tied to `callId` or not. */
async function clienteConVendita(nomeLead: string, closerId: string, callId: string | null, leadId: string | null) {
  const db = dbLocale()
  const oggi = oggiRoma()
  const { data: cliente, error: e1 } = await db
    .from('clients')
    .insert({ nome: nomeLead, lead_id: leadId, closer_id: closerId, fonte: 'dm_inbound' })
    .select('id')
    .single()
  if (e1) throw e1
  const { data: vendita, error: e2 } = await db
    .from('sales')
    .insert({
      client_id: cliente.id,
      product_id: PRODOTTO_3_MESI,
      tipo: 'nuovo',
      call_id: callId,
      closer_id: closerId,
      data_vendita: oggi,
      data_inizio: aggiungiGiorni(oggi, 7),
      data_fine: aggiungiGiorni(oggi, 96),
      valore_contratto: 1500,
      numero_rate: 1,
    })
    .select('id')
    .single()
  if (e2) throw e2
  return vendita.id as string
}

test('la call di follow-up passata a un altro closer: la prima call lo dice, senza giorno né bottone', async ({ page }) => {
  const nome = nomeUnico('Altro closer')
  const id = await callInFollowUp(nome, ID_CLOSER)
  const prima = await leggi(id)
  // booked, then handed to the admin (the setter hands his calls over)
  const { error } = await dbLocale().from('calls').insert({
    lead_id: prima.lead_id,
    setter_id: ID_SETTER,
    closer_id: ID_ADMIN,
    tipo: prima.tipo,
    programmata_il: istanteRoma(aggiungiGiorni(oggiRoma(), 2), '18:00'),
    follow_up_di: id,
    created_by: ID_CLOSER,
  })
  if (error) throw error

  await accedi(page, 'closer')
  await page.goto('/calls')
  const card = primaCall(page, nome)
  await expect(card.getByTestId('call-di-follow-up')).toHaveText(FOLLOW_UP.diAltroCloser)
  await expect(card.getByTestId('follow-up-in-chat')).toHaveCount(0)
  await expect(card.getByRole('button', { name: FOLLOW_UP.nomeBottone(nome) })).toHaveCount(0)
  // not his any more: never on his list
  await expect(callDiFollowUp(page, nome)).toHaveCount(0)

  // «Follow-up» asks nothing: the call has its follow-up call
  await card.getByRole('button', { name: 'Cambia esito' }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await nonRegistrata(foglio)
  await expect(foglio.getByTestId('follow-up-gia-fissata')).toHaveText(FOLLOW_UP.giaFissata(FOLLOW_UP.assegnataAltroCloser))
  await expect(foglio.getByRole('group', { name: FOLLOW_UP.domanda })).toHaveCount(0)
})

test('la vendita della call col closer cambiato: il closer della call non la chiede', async ({ page }) => {
  const nome = nomeUnico('Vendita altrui')
  const id = await creaCallDiProva(nome, ID_CLOSER, 3)
  await dbLocale().from('calls').update({ stato: 'svolta', esito: 'chiusa', qualificata: true }).eq('id', id)
  // the sale carries the admin as closer: Lorenzo does not read it
  await clienteConVendita(nome, ID_ADMIN, id, (await leggi(id)).lead_id)

  await accedi(page, 'closer')
  await page.goto('/calls')
  await expect(primaCall(page, nome)).toBeVisible()
  await expect(primaCall(page, nome).getByTestId('vendita-da-registrare')).toHaveCount(0)
  await expect(page.locator('section').filter({ hasText: VENDITA_DA_REGISTRARE.descrizioneSezione }).getByRole('article', { name: nome })).toHaveCount(0)
})

test('l’admin collega alla call chiusa la vendita registrata senza la call: niente seconda vendita', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const nome = nomeUnico('Collega')
  const id = await creaCallDiProva(nome, ID_ADMIN, 3)
  await dbLocale().from('calls').update({ stato: 'svolta', esito: 'chiusa', qualificata: true }).eq('id', id)
  // registered from Vendite: a client with the lead's name, without the lead, and a sale without the call
  const vendita = await clienteConVendita(nome, ID_ADMIN, null, null)

  await accedi(page, 'admin')
  await page.goto('/calls')
  const card = primaCall(page, nome)
  await expect(card.getByTestId('vendita-da-registrare')).toBeVisible()
  const collega = card.getByRole('button', { name: VENDITA_DA_REGISTRARE.nomeCollega(nome), exact: true })
  // label in name (WCAG 2.5.3): the name starts with the words on the button
  await expect(collega).toHaveText(VENDITA_DA_REGISTRARE.collega)
  expect(VENDITA_DA_REGISTRARE.nomeCollega(nome).startsWith(VENDITA_DA_REGISTRARE.collega)).toBe(true)
  // the admin ties it: no line telling him to ask himself
  await expect(card.getByTestId('vendita-chiedi-admin')).toHaveCount(0)
  expect((await collega.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // 390px: the two buttons wrap, the page never scrolls sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await collega.click()

  const foglio = page.getByRole('dialog')
  await expect(foglio.getByRole('heading', { name: VENDITA_DA_REGISTRARE.titoloCollega(nome) })).toBeVisible()
  const elenco = foglio.getByTestId('collega-vendita-elenco')
  // first the sale of the client with the lead's name
  await expect(elenco.getByRole('listitem').first()).toContainText(nome)
  await expect(elenco.getByRole('listitem').first()).toContainText(VENDITA_DA_REGISTRARE.stessoCliente)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // the title wraps before the close button, which speaks Italian
  const titolo = await foglio.getByRole('heading', { name: VENDITA_DA_REGISTRARE.titoloCollega(nome) }).boundingBox()
  const chiudi = await foglio.getByRole('button', { name: 'Chiudi', exact: true }).boundingBox()
  expect(titolo!.x + titolo!.width).toBeLessThanOrEqual(chiudi!.x)
  await page.screenshot({ path: '.shots/admin-collega-vendita-390.png' })
  const dettaglio = dettaglioVendita(ETICHETTA_TIPO_VENDITA.nuovo, formatData(oggiRoma()), formatEuro(1500))
  await elenco.getByRole('button', { name: VENDITA_DA_REGISTRARE.nomeBottoneCollega(nome, dettaglio), exact: true }).click()
  await expect(page.getByText(VENDITA_DA_REGISTRARE.collegata(nome))).toBeVisible()
  // its button is gone: the focus goes to the card's title, never <body>
  await expect(primaCall(page, nome).getByRole('heading', { name: nome })).toBeFocused()

  // the call has its sale: it asks no more, and no second sale was made
  await expect(primaCall(page, nome).getByTestId('vendita-da-registrare')).toHaveCount(0)
  const { data, error } = await dbLocale().from('sales').select('id, call_id').eq('call_id', id)
  if (error) throw error
  expect(data).toEqual([{ id: vendita, call_id: id }])
})

test('il closer con la vendita già registrata senza la call: la nuova vendita lo avvisa, l’admin la collega da lì', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const nome = nomeUnico('Doppia')
  const id = await creaCallDiProva(nome, ID_CLOSER, 3)
  await dbLocale().from('calls').update({ stato: 'svolta', esito: 'chiusa', qualificata: true }).eq('id', id)
  // registered by the closer from Le mie vendite, without the call: a client with the lead's name
  const vendita = await clienteConVendita(nome, ID_CLOSER, null, null)
  const dettaglio = dettaglioVendita(ETICHETTA_TIPO_VENDITA.nuovo, formatData(oggiRoma()), formatEuro(1500))

  await accedi(page, 'closer')
  await page.goto('/calls')
  const card = primaCall(page, nome)
  await expect(card.getByTestId('vendita-chiedi-admin')).toHaveText(VENDITA_DA_REGISTRARE.chiediAdmin)
  await card.getByRole('link', { name: VENDITA_DA_REGISTRARE.nomeBottone(nome) }).click()
  await expect(page).toHaveURL(`/sales/new?call=${id}`)

  // before the form: the sale that looks like this one, and what to do
  const avviso = page.getByTestId('vendita-gia-registrata')
  await expect(avviso.getByRole('heading', { name: VENDITA_DA_REGISTRARE.giaRegistrataTitolo })).toBeVisible()
  await expect(avviso).toContainText(VENDITA_DA_REGISTRARE.giaRegistrataCloser)
  await expect(avviso.getByRole('link', { name: VENDITA_DA_REGISTRARE.nomeApriVendita(nome, dettaglio) })).toHaveAttribute(
    'href',
    `/sales/${vendita}`,
  )
  // only the admin ties it
  await expect(avviso.getByRole('button')).toHaveCount(0)
  // the form stays: it may be another sale
  await expect(page.getByTestId('precompilata')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // the admin, on the same page, ties it from the warning
  await page.context().clearCookies()
  await accedi(page, 'admin')
  await page.goto(`/sales/new?call=${id}`)
  await expect(avviso).toContainText(VENDITA_DA_REGISTRARE.giaRegistrataAdmin)
  await avviso.getByRole('button', { name: VENDITA_DA_REGISTRARE.nomeCollega(nome), exact: true }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByRole('button', { name: VENDITA_DA_REGISTRARE.nomeBottoneCollega(nome, dettaglio), exact: true }).click()
  await expect(page.getByText(VENDITA_DA_REGISTRARE.collegata(nome))).toBeVisible()
  // the call has its sale now: the page says so, never a second one
  await expect(page.getByText('Vendita già registrata')).toBeVisible()
  const { data, error } = await dbLocale().from('sales').select('id').eq('call_id', id)
  if (error) throw error
  expect(data).toEqual([{ id: vendita }])
})

test('il foglio «collega» senza vendite da proporre: dice cosa fare e porta a «Registra la vendita»', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const nome = nomeUnico('Nessuna')
  // held 200 days ago: no sale without a call signed near it, none of a client with its name
  const id = await creaCallDiProva(nome, ID_ADMIN, 200 * 24)
  await dbLocale().from('calls').update({ stato: 'svolta', esito: 'chiusa', qualificata: true }).eq('id', id)

  await accedi(page, 'admin')
  await page.goto('/calls')
  const card = primaCall(page, nome)
  await card.getByRole('button', { name: VENDITA_DA_REGISTRARE.nomeCollega(nome), exact: true }).click()
  const foglio = page.getByRole('dialog')
  const vuoto = foglio.getByTestId('collega-vendita-vuoto')
  await expect(vuoto).toContainText(VENDITA_DA_REGISTRARE.nessuna)
  const registra = vuoto.getByRole('link', { name: VENDITA_DA_REGISTRARE.nomeBottone(nome) })
  await expect(registra).toHaveText(VENDITA_DA_REGISTRARE.bottone)
  expect((await registra.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(foglio.getByRole('button', { name: 'Chiudi', exact: true })).toBeVisible()
  await registra.click()
  await expect(page).toHaveURL(`/sales/new?call=${id}`)
})
