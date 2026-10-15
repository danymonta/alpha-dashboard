import { expect, test } from '@playwright/test'

import { dbLocale } from './db'
import { rimettiLavori, statoLavori } from './marketing-db'
import { accedi } from './utenti'

/**
 * Impostazioni › Instagram › «Analisi dei reel» (1.36.0): the month's spend and
 * its limit, the two switches, the sentence of a permission Meta says is
 * missing. The admin only; the rows are put back at the end.
 */

test('il blocco «Analisi dei reel»: spesa, limite e interruttori, solo dell’admin', async ({ page }) => {
  const prima = await statoLavori()
  try {
    await accedi(page, 'admin')
    await page.goto('/settings/instagram')
    const blocco = page.getByTestId('analisi-reel-stato')
    await expect(blocco).toBeVisible({ timeout: 60_000 })
    await expect(blocco.getByTestId('analisi-costo')).toContainText(/\d+,\d{2} \$ di 25,00 \$/)

    // the limit: a number from 0 to 200, saved with its button
    const limite = blocco.getByLabel('Limite di spesa al mese ($)')
    await limite.fill('300')
    await blocco.getByRole('button', { name: 'Salva il limite' }).click()
    await expect(blocco.getByText('Scegli un limite tra 0 e 200 $.')).toBeVisible()
    await limite.fill('12,5')
    await blocco.getByRole('button', { name: 'Salva il limite' }).click()
    await expect(page.locator('[data-sonner-toast]').getByText('Limite di spesa: 12,5 $ al mese')).toBeVisible()
    expect(Number((await statoLavori()).costo_max_mese)).toBe(12.5)

    // the two switches: a tap saves, and the note says what it does
    const note = blocco.getByTestId('analisi-note-team')
    await expect(note).toBeChecked()
    await note.click()
    await expect(page.locator('[data-sonner-toast]').getByText('Note di setter e closer nelle analisi: spente')).toBeVisible()
    expect((await statoLavori()).note_team).toBe(false)
    const automatiche = blocco.getByTestId('analisi-automatiche')
    await automatiche.click()
    await expect.poll(async () => (await statoLavori()).automatiche).toBe(true)

    // Meta says the permission for the statistics is missing: the sentence, here and on the Analisi page
    await dbLocale().from('instagram_contenuti_stato').update({ permesso_insights: false }).eq('id', true)
    await page.reload()
    await expect(page.getByTestId('analisi-permesso')).toContainText('instagram_business_manage_insights')
    await page.goto('/marketing/analisi')
    await expect(page.getByTestId('analisi-situazione')).toContainText('Instagram non dà ancora le statistiche dei post')
  } finally {
    await dbLocale().from('instagram_contenuti_stato').update({ permesso_insights: null }).eq('id', true)
    await rimettiLavori(prima)
  }
})

test('il marketing non vede né i soldi né gli interruttori: la situazione dice solo che cosa fa il lavoro', async ({ page }) => {
  await accedi(page, 'marketing')
  await page.goto('/marketing/analisi')
  const situazione = page.getByTestId('analisi-situazione')
  await expect(situazione).toBeVisible({ timeout: 60_000 })
  await expect(situazione).not.toContainText('$')
  // the settings page is the admin's: the marketing is sent away from it, never shown the block
  await page.goto('/settings/instagram')
  await expect(page).not.toHaveURL(/\/settings\/instagram/)
  await expect(page.getByTestId('analisi-reel-stato')).toHaveCount(0)
})
