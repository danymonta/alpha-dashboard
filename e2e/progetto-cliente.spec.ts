import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { ID_ADMIN, ID_COACH, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

/**
 * One project for every paying client (Dany, 02/10/2026): the first cashed
 * instalment of a new sale opens it with the 8 tasks of the coach and the
 * dates of the path; the coach is picked with one tap; an upsell opens nothing.
 */
// One word: the client's first name keeps it, and pulisciVendite finds it (projects included)
const PREFISSO = 'E2EProgettoCliente'

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
})

const TITOLI = [
  'Call di onboarding',
  'Analisi e strategia iniziale',
  'Programmazione allenamento (creazione e aggiornamenti)',
  'Programmazione alimentare (creazione e aggiornamenti)',
  'Revisione video',
  'Call di check',
  'Assistenza chat',
  'Altre attività',
]

/** Tap the visible chip, as a person would: the radio itself is visually hidden. */
async function scegli(page: Page, nome: string | RegExp) {
  const radio = page.getByRole('radio', { name: nome, exact: typeof nome === 'string' })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

function rata(page: Page, nome: string) {
  return page.getByRole('listitem', { name: nome, exact: true })
}

async function progettiDelCliente(clientId: string) {
  const { data, error } = await dbLocale().from('pm_progetti').select('id').eq('client_id', clientId)
  if (error) throw error
  return data
}

test('la nuova vendita propone l’inizio una settimana dopo, e lo segue finché non lo cambi tu', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/sales/new')
  const oggi = oggiRoma()

  await expect(page.getByLabel('Data vendita')).toHaveValue(oggi)
  await expect(page.getByLabel('Inizio percorso')).toHaveValue(aggiungiGiorni(oggi, 7))
  await expect(page.getByLabel('Inizio percorso')).toHaveAccessibleDescription(
    'Il percorso di solito inizia una settimana dopo il pagamento: controlla la data.',
  )

  // a sale recorded a few days late: the start moves with it
  const tardi = aggiungiGiorni(oggi, -3)
  await page.getByLabel('Data vendita').fill(tardi)
  await expect(page.getByLabel('Inizio percorso')).toHaveValue(aggiungiGiorni(tardi, 7))

  // a start chosen by hand stays where it is
  await page.getByLabel('Inizio percorso').fill(tardi)
  await page.getByLabel('Data vendita').fill(oggi)
  await expect(page.getByLabel('Inizio percorso')).toHaveValue(tardi)
})

test('la prima rata incassata apre il progetto del cliente, con gli 8 task e le date del percorso; il coach si sceglie con un tocco', async ({
  page,
}) => {
  const nome = `${PREFISSO}${Date.now()}`
  const oggi = oggiRoma()
  await accedi(page, 'admin')
  await page.goto('/sales/new')

  await page.getByLabel('Nome', { exact: true }).fill(nome)
  await page.getByLabel('Cognome').fill('Rossi')
  await scegli(page, /Percorso Alpha 3 mesi/)
  await scegli(page, '2')
  await page.getByRole('button', { name: 'Registra vendita' }).click()
  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/)

  const venditaId = page.url().split('/').at(-1)!
  const { data: vendita, error } = await dbLocale()
    .from('sales')
    .select('client_id, data_inizio, data_fine')
    .eq('id', venditaId)
    .single()
  if (error) throw error
  expect(vendita.data_inizio).toBe(aggiungiGiorni(oggi, 7))
  // nothing paid yet: no project
  expect(await progettiDelCliente(vendita.client_id)).toHaveLength(0)

  await rata(page, 'Rata 1').getByRole('button', { name: 'Segna incassata' }).click()
  await expect(page.getByText(/Rata 1 incassata/)).toBeVisible()
  await expect.poll(async () => (await progettiDelCliente(vendita.client_id)).length).toBe(1)

  // the client's sheet leads to the project, still without a coach
  await page.goto(`/clients/${vendita.client_id}`)
  const collegamento = page.getByTestId('progetto-cliente')
  await expect(collegamento).toContainText('Senza coach')
  await collegamento.click()
  await expect(page).toHaveURL(/\/progetti\/[0-9a-f-]{36}$/)
  const progettoId = page.url().split('/').at(-1)!

  await expect(page.getByRole('heading', { level: 1, name: `${nome} Rossi` })).toBeVisible()
  await expect(page.getByText(`${formatData(vendita.data_inizio)} → ${formatData(vendita.data_fine)}`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Scheda del cliente' })).toHaveAttribute('href', `/clients/${vendita.client_id}`)

  // the same 8 tasks of the template, without dates, nobody on them yet
  const { data: prima } = await dbLocale().from('v_pm_task').select('titolo, scadenza, assegnatari').eq('progetto_id', progettoId).order('ordine')
  expect(prima?.map((t) => t.titolo)).toEqual(TITOLI)
  expect(prima?.every((t) => t.scadenza === null && (t.assegnatari ?? []).length === 0)).toBe(true)

  // the list of projects says it has no coach
  await page.goto('/progetti')
  await expect(page.getByRole('link', { name: new RegExp(`${nome} Rossi`) })).toContainText('Senza coach')

  // one tap: the coach
  await page.goto(`/progetti/${progettoId}`)
  await page.getByRole('button', { name: 'Scegli il coach' }).click()
  const foglio = page.getByRole('dialog', { name: 'Scegli il coach' })
  await foglio.getByRole('button', { name: /^Marco Coach/ }).click()
  await expect(page.getByText(`Marco Coach è il coach di ${nome} Rossi`)).toBeVisible()
  await expect(page.getByTestId('coach-del-cliente')).toContainText('Coach: Marco Coach')

  // the meal plan goes to nutrition when someone does it, otherwise to the coach too
  const { data: nutrizione } = await dbLocale()
    .from('profiles')
    .select('id')
    .eq('ruolo', 'nutrizione')
    .eq('attivo', true)
    .order('nome')
    .limit(1)
  const alimentare = nutrizione?.[0]?.id ?? ID_COACH
  const { data: dopo } = await dbLocale().from('v_pm_task').select('titolo, assegnatari').eq('progetto_id', progettoId).order('ordine')
  for (const t of dopo ?? []) {
    expect(t.assegnatari, t.titolo!).toEqual([t.titolo!.startsWith('Programmazione alimentare') ? alimentare : ID_COACH])
  }
  const { data: membri } = await dbLocale().from('pm_membri').select('profile_id').eq('progetto_id', progettoId)
  expect(membri?.map((m) => m.profile_id)).toContain(ID_COACH)

  await page.getByRole('link', { name: 'Attività', exact: true }).click()
  await expect(page.getByTestId('task')).toHaveCount(8)
})

test('un upsell incassato non apre nessun progetto', async ({ page }) => {
  const nome = `${PREFISSO}${Date.now()}`
  const { data: cliente, error } = await dbLocale()
    .from('clients')
    .insert({ nome, cognome: 'Università', fonte: 'altro', created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error

  await accedi(page, 'admin')
  await page.goto(`/sales/new?cliente=${cliente.id}&tipo=upsell`)
  await expect(page.getByRole('radio', { name: 'Upsell', exact: true })).toBeChecked()
  await scegli(page, /Percorso Alpha 3 mesi/)
  await page.getByRole('button', { name: 'Registra vendita' }).click()
  await expect(page).toHaveURL(`/clients/${cliente.id}`)

  const { data: vendita } = await dbLocale().from('sales').select('id').eq('client_id', cliente.id).single()
  await page.goto(`/sales/${vendita!.id}`)
  await rata(page, 'Rata 1').getByRole('button', { name: 'Segna incassata' }).click()
  await expect(page.getByText(/Rata 1 incassata/)).toBeVisible()

  const { data: pagata } = await dbLocale().from('payments').select('stato').eq('sale_id', vendita!.id).single()
  expect(pagata?.stato).toBe('incassata')
  expect(await progettiDelCliente(cliente.id)).toHaveLength(0)
  await page.goto(`/clients/${cliente.id}`)
  await expect(page.getByTestId('progetto-cliente')).toHaveCount(0)
})

test('in Impostazioni il modello dei nuovi clienti si riconosce, con le 8 attività senza date', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/settings/progetti')
  const modello = page.getByTestId('modelli').getByRole('link', { name: /Percorso cliente/ })
  await expect(modello).toContainText('Per i nuovi clienti')
  await expect(modello).toContainText('8 attività')
  // it stays on: switched off, every new client's project would open without tasks
  await expect(page.getByRole('switch', { name: 'Percorso cliente attivo: è il modello dei nuovi clienti' })).toBeDisabled()
  await expect(page.getByTestId('senza-modello-clienti')).toHaveCount(0)
  await modello.click()

  await expect(page.getByTestId('modello-nuovi-clienti')).toContainText('Ogni cliente che paga la prima rata ha un progetto')
  const attivita = page.getByRole('list', { name: 'Attività fuori dalle liste' }).getByRole('listitem')
  await expect(attivita).toHaveText(TITOLI.map((t) => new RegExp(t.replace(/[()]/g, '\\$&'))))
  await expect(attivita.first()).toContainText('Senza date: aperta per tutto il progetto')
  await expect(page.getByRole('listitem', { name: TITOLI[3] })).toContainText('Nutrizione')

  // the sheet of an activity says who does it, and that it has no dates
  await page.getByRole('button', { name: `Modifica ${TITOLI[3]}` }).click()
  const foglio = page.getByRole('dialog', { name: 'Modifica l’attività' })
  await expect(foglio.getByLabel('Chi la fa')).toHaveValue('nutrizione')
  await expect(foglio.getByRole('switch', { name: 'Con le date' })).not.toBeChecked()
  await expect(foglio.getByLabel('Dal giorno')).toHaveCount(0)
})
