import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

function campo(page: Page, etichetta: string) {
  return page.getByRole('group', { name: etichetta }).getByRole('textbox')
}

async function attendiSalvataggio(page: Page) {
  await expect(page.getByText('Salvataggio…')).toBeVisible()
  await expect(page.getByTestId('stato-salvato')).toBeVisible()
}

test.describe('Oggi, report giornaliero del setter', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'setter')
  })

  test('un tocco su +5 si salva da solo e resta dopo il ricaricamento', async ({ page }) => {
    await page.goto('/today')
    const dm = campo(page, 'DM outbound')
    const prima = Number(await dm.inputValue())

    await page.getByRole('button', { name: 'DM outbound: più 5' }).click()
    await expect(dm).toHaveValue(String(prima + 5))
    await attendiSalvataggio(page)

    await page.reload()
    await expect(campo(page, 'DM outbound')).toHaveValue(String(prima + 5))
  })

  test('si può scrivere il numero direttamente', async ({ page }) => {
    await page.goto('/today')
    const conversazioni = campo(page, 'Conversazioni')
    // Always a different value: rewriting the same number fires no change
    const nuovo = String(Number(await conversazioni.inputValue()) + 13)

    await conversazioni.fill(nuovo)
    await conversazioni.press('Tab')
    await attendiSalvataggio(page)

    await page.reload()
    await expect(campo(page, 'Conversazioni')).toHaveValue(nuovo)
  })

  test('un giorno senza report si crea al primo tocco', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -2)
    await dbLocale()
      .from('setter_daily_reports')
      .delete()
      .eq('setter_id', ID_SETTER)
      .eq('data', giorno)

    await page.goto(`/today?data=${giorno}`)
    await expect(page.getByText('Non ancora compilato')).toBeVisible()
    await expect(campo(page, 'Call proposte')).toHaveValue('0')

    await page.getByRole('button', { name: 'Call proposte: più 1' }).click()
    await attendiSalvataggio(page)
    await expect(page.getByText(/avviato/)).toBeVisible()

    await page.reload()
    await expect(campo(page, 'Call proposte')).toHaveValue('1')
  })

  test('un giorno di due mesi fa si corregge ancora, il futuro non esiste', async ({ page }) => {
    const passato = aggiungiGiorni(oggiRoma(), -60)
    await page.goto(`/today?data=${passato}`)
    await expect(page.getByLabel('Scegli il giorno del report')).toHaveValue(passato)

    const follow = campo(page, 'Follow-up del giorno')
    const prima = Number(await follow.inputValue())
    await page.getByRole('button', { name: 'Follow-up del giorno: più 1' }).click()
    await attendiSalvataggio(page)
    await page.reload()
    await expect(campo(page, 'Follow-up del giorno')).toHaveValue(String(prima + 1))

    // leave the seed as it was
    await page.getByRole('button', { name: 'Follow-up del giorno: meno 1' }).click()
    await attendiSalvataggio(page)

    await page.goto(`/today?data=${aggiungiGiorni(oggiRoma(), 1)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oggi')
    await expect(page.getByRole('link', { name: 'Giorno successivo' })).toHaveCount(0)
  })
})

test('l’admin non compila il report del setter', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/today')
  await expect(page).toHaveURL('/')
})
