import type { Page } from '@playwright/test'

/** Seed accounts created by supabase/seed.sql. Local only. */
export const UTENTI = {
  admin: { email: 'admin@alpha.test', nome: 'Dany Montagnolo' },
  setter: { email: 'setter@alpha.test', nome: 'Loris Setter' },
  closer: { email: 'closer@alpha.test', nome: 'Lorenzo Closer' },
} as const

export type RuoloSeed = keyof typeof UTENTI

export const PASSWORD_SEED = process.env.SEED_PASSWORD ?? 'alpha1234'

/** Pages reachable by each role, as the navigation offers them. */
export const PAGINE: Record<RuoloSeed, { nome: string; url: string }[]> = {
  admin: [
    { nome: 'panoramica', url: '/' },
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'vendite', url: '/sales' },
    { nome: 'incassi', url: '/payments' },
    { nome: 'clienti', url: '/clients' },
    { nome: 'setting', url: '/setting' },
    { nome: 'provvigioni', url: '/commissions' },
    { nome: 'costi', url: '/expenses' },
    { nome: 'team', url: '/settings/team' },
  ],
  setter: [
    { nome: 'oggi', url: '/today' },
    { nome: 'nuova-call', url: '/calls/new' },
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'i-miei-numeri', url: '/my-numbers' },
  ],
  closer: [
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'le-mie-vendite', url: '/my-sales' },
  ],
}

export async function accedi(page: Page, ruolo: RuoloSeed) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(UTENTI[ruolo].email)
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}
