import { expect, test } from '@playwright/test'

import { dbLocale } from './db'
import { CONTENUTO_SEED, PASSWORD_SEED, UTENTI, accedi } from './utenti'

test('senza sessione ogni pagina porta al login', async ({ page }) => {
  await page.goto('/sales')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible()
})

test('l’admin vede la navigazione completa', async ({ page }) => {
  await accedi(page, 'admin')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Panoramica' })).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  // Setter and Closer instead of Setting (07/10/2026)
  const voci = [
    'Panoramica',
    'Le mie call',
    'Vendite',
    'Pipeline',
    'Incassi',
    'Clienti',
    'Setter',
    'Closer',
    'Provvigioni',
    'Costi',
    // the Marketing area, between Economics and Progetti (1.32.0)
    'Contenuti',
    'Impostazioni',
  ]
  for (const voce of voci) {
    // "Le mie call" and "Closer" may carry the number of his outcomes to record
    await expect(nav.getByRole('link', { name: new RegExp(`^${voce}(, \\d+ esit[io] da registrare)?$`) })).toBeVisible()
  }
  await expect(nav.getByRole('link', { name: 'Setting', exact: true })).toHaveCount(0)
})

test('il setter atterra su Oggi e non vede le voci dell’admin', async ({ page }) => {
  await accedi(page, 'setter')
  await expect(page).toHaveURL('/today')

  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(nav.getByRole('link', { name: 'Oggi' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Vendite' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Costi' })).toHaveCount(0)
})

test('il closer atterra sulle sue call e non raggiunge i costi', async ({ page }) => {
  await accedi(page, 'closer')
  await expect(page).toHaveURL('/calls')

  // Anche via URL diretto: il frontend nasconde, la pagina rifiuta e riporta a casa
  await page.goto('/expenses')
  await expect(page).toHaveURL('/calls')
  await expect(page.getByRole('heading', { name: 'Costi' })).toHaveCount(0)
})

test('il nome e il ruolo dell’utente sono visibili nella shell', async ({ page }) => {
  await accedi(page, 'admin')
  await expect(page.getByText(UTENTI.admin.nome).first()).toBeVisible()
})

test('coach ed editor non hanno l’area Economics: le pagine Economics li riportano ai loro task', async ({ page }) => {
  // the video editor has Progetti and, since 1.32.0, the Marketing area too; the coach only Progetti
  for (const ruolo of ['coach', 'editor'] as const) {
    await accedi(page, ruolo)
    await expect(page).toHaveURL('/task')
    for (const pagina of ['/', '/sales', '/expenses', '/commissions']) {
      await page.goto(pagina)
      await expect(page).toHaveURL('/task')
    }
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Progetti' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Contenuti' })).toHaveCount(ruolo === 'editor' ? 1 : 0)
    await page.context().clearCookies()
  }
})

test('il marketing atterra sui contenuti: le pagine Economics e le impostazioni lo riportano lì', async ({ page }) => {
  await accedi(page, 'marketing')
  await expect(page).toHaveURL('/marketing/contenuti')
  await expect(page.getByRole('heading', { level: 1, name: 'Instagram Posts' })).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
  for (const voce of ['Contenuti', 'I miei task', 'Progetti', 'Il mio tempo', 'Novità']) {
    await expect(nav.getByRole('link', { name: voce, exact: true })).toBeVisible()
  }
  for (const voce of ['Panoramica', 'Oggi', 'Le mie call', 'Vendite', 'Pipeline', 'Costi', 'Impostazioni']) {
    await expect(nav.getByRole('link', { name: voce, exact: true })).toHaveCount(0)
  }

  // by direct URL too: the frontend hides, the page refuses and takes him home
  for (const pagina of ['/', '/setting', '/calls', '/today', '/settings/team', '/expenses', '/settings/products']) {
    await page.goto(pagina)
    await expect(page, pagina).toHaveURL('/marketing/contenuti')
  }
  // /marketing goes to the calendar
  await page.goto('/marketing')
  await expect(page).toHaveURL('/marketing/contenuti')
})

test('il calendario dei contenuti è dell’area Marketing: il setter torna a Oggi, il coach ai suoi task', async ({ page }) => {
  for (const [ruolo, casa] of [
    ['setter', '/today'],
    ['coach', '/task'],
  ] as const) {
    await accedi(page, ruolo)
    for (const pagina of [
      '/marketing',
      '/marketing/contenuti',
      `/marketing/contenuti/${CONTENUTO_SEED}`,
      // the panel's address and the posts of Instagram (1.33.0)
      `/marketing/contenuti?contenuto=${CONTENUTO_SEED}`,
      '/marketing/instagram',
    ]) {
      await page.goto(pagina)
      await expect(page, `${ruolo} ${pagina}`).toHaveURL(casa)
    }
    // nor through the routes the pages of the area call from the browser
    const dettaglio = await page.request.get(`/api/marketing/contenuti/${CONTENUTO_SEED}`)
    expect(dettaglio.status(), `${ruolo} dettaglio`).toBe(403)
    expect(await dettaglio.json()).toEqual({ errore: 'Il calendario dei contenuti è dell’area Marketing.' })
    const aggiorna = await page.request.post('/api/marketing/instagram/aggiorna', {
      headers: { origin: new URL(page.url()).origin },
    })
    expect(aggiorna.status(), `${ruolo} aggiorna`).toBe(403)
    expect(await aggiorna.json()).toEqual({ errore: 'Aggiorna da Instagram lo usano l’admin e il marketing.' })
    await expect(
      page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Contenuti' }),
    ).toHaveCount(0)
    await page.context().clearCookies()
  }
})

test('chi è già entrato non rivede il login: va dritto dove stava andando', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/login?da=/tempo')
  await expect(page).toHaveURL(/\/tempo$/)
  await page.goto('/login?da=//evil.example.com')
  await expect(page).toHaveURL(/localhost:3000\/(today)?$/)
})

test('senza sessione «Registra rinnovo» da un’email apre, dopo l’accesso, il rinnovo di quel cliente', async ({ page }) => {
  const db = dbLocale()
  const { data: vendita, error } = await db
    .from('sales')
    .select('client_id')
    .eq('tipo', 'nuovo')
    .limit(1)
    .single()
  if (error) throw error
  const destinazione = `/sales/new?cliente=${vendita.client_id}&tipo=rinnovo`

  await page.goto(destinazione)
  await expect(page).toHaveURL(/\/login\?da=/)
  expect(new URL(page.url()).searchParams.get('da')).toBe(destinazione)
  // the Google button carries it to the callback (cookie), query included
  await expect(page.locator('form input[name="da"]')).toHaveValue(destinazione)

  // signed in, the same "da" leads there, as the callback does after Google
  await accedi(page, 'admin')
  await page.goto(`/login?da=${encodeURIComponent(destinazione)}`)
  await expect(page).toHaveURL(destinazione)
  await expect(page.getByRole('radio', { name: 'Rinnovo' })).toBeChecked()
})

test('senza sessione la pagina di consenso di Claude porta al login e, dopo l’accesso, torna con la sua richiesta', async ({
  page,
}) => {
  // Claude connected (09/10/2026): Supabase sends the browser to /oauth/consent?authorization_id=…
  const destinazione = '/oauth/consent?authorization_id=richiestaDiProva0123456789abcdef'
  await page.goto(destinazione)
  await expect(page).toHaveURL(/\/login\?da=/)
  expect(new URL(page.url()).searchParams.get('da')).toBe(destinazione)

  // the dev login on that same page goes back there, query included, as Google does
  await page.getByLabel('Email').fill(UTENTI.marketing.email)
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await expect(page).toHaveURL(destinazione)
  // a request Supabase does not know: the page says so, never a loop back to the login
  await expect(page.getByRole('heading', { level: 1, name: 'Collegamento non riuscito' })).toBeVisible()
})

// the PKCE verifier the server exchange reads: present while a Google sign-in is pending
const VERIFICATORE = {
  name: 'sb-127-auth-token-code-verifier',
  value: `base64-${Buffer.from(JSON.stringify('verificatore-di-prova')).toString('base64url')}`,
  domain: 'localhost',
  path: '/',
}

test('il codice di Google finito sulla home (Site URL) arriva al rientro, non resta su /login?code=', async ({ page }) => {
  // what Supabase does when the return address is not in its allow list
  await page.context().addCookies([VERIFICATORE])
  await page.goto('/?code=e0f770a2-1b2e-4c9c-9806-188e785ae668')
  // a made-up code cannot be exchanged: the callback says so, instead of a silent loop
  await expect(page).toHaveURL(/\/login\?errore=callback$/)
})

test('chi è già dentro e apre un vecchio link col codice resta dentro', async ({ page }) => {
  await accedi(page, 'admin')

  // no sign-in pending: the old link takes the normal way
  await page.goto('/login?code=e0f770a2-1b2e-4c9c-9806-188e785ae668&da=%2F')
  await expect(page).toHaveURL(/\/$/)

  // a pending verifier too: the failed exchange must not touch the session
  await page.context().addCookies([VERIFICATORE])
  await page.goto('/?code=e0f770a2-1b2e-4c9c-9806-188e785ae668')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toBeVisible()
})
