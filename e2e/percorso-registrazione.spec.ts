import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import {
  aspettaCodice,
  attivaDiProva,
  creaOnboardingDiProva,
  emailDiProva,
  idPosta,
  invitoDi,
  linkDi,
  pulisciClientiPercorso,
  sessioneClienteDb,
} from './percorso-db'
import { accedi } from './utenti'

/*
 * The client's door (release B1a, docs/onboarding/rilascio-b.md): the admin marks an invented
 * client as a test client, confirms the payment and copies the link; the client opens it in
 * another browser, writes his email, receives the code (Mailpit, E2E_EMAIL_MAILPIT on the dev
 * server) and lands on /percorso. Then the return from /entra, the team's pages closed to him,
 * the password refused, no script from another origin, a link that is not a test link with the
 * area closed, and «Elimina onboarding» on an onboarding never used.
 *
 * It needs the dev server started with E2E_EMAIL_MAILPIT=http://127.0.0.1:54324: without it no
 * code reaches Mailpit and the test is skipped.
 */
const PREFISSO = 'E2EPerc'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  const r = await request.get('http://127.0.0.1:54324/api/v1/info').catch(() => null)
  test.skip(!r?.ok(), 'Mailpit non risponde')
})

test.afterAll(async () => {
  await pulisciClientiPercorso(PREFISSO)
})

/** The origins of every script of the page: only the app's own. */
async function originiScript(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((s) => new URL((s as HTMLScriptElement).src, location.href).origin),
  )
}

test('il cliente di prova si registra dal link, rientra da /entra e resta nella sua area', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000)
  const origine = new URL(baseURL ?? 'http://localhost:3000').origin
  const nome = `${PREFISSO}Mario${Date.now().toString().slice(-5)}`
  const email = emailDiProva('registrazione')
  const { clientId } = await creaOnboardingDiProva(nome, email)

  // the admin: «Cliente di prova», «Conferma pagamento», «Copia link»
  await accedi(page, 'admin')
  await page.goto(`/onboarding/${clientId}`)
  const scheda = page.getByTestId('scheda-onboarding')
  await expect(scheda.getByTestId('riquadro-accesso')).toContainText('Non si è ancora registrato')
  await scheda.getByTestId('cliente-prova').getByRole('switch').click()
  await expect(page.getByText('Segnato come cliente di prova').first()).toBeVisible()
  await expect.poll(async () => (await invitoDi(clientId))?.prova).toBe(true)
  await scheda.getByTestId('conferma-pagamento').click()
  await page.getByTestId('conferma-pagamento-si').click()
  const copia = scheda.getByTestId('link-copia')
  await expect(copia).toBeVisible()
  const indirizzo = (await copia.locator('p.num').first().innerText()).trim()
  expect(indirizzo).toContain('/join/')
  const link = new URL(indirizzo).pathname

  // the client, in a browser of his own
  const contesto = await browser.newContext()
  const cliente = await contesto.newPage()
  await cliente.goto(link)
  await expect(cliente.getByRole('heading', { name: `Ciao ${nome}.` })).toBeVisible()
  for (const o of await originiScript(cliente)) expect(o).toBe(origine)
  // the email is never on the page of the token
  await expect(cliente.getByText(email)).toHaveCount(0)
  await cliente.getByRole('button', { name: 'Continua' }).click()
  await expect(cliente).toHaveURL(/\/join\/registrati$/)
  await expect(cliente.getByLabel('La tua email')).toHaveValue(email)
  const viste = await idPosta(email)
  await cliente.getByRole('button', { name: 'Inviami il codice' }).click()
  await expect(cliente.getByText(`Ti abbiamo scritto a ${email}: inserisci il codice.`)).toBeVisible()
  const mail = await aspettaCodice(email, viste)
  expect(mail, 'il codice è arrivato in Mailpit').not.toBeNull()
  expect(mail!.oggetto).toBe('Il tuo codice per Percorso Alpha')
  expect(mail!.conLink).toBe(false)
  await cliente.getByLabel('Il codice', { exact: true }).fill(mail!.codice!)
  await cliente.getByRole('button', { name: 'Entra nel percorso' }).click()
  await expect(cliente).toHaveURL(/\/percorso$/, { timeout: 30_000 })
  await expect(cliente.getByRole('heading', { level: 1, name: `Ciao ${nome}.` })).toBeVisible()
  await expect(cliente.getByTestId('pannello-passo')).toHaveAttribute('data-vista', 'passo:benvenuto')
  for (const o of await originiScript(cliente)) expect(o).toBe(origine)

  // the card of the admin knows him now
  await page.reload()
  await expect(scheda.getByTestId('riquadro-accesso')).toContainText('Accesso: Attivo')
  await expect(scheda.getByTestId('riquadro-elimina')).toContainText('per fermare l’onboarding usa «Revoca»')

  // the link opened again
  await cliente.goto(link)
  await expect(cliente.getByRole('heading', { name: 'Hai già il tuo accesso.' })).toBeVisible()

  // the team's pages are not his: back to /percorso, or 403 for an API of the team
  for (const percorso of ['/', '/onboarding', '/settings', '/oauth/consent', '/login']) {
    await cliente.goto(percorso)
    await expect(cliente, `${percorso} lo riporta al percorso`).toHaveURL(/\/percorso$/)
  }
  const alfire = await cliente.request.post('/api/alfire', { data: {} })
  expect(alfire.status()).toBe(403)

  // no password for a client, not even from his own session
  const sua = await sessioneClienteDb(email)
  const { error: errorePassword } = await sua.auth.updateUser({ password: 'Una-password-lunga-123' })
  expect(errorePassword, 'la password del cliente si rifiuta').not.toBeNull()

  // «Esci», then the return from /entra in a third browser
  await cliente.getByRole('button', { name: 'Esci' }).first().click()
  await expect(cliente).toHaveURL(/\/entra/)
  await contesto.close()

  const terzo = await browser.newContext()
  const rientro = await terzo.newPage()
  await rientro.goto('/entra')
  for (const o of await originiScript(rientro)) expect(o).toBe(origine)
  const prima = await idPosta(email)
  await rientro.getByLabel('La tua email').fill(email)
  await rientro.getByRole('button', { name: 'Inviami il codice' }).click()
  await expect(rientro.getByText('Se l’email è registrata, ti abbiamo scritto un codice di 8 cifre. Vale 60 minuti.')).toBeVisible()
  const accesso = await aspettaCodice(email, prima)
  expect(accesso, 'il codice di accesso è arrivato').not.toBeNull()
  expect(accesso!.oggetto).toBe('Il tuo codice per entrare nel Percorso Alpha')
  expect(accesso!.conLink).toBe(false)
  await rientro.getByLabel('Il codice', { exact: true }).fill(accesso!.codice!)
  await rientro.getByRole('button', { name: 'Entra', exact: true }).click()
  await expect(rientro).toHaveURL(/\/percorso$/, { timeout: 30_000 })
  await terzo.close()

  // /login with the client's address sends the client's email, never the team's
  const quarto = await browser.newContext()
  const login = await quarto.newPage()
  await login.goto('/login')
  const ancora = await idPosta(email)
  await login.getByLabel('Indirizzo di posta').fill(email)
  await login.getByRole('button', { name: 'Invia il codice' }).click()
  const dalLogin = await aspettaCodice(email, ancora)
  expect(dalLogin, 'una mail è arrivata').not.toBeNull()
  expect(dalLogin!.oggetto).toBe('Il tuo codice per entrare nel Percorso Alpha')
  await quarto.close()
})

test('un link che non è di prova, con l’area chiusa, non si apre', async ({ page }) => {
  const nome = `${PREFISSO}Luigi${Date.now().toString().slice(-5)}`
  const { clientId } = await creaOnboardingDiProva(nome, emailDiProva('chiusa'))
  await attivaDiProva(clientId, false)
  expect((await invitoDi(clientId))?.stato).toBe('attivo')
  const link = await linkDi(clientId)
  expect(link).not.toBeNull()
  await page.goto(link!)
  // paid and active, but the area is closed: «not active yet», never «waiting for the payment»
  await expect(page.getByText('Il tuo accesso non è ancora attivo. Ti avvisiamo noi.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continua' })).toHaveCount(0)
})

test('l’admin elimina un onboarding mai usato e lo riavvia dalla vendita', async ({ page }) => {
  test.setTimeout(120_000)
  const nome = `${PREFISSO}Elimina${Date.now().toString().slice(-5)}`
  const { clientId, saleId } = await creaOnboardingDiProva(nome, emailDiProva('elimina'))
  await accedi(page, 'admin')
  await page.goto(`/onboarding/${clientId}`)

  const riquadro = page.getByTestId('riquadro-elimina')
  await riquadro.getByRole('button', { name: 'Elimina onboarding' }).click()
  const domanda = page.getByRole('dialog')
  await expect(domanda).toContainText('Cliente, vendita, rate e progetto restano.')
  await expect(domanda).toContainText('lista «Onboarding»')
  await domanda.getByRole('button', { name: 'Elimina' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.getByText('Onboarding eliminato').first()).toBeVisible()
  expect(await invitoDi(clientId)).toBeNull()
  const { data: vendita } = await dbLocale().from('sales').select('id').eq('id', saleId).maybeSingle()
  expect(vendita?.id).toBe(saleId)

  // the sale is back among the new ones without onboarding, and it starts again
  await expect(page.getByTestId('senza-onboarding').getByText(`${nome} Incassi`)).toBeVisible()
  await page.goto(`/onboarding/nuovo?vendita=${saleId}`)
  // the wizard answers only once hydrated
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(nome)
  const avanti = page.getByTestId('wizard-avanti')
  await avanti.click()
  await expect(page.getByTestId('wizard')).toHaveAttribute('data-schermata', 'team')
  await avanti.click()
  await expect(page.getByTestId('wizard')).toHaveAttribute('data-schermata', 'riepilogo')
  await avanti.click()
  await expect(page.getByTestId('onboarding-avviato')).toBeVisible()
  expect((await invitoDi(clientId))?.stato).toBe('in_attesa_pagamento')
})
