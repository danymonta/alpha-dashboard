import { expect, test, type Page } from '@playwright/test'

import { SPOSTA } from '../lib/call/spostamento'
import { ID_ADMIN, ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { nonRegistrata } from './registrazione'
import { accedi } from './utenti'

const PREFISSO = 'E2E Esito'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
})

function nomeUnico(etichetta: string) {
  return `${PREFISSO} ${etichetta} ${Date.now()}`
}

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

async function apriEsito(page: Page, nome: string) {
  await scheda(page, nome).getByRole('button', { name: /Registra esito|Cambia esito/ }).click()
  return page.getByRole('dialog')
}

test.describe('Le mie call, closer', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'closer')
  })

  test('no show in due tocchi', async ({ page }) => {
    const nome = nomeUnico('NoShow')
    await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    await expect(scheda(page, nome).getByText('Esito da registrare')).toBeVisible()

    const foglio = await apriEsito(page, nome) // 1
    await foglio.getByRole('button', { name: 'No show', exact: true }).click() // 2

    await expect(page.getByText(`${nome}: no show`)).toBeVisible()
    await expect(scheda(page, nome).getByText('No show')).toBeVisible()
  })

  test('persa: senza il motivo di non chiusura non si salva, con il motivo sì', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const nome = nomeUnico('Persa')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    // the setter's note, and a note of the closer's from before
    await dbLocale().from('calls').update({ note: 'Fissata dal setter', note_closer: 'Da risentire' }).eq('id', callId)
    await page.goto('/calls')
    // the closer reads the setter's note on the card
    await expect(scheda(page, nome).getByTestId('note-setter')).toHaveText('Note del setter: Fissata dal setter')

    const foglio = await apriEsito(page, nome) // 1
    await foglio.getByRole('button', { name: 'Persa', exact: true }).click() // 2
    await nonRegistrata(foglio)

    // the reason is asked, with its guidance; the save line says what is missing
    const motivo = foglio.getByLabel(/Motivo di non chiusura/)
    await expect(motivo).toBeVisible()
    await expect(foglio.getByText('Perché non ha chiuso?')).toBeVisible()
    await expect(motivo).toHaveAttribute('placeholder', /fuori budget/)
    await expect(foglio.getByTestId('salva-esito-aiuto')).toHaveText(/scrivi il motivo di non chiusura/)
    // the closer's notes open on what he saved, and are optional; the setter's are not here
    await expect(foglio.getByLabel(/Note aggiuntive/)).toHaveValue('Da risentire')
    await expect(foglio.getByLabel(/Note del setter/)).toHaveCount(0)

    // a tap without the reason saves nothing
    await foglio.getByRole('button', { name: 'No', exact: true }).click()
    await expect(foglio.getByText('Scrivi il motivo di non chiusura', { exact: true })).toBeVisible()
    await expect(motivo).toBeFocused()
    await expect(motivo).toHaveAttribute('aria-invalid', 'true')
    const { data: prima } = await dbLocale().from('calls').select('stato, esito').eq('id', callId).single()
    expect(prima).toEqual({ stato: 'programmata', esito: null })

    // with the reason it saves
    await motivo.fill('Fuori budget, ci risentiamo a gennaio')
    await expect(foglio.getByTestId('salva-esito-aiuto')).toHaveText('Un tocco su Sì o No salva l’esito.')
    await foglio.getByLabel(/Note aggiuntive/).fill('Vuole la versione da 3 mesi')
    await foglio.getByRole('button', { name: 'No', exact: true }).click() // 3

    await expect(scheda(page, nome).getByText('non qualificata')).toBeVisible()
    await expect(scheda(page, nome).getByTestId('motivo-non-chiusura')).toHaveText(
      'Motivo di non chiusura: Fuori budget, ci risentiamo a gennaio',
    )

    const { data } = await dbLocale()
      .from('calls')
      .select('stato, esito, qualificata, obiezione_principale, note_closer, note')
      .eq('id', callId)
      .single()
    expect(data).toEqual({
      stato: 'svolta',
      esito: 'persa',
      qualificata: false,
      obiezione_principale: 'Fuori budget, ci risentiamo a gennaio',
      note_closer: 'Vuole la versione da 3 mesi',
      // the setter's note is never touched by an outcome
      note: 'Fissata dal setter',
    })

    // changing the outcome opens on the saved reason
    const ancora = await apriEsito(page, nome)
    await ancora.getByRole('button', { name: 'Follow-up', exact: true }).click()
    await nonRegistrata(ancora)
    await ancora.getByRole('button', { name: 'No, follow-up in chat' }).click()
    await expect(ancora.getByLabel(/Motivo di non chiusura/)).toHaveValue('Fuori budget, ci risentiamo a gennaio')
  })

  test('il foglio dell’esito sta nello schermo anche con testi lunghi su un telefono piccolo', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 500 })
    const nome = nomeUnico('Lungo')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await dbLocale()
      .from('calls')
      .update({
        obiezione_principale: 'Fuori budget, ne parla con la compagna. '.repeat(10).trim(),
        note_closer: 'Vuole ripensarci con calma, richiamare dopo le feste. '.repeat(10).trim(),
      })
      .eq('id', callId)
    await page.goto('/calls')

    const foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
    await nonRegistrata(foglio)
    await foglio.getByRole('button', { name: 'No, follow-up in chat' }).click()
    // never taller than the screen: it scrolls, and the two texts stop growing
    const box = (await foglio.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(500)
    for (const campo of [foglio.getByLabel(/Motivo di non chiusura/), foglio.getByLabel(/Note aggiuntive/)]) {
      expect((await campo.boundingBox())!.height).toBeLessThanOrEqual(160)
    }
    // no amounts in these texts: the setter who booked the call reads them
    await expect(foglio.getByText('Niente importi qui', { exact: false })).toBeAttached()
    await foglio.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(foglio.getByRole('button', { name: 'Sì', exact: true })).toBeInViewport()
    await foglio.evaluate((el) => el.scrollTo(0, 0))
    await expect(foglio.getByRole('heading', { name: nome })).toBeInViewport()
  })

  test('chiusa porta alla nuova vendita precompilata', async ({ page }) => {
    const nome = nomeUnico('Chiusa')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    const foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Chiusa', exact: true }).click()
    await nonRegistrata(foglio)

    await expect(page).toHaveURL(`/sales/new?call=${callId}`)
    // the client is prefilled from the lead: "E2E Esito Chiusa 123" -> nome + cognome
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('E2E')
    await expect(page.getByLabel('Cognome')).toHaveValue(nome.replace(/^E2E /, ''))
    await expect(page.getByTestId('precompilata')).toContainText('Loris Setter')
  })

  test('un esito sbagliato si annulla', async ({ page }) => {
    const nome = nomeUnico('Annulla')
    await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')

    let foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Cancellata', exact: true }).click()
    await expect(scheda(page, nome).getByText('Cancellata')).toBeVisible()

    foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: /Annulla l’esito/ }).click()
    await expect(scheda(page, nome).getByText('Esito da registrare')).toBeVisible()
  })

  test('il closer non vede le call assegnate all’admin', async ({ page }) => {
    const nome = nomeUnico('DiDany')
    await creaCallDiProva(nome, ID_ADMIN)
    await page.goto('/calls')
    await expect(scheda(page, nome)).toHaveCount(0)
  })
})

test('l’admin registra l’esito delle call assegnate a lui', async ({ page }) => {
  const nome = nomeUnico('Admin')
  await creaCallDiProva(nome, ID_ADMIN)
  await accedi(page, 'admin')
  await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Le mie call' }).click()

  const foglio = await apriEsito(page, nome)
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await nonRegistrata(foglio)
  await foglio.getByRole('button', { name: 'No, follow-up in chat' }).click()
  await foglio.getByLabel(/Motivo di non chiusura/).fill('Deve parlarne con la compagna')
  await foglio.getByRole('button', { name: 'Sì', exact: true }).click()
  await expect(scheda(page, nome).getByText('Follow-up').first()).toBeVisible()
})

test('il setter vede stato ed esito, ma non registra', async ({ page }) => {
  const nome = nomeUnico('Setter')
  await creaCallDiProva(nome, ID_CLOSER)
  await accedi(page, 'setter')
  await page.goto('/calls')

  await expect(scheda(page, nome).getByText('Esito da registrare')).toBeVisible()
  await expect(scheda(page, nome).getByText(/con Lorenzo/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registra esito' })).toHaveCount(0)
})

test('il setter vede il motivo di non chiusura delle sue call, scritto dal closer', async ({ page }) => {
  const nome = nomeUnico('Motivo al setter')
  const id = await creaCallDiProva(nome, ID_CLOSER, 3)
  const { error } = await dbLocale()
    .from('calls')
    .update({ stato: 'svolta', qualificata: true, esito: 'persa', obiezione_principale: 'Fuori budget per ora' })
    .eq('id', id)
  if (error) throw error

  await accedi(page, 'setter')
  await page.goto('/calls')
  await expect(scheda(page, nome).getByTestId('motivo-non-chiusura')).toContainText('Fuori budget per ora')
  // he reads it, the closer writes it: no outcome sheet on his side
  await expect(scheda(page, nome).getByRole('button', { name: /Registra esito|Cambia esito/ })).toHaveCount(0)
})

test('le note aggiuntive sono del closer: il setter le legge, scrive solo le sue (Dany, 30/09/2026)', async ({ browser }) => {
  const nome = nomeUnico('Note')
  const id = await creaCallDiProva(nome, ID_CLOSER, 3)
  // as the setter wrote it when he booked the call
  await dbLocale().from('calls').update({ note: 'Chiamarlo dopo le 18' }).eq('id', id)

  // the closer: reads the setter's note, writes his own in the outcome sheet
  const closer = await (await browser.newContext()).newPage()
  await accedi(closer, 'closer')
  await closer.goto('/calls')
  await expect(scheda(closer, nome).getByTestId('note-setter')).toContainText('Chiamarlo dopo le 18')
  const foglio = await apriEsito(closer, nome)
  await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
  await nonRegistrata(foglio)
  await foglio.getByRole('button', { name: 'No, follow-up in chat' }).click()
  await foglio.getByLabel(/Motivo di non chiusura/).fill('Deve parlarne con la compagna')
  await foglio.getByLabel(/Note aggiuntive/).fill('Richiamare lunedì dopo le 18')
  await foglio.getByRole('button', { name: 'Sì', exact: true }).click()
  await expect(scheda(closer, nome).getByText('Follow-up').first()).toBeVisible()

  // his call sheet: the setter's note to read, his own to correct
  await closer.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  const modificaCloser = closer.getByRole('dialog')
  await expect(modificaCloser.getByTestId('note-setter-sola-lettura')).toContainText('Chiamarlo dopo le 18')
  await expect(modificaCloser.getByLabel('Note del setter')).toHaveCount(0)
  await expect(modificaCloser.getByLabel(/Note aggiuntive/)).toHaveValue('Richiamare lunedì dopo le 18')
  await closer.context().close()

  // the setter, on his phone: reads the outcome and the closer's notes, never writes them
  const setter = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await accedi(setter, 'setter')
  await setter.goto('/calls')
  const card = scheda(setter, nome)
  await expect(card.getByTestId('motivo-non-chiusura')).toHaveText('Motivo di non chiusura: Deve parlarne con la compagna')
  await expect(card.getByTestId('note-closer')).toHaveText('Note aggiuntive del closer: Richiamare lunedì dopo le 18')
  await expect(card.getByRole('button', { name: /Registra esito|Cambia esito/ })).toHaveCount(0)

  // his sheet has one text to write, his own; the closer's words are there to read
  await card.getByRole('button', { name: `Modifica la call con ${nome}` }).click()
  const modificaSetter = setter.getByRole('dialog')
  await expect(modificaSetter.getByText('L’esito, il motivo di non chiusura e le note aggiuntive li scrive il closer.')).toBeVisible()
  await expect(modificaSetter.getByLabel('Note del setter')).toHaveValue('Chiamarlo dopo le 18')
  await expect(modificaSetter.getByLabel(/Note aggiuntive/)).toHaveCount(0)
  await expect(modificaSetter.locator('textarea')).toHaveCount(1)
  await expect(modificaSetter.getByTestId('note-closer-sola-lettura')).toContainText('Richiamare lunedì dopo le 18')
  await modificaSetter.getByLabel('Note del setter').fill('Chiamarlo dopo le 19')
  await modificaSetter.getByRole('button', { name: 'Salva la call' }).click()
  await expect(setter.getByText('Call aggiornata')).toBeVisible()
  await setter.context().close()

  const { data } = await dbLocale()
    .from('calls')
    .select('note, note_closer, obiezione_principale, esito')
    .eq('id', id)
    .single()
  expect(data).toEqual({
    note: 'Chiamarlo dopo le 19',
    note_closer: 'Richiamare lunedì dopo le 18',
    obiezione_principale: 'Deve parlarne con la compagna',
    esito: 'follow_up',
  })
})

test('una call futura si può solo annullare, mettere in attesa di conferma o spostare', async ({ page }) => {
  const nome = nomeUnico('Futura')
  await creaCallDiProva(nome, ID_CLOSER, -48)
  await accedi(page, 'closer')
  await page.goto('/calls')

  // moving has its own button (Dany, 02/10/2026): e2e/sposta-call.spec.ts
  await expect(scheda(page, nome).getByRole('button', { name: `Sposta la call con ${nome}` })).toBeVisible()
  await scheda(page, nome).getByRole('button', { name: 'Annulla o rimanda' }).click()
  const foglio = page.getByRole('dialog')
  await expect(foglio.getByRole('button', { name: 'Cancellata', exact: true })).toBeVisible()
  // the lead will confirm a new date (Dany, 04/10/2026); a known date is «Sposta», right beside
  await expect(foglio.getByRole('button', { name: SPOSTA.attesa.etichetta, exact: true })).toBeVisible()
  await expect(foglio.getByRole('button', { name: SPOSTA.riprogrammata.scelta, exact: true })).toHaveCount(0)
  await expect(foglio.getByRole('button', { name: 'Riprogrammata', exact: true })).toHaveCount(0)
  await expect(foglio.getByRole('button', { name: 'Chiusa', exact: true })).toHaveCount(0)
  await expect(foglio.getByRole('button', { name: 'No show', exact: true })).toHaveCount(0)
})
