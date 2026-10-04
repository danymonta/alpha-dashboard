import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { ID_ADMIN, PRODOTTO_3_MESI, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

/**
 * "Non rinnova" (Dany, 04/10/2026): the admin closes a client who does not
 * renew from his sheet, on the phone. The client goes under Chiuso in Clienti
 * and under "Non rinnovano" in Rinnovi, and leaves "In scadenza" (Rinnovi and
 * the Panoramica box) and "Da recuperare"; "Riapri" brings him back.
 */
const PREFISSO = 'E2EChiuso'

async function cliente(cognome: string, inizio: string, fine: string) {
  const db = dbLocale()
  const { data, error } = await db
    .from('clients')
    .insert({ nome: PREFISSO, cognome, telefono: '+39 333 123 4567', fonte: 'referral', created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await db.from('sales').insert({
    client_id: data.id,
    product_id: PRODOTTO_3_MESI,
    tipo: 'nuovo',
    data_vendita: inizio,
    data_inizio: inizio,
    data_fine: fine,
    valore_contratto: 900,
    numero_rate: 1,
    created_by: ID_ADMIN,
  })
  if (e2) throw e2
  return data.id
}

async function senzaScrollLaterale(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
}

test.beforeEach(async () => {
  await pulisciVendite(PREFISSO)
})
test.afterEach(async () => {
  // the closures go with the clients (on delete cascade)
  await pulisciVendite(PREFISSO)
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('chiude dalla scheda chi non rinnova, lo ritrova tra i chiusi e in «Non rinnovano», poi lo riapre', async ({ page }) => {
    // several pages compiled on the first hit by the dev server
    test.setTimeout(150_000)
    const oggi = oggiRoma()
    const id = await cliente('Scade', aggiungiGiorni(oggi, -80), aggiungiGiorni(oggi, 10))
    const nome = `${PREFISSO} Scade`

    await accedi(page, 'admin')
    // before: among the ones that end soon
    await page.goto('/rinnovi')
    await expect(page.getByTestId('elenco-in-scadenza').getByRole('listitem', { name: nome })).toBeVisible()

    await page.goto(`/clients/${id}`)
    await page.getByTestId('non-rinnova').click()
    const foglio = page.getByRole('dialog', { name: 'Non rinnova' })
    await expect(foglio).toContainText('Esce da «In scadenza» e «Da recuperare»')
    await expect(foglio.getByLabel('Chiuso dal')).toHaveValue(oggi)
    // never in the future
    await foglio.getByLabel('Chiuso dal').fill(aggiungiGiorni(oggi, 1))
    await foglio.getByRole('button', { name: 'Chiudi il cliente' }).click()
    await expect(foglio.getByText('Il giorno non può essere nel futuro')).toBeVisible()
    await foglio.getByLabel('Chiuso dal').fill(oggi)
    await foglio.getByLabel(/Perché non rinnova/).fill('Ha raggiunto l’obiettivo, prosegue da solo')
    await expect(foglio.getByText('42/500')).toBeVisible()
    await foglio.getByRole('button', { name: 'Chiudi il cliente' }).click()
    await expect(page.getByText('Cliente chiuso')).toBeVisible()
    await expect(foglio).toBeHidden()

    const chiusura = page.getByTestId('chiusura-cliente')
    await expect(chiusura).toContainText(`Non rinnova · chiuso il ${oggi.split('-').reverse().join('/')}`)
    await expect(chiusura).toContainText('Ha raggiunto l’obiettivo, prosegue da solo')
    await expect(page.getByText('Chiuso', { exact: true }).first()).toBeVisible()
    // closed: "Non rinnova" leaves the header, "Ha rinnovato" stays
    await expect(page.getByTestId('non-rinnova')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Ha rinnovato' })).toBeVisible()
    await senzaScrollLaterale(page)
    for (const bottone of [chiusura.getByRole('button', { name: `Riapri ${nome}` }), chiusura.getByRole('button', { name: /Modifica giorno/ })]) {
      const box = await bottone.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }

    const { data: salvata } = await dbLocale().from('clienti_chiusure').select('chiuso_il, motivo').eq('client_id', id).single()
    expect(salvata).toEqual({ chiuso_il: oggi, motivo: 'Ha raggiunto l’obiettivo, prosegue da solo' })

    // the pencil corrects the reason
    await chiusura.getByRole('button', { name: /Modifica giorno/ }).click()
    const modifica = page.getByRole('dialog', { name: 'Non rinnova' })
    await expect(modifica.getByLabel(/Perché non rinnova/)).toHaveValue('Ha raggiunto l’obiettivo, prosegue da solo')
    await modifica.getByLabel(/Perché non rinnova/).fill('Prosegue da solo')
    await modifica.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText('Chiusura aggiornata')).toBeVisible()
    await expect(chiusura).toContainText('Prosegue da solo')

    // Clienti: its own filter
    await page.goto('/clients?stato=chiuso')
    await expect(page.getByRole('link', { name: /^Chiuso\s*\d+$/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true })).toBeVisible()
    await page.goto('/clients?stato=in_scadenza')
    await expect(page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true })).toHaveCount(0)

    // Rinnovi: never in "In scadenza", in "Non rinnovano" with the reason and its actions
    await page.goto('/rinnovi')
    await expect(page.getByRole('heading', { name: /Non rinnovano/ })).toBeVisible()
    await expect(page.getByTestId('elenco-in-scadenza').getByRole('listitem', { name: nome })).toHaveCount(0)
    const riga = page.getByTestId('elenco-non-rinnovano').getByRole('listitem', { name: nome })
    await expect(riga).toContainText('Prosegue da solo')
    await expect(riga.getByTestId('whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/393331234567\?text=Ciao%20E2EChiuso/)
    await expect(riga.getByRole('link', { name: 'Registra rinnovo' })).toHaveAttribute('href', `/sales/new?cliente=${id}&tipo=rinnovo`)
    await senzaScrollLaterale(page)

    // Panoramica: not in the "In scadenza" box
    await page.goto('/')
    const box = page.locator('section', { has: page.getByRole('heading', { name: 'In scadenza nei prossimi 30 giorni' }) })
    await expect(box).toBeVisible()
    // (his overdue instalment keeps him in "Da incassare": that box speaks of money, not of renewals)
    await expect(box.getByRole('link', { name: new RegExp(nome) })).toHaveCount(0)

    // "Riapri" from Rinnovi asks first, then he is back among the ones that end soon
    await page.goto('/rinnovi')
    await page.getByTestId('elenco-non-rinnovano').getByRole('button', { name: `Riapri ${nome}` }).click()
    const domanda = page.getByRole('dialog', { name: `Riaprire ${nome}?` })
    await expect(domanda).toContainText('Il giorno e il motivo della chiusura si tolgono')
    await domanda.getByRole('button', { name: 'Riapri' }).click()
    await expect(page.getByText('Cliente riaperto')).toBeVisible()
    await expect(page.getByTestId('elenco-in-scadenza').getByRole('listitem', { name: nome })).toBeVisible()
    await expect(page.getByRole('listitem', { name: nome })).toHaveCount(1)
    const { data: dopo } = await dbLocale().from('clienti_chiusure').select('client_id').eq('client_id', id)
    expect(dopo).toEqual([])
  })
})

test('un cliente finito e chiuso non è più da recuperare', async ({ page }) => {
  test.setTimeout(90_000)
  const oggi = oggiRoma()
  const id = await cliente('Finito', aggiungiGiorni(oggi, -110), aggiungiGiorni(oggi, -20))
  const nome = `${PREFISSO} Finito`

  await accedi(page, 'admin')
  await page.goto('/rinnovi')
  await expect(page.getByTestId('elenco-da-recuperare').getByRole('listitem', { name: nome })).toBeVisible()

  const { error } = await dbLocale()
    .from('clienti_chiusure')
    .insert({ client_id: id, chiuso_il: aggiungiGiorni(oggi, -2), motivo: null, created_by: ID_ADMIN })
  if (error) throw error
  await page.reload()
  await expect(page.getByTestId('elenco-da-recuperare').getByRole('listitem', { name: nome })).toHaveCount(0)
  const riga = page.getByTestId('elenco-non-rinnovano').getByRole('listitem', { name: nome })
  await expect(riga).toContainText(`chiuso il ${aggiungiGiorni(oggi, -2).split('-').reverse().join('/')}`)
})

test('chiuso oggi, rinnova oggi da «Registra rinnovo»: torna aperto da solo', async ({ page }) => {
  // the sales form and the client sheet compiled on the first hit by the dev server
  test.setTimeout(120_000)
  const oggi = oggiRoma()
  const id = await cliente('Ripensa', aggiungiGiorni(oggi, -80), aggiungiGiorni(oggi, 10))
  const nome = `${PREFISSO} Ripensa`
  // closed today, the day the renewal form proposes
  const { error } = await dbLocale()
    .from('clienti_chiusure')
    .insert({ client_id: id, chiuso_il: oggi, motivo: 'Ci pensa', created_by: ID_ADMIN })
  if (error) throw error

  await accedi(page, 'admin')
  await page.goto('/rinnovi')
  await page.getByTestId('elenco-non-rinnovano').getByRole('listitem', { name: nome }).getByRole('link', { name: 'Registra rinnovo' }).click()
  await expect(page).toHaveURL(`/sales/new?cliente=${id}&tipo=rinnovo`)
  await page.getByRole('button', { name: 'Registra vendita' }).click()
  await expect(page).toHaveURL(`/clients/${id}`)
  await expect(page.getByTestId('chiusura-cliente')).toHaveCount(0)

  const { data: rinnovo } = await dbLocale().from('sales').select('data_vendita').eq('client_id', id).eq('tipo', 'rinnovo').single()
  expect(rinnovo?.data_vendita).toBe(oggi)
  const { data: chiusure } = await dbLocale().from('clienti_chiusure').select('client_id').eq('client_id', id)
  expect(chiusure).toEqual([])

  await page.goto('/rinnovi')
  await expect(page.getByRole('listitem', { name: nome })).toHaveCount(0)
})
