import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { ID_ADMIN, PRODOTTO_3_MESI, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

/**
 * "Archivia come ex cliente" (Dany, 05/10/2026): a closed client who does not
 * buy again goes into the archive from his sheet or from "Non rinnovano" in
 * Rinnovi. He becomes "Ex cliente" (Clienti filter), leaves "Non rinnovano";
 * "Togli dall'archivio" brings him back to "Chiuso", "Riapri" ends the
 * closure and the archive with it.
 */
const PREFISSO = 'E2EArchivio'

/** A client whose path ended 20 days ago, closed 5 days ago (or `chiusoGiorniFa`). */
async function clienteChiuso(cognome: string, chiusoGiorniFa = 5) {
  const db = dbLocale()
  const oggi = oggiRoma()
  const { data, error } = await db
    .from('clients')
    .insert({ nome: PREFISSO, cognome, telefono: '+39 333 765 4321', fonte: 'referral', created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await db.from('sales').insert({
    client_id: data.id,
    product_id: PRODOTTO_3_MESI,
    tipo: 'nuovo',
    data_vendita: aggiungiGiorni(oggi, -110),
    data_inizio: aggiungiGiorni(oggi, -110),
    data_fine: aggiungiGiorni(oggi, -20),
    valore_contratto: 900,
    numero_rate: 1,
    created_by: ID_ADMIN,
  })
  if (e2) throw e2
  const { error: e3 } = await db
    .from('clienti_chiusure')
    .insert({
      client_id: data.id,
      chiuso_il: aggiungiGiorni(oggi, -chiusoGiorniFa),
      motivo: 'Si allena da solo',
      created_by: ID_ADMIN,
    })
  if (e3) throw e3
  return data.id
}

async function archiviatoIl(id: string) {
  const { data } = await dbLocale().from('clienti_chiusure').select('archiviato_il').eq('client_id', id).maybeSingle()
  return data === null ? 'nessuna chiusura' : data.archiviato_il
}

async function senzaScrollLaterale(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
}

const giorno = (iso: string) => iso.split('-').reverse().join('/')

test.beforeEach(async () => {
  await pulisciVendite(PREFISSO)
})
test.afterEach(async () => {
  await pulisciVendite(PREFISSO)
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('dalla scheda: archivia come ex cliente, lo ritrova sotto «Ex cliente», lo toglie dall’archivio', async ({ page }) => {
    test.setTimeout(150_000)
    const oggi = oggiRoma()
    const id = await clienteChiuso('Scheda')
    const nome = `${PREFISSO} Scheda`

    await accedi(page, 'admin')
    await page.goto(`/clients/${id}`)
    const chiusura = page.getByTestId('chiusura-cliente')
    await expect(chiusura).toContainText(`Non rinnova · chiuso il ${giorno(aggiungiGiorni(oggi, -5))}`)
    const archivia = chiusura.getByRole('button', { name: 'Archivia come ex cliente' })
    for (const bottone of [archivia, chiusura.getByRole('button', { name: `Riapri ${nome}` })]) {
      const box = await bottone.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
    await senzaScrollLaterale(page)

    // from the keyboard: the same button turns into "Togli dall'archivio", the focus stays on it
    await archivia.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Archiviato come ex cliente', { exact: true })).toBeVisible()
    await expect(chiusura).toContainText(`Ex cliente · archiviato il ${giorno(oggi)}`)
    await expect(chiusura.getByRole('button', { name: 'Togli dall’archivio' })).toBeFocused()
    // the closure stays under it, with its reason
    await expect(chiusura).toContainText(`Non rinnova · chiuso il ${giorno(aggiungiGiorni(oggi, -5))}`)
    await expect(chiusura).toContainText('Si allena da solo')
    await expect(page.getByText('Ex cliente', { exact: true }).first()).toBeVisible()
    await expect(chiusura.getByRole('button', { name: 'Archivia come ex cliente' })).toHaveCount(0)
    const togli = chiusura.getByRole('button', { name: 'Togli dall’archivio' })
    expect((await togli.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await senzaScrollLaterale(page)
    expect(await archiviatoIl(id)).toBe(oggi)

    // Clienti: under "Ex cliente", no longer under "Chiuso"
    await page.goto('/clients?stato=ex_cliente')
    await expect(page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true })).toBeVisible()
    await page.goto('/clients?stato=chiuso')
    await expect(page.getByRole('link', { name: new RegExp(nome) }).filter({ visible: true })).toHaveCount(0)

    // Rinnovi: out of "Non rinnovano", counted among the archived
    await page.goto('/rinnovi')
    await expect(page.getByRole('listitem', { name: nome })).toHaveCount(0)
    await expect(page.getByTestId('link-archiviati')).toHaveAttribute('href', '/clients?stato=ex_cliente')
    await senzaScrollLaterale(page)

    // "Togli dall'archivio": closed again, with the day and the reason of before
    await page.goto(`/clients/${id}`)
    await chiusura.getByRole('button', { name: 'Togli dall’archivio' }).click()
    await expect(page.getByText('Tolto dall’archivio', { exact: true })).toBeVisible()
    await expect(chiusura).not.toContainText('Ex cliente')
    await expect(chiusura.getByRole('button', { name: 'Archivia come ex cliente' })).toBeVisible()
    await expect(page.getByText('Chiuso', { exact: true }).first()).toBeVisible()
    expect(await archiviatoIl(id)).toBeNull()
    await page.goto('/rinnovi')
    await expect(page.getByTestId('elenco-non-rinnovano').getByRole('listitem', { name: nome })).toBeVisible()
  })
})

test('da «Non rinnovano»: archivia, «Annulla» dal toast, poi «Riapri» toglie chiusura e archivio', async ({ page }) => {
  test.setTimeout(150_000)
  const oggi = oggiRoma()
  const id = await clienteChiuso('Rinnovi')
  const nome = `${PREFISSO} Rinnovi`

  await accedi(page, 'admin')
  await page.goto('/rinnovi')
  const riga = page.getByTestId('elenco-non-rinnovano').getByRole('listitem', { name: nome })
  const archivia = riga.getByRole('button', { name: `Archivia ${nome} come ex cliente` })
  await expect(archivia).toHaveText('Archivia')
  expect((await archivia.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await archivia.click()
  await expect(page.getByText('Archiviato come ex cliente', { exact: true })).toBeVisible()
  await expect(riga).toHaveCount(0)
  await expect(page.getByTestId('link-archiviati')).toBeVisible()
  expect(await archiviatoIl(id)).toBe(oggi)

  // the toast undoes it: back in "Non rinnovano"
  await page.getByRole('button', { name: 'Annulla' }).click()
  await expect(page.getByText('Tolto dall’archivio', { exact: true })).toBeVisible()
  await expect.poll(() => archiviatoIl(id)).toBeNull()
  await page.reload()
  await expect(riga).toBeVisible()

  // archived again, then "Riapri" from his sheet: the dates decide (ended 20 days ago)
  await riga.getByRole('button', { name: `Archivia ${nome} come ex cliente` }).click()
  await expect.poll(() => archiviatoIl(id)).toBe(oggi)
  await page.goto(`/clients/${id}`)
  await page.getByTestId('chiusura-cliente').getByRole('button', { name: `Riapri ${nome}` }).click()
  const domanda = page.getByRole('dialog', { name: `Riaprire ${nome}?` })
  await expect(domanda).toContainText('l’archivio se l’avevi archiviato')
  await domanda.getByRole('button', { name: 'Riapri' }).click()
  await expect(page.getByText('Cliente riaperto')).toBeVisible()
  await expect(page.getByTestId('chiusura-cliente')).toHaveCount(0)
  await expect(page.getByText('Scaduto', { exact: true }).first()).toBeVisible()
  expect(await archiviatoIl(id)).toBe('nessuna chiusura')
  await page.goto('/rinnovi')
  await expect(page.getByTestId('elenco-da-recuperare').getByRole('listitem', { name: nome })).toBeVisible()
})

test('da «Non rinnovano» con la tastiera: la riga archiviata se ne va, il focus passa alla prossima e poi agli archiviati', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const oggi = oggiRoma()
  // the most recent closure first: A, then B, the last row
  const idA = await clienteChiuso('TastieraA', 1)
  const idB = await clienteChiuso('TastieraB', 2)
  const nomeA = `${PREFISSO} TastieraA`
  const nomeB = `${PREFISSO} TastieraB`

  await accedi(page, 'admin')
  await page.goto('/rinnovi')
  const elenco = page.getByTestId('elenco-non-rinnovano')
  await expect(elenco.getByRole('listitem')).toHaveCount(2)
  await expect(elenco.getByRole('listitem').first()).toHaveAccessibleName(nomeA)
  const annuncio = page.getByTestId('annuncio-archivio')
  await expect(annuncio).toHaveAttribute('role', 'status')

  // A from the keyboard: his row goes, the focus lands on B's "Archivia", and it is said
  await elenco.getByRole('button', { name: `Archivia ${nomeA} come ex cliente` }).focus()
  await page.keyboard.press('Enter')
  await expect(elenco.getByRole('listitem', { name: nomeA })).toHaveCount(0)
  const archiviaB = elenco.getByRole('button', { name: `Archivia ${nomeB} come ex cliente` })
  await expect(archiviaB).toBeFocused()
  await expect(annuncio).toHaveText(`${nomeA} non è più in «Non rinnovano»: ora sei su «Archivia» di ${nomeB}.`)
  await expect.poll(() => archiviatoIl(idA)).toBe(oggi)

  // B, the last row, with Enter again: nothing after him, the focus goes to the archived clients
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listitem', { name: nomeB })).toHaveCount(0)
  await expect(page.getByTestId('link-archiviati')).toBeFocused()
  await expect(page.getByTestId('link-archiviati')).toContainText('Archiviati come ex clienti: 2')
  await expect(annuncio).toHaveText(`${nomeB} non è più in «Non rinnovano»: ora sei sul link agli archiviati.`)
  await expect.poll(() => archiviatoIl(idB)).toBe(oggi)
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
})

test('archiviato intanto altrove: tiene il suo giorno, e «Annulla» toglie solo l’archivio del suo tocco, anche rifatto lo stesso giorno', async ({ page }) => {
  test.setTimeout(150_000)
  const oggi = oggiRoma()
  const ieri = aggiungiGiorni(oggi, -1)
  const id = await clienteChiuso('Altrove')
  const nome = `${PREFISSO} Altrove`
  const archiviaAltrove = async () => {
    const { error } = await dbLocale().from('clienti_chiusure').update({ archiviato_il: ieri }).eq('client_id', id)
    if (error) throw error
  }

  await accedi(page, 'admin')
  await page.goto(`/clients/${id}`)
  const chiusura = page.getByTestId('chiusura-cliente')
  const archivia = chiusura.getByRole('button', { name: 'Archivia come ex cliente' })
  await expect(archivia).toBeVisible()

  // another tab archived him yesterday: this page still offers "Archivia"
  await archiviaAltrove()
  await archivia.click()
  await expect(page.getByText('Era già archiviato', { exact: true })).toBeVisible()
  await expect(page.getByText(`${nome} è tra gli ex clienti dal ${giorno(ieri)}.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Annulla' })).toHaveCount(0)
  await expect(chiusura).toContainText(`Ex cliente · archiviato il ${giorno(ieri)}`)
  expect(await archiviatoIl(id)).toBe(ieri)

  // archived by this tap, then again elsewhere: the toast's "Annulla" leaves the new one alone
  await chiusura.getByRole('button', { name: 'Togli dall’archivio' }).click()
  await expect.poll(() => archiviatoIl(id)).toBeNull()
  await chiusura.getByRole('button', { name: 'Archivia come ex cliente' }).click()
  await expect(page.getByText('Archiviato come ex cliente', { exact: true })).toBeVisible()
  await expect.poll(() => archiviatoIl(id)).toBe(oggi)
  await archiviaAltrove()
  await page.getByRole('button', { name: 'Annulla' }).click()
  await expect(page.getByText('Nel frattempo la chiusura è cambiata: l’archivio resta com’è. Ricarica la pagina.')).toBeVisible()
  expect(await archiviatoIl(id)).toBe(ieri)

  // archived by this tap, then undone and archived again elsewhere the same
  // day: the day is the same as the tap's, the toast's "Annulla" still leaves
  // the new archive alone
  await page.reload()
  await chiusura.getByRole('button', { name: 'Togli dall’archivio' }).click()
  await expect.poll(() => archiviatoIl(id)).toBeNull()
  await chiusura.getByRole('button', { name: 'Archivia come ex cliente' }).click()
  await expect(page.getByText('Archiviato come ex cliente', { exact: true })).toBeVisible()
  await expect.poll(() => archiviatoIl(id)).toBe(oggi)
  const db = dbLocale()
  for (const archiviato_il of [null, oggi]) {
    const { error } = await db.from('clienti_chiusure').update({ archiviato_il }).eq('client_id', id)
    if (error) throw error
  }
  await page.getByRole('button', { name: 'Annulla' }).click()
  await expect(page.getByText('Nel frattempo la chiusura è cambiata: l’archivio resta com’è. Ricarica la pagina.')).toBeVisible()
  expect(await archiviatoIl(id)).toBe(oggi)
  await page.reload()
  await expect(chiusura).toContainText(`Ex cliente · archiviato il ${giorno(oggi)}`)
})
