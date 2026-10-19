import { expect, test, type Page } from '@playwright/test'

import { oggiRoma } from '../lib/date'
import { dbLocale, ID_ADMIN, ID_SETTER } from './db'
import { accedi, NOTIFICA_BACKUP_SEED, NOTIFICA_PROMEMORIA_SEED, NOTIFICA_RIEPILOGO_SEED } from './utenti'

/**
 * The notification center (1.41.0): the bell with the red dot, the list, the
 * email as it was, read / read all / delete, and nobody reads another person's.
 * The three notifications of the admin are the seed's (55_notifiche.sql); every
 * test puts them back as they were.
 */
const HTML = '<!doctype html><html lang="it"><body><p>Settimana dal 10/10 al 16/10 di prova</p><a href="https://example.test/x">Un link</a></body></html>'

async function ripristina() {
  const db = dbLocale()
  const { error: e0 } = await db.from('notifiche').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e0) throw e0
  const base = { destinatario_id: ID_ADMIN, corpo_html: HTML, email_inviata: true }
  const { error } = await db.from('notifiche').insert([
    {
      ...base,
      id: NOTIFICA_RIEPILOGO_SEED,
      tipo: 'riepilogo_settimana',
      titolo: 'Riepilogo della settimana di prova',
      anteprima: 'Cash della settimana 3.200,00 €.',
      link: '/',
      chiave: 'e2e/riepilogo',
      created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
    {
      ...base,
      id: NOTIFICA_PROMEMORIA_SEED,
      tipo: 'promemoria_rinnovo',
      titolo: 'Call di rinnovo con Mario Esempio',
      anteprima: 'Il percorso finisce il 18/11/2026.',
      link: '/clients/00000000-0000-4000-8000-000000000000',
      email_inviata: false,
      chiave: 'e2e/promemoria',
      letta_il: new Date(Date.now() - 86_400_000).toISOString(),
      created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    },
    {
      ...base,
      id: NOTIFICA_BACKUP_SEED,
      tipo: 'backup',
      titolo: 'Backup settimanale di prova',
      anteprima: 'Il backup è partito per email.',
      link: '/settings/export',
      chiave: 'e2e/backup',
      letta_il: new Date(Date.now() - 86_400_000).toISOString(),
      created_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    },
  ])
  if (error) throw error
}

test.beforeEach(async () => {
  await ripristina()
})
test.afterAll(async () => {
  await ripristina()
})

// the bell is in the top bar twice (phone and desktop): the visible one
const campanella = (page: Page) => page.locator('[data-testid="campanella"]:visible')
const conteggio = (page: Page) => page.locator('[data-testid="campanella-conteggio"]:visible')

test('la campanella ha il pallino rosso col numero, e il nome lo dice', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/')
  await expect(campanella(page)).toHaveAccessibleName('Notifiche, 1 da leggere')
  await expect(conteggio(page)).toHaveText('1')
  // the dot is a sign, never the only one: the digits are hidden from screen readers
  await expect(conteggio(page)).toHaveAttribute('aria-hidden', 'true')
  const box = await campanella(page).boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
})

test('la lista: le più recenti per prime, da leggere in grassetto e con le parole, email inviata o no', async ({ page }) => {
  await accedi(page, 'admin')
  await campanella(page).click()
  await expect(page).toHaveURL(/\/notifiche$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Notifiche' })).toBeVisible()

  const righe = page.getByTestId('notifica')
  await expect(righe).toHaveCount(3)
  await expect(righe.nth(0)).toContainText('Riepilogo della settimana di prova')
  await expect(righe.nth(1)).toContainText('Call di rinnovo con Mario Esempio')
  await expect(righe.nth(2)).toContainText('Backup settimanale di prova')

  await expect(righe.nth(0)).toHaveAttribute('data-letta', 'no')
  await expect(righe.nth(0).getByTestId('da-leggere')).toHaveText('Da leggere')
  await expect(righe.nth(1)).toHaveAttribute('data-letta', 'si')
  await expect(righe.nth(1).getByTestId('da-leggere')).toHaveCount(0)
  // the email: icon and words, not colour
  await expect(righe.nth(0).getByTestId('email-inviata')).toHaveText('Email inviata')
  await expect(righe.nth(1).getByTestId('email-non-partita')).toHaveText('Email non partita')
  await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText('1 da leggere')
  // the bell is lit on its own page
  await expect(campanella(page)).toHaveAttribute('aria-current', 'page')
})

test('aprirla la segna letta: il pallino sparisce, l’email è mostrata com’era, in un riquadro senza script', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/notifiche')
  await page.getByTestId('notifica').first().getByRole('link').first().click()
  await expect(page).toHaveURL(new RegExp(`/notifiche/${NOTIFICA_RIEPILOGO_SEED}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Riepilogo della settimana di prova' })).toBeVisible()

  // the email as it was, in a sandboxed frame
  const riquadro = page.getByTestId('corpo-notifica')
  const sandbox = (await riquadro.getAttribute('sandbox')) ?? ''
  expect(sandbox).not.toContain('allow-scripts')
  expect(sandbox).not.toContain('allow-same-origin')
  await expect(page.frameLocator('[data-testid="corpo-notifica"]').getByText('Settimana dal 10/10 al 16/10 di prova')).toBeVisible()
  const documento = (await riquadro.getAttribute('srcdoc')) ?? ''
  expect(documento).toContain('<base target="_blank">')
  expect(documento).toContain("default-src 'none'")

  // the button to what it is about
  await expect(page.getByRole('link', { name: 'Apri la Panoramica' })).toBeVisible()

  // marked read: the bell loses the dot, and the list says so
  await expect(campanella(page)).toHaveAccessibleName('Notifiche')
  await expect(conteggio(page)).toHaveCount(0)
  await page.getByRole('link', { name: 'Notifiche', exact: true }).first().click()
  await expect(page.getByTestId('notifica').first()).toHaveAttribute('data-letta', 'si')
  await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText('Hai letto tutto')
})

test('una notifica senza email dice perché e porta alla scheda', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/notifiche/${NOTIFICA_PROMEMORIA_SEED}`)
  await expect(page.getByText('L’email non è partita', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Apri la scheda del cliente' })).toBeVisible()
})

test('«Segna tutte come lette» azzera il conto', async ({ page }) => {
  const db = dbLocale()
  const { error } = await db.from('notifiche').update({ letta_il: null }).eq('destinatario_id', ID_ADMIN)
  if (error) throw error
  await accedi(page, 'admin')
  await page.goto('/notifiche')
  await expect(campanella(page)).toHaveAccessibleName('Notifiche, 3 da leggere')
  await page.getByTestId('segna-tutte-lette').click()
  await expect(page.getByText('Tutte le notifiche sono segnate come lette')).toBeVisible()
  await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText('Hai letto tutto')
  await expect(page.getByTestId('segna-tutte-lette')).toBeDisabled()
  await expect(campanella(page)).toHaveAccessibleName('Notifiche')
})

test('elimina dalla riga: prima la domanda, poi sparisce', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/notifiche')
  await page.getByRole('button', { name: 'Elimina la notifica «Backup settimanale di prova»' }).click()
  await expect(page.getByRole('dialog')).toContainText('Non si può annullare')
  await expect(page.getByRole('dialog')).toContainText('resta nella tua posta')
  // nothing is deleted on the first tap
  await expect(page.getByTestId('notifica')).toHaveCount(3)
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
  await expect(page.getByText('Notifica eliminata')).toBeVisible()
  await expect(page.getByTestId('notifica')).toHaveCount(2)
})

test('elimina dal dettaglio e torna alla lista', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/notifiche/${NOTIFICA_BACKUP_SEED}`)
  await page.getByRole('button', { name: 'Elimina' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
  await expect(page).toHaveURL(/\/notifiche$/)
  await expect(page.getByTestId('notifica')).toHaveCount(2)
  // and the link of the deleted one says so
  await page.goto(`/notifiche/${NOTIFICA_BACKUP_SEED}`)
  await expect(page.getByText('Questa notifica non c’è più')).toBeVisible()
})

test('dal profilo si arriva al centro notifiche, col numero', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/account?scheda=account')
  const voce = page.getByTestId('link-notifiche-account')
  await expect(voce).toContainText('1 da leggere')
  await voce.click()
  await expect(page).toHaveURL(/\/notifiche$/)
})

test('il setter non vede quelle dell’admin: stato vuoto, nessun pallino; e vede solo le sue', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/notifiche')
  await expect(page.getByText('Nessuna notifica')).toBeVisible()
  await expect(page.getByTestId('notifica')).toHaveCount(0)
  await expect(campanella(page)).toHaveAccessibleName('Notifiche')
  await expect(conteggio(page)).toHaveCount(0)
  // the admin's notification by its address: not found
  await page.goto(`/notifiche/${NOTIFICA_RIEPILOGO_SEED}`)
  await expect(page.getByText('Questa notifica non c’è più')).toBeVisible()

  const db = dbLocale()
  const { error } = await db.from('notifiche').insert({
    destinatario_id: ID_SETTER,
    tipo: 'backup',
    titolo: 'Solo del setter',
    corpo_html: HTML,
    chiave: 'e2e/setter',
  })
  if (error) throw error
  await page.goto('/notifiche')
  await expect(page.getByTestId('notifica')).toHaveCount(1)
  await expect(page.getByTestId('notifica')).toContainText('Solo del setter')
  await expect(campanella(page)).toHaveAccessibleName('Notifiche, 1 da leggere')
})

test('a 390 px la lista e il dettaglio non scorrono di lato e la campanella si tocca', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto('/')
  await expect(campanella(page)).toBeVisible()
  const box = await campanella(page).boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await campanella(page).click()
  await expect(page.getByTestId('notifica')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.goto(`/notifiche/${NOTIFICA_RIEPILOGO_SEED}`)
  await expect(page.getByTestId('corpo-notifica')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

// The cron routes against the local dev server started WITHOUT a Resend key: the notifications are saved
// anyway and a second run the same day does not double them. Opt in with E2E_CRON_NOTIFICHE=1 (it hits
// whatever E2E_BASE_URL points at: never against a server that has a real Resend key).
test.describe('i cron salvano le notifiche anche senza email', () => {
  test.skip(process.env.E2E_CRON_NOTIFICHE !== '1' || !process.env.CRON_SECRET, 'E2E_CRON_NOTIFICHE=1 e CRON_SECRET')
  const intestazioni = () => ({ authorization: `Bearer ${process.env.CRON_SECRET}` })

  test('backup e giornaliero: righe una volta sola dopo due giri', async ({ request }) => {
    const db = dbLocale()
    await db.from('notifiche').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const oggi = oggiRoma()

    for (const percorso of ['/api/cron/backup', '/api/cron/giornaliero', '/api/cron/backup', '/api/cron/giornaliero']) {
      const risposta = await request.get(percorso, { headers: intestazioni() })
      const corpo = await risposta.json()
      // no email key on this server: nothing leaves
      expect(JSON.stringify(corpo)).toMatch(/non configurata/)
    }

    const { data: backup } = await db.from('notifiche').select('destinatario_id, email_inviata, link').eq('chiave', `backup/${oggi}`)
    const { data: admin } = await db.from('profiles').select('id').eq('ruolo', 'admin').eq('attivo', true)
    expect(backup).toHaveLength(admin?.length ?? 0)
    expect(backup?.every((r) => !r.email_inviata && r.link === '/settings/export')).toBe(true)

    // the reminders: the same count after a third run
    const { count: prima } = await db.from('notifiche').select('id', { count: 'exact', head: true })
    await request.get('/api/cron/giornaliero', { headers: intestazioni() })
    const { count: dopo } = await db.from('notifiche').select('id', { count: 'exact', head: true })
    expect(dopo).toBe(prima)

    // what the nights saved, by kind (printed for whoever runs it)
    const { data: tutte } = await db.from('notifiche').select('tipo, chiave, email_inviata, destinatario_id')
    const perTipo: Record<string, number> = {}
    for (const r of tutte ?? []) perTipo[r.tipo] = (perTipo[r.tipo] ?? 0) + 1
    console.log('notifiche salvate dai cron (righe per tipo):', JSON.stringify(perTipo), 'admin attivi:', admin?.length)
    // never two rows with the same recipient and key
    const chiavi = (tutte ?? []).map((r) => `${r.destinatario_id}|${r.chiave}`)
    expect(new Set(chiavi).size).toBe(chiavi.length)
  })
})
