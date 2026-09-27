import type { Page } from '@playwright/test'

/** Seed accounts created by supabase/seed.sql and supabase/seeds/10_progetti.sql. Local only. */
export const UTENTI = {
  admin: { email: 'admin@alpha.test', nome: 'Dany Montagnolo' },
  setter: { email: 'setter@alpha.test', nome: 'Loris Setter' },
  closer: { email: 'closer@alpha.test', nome: 'Lorenzo Closer' },
  coach: { email: 'coach@alpha.test', nome: 'Marco Coach' },
  editor: { email: 'editor@alpha.test', nome: 'Sara Editor' },
} as const

export type RuoloSeed = keyof typeof UTENTI

export const PASSWORD_SEED = process.env.SEED_PASSWORD ?? 'alpha1234'

/** Seed projects (supabase/seeds/10_progetti.sql) with fixed ids. */
export const PROGETTO_PERCORSO_CLIENTE = 'bbbbbbb1-0000-4000-8000-000000000001'
export const PROGETTO_REEL = 'bbbbbbb1-0000-4000-8000-000000000003'
export const PROGETTO_FUNNEL = 'bbbbbbb1-0000-4000-8000-000000000004'

/** Every tab of one project, for the screenshots. */
function schedeProgetto(id: string) {
  return [
    { nome: 'progetto-attivita', url: `/progetti/${id}` },
    { nome: 'progetto-gantt', url: `/progetti/${id}/gantt` },
    { nome: 'progetto-tempo', url: `/progetti/${id}/tempo` },
    { nome: 'progetto-note', url: `/progetti/${id}/note` },
    { nome: 'progetto-membri', url: `/progetti/${id}/membri` },
  ]
}

const PROGETTI = { nome: 'progetti', url: '/progetti' }
const TEMPO = { nome: 'il-mio-tempo', url: '/tempo' }

/** Pages reachable by each role, as the navigation offers them. */
export const PAGINE: Record<RuoloSeed, { nome: string; url: string }[]> = {
  admin: [
    { nome: 'panoramica', url: '/' },
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'nuova-vendita', url: '/sales/new' },
    { nome: 'pipeline', url: '/leads' },
    { nome: 'vendite', url: '/sales' },
    { nome: 'incassi', url: '/payments' },
    { nome: 'clienti', url: '/clients' },
    { nome: 'setting', url: '/setting' },
    { nome: 'provvigioni', url: '/commissions' },
    { nome: 'costi', url: '/expenses' },
    { nome: 'impostazioni', url: '/settings' },
    { nome: 'team', url: '/settings/team' },
    { nome: 'prodotti', url: '/settings/products' },
    { nome: 'regole-provvigioni', url: '/settings/commissions' },
    { nome: 'export', url: '/settings/export' },
    { nome: 'registro', url: '/settings/audit' },
    { nome: 'impostazioni-progetti', url: '/settings/progetti' },
    PROGETTI,
    ...schedeProgetto(PROGETTO_PERCORSO_CLIENTE),
    TEMPO,
  ],
  setter: [
    { nome: 'oggi', url: '/today' },
    { nome: 'nuova-call', url: '/calls/new' },
    { nome: 'pipeline', url: '/leads' },
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'i-miei-numeri', url: '/my-numbers' },
    // the seed setter is in no project: the empty state
    PROGETTI,
    TEMPO,
  ],
  closer: [
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'pipeline', url: '/leads' },
    { nome: 'nuova-vendita', url: '/sales/new' },
    { nome: 'le-mie-vendite', url: '/my-sales' },
    PROGETTI,
    ...schedeProgetto(PROGETTO_FUNNEL),
    TEMPO,
  ],
  coach: [PROGETTI, ...schedeProgetto(PROGETTO_PERCORSO_CLIENTE), TEMPO],
  editor: [PROGETTI, ...schedeProgetto(PROGETTO_REEL), TEMPO],
}

const IN_ATTESA_DELLO_STREAMING = new WeakSet<Page>()

/**
 * With streaming SSR, React 19.2 keeps the finished content in a hidden
 * <div id="S:…"> for a few hundred ms before revealing it: a locator can then
 * match two copies of the same element. After every full navigation, wait
 * until React has swapped them in.
 */
export function attendiStreaming(page: Page) {
  if (IN_ATTESA_DELLO_STREAMING.has(page)) return
  IN_ATTESA_DELLO_STREAMING.add(page)
  for (const metodo of ['goto', 'reload', 'goBack', 'goForward'] as const) {
    const originale = page[metodo].bind(page) as (...args: unknown[]) => Promise<unknown>
    Object.assign(page, {
      [metodo]: async (...args: unknown[]) => {
        const risposta = await originale(...args)
        await page
          .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, { timeout: 15_000 })
          .catch(() => undefined)
        return risposta
      },
    })
  }
}

export async function accedi(page: Page, ruolo: RuoloSeed) {
  attendiStreaming(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill(UTENTI[ruolo].email)
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  await page
    .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, { timeout: 15_000 })
    .catch(() => undefined)
}
