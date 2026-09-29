import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

// Runs against the fake model (e2e/llm-finto.mjs), like alfire-chat.spec.ts: the dev
// server must start with ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and E2E_ALFIRE_FINTO=1.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

test.afterEach(async () => {
  await dbLocale().from('expenses').delete().like('descrizione', 'E2EAlfire%')
})

async function chiedi(page: Page, domanda: string) {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  const casella = pannello.getByLabel('Scrivi ad Alfire')
  await casella.fill(domanda)
  await casella.press('Enter')
  return { pannello, casella, mio: pannello.getByTestId('alfire-mio-messaggio') }
}

test('un tocco su una risposta è il mio messaggio, e Alfire risponde sapendo cosa aveva chiesto', async ({ page }) => {
  const { pannello, casella, mio } = await chiedi(page, 'Mostrami le rate di Rossi')
  await expect(pannello.getByText('Ho trovato due clienti Rossi: quale cliente intendi?')).toBeVisible()
  const gruppo = pannello.getByRole('group', { name: 'Quale cliente intendi?' })
  await expect(gruppo.getByRole('button')).toHaveCount(2)
  // the question is already in the text: not repeated above the buttons
  await expect(pannello.getByText('Quale cliente intendi?', { exact: true })).toHaveCount(0)

  await gruppo.getByRole('button', { name: 'Luca Rossi' }).click()
  await expect(mio.last()).toHaveText('Luca Rossi')
  await expect(pannello.getByText('Ecco le rate di Luca Rossi: nessuna in ritardo.')).toBeVisible()

  // the buttons show the answer and never send again
  const scelta = gruppo.getByRole('button', { name: 'Luca Rossi' })
  await expect(scelta).toHaveAttribute('data-scelta', 'true')
  await expect(scelta).toBeDisabled()
  await expect(gruppo.getByRole('button', { name: 'Mario Rossi' })).toBeDisabled()
  await expect(mio).toHaveCount(2)
  // a tap leaves the box alone
  await expect(casella).toHaveValue('')
})

test('si può anche scrivere un’altra risposta: i bottoni non bloccano niente', async ({ page }) => {
  const { pannello, casella, mio } = await chiedi(page, 'Mostrami le rate di Rossi')
  const gruppo = pannello.getByRole('group', { name: 'Quale cliente intendi?' })
  await expect(gruppo.getByRole('button', { name: 'Mario Rossi' })).toBeEnabled()

  await casella.fill('Il secondo, Luca')
  await casella.press('Enter')
  await expect(mio.last()).toHaveText('Il secondo, Luca')
  await expect(pannello.getByText('Ecco le rate di Il secondo, Luca: nessuna in ritardo.')).toBeVisible()
  // none of the options was the answer, and none sends any more
  await expect(gruppo.locator('[data-scelta]')).toHaveCount(0)
  await expect(gruppo.getByRole('button', { name: 'Mario Rossi' })).toBeDisabled()
  await expect(gruppo.getByRole('button', { name: 'Luca Rossi' })).toBeDisabled()
})

test('una domanda scritta solo sopra i bottoni si vede e resta nel contesto di Alfire', async ({ page }) => {
  const { pannello, mio } = await chiedi(page, 'Dammi i numeri di un mese')
  await expect(pannello.getByText('Di quale mese vuoi i numeri?', { exact: true })).toBeVisible()
  // buttons are an answer: not "Alfire stopped without a word"
  await expect(pannello.getByTestId('alfire-muta')).toHaveCount(0)

  await pannello.getByRole('button', { name: 'Agosto 2026' }).click()
  await expect(mio.last()).toHaveText('Agosto 2026')
  // the route gave the question back to the model as text: it knows what "Agosto 2026" answers
  await expect(pannello.getByText('Numeri di Agosto 2026: 6.950,00 € incassati.')).toBeVisible()
})

test('dopo una risposta Alfire propone le domande successive: un tocco le chiede', async ({ page }) => {
  const { pannello, mio } = await chiedi(page, 'Com’è andato il mese?')
  await expect(pannello.getByText('Il mese va bene: 6.950,00 € incassati.')).toBeVisible()
  const seguito = pannello.getByRole('group', { name: 'Domande successive' })
  await expect(seguito.getByRole('button')).toHaveCount(2)

  await seguito.getByRole('button', { name: 'Chi è in ritardo con i pagamenti?' }).click()
  await expect(mio.last()).toHaveText('Chi è in ritardo con i pagamenti?')
  await expect(pannello.getByText('Nessuno è in ritardo con i pagamenti.')).toBeVisible()
  await expect(seguito.getByRole('button', { name: 'Chi è in ritardo con i pagamenti?' })).toBeDisabled()
  await expect(seguito.getByRole('button', { name: 'Quanto devo in provvigioni?' })).toBeDisabled()
})

test('solo domande successive, senza una parola di risposta: la chat offre ancora «Riprova»', async ({ page }) => {
  const { pannello } = await chiedi(page, 'Com’è andato il mese? Solo bottoni')
  await expect(pannello.getByRole('group', { name: 'Domande successive' }).getByRole('button')).toHaveCount(2)
  // follow-ups are not an answer: the read was never turned into words
  await expect(pannello.getByTestId('alfire-muta')).toBeVisible()
  await expect(pannello.getByTestId('alfire-muta').getByRole('button', { name: 'Riprova' })).toBeEnabled()
})

test('un tocco non scrive niente: la scrittura passa sempre dalla scheda e da «Conferma»', async ({ page }) => {
  const { pannello } = await chiedi(page, 'Registra la spesa di Figma')
  const gruppo = pannello.getByRole('group', { name: 'Di che categoria è la spesa?' })
  await gruppo.getByRole('button', { name: 'Software' }).click()

  const scheda = pannello.getByTestId('alfire-conferma')
  await expect(scheda).toContainText('Registro il costo «E2EAlfire Figma»')
  const prima = await dbLocale().from('expenses').select('id').like('descrizione', 'E2EAlfire%')
  expect(prima.data).toHaveLength(0)

  await scheda.getByRole('button', { name: 'Conferma' }).click()
  await expect(pannello.getByText('Fatto: costo.')).toBeVisible()
  const dopo = await dbLocale().from('expenses').select('importo, categoria').like('descrizione', 'E2EAlfire%').single()
  expect(dopo.data).toMatchObject({ importo: 15, categoria: 'software' })
})
