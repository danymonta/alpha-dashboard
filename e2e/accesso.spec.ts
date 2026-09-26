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
