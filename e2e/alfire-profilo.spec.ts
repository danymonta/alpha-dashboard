import { expect, test } from '@playwright/test'

import { ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

test.afterAll(async () => {
  // the setter as the seed made them
  await dbLocale().from('profiles').update({ nome: 'Loris Setter', foto_url: null }).eq('id', ID_SETTER)
})

test('Alfire si apre dalla fiamma in alto a destra e, senza chiave, dice cosa manca', async ({ page }) => {
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await expect(pannello.getByRole('heading', { name: 'Alfire' })).toBeVisible()
  if (!process.env.ALFIRE_API_KEY) {
    await expect(pannello).toContainText('Alfire non è ancora attiva')
    await expect(pannello).toContainText('ALFIRE_API_KEY')
    await expect(pannello.getByLabel('Scrivi ad Alfire')).toBeDisabled()
  }
  await page.screenshot({ path: '.shots/alfire-admin-1440.png' })
})

test.describe('profilo dal telefono', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('la foto in alto apre il profilo: nome, foto caricata e tolta, schede', async ({ page }) => {
    await accedi(page, 'setter')
    await page.getByRole('link', { name: /Il tuo profilo/ }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('tab', { name: 'Profilo' })).toHaveAttribute('aria-selected', 'true')

    await page.getByLabel('Nome visibile al team').fill('Loris DM')
    await page.getByRole('button', { name: 'Salva il nome' }).click()
    await expect(page.getByText('Nome aggiornato')).toBeVisible()
    // the phone's top bar has no name line any more: the profile link carries it
    await expect(page.getByRole('banner').getByRole('link', { name: 'Il tuo profilo: Loris DM' })).toBeVisible()

    await page.getByLabel('Scegli una foto').setInputFiles('public/brand/percorso-alpha-email.png')
    await expect(page.getByText('Foto aggiornata')).toBeVisible()
    const { data } = await dbLocale().from('profiles').select('foto_url').eq('id', ID_SETTER).single()
    expect(data?.foto_url).toMatch(new RegExp(`/storage/v1/object/public/avatari/${ID_SETTER}/.+\\.(webp|jpg)$`))
    await expect(page.getByRole('link', { name: /Il tuo profilo/ }).locator('img')).toHaveAttribute('src', data!.foto_url!)
    await page.screenshot({ path: '.shots/setter-account-390.png' })

    await page.getByRole('button', { name: 'Togli la foto' }).click()
    await expect(page.getByText('Foto tolta')).toBeVisible()
    const { data: dopo } = await dbLocale().storage.from('avatari').list(ID_SETTER)
    expect(dopo ?? []).toHaveLength(0)

    await page.getByRole('tab', { name: 'Alfire' }).click()
    await expect(page).toHaveURL(/scheda=alfire/)
    await expect(page.getByText('Leggi le risposte ad alta voce')).toBeVisible()
    await page.getByRole('tab', { name: 'Account' }).click()
    await expect(page.getByRole('button', { name: 'Esci' })).toBeVisible()
  })
})
