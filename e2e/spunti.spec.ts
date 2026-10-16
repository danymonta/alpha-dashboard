import { expect, test } from '@playwright/test'

import { FINTO_CLAUDE, eseguiPassiCall, raggiungibile, rimettiLavoriCall, statoLavoriCall } from './call-db'
import { dbLocale } from './db'
import { accedi } from './utenti'

/**
 * Spunti (1.37.0, CLAUDE.md sezione 31): la scheda del Marketing con il brief settimanale di
 * Claude, scritto incrociando reel, DM, setting e call. L'admin legge anche «Per te» (i numeri
 * dietro ogni contenuto, euro compresi); il marketing e il video editor solo i temi, senza nomi
 * né cifre; le idee vanno nel calendario con un tocco.
 */

const BRIEF_SEED = '5ee70000-0000-4000-8000-000000000001'

/** The contents these tests make: the ideas of Claude's fake and the one taken from the seed's brief. */
async function pulisci() {
  const db = dbLocale()
  await db.from('marketing_contenuti').delete().like('nome', 'Idea di prova%')
  await db.from('marketing_contenuti').delete().eq('da_spunti', BRIEF_SEED)
}

test.beforeEach(pulisci)
test.afterEach(pulisci)

test('l’admin legge gli spunti, aggiunge un’idea al calendario una volta sola e vede «Per te»', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/marketing/spunti')
  await expect(page.getByRole('heading', { name: 'Spunti', level: 1 })).toBeVisible()
  // the tab sits next to the others and is lit
  await expect(page.getByRole('navigation', { name: 'Sezioni del Marketing' }).getByRole('link', { name: 'Spunti' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('spunti-titolo')).toContainText('dalle ultime 4 settimane')
  await expect(page.getByTestId('spunti-per-te')).toBeVisible()

  const idee = page.getByTestId('idea-spunti')
  const n = await idee.count()
  expect(n).toBeGreaterThan(0)
  const prima = idee.first()
  const nome = (await prima.getByRole('heading').textContent())!.trim()
  await prima.getByRole('button', { name: 'Aggiungi al calendario' }).click()
  await expect(prima.getByTestId('idea-aggiunta')).toBeVisible()

  const { data } = await dbLocale().from('marketing_contenuti').select('id, nome, stato, da_spunti, da_spunti_idea').eq('nome', nome)
  expect(data).toHaveLength(1)
  expect(data![0]).toMatchObject({ stato: 'not_started', da_spunti: BRIEF_SEED, da_spunti_idea: 0 })

  // once: after a reload the same idea says it is in the calendar, with no button
  await page.reload()
  await expect(idee.first().getByTestId('idea-aggiunta')).toBeVisible()
  await expect(idee.first().getByRole('button', { name: 'Aggiungi al calendario' })).toHaveCount(0)
  await idee.first().getByRole('link', { name: 'Apri il contenuto' }).click()
  await expect(page.getByRole('dialog')).toContainText(nome)
})

test('il marketing legge i temi, senza euro né nomi, e può chiedere nuovi spunti; il video editor no', async ({ page }) => {
  await accedi(page, 'marketing')
  await page.goto('/marketing/spunti')
  await expect(page.getByTestId('spunti-titolo')).toBeVisible()
  await expect(page.getByTestId('spunti-per-te')).toHaveCount(0)
  await expect(page.getByTestId('chiedi-spunti')).toBeVisible()
  const testo = await page.locator('main').innerText()
  expect(testo).not.toMatch(/€|Loris|Dany|Setter|revenue|cash/i)

  await page.context().clearCookies()
  await accedi(page, 'editor')
  await page.goto('/marketing/spunti')
  await expect(page.getByTestId('spunti-titolo')).toBeVisible()
  await expect(page.getByTestId('chiedi-spunti')).toHaveCount(0)
  await expect(page.getByTestId('spunti-per-te')).toHaveCount(0)
})

test('setter, closer e coach non aprono gli spunti', async ({ page }) => {
  for (const ruolo of ['setter', 'closer', 'coach'] as const) {
    await page.context().clearCookies()
    await accedi(page, ruolo)
    await page.goto('/marketing/spunti')
    await expect(page.getByTestId('spunti-titolo')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Spunti', level: 1 })).toHaveCount(0)
  }
})

test('«Chiedi nuovi spunti»: il passo scrive un brief nuovo con Claude finto, senza nomi né euro nella richiesta', async ({ page }) => {
  test.setTimeout(180_000)
  test.skip(!FINTO_CLAUDE || !(await raggiungibile(FINTO_CLAUDE, '/__azzera')), 'Il Claude finto non risponde.')
  const prima = await statoLavoriCall()
  const db = dbLocale()
  const { data: esistenti } = await db.from('marketing_spunti').select('id')
  const ids = new Set((esistenti ?? []).map((x) => x.id))
  try {
    await fetch(`${FINTO_CLAUDE}/__azzera`)
    await accedi(page, 'marketing')
    await page.goto('/marketing/spunti')
    await page.getByTestId('chiedi-spunti').click()
    await expect(page.getByTestId('spunti-in-corso')).toBeVisible()
    expect(await eseguiPassiCall()).toBeGreaterThanOrEqual(1)

    const { data: nuovi } = await db.from('marketing_spunti').select('id, stato, motivo, tentativi').order('created_at', { ascending: false })
    const nuovo = (nuovi ?? []).find((x) => !ids.has(x.id))
    expect(nuovo).toMatchObject({ stato: 'pronta', motivo: 'richiesta' })

    await page.reload()
    await expect(page.getByTestId('spunti-in-corso')).toHaveCount(0)
    await expect(page.getByTestId('idee-spunti')).toBeVisible()
    // what Claude was sent: the sources behind the brief as themes and counts, never a name, never a figure of money
    const richieste = (await (await fetch(`${FINTO_CLAUDE}/__ultime`)).json()) as { corpo: unknown }[]
    const inviato = JSON.stringify(richieste.map((r) => r.corpo))
    expect(richieste.length).toBeGreaterThanOrEqual(1)
    expect(inviato).not.toMatch(/Loris|Marco Rossi|€/)
  } finally {
    const { data: ora } = await db.from('marketing_spunti').select('id')
    const nuoviIds = (ora ?? []).map((x) => x.id).filter((id) => !ids.has(id))
    if (nuoviIds.length) {
      await db.from('marketing_contenuti').delete().in('da_spunti', nuoviIds)
      await db.from('marketing_spunti').delete().in('id', nuoviIds)
    }
    await rimettiLavoriCall(prima)
  }
})
