import { expect, test, type Page } from '@playwright/test'

import { COOKIE_PICKER_E2E, CONFIG_PICKER_E2E } from '../lib/google/picker'
import { dbLocale, ID_ADMIN, ID_CLOSER, ID_COACH, ID_EDITOR } from './db'
import { bloccaGoogle, googleFinto, ID_CARTELLA, TOKEN_FINTO } from './google-finto'
import { accedi, PROGETTO_REEL } from './utenti'

/**
 * The client's Drive folder on his project (Dany, 05/10/2026: «la scheda Drive
 * deve essere visibile anche dal progetto del cliente perché fa parte delle sue
 * info, e deve poterla modificare ed editare il fitness coach»). The coach of
 * the project opens, links, changes and takes away the link, on the phone too;
 * another member of the project never sees it; the admin sees the same link on
 * the project and on the client sheet.
 */
const PREFISSO = 'E2ECartellaProgetto'
const URL_DRIVE = 'https://drive.google.com/drive/folders/e2e-cartella-progetto-1'
const URL_DRIVE_2 = 'https://drive.google.com/drive/folders/e2e-cartella-progetto-2'

type Fixture = { clientId: string; progettoId: string; nome: string }

/** A client with his project: Marco Coach is its coach, Sara Editor a member who is not. */
async function creaProgettoCliente(): Promise<Fixture> {
  const db = dbLocale()
  const nome = `${PREFISSO}${Date.now()}`
  const { data: cliente, error: e1 } = await db
    .from('clients')
    .insert({ nome, cognome: 'Drive', closer_id: ID_CLOSER, created_by: ID_ADMIN })
    .select('id')
    .single()
  if (e1) throw e1
  const { data: reparto, error: e2 } = await db.from('pm_reparti').select('id').eq('nome', 'Fitness Coaching').single()
  if (e2) throw e2
  const { data: progetto, error: e3 } = await db
    .from('pm_progetti')
    .insert({ reparto_id: reparto.id, nome: `${nome} Drive`, client_id: cliente.id, created_by: ID_ADMIN })
    .select('id')
    .single()
  if (e3) throw e3
  const { error: e4 } = await db.from('pm_membri').insert(
    [ID_COACH, ID_EDITOR].map((profile_id) => ({ progetto_id: progetto.id, profile_id, aggiunto_da: ID_ADMIN })),
  )
  if (e4) throw e4
  const { error: e5 } = await db.from('pm_progetti').update({ coach_id: ID_COACH }).eq('id', progetto.id)
  if (e5) throw e5
  return { clientId: cliente.id, progettoId: progetto.id, nome: `${nome} Drive` }
}

async function cartellaNelDb(clientId: string) {
  const { data, error } = await dbLocale().from('clienti_cartelle').select('url, created_by').eq('client_id', clientId)
  if (error) throw error
  return data
}

async function nessunoScrollLaterale(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
}

test.afterEach(async () => {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').like('nome', `${PREFISSO}%`)
  const ids = (clienti ?? []).map((c) => c.id)
  if (ids.length > 0) {
    await db.from('pm_progetti').delete().in('client_id', ids)
    // the folder link goes with the client (on delete cascade)
    await db.from('clients').delete().in('id', ids)
  }
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('il coach del cliente collega la cartella Drive dal progetto, la apre, la cambia e toglie il link', async ({ page, context }) => {
    test.setTimeout(90_000)
    const { clientId, progettoId, nome } = await creaProgettoCliente()
    await context.route('https://drive.google.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Drive</title><p>Cartella</p>' }),
    )

    await accedi(page, 'coach')
    await page.goto(`/progetti/${progettoId}`)
    await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
    // the client's info: his coach, and the folder; the client sheet is the admin's
    await expect(page.getByTestId('coach-del-cliente')).toContainText('Coach: Marco Coach')
    await expect(page.getByRole('link', { name: 'Scheda del cliente' })).toHaveCount(0)
    const riga = page.getByTestId('cartella-drive')
    await expect(riga).toContainText('Nessuna cartella collegata')

    await riga.getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
    await expect(foglio).toContainText(`Il link alla cartella di ${nome} su Google Drive. Lo vedete tu e l’admin`)
    // the advice on invoices is the admin's: the coach never reads about money
    await expect(foglio).not.toContainText('fatture')
    const campo = foglio.getByLabel('Link della cartella')
    await campo.fill('https://example.com/cartella')
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(foglio.getByText('Incolla il link di una cartella di Google Drive')).toBeVisible()

    await campo.fill(URL_DRIVE)
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText('Cartella collegata', { exact: true })).toBeVisible()
    await expect(foglio).toBeHidden()

    const link = riga.getByRole('link', { name: /Cartella Drive/ })
    await expect(link).toHaveAttribute('href', URL_DRIVE)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(await cartellaNelDb(clientId)).toEqual([{ url: URL_DRIVE, created_by: ID_COACH }])

    await nessunoScrollLaterale(page)
    const matita = riga.getByRole('button', { name: 'Modifica il link della cartella Drive' })
    const box = await matita.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)

    const [scheda] = await Promise.all([page.waitForEvent('popup'), link.click()])
    await expect(scheda).toHaveURL(URL_DRIVE)
    await scheda.close()

    // part of the client's info: there on every tab of the project
    await page.getByRole('link', { name: 'Attività', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/progetti/${progettoId}/attivita`))
    await expect(riga.getByRole('link', { name: /Cartella Drive/ })).toHaveAttribute('href', URL_DRIVE)

    // the pencil opens on the saved link and changes it
    await matita.click()
    await expect(foglio.getByLabel('Link della cartella')).toHaveValue(URL_DRIVE)
    await foglio.getByLabel('Link della cartella').fill(URL_DRIVE_2)
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText('Link aggiornato', { exact: true })).toBeVisible()
    await expect(riga.getByRole('link', { name: /Cartella Drive/ })).toHaveAttribute('href', URL_DRIVE_2)
    expect((await cartellaNelDb(clientId)).map((c) => c.url)).toEqual([URL_DRIVE_2])

    // "Togli il link" asks first
    await matita.click()
    await foglio.getByRole('button', { name: 'Togli il link' }).click()
    const domanda = page.getByRole('dialog', { name: /^Eliminare il link alla cartella Drive/ })
    await expect(domanda).toContainText('La cartella su Google Drive resta com’è')
    await domanda.getByRole('button', { name: 'Elimina' }).click()
    await expect(page.getByText('Link tolto')).toBeVisible()
    await expect(riga).toContainText('Nessuna cartella collegata')
    await expect(riga.getByRole('link')).toHaveCount(0)
    expect(await cartellaNelDb(clientId)).toEqual([])
    await nessunoScrollLaterale(page)
  })

  test('«Scegli da Drive» anche per il coach: la cartella scelta si salva, il token mai al server', async ({ page, context, baseURL }) => {
    test.setTimeout(90_000)
    const { clientId, progettoId } = await creaProgettoCliente()
    await context.addCookies([{ name: COOKIE_PICKER_E2E, value: '1', url: baseURL ?? 'http://localhost:3000' }])
    const google = await bloccaGoogle(context)
    const alServer: string[] = []
    page.on('request', (r) => {
      if (r.url().startsWith('http://localhost')) alServer.push(`${r.url()} ${r.postData() ?? ''}`)
    })
    await googleFinto(page, { accesso: 'ok', picker: 'cartella' })

    await accedi(page, 'coach')
    await page.goto(`/progetti/${progettoId}`)
    await page.getByTestId('cartella-drive').getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
    const bottone = foglio.getByRole('button', { name: 'Scegli da Drive' })
    await expect(bottone).toBeVisible()
    const box = await bottone.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    // the folder must be shared with him: the sheet tells him whom to ask
    await expect(foglio).toContainText('Chiedi all’admin di condividerla con il tuo account Google.')

    await bottone.click()
    await expect(page.getByText('Cartella collegata', { exact: true })).toBeVisible()
    const url = `https://drive.google.com/drive/folders/${ID_CARTELLA}`
    await expect(page.getByTestId('cartella-drive').getByRole('link', { name: /Cartella Drive/ })).toHaveAttribute('href', url)
    expect(await cartellaNelDb(clientId)).toEqual([{ url, created_by: ID_COACH }])
    expect(alServer.some((r) => r.includes(TOKEN_FINTO))).toBe(false)
    expect(google).toEqual([])
    await nessunoScrollLaterale(page)
  })
})

test('un altro membro del progetto non vede la cartella, né la configurazione di Google', async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  const { clientId, progettoId, nome } = await creaProgettoCliente()
  const { error } = await dbLocale().from('clienti_cartelle').insert({ client_id: clientId, url: URL_DRIVE, created_by: ID_ADMIN })
  if (error) throw error
  await context.addCookies([{ name: COOKIE_PICKER_E2E, value: '1', url: baseURL ?? 'http://localhost:3000' }])

  await accedi(page, 'editor')
  for (const scheda of ['', '/attivita']) {
    await page.goto(`/progetti/${progettoId}${scheda}`)
    await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
    await expect(page.getByTestId('coach-del-cliente')).toContainText('Coach: Marco Coach')
    // no card at all, not even an empty one
    await expect(page.getByTestId('cartella-drive')).toHaveCount(0)
    const html = await page.content()
    expect(html).not.toContain('drive.google.com')
    expect(html).not.toContain('Cartella Drive')
    expect(html).not.toContain(CONFIG_PICKER_E2E.apiKey)
  }
})

test('l’admin vede lo stesso link nel progetto e nella scheda del cliente; la configurazione di Google solo lì', async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  const { clientId, progettoId, nome } = await creaProgettoCliente()
  // linked by the coach
  const { error } = await dbLocale().from('clienti_cartelle').insert({ client_id: clientId, url: URL_DRIVE, created_by: ID_COACH })
  if (error) throw error
  await context.addCookies([{ name: COOKIE_PICKER_E2E, value: '1', url: baseURL ?? 'http://localhost:3000' }])

  await accedi(page, 'admin')
  await page.goto(`/progetti/${progettoId}`)
  const riga = page.getByTestId('cartella-drive')
  await expect(riga.getByRole('link', { name: /Cartella Drive/ })).toHaveAttribute('href', URL_DRIVE)
  await riga.getByRole('button', { name: 'Modifica il link della cartella Drive' }).click()
  const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
  await expect(foglio).toContainText('Lo vedete tu e il coach del suo progetto, se ne ha uno, che lo può anche cambiare')
  await expect(foglio).toContainText('Con il coach condividi su Drive solo una cartella senza fatture né contratti.')
  await expect(foglio.getByRole('button', { name: 'Scegli da Drive' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()

  await page.getByRole('link', { name: 'Scheda del cliente' }).click()
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}$`))
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  await expect(page.getByTestId('cartella-drive').getByRole('link', { name: /Cartella Drive/ })).toHaveAttribute('href', URL_DRIVE)

  // a project without a client: no card and none of Google's values
  await page.goto(`/progetti/${PROGETTO_REEL}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('cartella-drive')).toHaveCount(0)
  expect(await page.content()).not.toContain(CONFIG_PICKER_E2E.apiKey)
})
