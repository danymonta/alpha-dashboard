import { expect, test, type Page } from '@playwright/test'

import { ID_ADMIN, creaCallDiProva, creaClienteConVendita, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// Everything created here starts with this, so afterAll can clean up
const PREFISSO = 'E2EControllo'

test.afterAll(async () => {
  await pulisciVendite(PREFISSO)
  const db = dbLocale()
  await db.from('products').delete().like('nome', `${PREFISSO}%`)
  await db.from('pm_reparti').delete().like('nome', `${PREFISSO}%`)
})

async function scegli(page: Page, nome: string | RegExp) {
  const radio = page.getByRole('radio', { name: nome, exact: typeof nome === 'string' })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

function rata(page: Page, nome: string) {
  return page.getByRole('listitem', { name: nome, exact: true })
}

/** The question after the red button: says what goes, then deletes. */
async function confermaEliminazione(page: Page, domanda: RegExp) {
  const conferma = page.getByRole('dialog', { name: domanda })
  await expect(conferma).toBeVisible()
  await conferma.getByRole('button', { name: 'Elimina', exact: true }).click()
  await expect(conferma).toBeHidden()
}

async function aggiungiBlocco(page: Page, quante: string, importo: string) {
  await page.locator('#blocco-quante').selectOption(quante)
  await page.locator('#blocco-importo').fill(importo)
  await page.getByRole('button', { name: 'Aggiungi al piano' }).click()
}

test.describe('pieno controllo dell’admin', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'admin')
  })

  test('il caso Saverio: annuale su misura, 3 rate da 500 e 3 da 333,33, poi rata aggiunta, tolta e vendita eliminata', async ({ page }) => {
    const clienteId = await creaClienteConVendita(`${PREFISSO}${Date.now()}`, ID_ADMIN)

    await page.goto(`/sales/new?cliente=${clienteId}`)
    await expect(page.getByRole('radio', { name: 'Rinnovo' })).toBeChecked()
    await scegli(page, /^Personalizzato/)
    await page.getByLabel('Cosa hai venduto').fill('Annuale')
    await page.getByRole('button', { name: '12 mesi' }).click()
    await expect(page.getByLabel('Fine del percorso')).not.toHaveValue('')

    await scegli(page, 'Piano personalizzato')
    await aggiungiBlocco(page, '3', '500')
    await aggiungiBlocco(page, '3', '333,33')
    const righe = page.getByRole('list', { name: 'Rate del piano' }).getByRole('listitem')
    await expect(righe).toHaveCount(6)
    // the cents go on the last one
    await page.locator('#rata-5-importo').fill('333,34')

    await page.getByLabel('Valore del contratto').fill('2.500')
    const totale = page.getByRole('status').filter({ hasText: 'torna col contratto' })
    await expect(totale).toContainText('6 rate · totale 2.500,00')

    await page.getByRole('button', { name: 'Registra vendita' }).click()
    await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/)
    const venditaId = page.url().split('/').at(-1)!

    await expect(page.getByTestId('piano-rate').getByRole('listitem')).toHaveCount(6)
    await expect(page.getByText('Annuale')).toBeVisible()
    const { data: rate } = await dbLocale()
      .from('payments')
      .select('importo_previsto')
      .eq('sale_id', venditaId)
      .order('numero_rata')
    expect(rate?.map((r) => r.importo_previsto)).toEqual([500, 500, 500, 333.33, 333.33, 333.34])

    // one more instalment, then away again
    await page.getByRole('button', { name: 'Aggiungi rata' }).click()
    const foglio = page.getByRole('dialog', { name: 'Aggiungi una rata' })
    await foglio.getByLabel('Importo').fill('100')
    await foglio.getByRole('button', { name: 'Aggiungi la rata' }).click()
    await expect(page.getByTestId('piano-rate').getByRole('listitem')).toHaveCount(7)

    await rata(page, 'Rata 7').getByRole('button', { name: /Altre azioni/ }).click()
    await page.getByRole('button', { name: 'Elimina la rata' }).click()
    await confermaEliminazione(page, /^Eliminare la rata 7\?/)
    await expect(page.getByTestId('piano-rate').getByRole('listitem')).toHaveCount(6)

    // the whole sale
    await page.getByRole('button', { name: 'Modifica', exact: true }).click()
    await page.getByRole('button', { name: 'Elimina la vendita' }).click()
    await confermaEliminazione(page, /^Eliminare .*\?/)
    await expect(page).toHaveURL(/\/sales$/)
    const { count } = await dbLocale().from('payments').select('id', { count: 'exact', head: true }).eq('sale_id', venditaId)
    expect(count).toBe(0)
  })

  test('un prodotto con il suo piano abituale precompila la vendita, poi si elimina', async ({ page }) => {
    const nome = `${PREFISSO}Prodotto${Date.now()}`
    await page.goto('/settings/products')
    await page.getByRole('button', { name: 'Nuovo prodotto' }).click()
    await page.getByLabel('Nome').fill(nome)
    await page.getByLabel('Durata (mesi)').fill('12')
    await page.getByLabel('Prezzo di listino').fill('2.500')
    await page.locator('#pp-quante').selectOption('3')
    await page.locator('#pp-importo').fill('500')
    await page.getByRole('button', { name: 'Aggiungi al piano' }).click()
    await page.locator('#pp-quante').selectOption('3')
    await page.locator('#pp-importo').fill('333,33')
    await page.getByRole('button', { name: 'Aggiungi al piano' }).click()
    await page.locator('#pp-5-importo').fill('333,34')
    await page.getByRole('button', { name: 'Salva', exact: true }).click()

    const riga = page.getByRole('listitem').filter({ hasText: nome })
    await expect(riga).toContainText('3 × 500,00 € poi 2 × 333,33 € poi 1 × 333,34 €')

    // the new sale starts from that plan
    const clienteId = await creaClienteConVendita(`${PREFISSO}${Date.now()}`, ID_ADMIN)
    await page.goto(`/sales/new?cliente=${clienteId}`)
    await scegli(page, new RegExp(nome))
    await expect(page.getByRole('radio', { name: 'Piano personalizzato' })).toBeChecked()
    await expect(page.getByRole('list', { name: 'Rate del piano' }).getByRole('listitem')).toHaveCount(6)
    await expect(page.getByRole('status').filter({ hasText: 'torna col contratto' })).toBeVisible()

    await page.goto('/settings/products')
    await page.getByRole('button', { name: `Modifica ${nome}` }).click()
    await page.getByRole('button', { name: 'Elimina il prodotto' }).click()
    await confermaEliminazione(page, new RegExp(`^Eliminare ${nome}\\?`))
    await expect(page.getByRole('listitem').filter({ hasText: nome })).toHaveCount(0)
  })

  test('cliente e lead si eliminano dopo aver detto cosa si portano dietro', async ({ page }) => {
    const nome = `${PREFISSO}${Date.now()}`
    const clienteId = await creaClienteConVendita(nome, ID_ADMIN)
    await page.goto(`/clients/${clienteId}`)
    await page.getByRole('button', { name: 'Modifica', exact: true }).click()
    await page.getByRole('button', { name: 'Elimina il cliente' }).click()
    const domanda = page.getByRole('dialog', { name: /^Eliminare / })
    await expect(domanda).toContainText('Si eliminano anche 1 vendita e 1 rata.')
    await confermaEliminazione(page, /^Eliminare /)
    await expect(page).toHaveURL(/\/clients$/)
    const { count } = await dbLocale().from('clients').select('id', { count: 'exact', head: true }).eq('id', clienteId)
    expect(count).toBe(0)

    const lead = `${PREFISSO}Lead${Date.now()}`
    await creaCallDiProva(lead, ID_ADMIN)
    await page.goto('/leads')
    await page.getByRole('button', { name: `Cambia stato di ${lead}` }).click()
    await page.getByRole('button', { name: 'Modifica nome, handle e fonte' }).click()
    await page.getByRole('button', { name: 'Elimina il lead' }).click()
    await expect(page.getByRole('dialog', { name: /^Eliminare / })).toContainText('Si eliminano anche 1 call.')
    await confermaEliminazione(page, /^Eliminare /)
    await expect(page.getByRole('heading', { name: lead })).toHaveCount(0)
  })

  test('un reparto si rinomina e si elimina; con dei progetti no', async ({ page }) => {
    const nome = `${PREFISSO}Reparto${Date.now()}`
    await page.goto('/settings/progetti')
    await page.getByRole('button', { name: 'Nuovo reparto' }).click()
    await page.getByLabel('Nome').fill(nome)
    await page.getByRole('button', { name: 'Crea il reparto' }).click()
    const reparti = page.getByTestId('reparti')
    await expect(reparti.getByRole('listitem', { name: nome })).toBeVisible()

    await page.getByRole('button', { name: `Modifica ${nome}` }).click()
    await page.getByLabel('Nome').fill(`${nome} DM`)
    await page.getByRole('button', { name: 'Salva il reparto' }).click()
    await expect(reparti.getByRole('listitem', { name: `${nome} DM` })).toBeVisible()

    await page.getByRole('button', { name: `Modifica ${nome} DM` }).click()
    await page.getByRole('button', { name: 'Elimina il reparto' }).click()
    await confermaEliminazione(page, /^Eliminare il reparto /)
    await expect(reparti.getByRole('listitem', { name: `${nome} DM` })).toHaveCount(0)

    // a department with projects: the question explains and the button stays off
    const conProgetti = reparti.getByRole('listitem', { name: 'Fitness Coaching' })
    await conProgetti.getByRole('button', { name: 'Modifica Fitness Coaching' }).click()
    await page.getByRole('button', { name: 'Elimina il reparto' }).click()
    const domanda = page.getByRole('dialog', { name: /^Eliminare il reparto Fitness Coaching/ })
    await expect(domanda).toContainText('spostali in un altro reparto o eliminali prima')
    await expect(domanda.getByRole('button', { name: 'Elimina', exact: true })).toBeDisabled()
  })
})

test('un cliente senza vendite offre la prima vendita, non il rinnovo', async ({ page }) => {
  const { data: cliente } = await dbLocale()
    .from('clients')
    .insert({ nome: `${PREFISSO}Nuovo${Date.now()}`, cognome: 'Senza Vendite' })
    .select('id')
    .single()
  await accedi(page, 'admin')
  await page.goto(`/clients/${cliente!.id}`)
  await expect(page.getByRole('link', { name: 'Registra la prima vendita' })).toHaveAttribute(
    'href',
    `/sales/new?cliente=${cliente!.id}&tipo=nuovo`,
  )
  await expect(page.getByRole('link', { name: 'Ha rinnovato' })).toHaveCount(0)
  await expect(page.getByText('Nessun percorso registrato')).toBeVisible()
  await page.getByRole('link', { name: 'Registra la prima vendita' }).click()
  await expect(page.getByRole('radio', { name: 'Nuovo' })).toBeChecked()
})
