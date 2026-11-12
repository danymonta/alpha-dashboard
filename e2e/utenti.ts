import type { Page } from '@playwright/test'

/**
 * Seed accounts created by supabase/seed.sql, supabase/seeds/10_progetti.sql
 * supabase/seeds/25_marketing.sql (marketing, 1.32.0) and supabase/seeds/26_business_coach.sql
 * (the business coach, 1.52.0; from 1.58.0 he has the sales recap only). Local only.
 */
export const UTENTI = {
  admin: { email: 'admin@alpha.test', nome: 'Dany Montagnolo' },
  setter: { email: 'setter@alpha.test', nome: 'Loris Setter' },
  closer: { email: 'closer@alpha.test', nome: 'Lorenzo Closer' },
  coach: { email: 'coach@alpha.test', nome: 'Marco Coach' },
  editor: { email: 'editor@alpha.test', nome: 'Sara Editor' },
  marketing: { email: 'marketing@alpha.test', nome: 'Giulia Marketing' },
  business_coach: { email: 'businesscoach@alpha.test', nome: 'Paolo Consulente' },
} as const

export type RuoloSeed = keyof typeof UTENTI

export const PASSWORD_SEED = process.env.SEED_PASSWORD ?? 'alpha1234'

/** Seed projects (supabase/seeds/10_progetti.sql) with fixed ids. */
export const PROGETTO_PERCORSO_CLIENTE = 'bbbbbbb1-0000-4000-8000-000000000001'
export const PROGETTO_REEL = 'bbbbbbb1-0000-4000-8000-000000000003'
export const PROGETTO_FUNNEL = 'bbbbbbb1-0000-4000-8000-000000000004'

/** A seed content of the calendar (supabase/seeds/25_marketing.sql): a posted reel with every section written. */
export const CONTENUTO_SEED = 'ccccccc1-0000-4000-8000-000000000001'

/** The seed notifications of the admin (supabase/seeds/55_notifiche.sql, 1.41.0): a recap not read yet, a reminder and the backup, both read. */
export const NOTIFICA_RIEPILOGO_SEED = 'dd000001-0000-4000-8000-000000000001'
export const NOTIFICA_PROMEMORIA_SEED = 'dd000001-0000-4000-8000-000000000002'
export const NOTIFICA_BACKUP_SEED = 'dd000001-0000-4000-8000-000000000003'

/** A seed client in onboarding, waiting for the payment (supabase/seeds/60_onboarding.sql, 1.77.0). */
export const CLIENTE_ONBOARDING_SEED = '0b0a0000-0000-4000-8000-000000000001'

/** Every tab of one project, for the screenshots. */
function schedeProgetto(id: string) {
  return [
    { nome: 'progetto-panoramica', url: `/progetti/${id}` },
    { nome: 'progetto-attivita', url: `/progetti/${id}/attivita` },
    { nome: 'progetto-gantt', url: `/progetti/${id}/gantt` },
    { nome: 'progetto-tempo', url: `/progetti/${id}/tempo` },
    { nome: 'progetto-note', url: `/progetti/${id}/note` },
    { nome: 'progetto-membri', url: `/progetti/${id}/membri` },
  ]
}

const PROGETTI = { nome: 'progetti', url: '/progetti' }
const TEMPO = { nome: 'il-mio-tempo', url: '/tempo' }

/** Pages reachable by each role, as the navigation offers them. */
const PROFILO = { nome: 'profilo', url: '/account' }
const MIEI_TASK = { nome: 'miei-task', url: '/task' }
// every role opens the changelog, from "Altro" (CLAUDE.md section 23)
const CHANGELOG = { nome: 'changelog', url: '/changelog' }
// the notification center (1.41.0): every role has the page, the admin's has the seed notifications
const NOTIFICHE = { nome: 'notifiche', url: '/notifiche' }
// the recap of the DMs of the last 24 hours (1.35.0): the admin and the setter,
// on the recaps of supabase/seeds/40_insight.sql
const INSIGHT = [
  { nome: 'insight', url: '/insight' },
  { nome: 'insight-agenda', url: '/insight?canale=agenda' },
]
// the Marketing area (1.32.0): admin, video editor and marketing; the content
// in its panel and the posts of Instagram from 1.33.0
const CONTENUTI = [
  { nome: 'contenuti', url: '/marketing/contenuti' },
  { nome: 'contenuti-calendario', url: '/marketing/contenuti?vista=calendario' },
  { nome: 'contenuto', url: `/marketing/contenuti/${CONTENUTO_SEED}` },
  { nome: 'contenuto-pannello', url: `/marketing/contenuti?contenuto=${CONTENUTO_SEED}` },
  // 25/10/2026: the published posts with their insights (they replace Post di Instagram and Analisi), the reel's panel
  // of 1.36.0 on supabase/seeds/45_analisi_reel.sql, and the sheet of «Collega»
  { nome: 'pubblicati', url: '/marketing/pubblicati' },
  { nome: 'pubblicati-reel', url: '/marketing/pubblicati?reel=17900000000000001' },
  { nome: 'pubblicati-contenuto', url: `/marketing/pubblicati?contenuto=${CONTENUTO_SEED}` },
  // 1.37.0: the weekly brief, on supabase/seeds/52_spunti.sql
  { nome: 'spunti', url: '/marketing/spunti' },
]

export const PAGINE: Record<RuoloSeed, { nome: string; url: string }[]> = {
  admin: [
    { nome: 'panoramica', url: '/' },
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'nuova-call', url: '/calls/new' },
    { nome: 'nuova-vendita', url: '/sales/new' },
    { nome: 'pipeline', url: '/leads' },
    { nome: 'vendite', url: '/sales' },
    { nome: 'incassi', url: '/payments' },
    { nome: 'clienti', url: '/clients' },
    // 1.77.0: the guided onboarding (the team's side), on supabase/seeds/60_onboarding.sql
    { nome: 'onboarding', url: '/onboarding' },
    { nome: 'onboarding-nuovo', url: '/onboarding/nuovo' },
    { nome: 'onboarding-scheda', url: `/onboarding/${CLIENTE_ONBOARDING_SEED}` },
    { nome: 'rinnovi', url: '/rinnovi' },
    { nome: 'setting', url: '/setting' },
    ...INSIGHT,
    { nome: 'closer', url: '/setting/closer' },
    // 1.37.0: the recorded calls by source and by content, on the seeds of Fathom
    { nome: 'closer-per-fonte', url: '/setting/closer?per=fonte' },
    { nome: 'closer-per-contenuto', url: '/setting/closer?per=contenuto' },
    { nome: 'compila-giornata', url: '/setting/closer/giorno' },
    { nome: 'provvigioni', url: '/commissions' },
    { nome: 'costi', url: '/expenses' },
    { nome: 'spese-personali', url: '/spese-personali' },
    ...CONTENUTI,
    { nome: 'impostazioni', url: '/settings' },
    { nome: 'team', url: '/settings/team' },
    { nome: 'prodotti', url: '/settings/products' },
    { nome: 'regole-provvigioni', url: '/settings/commissions' },
    { nome: 'export', url: '/settings/export' },
    { nome: 'registro', url: '/settings/audit' },
    { nome: 'impostazioni-progetti', url: '/settings/progetti' },
    { nome: 'impostazioni-chiavi', url: '/settings/chiavi' },
    { nome: 'impostazioni-instagram', url: '/settings/instagram' },
    { nome: 'impostazioni-fathom', url: '/settings/fathom' },
    { nome: 'impostazioni-onboarding', url: '/settings/onboarding' },
    // the business coach's page, which the admin opens too (1.58.0)
    { nome: 'recap', url: '/recap' },
    CHANGELOG,
    NOTIFICHE,
    { nome: 'notifica', url: `/notifiche/${NOTIFICA_RIEPILOGO_SEED}` },
    PROGETTI,
    ...schedeProgetto(PROGETTO_PERCORSO_CLIENTE),
    TEMPO,
    { nome: 'tempo-team', url: '/tempo/team' },
    MIEI_TASK,
    PROFILO,
  ],
  setter: [
    { nome: 'oggi', url: '/today' },
    { nome: 'nuova-call', url: '/calls/new' },
    { nome: 'pipeline', url: '/leads' },
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'i-miei-numeri', url: '/my-numbers' },
    ...INSIGHT,
    // the closer's numbers, read only (07/10/2026)
    { nome: 'closer', url: '/setting/closer' },
    // the seed setter is in no project: the empty state
    PROGETTI,
    TEMPO,
    MIEI_TASK,
    CHANGELOG,
    NOTIFICHE,
    PROFILO,
  ],
  closer: [
    { nome: 'le-mie-call', url: '/calls' },
    { nome: 'pipeline', url: '/leads' },
    { nome: 'nuova-vendita', url: '/sales/new' },
    { nome: 'le-mie-vendite', url: '/my-sales' },
    { nome: 'i-miei-numeri', url: '/setting/closer' },
    { nome: 'compila-giornata', url: '/setting/closer/giorno' },
    PROGETTI,
    ...schedeProgetto(PROGETTO_FUNNEL),
    TEMPO,
    MIEI_TASK,
    CHANGELOG,
    PROFILO,
  ],
  coach: [MIEI_TASK, PROGETTI, ...schedeProgetto(PROGETTO_PERCORSO_CLIENTE), TEMPO, CHANGELOG, PROFILO],
  editor: [MIEI_TASK, PROGETTI, ...schedeProgetto(PROGETTO_REEL), TEMPO, ...CONTENUTI, CHANGELOG, PROFILO],
  // lands on the content calendar; Projects like the video editor (member of the reels project)
  marketing: [...CONTENUTI, MIEI_TASK, PROGETTI, ...schedeProgetto(PROGETTO_REEL), TEMPO, CHANGELOG, PROFILO],
  // the business coach (1.58.0): one page only, the sales recap
  business_coach: [{ nome: 'recap', url: '/recap' }],
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
