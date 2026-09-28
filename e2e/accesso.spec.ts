import { expect, test } from '@playwright/test'

import { UTENTI, accedi } from './utenti'

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
  const voci = [
    'Panoramica',
    'Le mie call',
    'Vendite',
    'Pipeline',
    'Incassi',
    'Clienti',
    'Setting',
    'Provvigioni',
    'Costi',
    'Impostazioni',
  ]
  for (const voce of voci) {
    await expect(nav.getByRole('link', { name: voce, exact: true })).toBeVisible()
  }
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

test('coach ed editor hanno solo i Progetti: le pagine Economics li riportano ai loro task', async ({ page }) => {
  for (const ruolo of ['coach', 'editor'] as const) {
    await accedi(page, ruolo)
    await expect(page).toHaveURL('/task')
    for (const pagina of ['/', '/sales', '/expenses', '/commissions']) {
      await page.goto(pagina)
      await expect(page).toHaveURL('/task')
    }
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
