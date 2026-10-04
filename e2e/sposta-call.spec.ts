import { expect, test, type Page } from '@playwright/test'

import { SPOSTA, quandoBreveDa } from '../lib/call/spostamento'
import { aggiungiGiorni, formatOra, oggiRoma } from '../lib/date'
import { SPOSTA_SOLO_AVANTI } from '../lib/validation/call'
import { ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { accedi } from './utenti'

// Moving a call (Dany, 02/10/2026): "Sposta" on the card and the outcome
// "Ha già una nuova data" ask the new day and time; the same call goes there,
// still to be held, with "Spostata dal …" on its card. "In attesa di conferma"
// (04/10/2026) asks no date: the call waits on its day until the lead confirms.
const PREFISSO = 'E2E Sposta'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
})

function nomeUnico(etichetta: string) {
  return `${PREFISSO} ${etichetta} ${Date.now()}`
}

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

/** A Europe/Rome day and time as a timestamptz, summer or winter time. */
function istanteRoma(giorno: string, ora: string): string {
  for (const fuso of ['+02:00', '+01:00']) {
    const istante = new Date(`${giorno}T${ora}:00${fuso}`)
    if (oggiRoma(istante) === giorno && formatOra(istante) === ora) return istante.toISOString()
  }
  throw new Error(`${giorno} ${ora} non esiste a Roma`)
}

/** A call of the seed setter for the seed closer, on that Rome day and time. */
async function callAlle(nome: string, giorno: string, ora: string, stato: 'programmata' | 'riprogrammata' = 'programmata') {
  const id = await creaCallDiProva(nome, ID_CLOSER)
  const { data, error } = await dbLocale()
    .from('calls')
    .update({ programmata_il: istanteRoma(giorno, ora), stato })
    .eq('id', id)
    .select('created_at')
    .single()
  if (error) throw error
  return { id, prenotata: data.created_at }
}

async function letta(id: string) {
  const { data, error } = await dbLocale()
    .from('calls')
    .select('programmata_il, stato, esito, spostata_dal, volte_spostata, created_at')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

test('«Ha già una nuova data» chiede la nuova data: la call passa a quel giorno e lascia il giorno vecchio', async ({ page }) => {
  test.setTimeout(60_000)
  const oggi = oggiRoma()
  const ieri = aggiungiGiorni(oggi, -1)
  const domani = aggiungiGiorni(oggi, 1)
  const nome = nomeUnico('Riprogrammata')
  const { id, prenotata } = await callAlle(nome, ieri, '19:00')

  await accedi(page, 'closer')
  await page.goto(`/setting/closer/giorno?data=${ieri}`)
  await scheda(page, nome).getByRole('button', { name: 'Registra esito' }).click()
  const foglio = page.getByRole('dialog')
  await foglio.getByRole('button', { name: SPOSTA.riprogrammata.scelta, exact: true }).click()

  // the new day is asked, from the day after at the same time (never before tomorrow)
  await expect(foglio.getByRole('group', { name: SPOSTA.riprogrammata.domanda })).toBeVisible()
  await expect(foglio.getByLabel('Giorno')).toHaveValue(domani)
  await expect(foglio.getByLabel('Ora')).toHaveValue('19:00')

  // without a day nothing is saved
  await foglio.getByLabel('Giorno').fill('')
  await foglio.getByRole('button', { name: SPOSTA.riprogrammata.salva }).click()
  await expect(foglio.getByText('Scegli il nuovo giorno')).toBeVisible()
  expect(await letta(id)).toMatchObject({ stato: 'programmata', volte_spostata: 0 })

  await foglio.getByRole('button', { name: 'Domani', exact: true }).click()
  await expect(foglio.getByRole('button', { name: 'Domani', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await foglio.getByLabel('Ora').fill('18:00')
  await foglio.getByRole('button', { name: SPOSTA.riprogrammata.salva }).click()
  await expect(page.getByText(SPOSTA.fatto(nome))).toBeVisible()

  // the old day no longer has the call: its numbers follow programmata_il
  await expect(scheda(page, nome)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('giorno')).toContainText('Ieri')
  await expect(scheda(page, nome)).toHaveCount(0)

  // the new day has it, still to be held, with the trace
  await page.goto(`/setting/closer/giorno?data=${domani}`)
  await expect(scheda(page, nome).getByTestId('spostata')).toHaveText(`Spostata dal ${quandoBreveDa(ieri, '19:00')}`)
  await expect(scheda(page, nome)).toContainText('18:00')

  expect(await letta(id)).toMatchObject({
    stato: 'programmata',
    esito: null,
    volte_spostata: 1,
    // the same call, booked when it was booked
    created_at: prenotata,
  })
  const dopo = await letta(id)
  expect(new Date(dopo.programmata_il).toISOString()).toBe(istanteRoma(domani, '18:00'))
  expect(new Date(dopo.spostata_dal!).toISOString()).toBe(istanteRoma(ieri, '19:00'))
})

test('«Sposta» dalla scheda, a 390 px: da oggi in avanti, con la traccia e quante volte', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const oggi = oggiRoma()
  const tra2 = aggiungiGiorni(oggi, 2)
  const tra3 = aggiungiGiorni(oggi, 3)
  const tra5 = aggiungiGiorni(oggi, 5)
  const nome = nomeUnico('Scheda')
  const { id } = await callAlle(nome, tra2, '18:00')

  await accedi(page, 'closer')
  await page.goto('/calls')
  const bottone = scheda(page, nome).getByRole('button', { name: `Sposta la call con ${nome}` })
  await expect(bottone).toHaveText(SPOSTA.bottone)
  expect((await bottone.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // a future call: the outcome sheet only cancels it or puts it in attesa di conferma
  await expect(scheda(page, nome).getByRole('button', { name: 'Annulla o rimanda' })).toBeVisible()
  // no horizontal scroll with the two buttons on the card
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await bottone.click()
  const foglio = page.getByRole('dialog')
  await expect(foglio.getByRole('heading', { name: SPOSTA.titolo(nome) })).toBeVisible()
  await expect(foglio.getByLabel('Giorno')).toHaveValue(tra3)
  await expect(foglio.getByLabel('Ora')).toHaveValue('18:00')

  // the closer never moves a call to a past day
  await foglio.getByLabel('Giorno').fill(aggiungiGiorni(oggi, -1))
  await foglio.getByRole('button', { name: SPOSTA.salva, exact: true }).click()
  await expect(foglio.getByText(SPOSTA_SOLO_AVANTI)).toBeVisible()

  await foglio.getByLabel('Giorno').fill(tra3)
  await foglio.getByLabel('Ora').fill('10:30')
  await foglio.getByRole('button', { name: SPOSTA.salva, exact: true }).click()
  await expect(page.getByText(SPOSTA.fatto(nome))).toBeVisible()
  await expect(foglio).toHaveCount(0)
  await expect(scheda(page, nome).getByTestId('spostata')).toHaveText(`Spostata dal ${quandoBreveDa(tra2, '18:00')}`)
  await expect(scheda(page, nome)).toContainText('10:30')

  // a second move: the last origin, and the count
  await scheda(page, nome).getByRole('button', { name: `Sposta la call con ${nome}` }).click()
  await foglio.getByLabel('Giorno').fill(tra5)
  await foglio.getByRole('button', { name: SPOSTA.salva, exact: true }).click()
  await expect(scheda(page, nome).getByTestId('spostata')).toHaveText(
    `Spostata 2 volte, l’ultima dal ${quandoBreveDa(tra3, '10:30')}`,
  )
  expect(await letta(id)).toMatchObject({ stato: 'programmata', volte_spostata: 2 })
})

test('il setter sposta una sua call da fare; una in attesa di conferma la sposta il closer', async ({ browser }) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const domani = aggiungiGiorni(oggi, 1)
  const tra2 = aggiungiGiorni(oggi, 2)
  const ieri = aggiungiGiorni(oggi, -1)
  const daFare = nomeUnico('Setter')
  const vecchia = nomeUnico('Vecchia')
  const { id, prenotata } = await callAlle(daFare, tra2, '17:30')
  // "In attesa di conferma" (stato riprogrammata): no new day yet
  const { id: idVecchia } = await callAlle(vecchia, ieri, '19:00', 'riprogrammata')

  const setter = await (await browser.newContext()).newPage()
  await accedi(setter, 'setter')
  await setter.goto('/calls')
  // the setter moves, he never records an outcome
  await expect(scheda(setter, daFare).getByRole('button', { name: /Registra esito|Annulla o rimanda/ })).toHaveCount(0)
  await scheda(setter, daFare).getByRole('button', { name: `Sposta la call con ${daFare}` }).click()
  const foglio = setter.getByRole('dialog')
  await foglio.getByRole('button', { name: 'Domani', exact: true }).click()
  await foglio.getByRole('button', { name: SPOSTA.salva, exact: true }).click()
  await expect(setter.getByText(SPOSTA.fatto(daFare))).toBeVisible()
  await expect(scheda(setter, daFare).getByTestId('spostata')).toHaveText(`Spostata dal ${quandoBreveDa(tra2, '17:30')}`)
  const mossa = await letta(id)
  expect(new Date(mossa.programmata_il).toISOString()).toBe(istanteRoma(domani, '17:30'))
  // his booking stays on the day he booked it
  expect(mossa.created_at).toBe(prenotata)

  // a call "In attesa di conferma": the setter reads it, the closer gives it its new day
  await expect(scheda(setter, vecchia)).toContainText(SPOSTA.attesa.etichetta)
  await expect(scheda(setter, vecchia).getByRole('button', { name: `Sposta la call con ${vecchia}` })).toHaveCount(0)
  // nor does his pencil move it: date and time read only, his notes still his
  await scheda(setter, vecchia).getByRole('button', { name: `Modifica la call con ${vecchia}` }).click()
  const matita = setter.getByRole('dialog')
  await expect(matita.getByLabel('Data')).toHaveAttribute('readonly', '')
  await expect(matita.getByLabel('Ora')).toHaveAttribute('readonly', '')
  await expect(matita.getByTestId('quando-bloccato')).toHaveText(SPOSTA.setterRiprogrammata)
  await matita.getByLabel('Note del setter').fill('Richiamarlo in settimana')
  await matita.getByRole('button', { name: 'Salva la call' }).click()
  await expect(matita).toHaveCount(0)
  expect(await letta(idVecchia)).toMatchObject({ stato: 'riprogrammata', volte_spostata: 0 })
  await setter.context().close()

  const closer = await (await browser.newContext()).newPage()
  await accedi(closer, 'closer')
  await closer.goto('/calls')
  const daSpostare = closer.locator('section').filter({ has: closer.getByRole('heading', { name: /^In attesa di conferma/ }) })
  await expect(daSpostare.getByRole('article', { name: vecchia })).toBeVisible()
  await daSpostare.getByRole('button', { name: `Sposta la call con ${vecchia}` }).click()
  // from tomorrow, at the time it had
  await expect(closer.getByRole('dialog').getByLabel('Giorno')).toHaveValue(domani)
  await closer.getByRole('dialog').getByRole('button', { name: SPOSTA.salva, exact: true }).click()
  await expect(closer.getByText(SPOSTA.fatto(vecchia))).toBeVisible()
  await expect(daSpostare.getByRole('article', { name: vecchia })).toHaveCount(0)
  await expect(scheda(closer, vecchia).getByTestId('spostata')).toHaveText(`Spostata dal ${quandoBreveDa(ieri, '19:00')}`)
  expect(await letta(idVecchia)).toMatchObject({ stato: 'programmata', volte_spostata: 1 })
  await closer.context().close()
})

test('una call svolta non si sposta: «Cambia esito» non offre di riprogrammarla', async ({ page }) => {
  const ieri = aggiungiGiorni(oggiRoma(), -1)
  const nome = nomeUnico('Svolta')
  const { id } = await callAlle(nome, ieri, '19:00')
  const { error } = await dbLocale()
    .from('calls')
    .update({ stato: 'svolta', esito: 'persa', qualificata: true, obiezione_principale: 'Fuori budget' })
    .eq('id', id)
  if (error) throw error

  await accedi(page, 'closer')
  await page.goto(`/setting/closer/giorno?data=${ieri}`)
  await expect(scheda(page, nome).getByRole('button', { name: `Sposta la call con ${nome}` })).toHaveCount(0)
  await scheda(page, nome).getByRole('button', { name: 'Cambia esito' }).click()
  const foglio = page.getByRole('dialog')
  await expect(foglio.getByRole('button', { name: 'Persa', exact: true })).toBeVisible()
  for (const scelta of [SPOSTA.riprogrammata.scelta, SPOSTA.attesa.etichetta]) {
    await expect(foglio.getByRole('button', { name: scelta, exact: true })).toHaveCount(0)
  }
  await expect(foglio.getByTestId('esito-fermo')).toHaveText(SPOSTA.foglioEsito.svolta)
  await page.keyboard.press('Escape')
  await expect(foglio).toHaveCount(0)
  // the pencil still corrects a wrong date of a held call, and never points to a «Sposta» that is not there
  await scheda(page, nome).getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  const matita = page.getByRole('dialog')
  await expect(matita.getByLabel('Data')).not.toHaveAttribute('readonly', '')
  await expect(matita).toContainText('data e ora se sono sbagliate. L’esito si registra dalla scheda.')
  await expect(matita).not.toContainText('«Sposta»')
  expect(await letta(id)).toMatchObject({ stato: 'svolta', volte_spostata: 0 })
})

test('un no show non si sposta: niente «Sposta» né riprogrammazione, la matita del closer ne corregge la data', async ({ browser }) => {
  test.setTimeout(90_000)
  const ieri = aggiungiGiorni(oggiRoma(), -1)
  const dueGiorniFa = aggiungiGiorni(oggiRoma(), -2)
  const noShow = nomeUnico('NoShow')
  const svolta = nomeUnico('SvoltaSetter')
  const { id } = await callAlle(noShow, ieri, '19:00')
  const { id: idSvolta } = await callAlle(svolta, ieri, '20:00')
  const db = dbLocale()
  const { error } = await db.from('calls').update({ stato: 'no_show' }).eq('id', id)
  if (error) throw error
  const { error: erroreSvolta } = await db
    .from('calls')
    .update({ stato: 'svolta', esito: 'follow_up', qualificata: true, obiezione_principale: 'Ci deve pensare' })
    .eq('id', idSvolta)
  if (erroreSvolta) throw erroreSvolta

  // the closer: on his day and in Le mie call, no «Sposta»; the outcome sheet
  // corrects a wrong no-show (undo first) but never moves it
  const closer = await (await browser.newContext()).newPage()
  await closer.setViewportSize({ width: 390, height: 844 })
  await accedi(closer, 'closer')
  for (const pagina of [`/setting/closer/giorno?data=${ieri}`, '/calls']) {
    await closer.goto(pagina)
    await expect(scheda(closer, noShow)).toContainText('No show')
    await expect(scheda(closer, noShow).getByRole('button', { name: `Sposta la call con ${noShow}` })).toHaveCount(0)
  }
  await scheda(closer, noShow).getByRole('button', { name: 'Cambia esito' }).click()
  const foglio = closer.getByRole('dialog')
  await expect(foglio.getByRole('button', { name: 'No show', exact: true })).toBeVisible()
  await expect(foglio.getByRole('button', { name: 'Cancellata', exact: true })).toBeVisible()
  for (const scelta of [SPOSTA.riprogrammata.scelta, SPOSTA.attesa.etichetta]) {
    await expect(foglio.getByRole('button', { name: scelta, exact: true })).toHaveCount(0)
  }
  await expect(foglio.getByTestId('esito-fermo')).toHaveText(SPOSTA.foglioEsito.noShow)
  await expect(foglio.getByRole('button', { name: 'Annulla l’esito, torna da fare' })).toBeVisible()
  await closer.keyboard.press('Escape')
  await expect(foglio).toHaveCount(0)
  // the pencil corrects a wrong date and time, as on a held call (Dany, 03/10/2026):
  // a typo is not a move, the call stays a no-show and gets no trace
  await scheda(closer, noShow).getByRole('button', { name: `Modifica la call con ${noShow}` }).click()
  const matitaCloser = closer.getByRole('dialog')
  await expect(matitaCloser.getByLabel('Data')).not.toHaveAttribute('readonly', '')
  await expect(matitaCloser.getByLabel('Ora')).not.toHaveAttribute('readonly', '')
  await expect(matitaCloser.getByTestId('quando-bloccato')).toHaveCount(0)
  await expect(matitaCloser).toContainText('data e ora se sono sbagliate. L’esito si registra dalla scheda.')
  await expect(matitaCloser).not.toContainText('«Sposta»')
  await matitaCloser.getByLabel('Data').fill(dueGiorniFa)
  await matitaCloser.getByLabel('Ora').fill('18:30')
  await matitaCloser.getByLabel('Link alla registrazione').fill('https://esempio.it/registrazione')
  await matitaCloser.getByRole('button', { name: 'Salva la call' }).click()
  await expect(closer.getByText('Call aggiornata')).toBeVisible()
  await expect(matitaCloser).toHaveCount(0)
  // 390px: the sheets never scroll the page sideways
  expect(await closer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const corretta = await letta(id)
  expect(corretta).toMatchObject({ stato: 'no_show', esito: null, spostata_dal: null, volte_spostata: 0 })
  expect(new Date(corretta.programmata_il).toISOString()).toBe(istanteRoma(dueGiorniFa, '18:30'))
  // it left the wrong day and counts on the right one, still a no-show, still without «Sposta»
  await closer.goto(`/setting/closer/giorno?data=${ieri}`)
  await expect(scheda(closer, noShow)).toHaveCount(0)
  await closer.goto(`/setting/closer/giorno?data=${dueGiorniFa}`)
  await expect(scheda(closer, noShow)).toContainText('No show')
  await expect(scheda(closer, noShow)).toContainText('18:30')
  await expect(scheda(closer, noShow).getByTestId('spostata')).toHaveCount(0)
  await expect(scheda(closer, noShow).getByRole('button', { name: `Sposta la call con ${noShow}` })).toHaveCount(0)
  await scheda(closer, noShow).getByRole('button', { name: 'Cambia esito' }).click()
  for (const scelta of [SPOSTA.riprogrammata.scelta, SPOSTA.attesa.etichetta]) {
    await expect(foglio.getByRole('button', { name: scelta, exact: true })).toHaveCount(0)
  }
  await expect(foglio.getByTestId('esito-fermo')).toHaveText(SPOSTA.foglioEsito.noShow)
  await closer.keyboard.press('Escape')
  await expect(foglio).toHaveCount(0)
  await closer.context().close()

  // the setter: no «Sposta» either, and his pencil keeps date and time read
  // only, saying why in his words: nobody moves it, the closer corrects a
  // wrong outcome, he books a new call
  const setter = await (await browser.newContext()).newPage()
  await accedi(setter, 'setter')
  await setter.goto('/calls')
  for (const [nome, frase] of [
    [noShow, SPOSTA.setterNoShow],
    [svolta, SPOSTA.setterSvolta],
  ] as const) {
    await expect(scheda(setter, nome).getByRole('button', { name: `Sposta la call con ${nome}` })).toHaveCount(0)
    await scheda(setter, nome).getByRole('button', { name: `Modifica la call con ${nome}` }).click()
    const matita = setter.getByRole('dialog')
    await expect(matita.getByLabel('Data')).toHaveAttribute('readonly', '')
    await expect(matita.getByLabel('Ora')).toHaveAttribute('readonly', '')
    // out of the tab order: the sheet opens on the first field he can change, never on them
    await expect(matita.getByLabel('Closer')).toBeFocused()
    await expect(matita.getByLabel('Data')).toHaveAttribute('tabindex', '-1')
    await expect(matita.getByLabel('Ora')).toHaveAttribute('tabindex', '-1')
    await expect(matita.getByTestId('quando-bloccato')).toHaveText(frase)
    await setter.keyboard.press('Escape')
    await expect(matita).toHaveCount(0)
  }
  await setter.context().close()

  const dopo = await letta(id)
  expect(dopo).toMatchObject({ stato: 'no_show', volte_spostata: 0 })
  expect(new Date(dopo.programmata_il).toISOString()).toBe(istanteRoma(dueGiorniFa, '18:30'))
  expect(await letta(idSvolta)).toMatchObject({ stato: 'svolta', volte_spostata: 0 })
})

test('«In attesa di conferma»: senza data la call resta sul suo giorno, in cima a Le mie call; poi «Sposta» le dà la data', async ({ page }) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const ieri = aggiungiGiorni(oggi, -1)
  const domani = aggiungiGiorni(oggi, 1)
  const nome = nomeUnico('Attesa')
  const { id, prenotata } = await callAlle(nome, ieri, '19:00')

  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'closer')
  await page.goto(`/setting/closer/giorno?data=${ieri}`)
  await scheda(page, nome).getByRole('button', { name: 'Registra esito' }).click()
  const foglio = page.getByRole('dialog')
  // two clear ways of rescheduling, 44px at least
  await expect(foglio.getByRole('group', { name: SPOSTA.attesa.gruppo })).toBeVisible()
  for (const scelta of [SPOSTA.riprogrammata.scelta, SPOSTA.attesa.etichetta]) {
    const bottone = foglio.getByRole('button', { name: scelta, exact: true })
    await expect(bottone).toBeVisible()
    const box = (await bottone.boundingBox())!
    expect(box.height, scelta).toBeGreaterThanOrEqual(44)
    expect(box.width, scelta).toBeGreaterThanOrEqual(44)
  }
  await expect(foglio.getByRole('button', { name: 'Riprogrammata', exact: true })).toHaveCount(0)

  await foglio.getByRole('button', { name: SPOSTA.attesa.etichetta, exact: true }).click()
  // no date asked: only the closer's notes, if he wants
  await expect(foglio.getByLabel('Giorno')).toHaveCount(0)
  await expect(foglio).toContainText(SPOSTA.attesa.spiegazione)
  await foglio.getByLabel(/Note aggiuntive/).fill('Mi scrive lui quando sa i turni')
  const salva = foglio.getByRole('button', { name: SPOSTA.attesa.salva })
  expect((await salva.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await salva.click()
  await expect(page.getByText(`${nome}: in attesa di conferma`)).toBeVisible()
  await expect(foglio).toHaveCount(0)

  // it stays on its day, with the label, and without an outcome
  await expect(scheda(page, nome)).toContainText(SPOSTA.attesa.etichetta)
  expect(await letta(id)).toMatchObject({ stato: 'riprogrammata', esito: null, volte_spostata: 0, created_at: prenotata })
  const { data: note } = await dbLocale().from('calls').select('note_closer').eq('id', id).single()
  expect(note?.note_closer).toBe('Mi scrive lui quando sa i turni')
  const prima = await letta(id)
  expect(new Date(prima.programmata_il).toISOString()).toBe(istanteRoma(ieri, '19:00'))

  // Le mie call: on top, under «In attesa di conferma»
  await page.goto('/calls')
  const sezioni = page.locator('section')
  await expect(sezioni.first().getByRole('heading', { name: /^In attesa di conferma \(\d+\)$/ })).toBeVisible()
  const inAttesa = sezioni.filter({ has: page.getByRole('heading', { name: /^In attesa di conferma/ }) })
  await expect(inAttesa.getByRole('article', { name: nome })).toContainText(SPOSTA.attesa.etichetta)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  // the lead confirms: «Sposta» gives it the new day
  const sposta = inAttesa.getByRole('button', { name: `Sposta la call con ${nome}` })
  expect((await sposta.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await sposta.click()
  const foglioSposta = page.getByRole('dialog')
  await expect(foglioSposta.getByLabel('Giorno')).toHaveValue(domani)
  await foglioSposta.getByLabel('Ora').fill('18:00')
  await foglioSposta.getByRole('button', { name: SPOSTA.salva, exact: true }).click()
  await expect(page.getByText(SPOSTA.fatto(nome))).toBeVisible()
  await expect(inAttesa.getByRole('article', { name: nome })).toHaveCount(0)
  await expect(scheda(page, nome).getByTestId('spostata')).toHaveText(`Spostata dal ${quandoBreveDa(ieri, '19:00')}`)
  const dopo = await letta(id)
  expect(dopo).toMatchObject({ stato: 'programmata', esito: null, volte_spostata: 1 })
  expect(new Date(dopo.programmata_il).toISOString()).toBe(istanteRoma(domani, '18:00'))
})
