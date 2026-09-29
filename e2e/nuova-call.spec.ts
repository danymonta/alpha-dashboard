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
    await page.getByRole('button', { name: 'Domani' }).click()
    await page.getByLabel('Ora').fill('15:30')

    // Default closer: the first admin (Dany)
    await expect(page.getByRole('radio', { name: 'Dany Montagnolo' })).toBeChecked()

    await page.getByRole('button', { name: 'Fissa la call' }).click()

    await expect(page.getByText(`Discovery call con ${nome}: domani alle 15:30`)).toBeVisible()
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
    expect(call).toMatchObject({ tipo: 'discovery', stato: 'programmata', closer_id: ID_ADMIN })
    expect(oggiRoma(new Date(call.programmata_il))).toBe(aggiungiGiorni(oggiRoma(), 1))
    expect(formatOra(call.programmata_il)).toBe('15:30')
  })

  test('solo discovery call, e la fonte spiega a cosa serve', async ({ page }) => {
    await expect(page.getByRole('group', { name: 'Tipo di call' })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'Strategy' })).toHaveCount(0)
    await expect(page.getByText('Fissa una discovery call: lead e call nascono insieme.')).toBeVisible()

    const fonte = page.getByRole('group', { name: 'Fonte' })
    await expect(fonte).toBeVisible()
    await expect(
      page.getByText('Scegli da dove arriva il lead: serve a contare le call prenotate da inbound e da outbound.'),
    ).toBeVisible()
    // the bookings by source are counted from it: nothing is chosen for the setter
    await expect(fonte.getByRole('radio', { checked: true })).toHaveCount(0)
  })

  test('senza nome, fonte e ora non parte e dice cosa manca', async ({ page }) => {
    await page.getByRole('button', { name: 'Fissa la call' }).click()

    await expect(page.getByText('Scrivi il nome del lead')).toBeVisible()
    await expect(page.getByText('Scegli la fonte')).toBeVisible()
    await expect(page.getByText('Scegli l’ora')).toBeVisible()
    await expect(page).toHaveURL('/calls/new')
  })

  test('senza fonte non parte, anche col resto compilato', async ({ page }) => {
    const firma = Date.now()
    await page.getByLabel('Nome del lead').fill(`Lead Senza Fonte ${firma}`)
    await page.getByLabel(/Handle Instagram/).fill(`e2e.senzafonte.${firma}`)
    await page.getByLabel('Ora').fill('16:00')
    await page.getByRole('button', { name: 'Fissa la call' }).click()

    await expect(page.getByRole('group', { name: 'Fonte' }).getByRole('alert')).toHaveText('Scegli la fonte')
    await expect(page).toHaveURL('/calls/new')

    // chosen, the same form goes through
    await scegli(page, 'DM inbound')
    await expect(page.getByText('Scegli la fonte')).toHaveCount(0)
    await page.getByRole('button', { name: 'Fissa la call' }).click()
    await expect(page).toHaveURL('/calls')
    const { data: lead } = await dbLocale()
      .from('leads')
      .select('fonte')
      .eq('instagram_handle', `@e2e.senzafonte.${firma}`)
      .single()
    expect(lead?.fonte).toBe('dm_inbound')
  })

  test('lo stesso handle riusa il lead invece di duplicarlo', async ({ page }) => {
    const handle = `e2e.doppio.${Date.now()}`

    for (const ora of ['11:00', '12:00']) {
      await page.goto('/calls/new')
      await page.getByLabel('Nome del lead').fill('Lead Doppio')
      await page.getByLabel(/Handle Instagram/).fill(handle)
      await scegli(page, 'DM inbound')
      await page.getByLabel('Ora').fill(ora)
      await page.getByRole('button', { name: 'Fissa la call' }).click()
      await expect(page).toHaveURL('/calls')
    }

    await expect(page.getByText('Lead già presente')).toBeVisible()

    const { data } = await dbLocale()
      .from('leads')
      .select('id, calls(id, tipo)')
      .eq('instagram_handle', `@${handle}`)
    expect(data).toHaveLength(1)
    expect(data![0].calls.map((c) => c.tipo)).toEqual(['discovery', 'discovery'])
  })
})

test('l’admin non usa il form del setter', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/calls/new')
  await expect(page).toHaveURL('/')
})
