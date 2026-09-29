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
    // no row yet: nothing for the database to add up
    await expect(page.getByTestId('dm-totali')).toContainText('DM totali: 0')

    await page.getByRole('button', { name: 'Call proposte: più 1' }).click()
    await attendiSalvataggio(page)
    await expect(page.getByText(/avviato/)).toBeVisible()

    await page.reload()
    await expect(campo(page, 'Call proposte')).toHaveValue('1')
  })

  test('ogni numero dice cosa conta e la strategy non si compila più', async ({ page }) => {
    await page.goto('/today')

    for (const aiuto of [
      'Persone nuove a cui scrivi tu per primo',
      'Persone nuove che ti chiedono informazioni e a cui rispondi',
      'Chi ti risponde e a cui rispondi, anche il giorno dopo',
      'Solleciti a chi non ti ha ancora risposto',
      'Persone a cui proponi una call',
    ]) {
      await expect(page.getByText(aiuto, { exact: true })).toBeVisible()
    }
    await expect(page.getByTestId('dm-totali')).toContainText('= outbound + inbound + follow up')
    await expect(page.getByText('Non entrano nei DM totali.', { exact: true })).toBeVisible()

    // The setter books discovery calls only: no strategy counter any more
    await expect(page.getByRole('group', { name: /strategy/i })).toHaveCount(0)
    await expect(campo(page, 'Discovery prenotate')).toBeVisible()

    const legenda = page.getByTestId('legenda')
    await legenda.getByText('Cosa significa ogni numero').click()
    await expect(legenda.getByText('DM totali', { exact: true })).toBeVisible()
    await expect(legenda.getByText('Prenotate da DM inbound', { exact: true })).toBeVisible()
    await expect(legenda.getByText('Prenotate da DM outbound', { exact: true })).toBeVisible()
  })

  test('i tre DM stanno insieme sopra il loro totale, le conversazioni a parte', async ({ page }) => {
    await page.goto('/today')

    const etichette = await page.locator('[role="group"] label').allInnerTexts()
    expect(etichette.slice(0, 5)).toEqual(['DM outbound', 'DM inbound', 'Follow up', 'Conversazioni', 'Call proposte'])

    // the three parts of DM totali, then the line with their sum
    const messaggi = page.getByRole('region', { name: 'Messaggi' })
    await expect(messaggi.getByRole('group')).toHaveCount(3)
    await expect(messaggi.getByTestId('dm-totali')).toBeVisible()
    await expect(messaggi.getByRole('group', { name: 'Conversazioni' })).toHaveCount(0)
    // conversations in a group of their own, which says they are not in the total
    const conversazioni = page.getByRole('region', { name: 'Conversazioni' })
    await expect(conversazioni.getByRole('group')).toHaveCount(1)
    await expect(conversazioni).toContainText('Non entrano nei DM totali.')
  })

  test('DM totali è quello che calcola il database, e si aggiorna dopo ogni salvataggio', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -3)
    const db = dbLocale()
    const { data: prima, error } = await db
      .from('setter_daily_reports')
      .select('id, dm_outbound, dm_inbound, follow_up, conversazioni')
      .eq('setter_id', ID_SETTER)
      .eq('data', giorno)
      .maybeSingle()
    if (error) throw error

    try {
      await page.goto(`/today?data=${giorno}`)
      const valore = page.getByTestId('dm-totali-valore')

      for (const [etichetta, n] of [
        ['DM outbound', '12'],
        ['DM inbound', '3'],
        ['Follow up', '2'],
      ] as const) {
        await campo(page, etichetta).fill(n)
        await campo(page, etichetta).press('Tab')
      }
      await expect(page.getByTestId('stato-salvato')).toBeVisible()
      await expect(valore).toHaveText('17')
      const { data: salvato } = await db
        .from('setter_daily_reports')
        .select('dm_totali')
        .eq('setter_id', ID_SETTER)
        .eq('data', giorno)
        .single()
      expect(salvato?.dm_totali).toBe(17)

      // conversations never move it
      const conv = campo(page, 'Conversazioni')
      await conv.fill(String(Number(await conv.inputValue()) + 7))
      await conv.press('Tab')
      await attendiSalvataggio(page)
      await expect(valore).toHaveText('17')

      // the page loads it from the saved row
      await page.reload()
      await expect(page.getByTestId('dm-totali')).toContainText('DM totali: 17')
    } finally {
      // leave the seed as it was
      if (prima) {
        const { id, ...numeri } = prima
        await db.from('setter_daily_reports').update(numeri).eq('id', id)
      } else {
        await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).eq('data', giorno)
      }
    }
  })

  test('un giorno di due mesi fa si corregge ancora, il futuro non esiste', async ({ page }) => {
    const passato = aggiungiGiorni(oggiRoma(), -60)
    await page.goto(`/today?data=${passato}`)
    await expect(page.getByLabel('Scegli il giorno del report')).toHaveValue(passato)

    const follow = campo(page, 'Follow up')
    const prima = Number(await follow.inputValue())
    await page.getByRole('button', { name: 'Follow up: più 1' }).click()
    await attendiSalvataggio(page)
    await page.reload()
    await expect(campo(page, 'Follow up')).toHaveValue(String(prima + 1))

    // leave the seed as it was
    await page.getByRole('button', { name: 'Follow up: meno 1' }).click()
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
