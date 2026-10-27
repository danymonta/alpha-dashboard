import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

/**
 * The money eye and «Di cosa parlare oggi» on the Panoramica, and «Dalle call» in Marketing
 * (27/10/2026), on the invented seeds (40_insight, 51_analisi_call, 52_spunti).
 */

const CARTELLA = process.env.CARTELLA_SCATTI

test.describe('Panoramica: stories and the money eye', () => {
  test('the eye hides every money number on this device and brings it back', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/')
    await expect(page.getByTestId('kpi')).toBeVisible()
    await expect(page.getByTestId('stories-oggi')).toBeVisible()
    await expect(page.getByTestId('stories-oggi').getByRole('heading', { name: 'Di cosa parlare oggi' })).toBeVisible()

    await page.getByRole('button', { name: 'Nascondi i soldi' }).click()
    await expect(page.getByTestId('soldi-nascosti')).toBeVisible()
    await expect(page.getByTestId('kpi')).toHaveCount(0)
    await expect(page.getByTestId('da-incassare')).toHaveCount(0)
    await expect(page.getByTestId('per-fonte')).toHaveCount(0)
    await expect(page.locator('main').getByText('€')).toHaveCount(0)
    await expect(page.getByTestId('stories-oggi')).toBeVisible()
    if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/panoramica-nascosti-${page.viewportSize()?.width}.png`, fullPage: true })

    // still hidden after a reload: the cookie of the device
    await page.reload()
    await expect(page.getByTestId('kpi')).toHaveCount(0)
    await page.getByRole('button', { name: 'Mostra i soldi' }).click()
    await expect(page.getByTestId('kpi')).toBeVisible()
    await expect(page.getByTestId('soldi-nascosti')).toHaveCount(0)
    if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/panoramica-${page.viewportSize()?.width}.png`, fullPage: true })
  })

  test('«Dalle call»: the objections as topics, the admin only', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/marketing/dalle-call')
    await expect(page.getByRole('heading', { level: 1, name: 'Dalle call' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Sezioni del Marketing' }).getByRole('link', { name: 'Dalle call' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const topic = page.getByTestId('topic-call')
    await expect(topic.getByText('Topic per le stories').first()).toBeVisible()
    await page.getByRole('link', { name: 'Ultimi 90 giorni' }).click()
    await expect(page.getByRole('link', { name: 'Ultimi 90 giorni' })).toHaveAttribute('aria-current', 'page')
    if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/dalle-call-${page.viewportSize()?.width}.png`, fullPage: true })
    const larghezza = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(larghezza).toBeLessThanOrEqual(0)
  })

  test('the marketing role has no «Dalle call» and the page sends it away', async ({ page }) => {
    await accedi(page, 'marketing')
    await page.goto('/marketing/spunti')
    await expect(page.getByRole('navigation', { name: 'Sezioni del Marketing' }).getByRole('link', { name: 'Dalle call' })).toHaveCount(0)
    await page.goto('/marketing/dalle-call')
    await expect(page).not.toHaveURL(/dalle-call/)
  })
})

test.describe('the phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Panoramica with the money hidden: no sideways scroll, the stories first', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/')
    await page.getByRole('button', { name: 'Nascondi i soldi' }).click()
    await expect(page.getByTestId('soldi-nascosti')).toBeVisible()
    if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/panoramica-nascosti-390.png`, fullPage: true })
    const larghezza = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(larghezza).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Mostra i soldi' }).click()
    await expect(page.getByTestId('kpi')).toBeVisible()
  })
})
