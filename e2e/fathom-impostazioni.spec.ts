import { expect, test } from '@playwright/test'

import { CHIAVE_FINTA, FINTO_FATHOM, raggiungibile, rimettiLavoriCall, statoLavoriCall, togliChiaveFathom } from './call-db'
import { dbLocale } from './db'
import { accedi } from './utenti'

/**
 * Impostazioni › Fathom (1.37.0): la chiave nel Vault (mai riletta dal browser), la prova contro
 * il Fathom finto, gli interruttori e il limite di spesa. Solo l'admin.
 */

test('l’admin incolla la chiave: Fathom risponde, la chiave non torna mai nella pagina', async ({ page }) => {
  test.skip(!FINTO_FATHOM || !(await raggiungibile(FINTO_FATHOM, '/__richieste')), 'Serve il Fathom finto.')
  const { data: gia } = await dbLocale().rpc('fathom_chiave')
  test.skip(Boolean(gia), 'Nel Vault locale c’è già una chiave di Fathom.')
  await accedi(page, 'admin')
  try {
    // the key is pasted in Chiavi e collegamenti since 1.38.0; Fathom only points there
    await page.goto('/settings/fathom')
    await expect(page.getByTestId('fathom-stato')).toContainText('Non collegato')
    await expect(page.getByLabel('Chiave API')).toHaveCount(0)
    await page.getByRole('link', { name: /Incolla o rigenera la chiave/ }).click()
    await expect(page).toHaveURL(/\/settings\/chiavi#fathom$/)
    await expect(page.getByTestId('fathom-stato')).toContainText('Non collegato')
    // the guide is a closed panel with the path of Fathom inside
    const guida = page.getByTestId('guida-fathom')
    await expect(guida).toHaveJSProperty('open', false)
    await guida.locator('summary').click()
    await expect(guida).toContainText('My Settings › API Access')
    await expect(guida).toContainText('Generate Api Key')
    await expect(guida).toContainText('Non incollare mai una chiave in chat')
    const campo = page.getByLabel('Chiave API')
    await expect(campo).toHaveAttribute('type', 'password')
    // an empty field says what to do; a key that is not one is refused by the database
    await page.getByRole('button', { name: 'Salva la chiave' }).click()
    await expect(page.getByText('Incolla la chiave copiata da Fathom.')).toBeVisible()
    await campo.fill('corta')
    await page.getByRole('button', { name: 'Salva la chiave' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'chiave' }).first()).toBeVisible()

    await campo.fill(CHIAVE_FINTA)
    await page.getByRole('button', { name: 'Salva la chiave' }).click()
    await expect(page.getByTestId('fathom-prova')).toHaveText('Fathom risponde con questa chiave.')
    await expect(page.getByTestId('fathom-stato')).toContainText('Fathom è collegato')
    // the field is emptied at every send and the page never carries the key
    await expect(page.getByLabel('Chiave nuova')).toHaveValue('')
    expect(await page.content()).not.toContain(CHIAVE_FINTA)
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain(CHIAVE_FINTA)

    // taking it away asks twice
    await page.getByRole('button', { name: 'Togli la chiave' }).click()
    await page.getByRole('button', { name: /Tocca ancora/ }).click()
    await expect(page.getByTestId('fathom-stato')).toContainText('Non collegato')
    const { data: dopo } = await dbLocale().rpc('fathom_chiave')
    expect(dopo).toBeNull()
  } finally {
    await togliChiaveFathom()
  }
})

test('interruttori e limite di spesa si salvano e si rimettono', async ({ page }) => {
  const prima = await statoLavoriCall()
  await accedi(page, 'admin')
  try {
    await page.goto('/settings/fathom')
    await expect(page.getByTestId('fathom-costo')).toContainText('su 10,00 $')
    const campo = page.getByLabel('Limite di spesa al mese ($)')
    await campo.fill('500')
    await page.getByRole('button', { name: 'Salva il limite' }).click()
    await expect(page.getByText('Scegli un limite tra 0 e 200 $.')).toBeVisible()
    await campo.fill('12,5')
    await page.getByRole('button', { name: 'Salva il limite' }).click()
    await expect(page.getByText('Limite di spesa: 12,5 $ al mese')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('fathom-costo')).toContainText('su 12,50 $')

    await page.getByTestId('fathom-analisi').click()
    await expect(page.getByText('Analisi delle call: spente')).toBeVisible()
    const dopo = await statoLavoriCall()
    expect(dopo.analisi_attive).toBe(false)
    expect(Number(dopo.costo_max_mese)).toBe(12.5)
  } finally {
    await rimettiLavoriCall(prima)
  }
})

test('la pagina è dell’admin: il closer e il setter non la aprono', async ({ page }) => {
  for (const ruolo of ['closer', 'setter'] as const) {
    await page.context().clearCookies()
    await accedi(page, ruolo)
    for (const pagina of ['/settings/fathom', '/settings/chiavi']) {
      await page.goto(pagina)
      await expect(page.getByRole('heading', { name: /Fathom|Chiavi e collegamenti/ })).toHaveCount(0)
      await expect(page.getByLabel('Chiave API')).toHaveCount(0)
    }
  }
})
