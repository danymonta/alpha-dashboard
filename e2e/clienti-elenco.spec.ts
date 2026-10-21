import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { COOKIE_PICKER_E2E, SCOPE_DRIVE_FILE } from '../lib/google/picker'
import { ID_ADMIN, ID_CLOSER, PRODOTTO_3_MESI, dbLocale, pulisciVendite } from './db'
import { bloccaGoogle, googleFinto, impostaCompito, registro } from './google-finto'
import { accedi } from './utenti'

/**
 * Clienti (Dany, 21/10/2026): the four cards (Attivi, Sospesi, Chiusi, Tutti)
 * with the table of the client's path, contract, Drive folder, what he paid,
 * how and the instalments to collect; "Sospendi" and "Riattiva" on the client
 * sheet; the link to the contract of each sale. Admin only: the closer, the
 * setter and the coach never see the list or the contract.
 */
const PREFISSO = 'E2EElenco'
const URL_CONTRATTO = 'https://drive.google.com/file/d/e2e-contratto-1/view'

async function cliente(cognome: string, { giorniFa = 40, fine = 50, rate = 3, valore = 900, closer = null as string | null } = {}) {
  const db = dbLocale()
  const oggi = oggiRoma()
  const { data, error } = await db
    .from('clients')
    .insert({ nome: PREFISSO, cognome, instagram_handle: `@${cognome.toLowerCase()}`, fonte: 'referral', closer_id: closer, created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error
  const inizio = aggiungiGiorni(oggi, -giorniFa)
  const { data: vendita, error: e2 } = await db
    .from('sales')
    .insert({
      client_id: data.id,
      product_id: PRODOTTO_3_MESI,
      tipo: 'nuovo',
      closer_id: closer,
      data_vendita: inizio,
      data_inizio: inizio,
      data_fine: aggiungiGiorni(oggi, fine),
      valore_contratto: valore,
      numero_rate: rate,
      created_by: ID_ADMIN,
    })
    .select('id')
    .single()
  if (e2) throw e2
  return { id: data.id as string, venditaId: vendita.id as string, nome: `${PREFISSO} ${cognome}` }
}

/** The first instalment paid by bank transfer, on the day of the sale. */
async function primaRataIncassata(venditaId: string, importo: number) {
  const { error } = await dbLocale()
    .from('payments')
    .update({ stato: 'incassata', incassato_il: oggiRoma(), importo_incassato: importo, metodo: 'bonifico' })
    .eq('sale_id', venditaId)
    .eq('numero_rata', 1)
  if (error) throw error
}

const riga = (page: Page, nome: string) => page.getByTestId('riga-cliente').filter({ hasText: nome })
const senzaScrollLaterale = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))

test.beforeEach(async () => {
  await pulisciVendite(PREFISSO)
})
test.afterEach(async () => {
  // sales, instalments, holds, closures, folders and contracts go with the client (on delete cascade)
  await pulisciVendite(PREFISSO)
})

test('le quattro schede con i conteggi, e «Tutti» con i suoi filtri e la ricerca', async ({ page }) => {
  test.setTimeout(150_000)
  const attivo = await cliente('Attivo')
  const sospeso = await cliente('Sospeso')
  const chiuso = await cliente('Chiuso')
  const db = dbLocale()
  await db.from('clienti_sospensioni').insert({ client_id: sospeso.id, sospeso_il: oggiRoma(), motivo: 'Viaggio' })
  await db.from('clienti_chiusure').insert({ client_id: chiuso.id, chiuso_il: oggiRoma() })

  await accedi(page, 'admin')
  await page.goto('/clients')
  const schede = page.getByRole('navigation', { name: 'Elenco dei clienti' })
  await expect(schede.getByRole('link')).toHaveCount(4)
  // «Attivi» by default
  await expect(page.getByTestId('vista-attivi')).toHaveAttribute('aria-current', 'page')
  await expect(riga(page, attivo.nome)).toBeVisible()
  await expect(riga(page, sospeso.nome)).toHaveCount(0)
  await expect(riga(page, chiuso.nome)).toHaveCount(0)

  // the counts are the ones the lists have
  const conta = async (vista: string) => Number(((await page.getByTestId(`vista-${vista}`).textContent()) ?? '').replace(/\D/g, ''))
  const conteggi = { attivi: await conta('attivi'), sospesi: await conta('sospesi'), chiusi: await conta('chiusi') }
  expect(await page.getByTestId('riga-cliente').count()).toBe(conteggi.attivi)

  await page.getByTestId('vista-sospesi').click()
  await expect(page).toHaveURL(/vista=sospesi/)
  await expect(page.getByTestId('vista-sospesi')).toHaveAttribute('aria-current', 'page')
  await expect(riga(page, sospeso.nome)).toBeVisible()
  await expect(riga(page, sospeso.nome)).toContainText('Sospeso dal')
  expect(await page.getByTestId('riga-cliente').count()).toBe(conteggi.sospesi)

  await page.getByTestId('vista-chiusi').click()
  await expect(page).toHaveURL(/vista=chiusi/)
  await expect(riga(page, chiuso.nome)).toBeVisible()
  await expect(riga(page, chiuso.nome)).toContainText('Chiuso il')
  expect(await page.getByTestId('riga-cliente').count()).toBe(conteggi.chiusi)

  // «Tutti»: the list of always, with the filter by state and the search
  await page.getByTestId('vista-tutti').click()
  await expect(page).toHaveURL(/vista=tutti/)
  await expect(page.getByRole('navigation', { name: 'Filtra per stato' })).toBeVisible()
  await page.getByRole('link', { name: /^Sospeso\s*\d+$/ }).click()
  await expect(page).toHaveURL(/stato=sospeso/)
  await expect(page.getByRole('link', { name: new RegExp(sospeso.nome) }).filter({ visible: true })).toBeVisible()
  await page.getByRole('link', { name: /^Tutti gli stati/ }).click()
  await expect(page).not.toHaveURL(/stato=/)
  await page.getByLabel('Cerca un cliente').fill('Attivo')
  await page.getByLabel('Cerca un cliente').press('Enter')
  await expect(page).toHaveURL(/q=Attivo/)
  await expect(page.getByTestId('vista-tutti')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: new RegExp(attivo.nome) }).filter({ visible: true })).toBeVisible()
  // an old link with a state and no card is «Tutti»
  await page.goto('/clients?stato=chiuso')
  await expect(page.getByTestId('vista-tutti')).toHaveAttribute('aria-current', 'page')
})

test('la riga dice mese e settimana, quanto ha pagato e come, la prossima rata in ritardo e il piano si apre', async ({ page }) => {
  test.setTimeout(120_000)
  const c = await cliente('Piano', { giorniFa: 40, fine: 50, rate: 3, valore: 900 })
  await primaRataIncassata(c.venditaId, 300)

  await accedi(page, 'admin')
  await page.goto('/clients?vista=attivi')
  const r = riga(page, c.nome)
  await expect(r).toBeVisible()
  // 40 days in a 91-day path: month 2 of 3, week 6 of 13
  await expect(r.getByTestId('percorso-mese')).toHaveText('Mese 2 di 3 · Settimana 6 di 13')
  await expect(r.getByRole('progressbar', { name: 'Avanzamento del percorso' })).toBeVisible()
  await expect(r).toContainText('@piano')
  await expect(r).toContainText('Primo percorso')
  // what he paid on this path, and his lifetime value
  await expect(r.getByTestId('pagato')).toContainText(/300,00\s€/)
  await expect(r).toContainText(/su 900,00\s€/)
  await expect(r.getByTestId('ltv')).toContainText(/LTV 300\s€/)
  await expect(r).toContainText('Bonifico')
  await expect(r).toContainText('1 di 3 rate pagate')
  // the next instalment is the second, late, with icon and words
  await expect(r.getByTestId('prossima-rata')).toContainText('Rata 2 di 3')
  await expect(r.getByTestId('in-ritardo')).toContainText(/In ritardo: 300,00\s€/)
  await expect(r).toContainText('2 rate da saldare')

  const apri = r.getByRole('button', { name: /Piano rate/ })
  await expect(apri).toHaveAttribute('aria-expanded', 'false')
  await expect(r.getByTestId('piano-rate-cliente')).toHaveCount(0)
  await apri.click()
  const nascondi = r.getByRole('button', { name: /Nascondi il piano/ })
  await expect(nascondi).toHaveAttribute('aria-expanded', 'true')
  const piano = r.getByTestId('piano-rate-cliente')
  await expect(piano.getByRole('listitem')).toHaveCount(3)
  await expect(piano.getByRole('listitem').nth(0)).toContainText('Incassata')
  await expect(piano.getByRole('listitem').nth(0)).toContainText('Bonifico')
  await expect(piano.getByRole('listitem').nth(1)).toContainText('In ritardo')
  await expect(piano.getByRole('listitem').nth(1)).toHaveAttribute('data-in-ritardo', 'true')
  await expect(piano.getByRole('listitem').nth(2)).toContainText('Prevista')
  await nascondi.click()
  await expect(r.getByTestId('piano-rate-cliente')).toHaveCount(0)

  // the row opens the client's sheet by the name
  await r.getByRole('link', { name: c.nome }).click()
  await expect(page).toHaveURL(new RegExp(`/clients/${c.id}`))
})

test('un percorso non ancora iniziato dice quando inizia', async ({ page }) => {
  test.setTimeout(90_000)
  const c = await cliente('Futuro', { giorniFa: -12, fine: 80, rate: 1 })
  await accedi(page, 'admin')
  await page.goto('/clients?vista=attivi')
  const r = riga(page, c.nome)
  await expect(r.getByTestId('percorso-mese')).toHaveText(/^Inizia il \d{2}\/\d{2}\/\d{4}$/)
  await expect(r.getByRole('progressbar')).toHaveCount(0)
  await expect(r).toContainText('Da iniziare')
})

test('Sospendi dalla scheda: il giorno, il motivo, la scheda Sospesi; Riattiva lo rimette tra gli attivi', async ({ page }) => {
  test.setTimeout(150_000)
  const c = await cliente('Pausa')
  await accedi(page, 'admin')
  await page.goto(`/clients/${c.id}`)
  await expect(page.getByTestId('sospensione-cliente')).toHaveCount(0)

  await page.getByTestId('sospendi').click()
  const foglio = page.getByRole('dialog', { name: 'Sospendi' })
  await expect(foglio).toContainText('Risulta «Sospeso» in Clienti')
  await expect(foglio.getByLabel('Sospeso dal')).toHaveValue(oggiRoma())
  // never in the future
  await foglio.getByLabel('Sospeso dal').fill(aggiungiGiorni(oggiRoma(), 1))
  await foglio.getByRole('button', { name: 'Sospendi il cliente' }).click()
  await expect(foglio.getByText('Il giorno non può essere nel futuro')).toBeVisible()
  await foglio.getByLabel('Sospeso dal').fill(aggiungiGiorni(oggiRoma(), -3))
  await foglio.getByLabel(/Perché lo sospendi/).fill('Viaggio di lavoro')
  await foglio.getByRole('button', { name: 'Sospendi il cliente' }).click()
  await expect(page.getByText('Cliente sospeso', { exact: true })).toBeVisible()
  await expect(foglio).toBeHidden()

  const scheda = page.getByTestId('sospensione-cliente')
  await expect(scheda).toContainText('Sospeso dal')
  await expect(scheda).toContainText('Viaggio di lavoro')
  await expect(page.getByText('Sospeso', { exact: true }).first()).toBeVisible()
  // already on hold: no second "Sospendi"
  await expect(page.getByTestId('sospendi')).toHaveCount(0)
  const { data: salvata } = await dbLocale().from('clienti_sospensioni').select('sospeso_il, motivo').eq('client_id', c.id).single()
  expect(salvata).toEqual({ sospeso_il: aggiungiGiorni(oggiRoma(), -3), motivo: 'Viaggio di lavoro' })

  // the pencil corrects the reason
  await page.getByTestId('modifica-sospensione').click()
  await expect(foglio.getByLabel(/Perché lo sospendi/)).toHaveValue('Viaggio di lavoro')
  await foglio.getByLabel(/Perché lo sospendi/).fill('Infortunio')
  await foglio.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Sospensione aggiornata')).toBeVisible()
  await expect(scheda).toContainText('Infortunio')

  // out of the active clients, among the suspended ones
  await page.goto('/clients?vista=attivi')
  await expect(riga(page, c.nome)).toHaveCount(0)
  await page.goto('/clients?vista=sospesi')
  await expect(riga(page, c.nome)).toBeVisible()
  await expect(riga(page, c.nome)).toContainText('Sospeso')

  // never to chase for the renewal
  await page.goto('/rinnovi')
  await expect(page.getByRole('listitem', { name: c.nome })).toHaveCount(0)

  // "Riattiva" asks first
  await page.goto(`/clients/${c.id}`)
  await page.getByTestId('riattiva').click()
  const domanda = page.getByRole('dialog', { name: /^Riattivare/ })
  await expect(domanda).toContainText('percorso, rate e incassi restano come sono')
  await page.getByTestId('conferma-riattiva').click()
  await expect(page.getByText('Cliente riattivato')).toBeVisible()
  await expect(page.getByTestId('sospensione-cliente')).toHaveCount(0)
  await expect(page.getByTestId('sospendi')).toBeVisible()
  const { data: dopo } = await dbLocale().from('clienti_sospensioni').select('client_id').eq('client_id', c.id)
  expect(dopo).toEqual([])
  await page.goto('/clients?vista=attivi')
  await expect(riga(page, c.nome)).toBeVisible()
})

test('«Non rinnova» su un sospeso: il chiuso vince e la sospensione finisce; un chiuso non si sospende', async ({ page }) => {
  test.setTimeout(150_000)
  const c = await cliente('Vince')
  await dbLocale().from('clienti_sospensioni').insert({ client_id: c.id, sospeso_il: oggiRoma() })
  await accedi(page, 'admin')
  await page.goto(`/clients/${c.id}`)
  await expect(page.getByTestId('sospensione-cliente')).toBeVisible()
  await page.getByTestId('non-rinnova').click()
  const foglio = page.getByRole('dialog', { name: 'Non rinnova' })
  await foglio.getByRole('button', { name: 'Chiudi il cliente' }).click()
  await expect(page.getByText('Cliente chiuso', { exact: true })).toBeVisible()
  await expect(page.getByTestId('chiusura-cliente')).toBeVisible()
  await expect(page.getByTestId('sospensione-cliente')).toHaveCount(0)
  // a closed client has nothing to suspend: the button is not offered
  await expect(page.getByTestId('sospendi')).toHaveCount(0)
  const { data } = await dbLocale().from('clienti_sospensioni').select('client_id').eq('client_id', c.id)
  expect(data).toEqual([])
  await page.goto('/clients?vista=chiusi')
  await expect(riga(page, c.nome)).toBeVisible()
})

test('il contratto di ogni percorso: aggiunge, apre, corregge e toglie il link, dall’elenco, dalla vendita e dallo storico', async ({ page, context }) => {
  test.setTimeout(180_000)
  const c = await cliente('Contratto')
  await context.route('https://drive.google.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Drive</title><p>Contratto</p>' }),
  )
  await accedi(page, 'admin')
  await page.goto('/clients?vista=attivi')
  const r = riga(page, c.nome)
  await r.getByRole('button', { name: /^Aggiungi il link del contratto di/ }).click()
  const foglio = page.getByRole('dialog', { name: 'Contratto', exact: true })
  const campo = foglio.getByLabel('Link del contratto')
  await campo.fill('https://example.com/contratto.pdf')
  await foglio.getByRole('button', { name: 'Salva' }).click()
  await expect(foglio.getByText('Incolla il link del contratto su Google Drive')).toBeVisible()
  // without https:// it gets it
  await campo.fill('drive.google.com/file/d/e2e-contratto-1/view')
  await foglio.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Contratto collegato', { exact: true })).toBeVisible()
  await expect(foglio).toBeHidden()
  const link = r.getByRole('link', { name: /^Apri il contratto di/ })
  await expect(link).toHaveAttribute('href', URL_CONTRATTO)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  const { data: salvato } = await dbLocale().from('vendite_contratti').select('url').eq('sale_id', c.venditaId).single()
  expect(salvato?.url).toBe(URL_CONTRATTO)

  // the sale page and the client's path history show the same link
  await page.goto(`/sales/${c.venditaId}`)
  await expect(page.getByTestId('contratto-vendita').getByRole('link', { name: /Contratto/ })).toHaveAttribute('href', URL_CONTRATTO)
  await page.goto(`/clients/${c.id}`)
  const percorso = page.getByTestId('percorso').first()
  await expect(percorso).toContainText('Contratto su Drive')
  await expect(percorso.getByRole('link', { name: /^Apri il contratto di/ })).toHaveAttribute('href', URL_CONTRATTO)

  // change it from the pencil, then take it away: the file on Drive stays
  await percorso.getByRole('button', { name: /^Modifica il link del contratto di/ }).click()
  await expect(foglio.getByLabel('Link del contratto')).toHaveValue(URL_CONTRATTO)
  await foglio.getByLabel('Link del contratto').fill('https://docs.google.com/document/d/e2e-doc-2/edit')
  await foglio.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Link aggiornato')).toBeVisible()
  await expect(percorso.getByRole('link', { name: /^Apri il contratto di/ })).toHaveAttribute('href', 'https://docs.google.com/document/d/e2e-doc-2/edit')

  await percorso.getByRole('button', { name: /^Modifica il link del contratto di/ }).click()
  await foglio.getByRole('button', { name: 'Togli il link' }).click()
  const domanda = page.getByRole('dialog', { name: /^Eliminare il link al contratto di/ })
  await expect(domanda).toContainText('Il file su Google Drive resta com’è')
  await domanda.getByRole('button', { name: 'Elimina' }).click()
  await expect(page.getByText('Link tolto')).toBeVisible()
  await expect(percorso.getByRole('button', { name: /^Aggiungi il link del contratto di/ })).toBeVisible()
  const { data: dopo } = await dbLocale().from('vendite_contratti').select('sale_id').eq('sale_id', c.venditaId)
  expect(dopo).toEqual([])
})

test.describe('«Scegli da Drive» per il contratto, con la configurazione di prova', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: COOKIE_PICKER_E2E, value: '1', url: baseURL ?? 'http://localhost:3000' }])
  })

  test('sceglie un file, mai una cartella: il link rifatto dall’id, con lo stesso permesso minimo', async ({ page, context }) => {
    test.setTimeout(150_000)
    const c = await cliente('Picker')
    const google = await bloccaGoogle(context)
    await googleFinto(page, { accesso: 'ok', picker: 'cartella' })
    await accedi(page, 'admin')
    await page.goto(`/sales/${c.venditaId}`)
    await page.getByTestId('contratto-vendita').getByRole('button', { name: /^Aggiungi il link del contratto/ }).click()
    const foglio = page.getByRole('dialog', { name: 'Contratto', exact: true })
    await expect(foglio.getByLabel('Link del contratto')).toBeVisible()

    // a folder instead of a file: said in Italian, nothing saved
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(foglio.getByText('Hai scelto una cartella, non un file: scegli il contratto.')).toBeVisible()
    expect((await dbLocale().from('vendite_contratti').select('sale_id').eq('sale_id', c.venditaId)).data).toEqual([])

    await impostaCompito(page, { picker: 'file' })
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(page.getByText('Contratto collegato', { exact: true })).toBeVisible()
    const url = 'https://drive.google.com/file/d/unFileQualsiasi-123/view'
    await expect(page.getByTestId('contratto-vendita').getByRole('link', { name: /Contratto/ })).toHaveAttribute('href', url)
    expect((await dbLocale().from('vendite_contratti').select('url').eq('sale_id', c.venditaId).single()).data?.url).toBe(url)

    const fatto = await registro(page)
    expect(fatto.filter((x) => 'token' in x).map((x) => (x.token as { scope: string }).scope)).toEqual([SCOPE_DRIVE_FILE])
    const picker = fatto.filter((x) => 'picker' in x).map((x) => x.picker as { titolo: string; viste: Record<string, unknown>[] })
    expect(picker[0].titolo).toBe('Scegli il contratto')
    // the person's files and the ones shared with him; a folder only to move through, never picked
    expect(picker[0].viste).toEqual([
      { vista: 'docs', cartelle: true, sceltaCartella: false },
      { vista: 'docs', cartelle: true, sceltaCartella: false, mie: false },
    ])
    expect(google).toEqual([])
  })
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('l’elenco diventa una lista di card: tutte le informazioni, target da 44 px, niente scroll laterale', async ({ page }) => {
    test.setTimeout(120_000)
    const c = await cliente('Telefono')
    await primaRataIncassata(c.venditaId, 300)
    await accedi(page, 'admin')
    for (const vista of ['attivi', 'sospesi', 'chiusi', 'tutti']) {
      await page.goto(`/clients?vista=${vista}`)
      await expect(page.getByTestId(`vista-${vista}`)).toHaveAttribute('aria-current', 'page')
      await senzaScrollLaterale(page)
    }
    await page.goto('/clients?vista=attivi')
    const r = riga(page, c.nome)
    await expect(r).toBeVisible()
    // the same information as the table, with each cell's label
    for (const etichetta of ['Percorso', 'Contratto', 'Cartella Drive', 'Pagato', 'Come paga', 'Rate da saldare']) {
      await expect(r.getByText(etichetta, { exact: true }).filter({ visible: true })).toBeVisible()
    }
    await expect(r.getByTestId('percorso-mese')).toBeVisible()
    for (const bottone of [
      r.getByRole('button', { name: /^Aggiungi il link del contratto/ }),
      r.getByRole('button', { name: /^Aggiungi il link della cartella Drive/ }),
      r.getByRole('button', { name: /Piano rate/ }),
    ]) {
      const box = await bottone.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
    await r.getByRole('button', { name: /Piano rate/ }).click()
    await expect(r.getByTestId('piano-rate-cliente')).toBeVisible()
    await senzaScrollLaterale(page)
    // the tabs are 44 px targets
    for (const vista of ['attivi', 'sospesi', 'chiusi', 'tutti']) {
      expect((await page.getByTestId(`vista-${vista}`).boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test('il closer legge la sua vendita ma non il contratto, e non vede l’elenco', async ({ page }) => {
  test.setTimeout(180_000)
  const c = await cliente('Riservato', { closer: ID_CLOSER })
  await dbLocale().from('vendite_contratti').insert({ sale_id: c.venditaId, url: URL_CONTRATTO, created_by: ID_ADMIN })

  // the closer reads his sale, never the contract
  await accedi(page, 'closer')
  await page.goto(`/sales/${c.venditaId}`)
  await expect(page.getByText(c.nome).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByTestId('contratto-vendita')).toHaveCount(0)
  const html = await page.content()
  expect(html).not.toContain('e2e-contratto-1')
  expect(html).not.toContain('Contratto su Drive')
  await page.goto('/clients')
  await expect(page).not.toHaveURL(/\/clients/)
  await page.goto(`/clients/${c.id}`)
  await expect(page).not.toHaveURL(/\/clients/)
  await page.goto('/my-sales')
  expect(await page.content()).not.toContain('e2e-contratto-1')
})

for (const ruolo of ['setter', 'coach'] as const) {
  test(`il ${ruolo} non vede né l’elenco dei clienti né il contratto`, async ({ page }) => {
    test.setTimeout(120_000)
    const c = await cliente('Riservato')
    await dbLocale().from('vendite_contratti').insert({ sale_id: c.venditaId, url: URL_CONTRATTO, created_by: ID_ADMIN })
    await accedi(page, ruolo)
    for (const url of ['/clients', '/clients?vista=sospesi', `/clients/${c.id}`, `/sales/${c.venditaId}`]) {
      await page.goto(url)
      await expect(page).not.toHaveURL(/\/(clients|sales)/)
      const html = await page.content()
      expect(html).not.toContain('e2e-contratto-1')
      expect(html).not.toContain('Contratto su Drive')
    }
  })
}
