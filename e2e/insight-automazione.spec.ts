import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbLocale, ID_ADMIN } from './db'
import { accedi } from './utenti'

/**
 * «Automazione» of the Insight (1.35.0, CLAUDE.md section 29): the admin
 * chooses when the recap is ready, in steps of 5 minutes, and turns it on; the
 * setter's meta line says it, Impostazioni › Instagram e Messenger says it,
 * the database has it. The address of the steps comes from the server
 * (urlPasso, D18): with INSIGHT_URL_PASSO=manuale (the worktree's default) the
 * action refuses to turn it on and says why, saves the time with the
 * automation off, and the test turns it on in the database, as a deploy with
 * its APP_URL does; with a local address (host.docker.internal) the admin
 * turns it on from the page. pg_cron never starts a run here: without an
 * address nothing is due (insight_da_avviare). The row goes back as it was.
 */

// the addresses public.insight_impostazioni accepts outside production
const URL_LOCALE = /^http:\/\/(host\.docker\.internal|localhost|127\.0\.0\.1)(:\d{2,5})?\/api\/cron\/insight$/

type Impostazioni = { attivo: boolean; ora: string; url_passo: string | null; updated_by: string | null }
let prima: Impostazioni | null = null

async function impostazioni(): Promise<Impostazioni> {
  const { data, error } = await dbLocale()
    .from('insight_impostazioni')
    .select('attivo, ora, url_passo, updated_by')
    .single()
  if (error) throw error
  return data as Impostazioni
}

function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

/** The <details> «Automazione» at the top of the page, opened. */
async function apriAutomazione(page: Page): Promise<Locator> {
  const automazione = page.getByTestId('insight-automazione')
  await expect(automazione).toBeVisible()
  if ((await automazione.getAttribute('open')) === null) await automazione.locator('summary').click()
  await expect(automazione.getByRole('button', { name: 'Salva automazione' })).toBeVisible()
  return automazione
}

test.beforeAll(async () => {
  prima = await impostazioni()
})

test.afterAll(async () => {
  if (!prima) return
  const { error } = await dbLocale().from('insight_impostazioni').update(prima).eq('id', true)
  if (error) throw error
})

test('l’admin salva «Pronto alle» 19:05: lo dicono la riga di stato, il setter e le impostazioni', async ({
  page,
  browser,
}) => {
  // two accounts and three pages compiled on the first hit by the dev server
  test.setTimeout(150_000)
  const db = dbLocale()
  const passi = process.env.INSIGHT_URL_PASSO?.trim() ?? ''
  // without INSIGHT_URL_PASSO the app falls back to its own address (urlPasso), as in production
  const conIndirizzo = passi === '' || URL_LOCALE.test(passi)
  // from a known state: off at 19:00
  const { error: erroreInizio } = await db.from('insight_impostazioni').update({ attivo: false, ora: '19:00' }).eq('id', true)
  if (erroreInizio) throw erroreInizio

  await accedi(page, 'admin')
  await page.goto('/insight')
  let automazione = await apriAutomazione(page)
  const stato = () => automazione.getByTestId('insight-automazione-stato')
  await expect(stato()).toContainText('Disattivata.')
  await expect(automazione).toContainText('Gira sul server dell’app: il Mac può restare spento. Parte circa 15 minuti prima.')

  const accesa = automazione.getByRole('checkbox', { name: 'Recap automatico attivo' })
  const ora = automazione.getByLabel('Pronto alle')
  const salva = automazione.getByRole('button', { name: 'Salva automazione' })
  // the artifact's step="300": 5 minutes
  await expect(ora).toHaveAttribute('type', 'time')
  await expect(ora).toHaveAttribute('step', '300')
  // 44 px: the whole row of the checkbox, the time, the button
  for (const bersaglio of [automazione.locator('label').filter({ hasText: 'Recap automatico attivo' }), ora, salva]) {
    expect((await bersaglio.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  // out of the steps: refused before the database
  await ora.fill('19:03')
  await salva.click()
  await expect(automazione.getByText('Scegli un orario a passi di 5 minuti, per esempio 19:00 o 19:05.')).toBeVisible()
  expect((await impostazioni()).ora).toBe('19:00:00')

  await ora.fill('19:05')
  await accesa.click()
  await expect(accesa).toBeChecked()
  await salva.click()

  if (conIndirizzo) {
    await expect(toast(page, 'Automazione salvata')).toBeVisible()
    await expect(stato()).toContainText('Attiva: recap pronto ogni giorno alle 19:05.')
    const salvate = await impostazioni()
    expect(salvate).toMatchObject({ attivo: true, ora: '19:05:00', updated_by: ID_ADMIN })
    if (passi) expect(salvate.url_passo).toBe(passi)
    else expect(salvate.url_passo).toMatch(URL_LOCALE)
  } else {
    // the steps are manual here: never on without an address, and the form says why
    await expect(automazione.getByRole('alert')).toContainText('INSIGHT_URL_PASSO=manuale')
    expect(await impostazioni()).toMatchObject({ attivo: false, ora: '19:00:00' })
    // off, the time is saved
    await accesa.click()
    await expect(accesa).not.toBeChecked()
    await salva.click()
    await expect(toast(page, 'Automazione salvata')).toBeVisible()
    expect(await impostazioni()).toMatchObject({ attivo: false, ora: '19:05:00', updated_by: ID_ADMIN })
    await expect(stato()).toContainText('Disattivata.')
    // on, as a deploy with its APP_URL saves it (the function wants an address for that)
    const { error } = await db.from('insight_impostazioni').update({ attivo: true }).eq('id', true)
    if (error) throw error
    await page.reload()
    automazione = await apriAutomazione(page)
    await expect(stato()).toContainText('Attiva: recap pronto ogni giorno alle 19:05.')
  }
  // the form starts again from what is saved
  await expect(automazione.getByRole('checkbox', { name: 'Recap automatico attivo' })).toBeChecked()
  await expect(automazione.getByLabel('Pronto alle')).toHaveValue('19:05')

  // the setter: no Automazione, his meta line says when the recap comes
  const contesto = await browser.newContext()
  try {
    const setter = await contesto.newPage()
    await accedi(setter, 'setter')
    await setter.goto('/insight')
    await expect(setter.getByRole('main')).toContainText('recap automatico alle 19:05')
    await expect(setter.getByTestId('insight-automazione')).toHaveCount(0)
    await expect(setter.getByRole('button', { name: 'Salva automazione' })).toHaveCount(0)
  } finally {
    await contesto.close()
  }

  // the settings say it too, read only
  await page.goto('/settings/instagram')
  await expect(page.getByRole('region', { name: 'Insight ultime 24h', exact: true })).toContainText(
    'Attiva: recap pronto ogni giorno alle 19:05.',
  )

  // on the phone, open: no sideways scroll
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/insight')
  await apriAutomazione(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
