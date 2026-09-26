import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, formatOra, oggiRoma } from '../lib/date'
import { ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

const ID_ADMIN = '11111111-1111-4111-8111-111111111111'

/** Tap the visible chip, as a person would: the radio itself is visually hidden. */
async function scegli(page: Page, etichetta: string) {
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: etichetta, exact: true }) })
    .click()
  await expect(page.getByRole('radio', { name: etichetta, exact: true })).toBeChecked()
}

// Every lead created here has an @e2e. handle, removed at the end (calls cascade)
test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('instagram_handle', '@e2e.%')
})

test.describe('Nuova call', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'setter')
    await page.goto('/calls/new')
  })

  test('crea lead e call insieme, con l’ora italiana giusta', async ({ page }) => {
    const firma = Date.now()
    const nome = `Lead E2E ${firma}`

    await page.getByLabel('Nome del lead').fill(nome)
    await page.getByLabel(/Handle Instagram/).fill(`@E2E.${firma}`)
    await scegli(page, 'DM outbound')
    await scegli(page, 'Strategy')
    await page.getByRole('button', { name: 'Domani' }).click()
    await page.getByLabel('Ora').fill('15:30')

    // Default closer: the first admin (Dany)
    await expect(page.getByRole('radio', { name: 'Dany Montagnolo' })).toBeChecked()

    await page.getByRole('button', { name: 'Fissa la call' }).click()

    await expect(page.getByText(`Strategy con ${nome}: domani alle 15:30`)).toBeVisible()
    await expect(page).toHaveURL('/calls')

    const { data: lead } = await dbLocale()
      .from('leads')
      .select('id, setter_id, fonte, stato, instagram_handle, calls(tipo, stato, closer_id, programmata_il)')
      .eq('instagram_handle', `@e2e.${firma}`)
      .single()

    expect(lead).toMatchObject({
      setter_id: ID_SETTER,
      fonte: 'dm_outbound',
      stato: 'call_fissata',
    })
    expect(lead?.calls).toHaveLength(1)
    const call = lead!.calls[0]
    expect(call).toMatchObject({ tipo: 'strategy', stato: 'programmata', closer_id: ID_ADMIN })
    expect(oggiRoma(new Date(call.programmata_il))).toBe(aggiungiGiorni(oggiRoma(), 1))
    expect(formatOra(call.programmata_il)).toBe('15:30')
  })

  test('senza nome e senza ora non parte e dice cosa manca', async ({ page }) => {
    await page.getByRole('button', { name: 'Fissa la call' }).click()

    await expect(page.getByText('Scrivi il nome del lead')).toBeVisible()
    await expect(page.getByText('Scegli l’ora')).toBeVisible()
    await expect(page).toHaveURL('/calls/new')
  })

  test('lo stesso handle riusa il lead invece di duplicarlo', async ({ page }) => {
    const handle = `e2e.doppio.${Date.now()}`

    for (const tipo of ['Discovery', 'Strategy']) {
      await page.goto('/calls/new')
      await page.getByLabel('Nome del lead').fill('Lead Doppio')
      await page.getByLabel(/Handle Instagram/).fill(handle)
      await scegli(page, tipo)
      await page.getByLabel('Ora').fill('11:00')
      await page.getByRole('button', { name: 'Fissa la call' }).click()
      await expect(page).toHaveURL('/calls')
    }

    await expect(page.getByText('Lead già presente')).toBeVisible()

    const { data } = await dbLocale()
      .from('leads')
      .select('id, calls(id)')
      .eq('instagram_handle', `@${handle}`)
    expect(data).toHaveLength(1)
    expect(data![0].calls).toHaveLength(2)
  })
})

test('l’admin non usa il form del setter', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/calls/new')
  await expect(page).toHaveURL('/')
})
