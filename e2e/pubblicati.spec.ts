import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'
import { accedi, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * «Pubblicati» (25/10/2026): the published posts of the account with their insights, the content of the Piano
 * editoriale each is linked to, «Collega» / «Scollega», and the View Count that follows the views of Instagram. Posts
 * and contents are written with the local service role and removed at the end; every caption and shortcode is
 * invented, and every caption carries this run's mark (RUN) so the search isolates them from the seed. Instagram is
 * never called: "Aggiorna da Instagram" is tapped only with an empty local Vault (the sentence of the missing token),
 * or against the fake Graph API (e2e/graph-finto.mjs) when the dev server and this run have E2E_GRAPH_FINTO.
 */

const STAMP = Date.now()
const RUN = STAMP.toString(36)
const codice = (n: number) => `E2e${RUN}P${n}`
const mediaId = (n: number) => `1795${STAMP}${n}`
const permalink = (n: number) => `https://www.instagram.com/reel/${codice(n)}/`
const ieri = () => aggiungiGiorni(oggiRoma(), -1)

type StatoGiro = Database['public']['Tables']['instagram_contenuti_stato']['Row']
type Abbinamento = Database['public']['Tables']['marketing_abbinamenti']['Row']
let statoIniziale: StatoGiro | null = null
let proposteIniziali: Abbinamento[] = []
const contenutiCreati: string[] = []

/** A post of the account, published yesterday at 18:30 in Rome (a reel unless said), with the run's mark in the caption. */
async function creaPost(n: number, didascalia: string, extra: Partial<Database['public']['Tables']['instagram_contenuti']['Insert']> = {}) {
  const { error } = await dbLocale()
    .from('instagram_contenuti')
    .insert({
      media_id: mediaId(n),
      shortcode: codice(n),
      permalink: permalink(n),
      media_type: 'VIDEO',
      media_product_type: 'REELS',
      reel: true,
      pubblicato_il: `${ieri()}T16:30:00Z`,
      didascalia: `${didascalia} ${RUN}`,
      ...extra,
    })
  if (error) throw error
}

/** A content of the calendar, without URL unless said. */
async function creaContenuto(nome: string, extra: Partial<Database['public']['Tables']['marketing_contenuti']['Insert']> = {}) {
  const { data, error } = await dbLocale()
    .from('marketing_contenuti')
    .insert({ tipo: 'reel', nome, stato: 'posted', post_date: ieri(), ...extra })
    .select('id')
    .single()
  if (error) throw error
  contenutiCreati.push(data.id)
  return data.id
}

async function contenuto(id: string) {
  const { data, error } = await dbLocale()
    .from('marketing_contenuti')
    .select('url, stato, post_date, view_count, view_count_da_instagram, updated_at')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/** The admin's own session on the local database (instagram_imposta_token as he calls it). */
async function sessioneAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI.admin.email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

const toast = (page: Page, testo: string) => page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
/** The row of a post in the table (at 1280 px the table is on screen, the cards are not). */
const riga = (page: Page, n: number) => page.locator(`tr[data-riga-post="${mediaId(n)}"]`)
const cella = (page: Page, n: number, colonna: string) => riga(page, n).locator(`td[data-colonna="${colonna}"]`)
const schede = (page: Page) => page.getByRole('navigation', { name: 'Sezioni del Marketing' })

async function apriPagina(page: Page, ricerca = '') {
  await page.goto(`/marketing/pubblicati${ricerca ? `?q=${encodeURIComponent(ricerca)}` : ''}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Pubblicati' })).toBeVisible({ timeout: 60_000 })
}

test.beforeAll(async () => {
  const db = dbLocale()
  const { data, error } = await db.from('instagram_contenuti_stato').select('*').maybeSingle()
  if (error) throw error
  statoIniziale = data
  const { data: proposte, error: erroreProposte } = await db.from('marketing_abbinamenti').select('*').eq('esito', 'proposto')
  if (erroreProposte) throw erroreProposte
  proposteIniziali = proposte.filter((p) => !p.shortcode.startsWith('E2e'))
})

test.afterAll(async () => {
  const db = dbLocale()
  // the contents made here, and any that point to one of these posts
  const { data: dalPost } = await db.from('marketing_contenuti').select('id').like('url', `%E2e${RUN}%`)
  const ids = [...contenutiCreati, ...(dalPost ?? []).map((c) => c.id)]
  if (ids.length) await db.from('marketing_contenuti').delete().in('id', ids)
  await db.from('marketing_abbinamenti_rifiutati').delete().like('shortcode', `E2e${RUN}%`)
  await db.from('instagram_contenuti').delete().like('shortcode', `E2e${RUN}%`)
  await db.from('marketing_abbinamenti').delete().eq('esito', 'proposto')
  if (proposteIniziali.length) await db.from('marketing_abbinamenti').upsert(proposteIniziali)
  // the run's state as it was (no error and no "appena fatto" left behind)
  if (statoIniziale) {
    const { id: _id, created_at: _c, updated_at: _u, ...campi } = statoIniziale
    void _id
    void _c
    void _u
    await db.from('instagram_contenuti_stato').update(campi).eq('id', true)
  }
})

test('la tabella: una riga per post con didascalia, Piano editoriale e i numeri; «–» dove Instagram non li ha dati', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(1, 'Un reel con tutti i suoi numeri', {
    views: 1234, reach: 987, saved: 12, shares: 5, comments: 3, metriche_stato: 'lette', metriche_il: new Date().toISOString(),
  })
  await creaPost(2, 'Un carosello senza statistiche', {
    media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', reel: false, permalink: `https://www.instagram.com/p/${codice(2)}/`, comments_count: 4,
  })
  const nome = `E2E pubblicati ${RUN} collegato`
  await creaContenuto(nome, { url: permalink(1), reel_type: 'education', formato: 'raw_talking_head' })

  await accedi(page, 'marketing')
  await apriPagina(page, RUN)
  await expect(schede(page).getByRole('link', { name: 'Pubblicati', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('tabella-pubblicati').getByRole('columnheader')).toHaveText([
    'Post', 'Piano editoriale', 'Views', 'Reach', 'Salvati', 'Condivisioni', 'Commenti', 'DM', 'In target', 'Call', 'Cosa fare',
  ])

  // the reel: its caption as a link to the panel, the content of the plan with its pills, the numbers side by side
  await expect(riga(page, 1).getByRole('link', { name: new RegExp(`^Un reel con tutti i suoi numeri ${RUN}`) })).toBeVisible()
  await expect(cella(page, 1, 'views')).toContainText('1.234')
  await expect(cella(page, 1, 'reach')).toHaveText('987')
  await expect(cella(page, 1, 'saved')).toHaveText('12')
  await expect(cella(page, 1, 'shares')).toHaveText('5')
  await expect(cella(page, 1, 'commenti')).toHaveText('3')
  await expect(riga(page, 1).getByTestId('cella-piano').getByRole('link', { name: nome, exact: true })).toBeVisible()
  await expect(riga(page, 1).getByTestId('cella-piano')).toContainText('Education')
  await expect(riga(page, 1).getByTestId('cella-piano')).toContainText('Raw Talking Head')
  await expect(riga(page, 1).getByTestId('collega')).toHaveCount(0)

  // the carousel: not read is «–», never 0; the comments of its listing are there; no score; one discreet «Collega»
  for (const colonna of ['views', 'reach', 'saved', 'shares']) await expect(cella(page, 2, colonna)).toHaveText('–')
  await expect(cella(page, 2, 'commenti')).toHaveText('4')
  await expect(riga(page, 2).getByTestId('colonna-punteggio')).toHaveText('–')
  await expect(riga(page, 2).getByTestId('collega')).toBeVisible()
  await expect(riga(page, 2)).toContainText('Carosello')
  // «Apri su Instagram» is a link out, in a new tab
  const fuori = riga(page, 2).getByRole('link', { name: /^Apri su Instagram/ })
  await expect(fuori).toHaveAttribute('href', `https://www.instagram.com/p/${codice(2)}/`)
  await expect(fuori).toHaveAttribute('target', '_blank')

  // the lists «Da collegare», «Collegati», «Fuori dal calendario» and the proposals are gone
  for (const parola of ['Da collegare', 'Forse è', 'Crea il contenuto', 'Non va nel calendario', 'Fuori dal calendario']) {
    await expect(page.getByText(parola, { exact: false })).toHaveCount(0)
  }
})

test('i filtri: tipo, nel piano o no, ricerca nella didascalia; Togli i filtri', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(3, 'Reel collegato per i filtri')
  await creaPost(4, 'Reel libero per i filtri')
  await creaPost(5, 'Carosello libero per i filtri', { media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', reel: false, permalink: `https://www.instagram.com/p/${codice(5)}/` })
  await creaPost(6, 'Foto libera per i filtri', { media_type: 'IMAGE', media_product_type: 'FEED', reel: false, permalink: `https://www.instagram.com/p/${codice(6)}/` })
  // a post published long before the plan: a normal row, nobody has to link it
  await creaPost(7, 'Reel di due mesi fa per i filtri', { pubblicato_il: `${aggiungiGiorni(oggiRoma(), -60)}T16:30:00Z` })
  await creaContenuto(`E2E pubblicati ${RUN} filtri`, { url: permalink(3) })

  await accedi(page, 'marketing')
  await apriPagina(page, RUN)
  for (const n of [3, 4, 5, 6]) await expect(riga(page, n)).toBeVisible()
  // the default period is 30 days
  await expect(riga(page, 7)).toHaveCount(0)

  const filtri = page.getByRole('region', { name: 'Filtri dei pubblicati' })
  await filtri.getByRole('combobox', { name: 'Tipo' }).selectOption('carosello')
  await expect(page).toHaveURL(/tipo=carosello/)
  await expect(riga(page, 5)).toBeVisible()
  for (const n of [3, 4, 6]) await expect(riga(page, n)).toHaveCount(0)

  await filtri.getByRole('combobox', { name: 'Tipo' }).selectOption('tutti')
  // wait for the list of the new filter before the next one: each change starts from the filters the page shows
  await expect(page).not.toHaveURL(/tipo=/)
  await expect(riga(page, 3)).toBeVisible()
  await filtri.getByRole('combobox', { name: 'Piano editoriale' }).selectOption('nel_piano')
  await expect(page).toHaveURL(/piano=nel_piano/)
  await expect(riga(page, 3)).toBeVisible()
  for (const n of [4, 5, 6]) await expect(riga(page, n)).toHaveCount(0)
  await filtri.getByRole('combobox', { name: 'Piano editoriale' }).selectOption('fuori')
  await expect(page).toHaveURL(/piano=fuori/)
  await expect(riga(page, 4)).toBeVisible()
  await expect(riga(page, 3)).toHaveCount(0)

  // the period: 90 days brings the old one
  await filtri.getByRole('combobox', { name: 'Periodo' }).selectOption('90')
  await expect(page).toHaveURL(/periodo=90/)
  await expect(riga(page, 7)).toBeVisible()
  await expect(riga(page, 7).getByTestId('collega')).toBeVisible()

  // the search takes every character as it is
  await filtri.getByRole('searchbox', { name: 'Cerca nella didascalia' }).fill(`Foto libera`)
  await filtri.getByRole('searchbox', { name: 'Cerca nella didascalia' }).press('Enter')
  await expect(page.getByTestId('elenco-pubblicati')).toBeVisible()
  await filtri.getByRole('button', { name: 'Togli i filtri' }).click()
  await expect(page).toHaveURL(/\/marketing\/pubblicati$/)
  await expect(page.getByRole('searchbox', { name: 'Cerca nella didascalia' })).toHaveValue('')

  // a search with nothing found: the empty state with its way out
  await apriPagina(page, `nessuno-${RUN}-xyz`)
  await expect(page.getByText('Nessun post con questi filtri')).toBeVisible()
  await page.getByRole('link', { name: 'Togli i filtri' }).click()
  await expect(page).toHaveURL(/\/marketing\/pubblicati$/)
})

test('«Collega» da una riga: la ricerca tra i contenuti senza post, l’URL e la View Count del contenuto, poi «Annulla»', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(10, 'Un reel da collegare a mano', { views: 4321, reach: 3000, saved: 20, shares: 8, metriche_stato: 'lette', metriche_il: new Date().toISOString() })
  const nome = `E2E pubblicati ${RUN} da montare`
  const id = await creaContenuto(nome, { stato: 'to_be_edited', post_date: null, view_count: 9 })
  // a carousel topic is not offered for a reel
  const altro = `E2E pubblicati ${RUN} carosello`
  await creaContenuto(altro, { tipo: 'carousel' })

  await accedi(page, 'marketing')
  await apriPagina(page, RUN)
  await riga(page, 10).getByTestId('collega').click()
  const foglio = page.getByTestId('foglio-collega')
  await expect(foglio).toBeVisible()
  await foglio.getByLabel('Cerca per Name').fill(`${RUN} `)
  await expect(foglio.getByRole('button', { name: `Collega e segna Posted a «${nome}»` })).toBeVisible()
  await expect(foglio.getByRole('button', { name: new RegExp(altro) })).toHaveCount(0)
  await foglio.getByRole('button', { name: `Collega e segna Posted a «${nome}»` }).click()

  await expect(page.locator('[data-sonner-toast]').getByText(`Collegato a «${nome}».`)).toBeVisible()
  await expect(foglio).toBeHidden()
  // the row says it at once: the content's Name, no more «Collega»
  await expect(riga(page, 10).getByTestId('cella-piano').getByRole('link', { name: nome, exact: true })).toBeVisible()
  await expect(riga(page, 10).getByTestId('collega')).toHaveCount(0)
  const dopo = await contenuto(id)
  expect(dopo).toMatchObject({ url: permalink(10), stato: 'posted', post_date: ieri() })
  // the View Count of the content is now the views of the post, and says so
  expect(dopo).toMatchObject({ view_count: 4321, view_count_da_instagram: true })

  await page.locator('[data-sonner-toast]').filter({ hasText: 'Collegato a' }).getByRole('button', { name: 'Annulla' }).click()
  await expect(toast(page, 'Collegamento annullato.')).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBeNull()
  // unlinked again: the number stays (it was Instagram's), written by hand from now on
  await expect.poll(async () => (await contenuto(id)).view_count_da_instagram).toBe(false)
  await expect(riga(page, 10).getByTestId('collega')).toBeVisible()
})

test('il pannello del reel: «Nel Piano editoriale» con «Collega a un contenuto», poi «Scollega» e «Annulla»', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(11, 'Un reel dal pannello', { views: 55, metriche_stato: 'lette', metriche_il: new Date().toISOString() })
  const nome = `E2E pubblicati ${RUN} dal pannello`
  const id = await creaContenuto(nome, { post_date: null })

  await accedi(page, 'marketing')
  await page.goto(`/marketing/pubblicati?reel=${mediaId(11)}&q=${RUN}`)
  const p = page.getByTestId('pannello-reel')
  await expect(p).toBeVisible({ timeout: 60_000 })
  const nelPiano = p.getByTestId('nel-piano')
  await expect(nelPiano).toContainText('Questo post non è nel Piano editoriale')
  await nelPiano.getByTestId('collega-dal-pannello').click()
  await nelPiano.getByLabel('Cerca per Name').fill(nome)
  await nelPiano.getByRole('button', { name: `Collega a «${nome}»` }).click()
  await expect(page.locator('[data-sonner-toast]').getByText(`Collegato a «${nome}».`)).toBeVisible()
  await expect(p.getByTestId('nel-piano')).toContainText(`Collegato a ${nome}`)
  expect(await contenuto(id)).toMatchObject({ url: permalink(11), view_count: 55, view_count_da_instagram: true })

  // «Scollega» leaves a «no» for the pair and the toast has «Annulla»
  await p.getByRole('button', { name: `Scollega il post da «${nome}»` }).click()
  await expect(page.locator('[data-sonner-toast]').getByText(`Scollegato da «${nome}».`)).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBeNull()
  const rifiuti = () => dbLocale().from('marketing_abbinamenti_rifiutati').select('shortcode').eq('shortcode', codice(11)).eq('contenuto_id', id)
  await expect.poll(async () => (await rifiuti()).data?.length).toBe(1)
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Scollegato' }).getByRole('button', { name: 'Annulla' }).click()
  await expect(toast(page, 'Post di nuovo collegato.')).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBe(permalink(11))
  await expect.poll(async () => (await rifiuti()).data?.length).toBe(0)
})

test('View Count: da Instagram in sola lettura quando il contenuto è collegato, a mano quando non lo è; il giro lo aggiorna senza toccare updated_at', async ({ page }) => {
  test.setTimeout(180_000)
  await creaPost(20, 'Un reel con le views', { views: 777, metriche_stato: 'lette', metriche_il: new Date().toISOString() })
  await creaPost(21, 'Un reel senza statistiche lette')
  const collegato = `E2E pubblicati ${RUN} view count collegato`
  const libero = `E2E pubblicati ${RUN} view count libero`
  const senzaViews = `E2E pubblicati ${RUN} view count senza views`
  const idCollegato = await creaContenuto(collegato, { url: permalink(20), view_count: 5 })
  const idLibero = await creaContenuto(libero, { view_count: 55 })
  const idSenzaViews = await creaContenuto(senzaViews, { url: permalink(21), view_count: 12 })

  // the database filled it at once from the post's views; the one linked to a post not read keeps its own number
  expect(await contenuto(idCollegato)).toMatchObject({ view_count: 777, view_count_da_instagram: true })
  expect(await contenuto(idLibero)).toMatchObject({ view_count: 55, view_count_da_instagram: false })
  expect(await contenuto(idSenzaViews)).toMatchObject({ view_count: 12, view_count_da_instagram: false })

  await accedi(page, 'marketing')
  // the table: the number comes with its mark and its words, the hand-written one has none
  await page.goto(`/marketing/contenuti?q=${encodeURIComponent(`${RUN} view count`)}`)
  const tabella = page.getByRole('region', { name: 'Piano editoriale', exact: true })
  const cellaCollegato = tabella.locator(`tr[data-riga-contenuto="${idCollegato}"] [data-view-count]`)
  await expect(cellaCollegato).toHaveAttribute('data-view-count', 'da-instagram')
  await expect(cellaCollegato).toContainText('777')
  await expect(cellaCollegato).toContainText('Da Instagram: si aggiorna da solo')
  await expect(cellaCollegato).toHaveAttribute('title', 'Da Instagram: si aggiorna da solo')
  await expect(tabella.locator(`tr[data-riga-contenuto="${idLibero}"] [data-view-count]`)).toHaveAttribute('data-view-count', 'a-mano')

  // the panel: read only when linked, with the words; an input when not
  await tabella.getByRole('link', { name: collegato, exact: true }).click()
  const foglio = page.getByRole('dialog', { name: collegato, exact: true })
  const sola = foglio.getByTestId('view-count-da-instagram')
  await expect(sola).toContainText('777')
  await expect(sola).toContainText('Da Instagram: si aggiorna da solo')
  await expect(foglio.getByLabel('View Count', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)

  await tabella.getByRole('link', { name: libero, exact: true }).click()
  const foglioLibero = page.getByRole('dialog', { name: libero, exact: true })
  const campo = foglioLibero.getByLabel('View Count', { exact: true })
  await expect(campo).toHaveValue('55')
  await expect(foglioLibero).toContainText('Si compila da solo quando il contenuto ha il link di un reel')
  await campo.fill('60')
  await campo.press('Enter')
  await expect(toast(page, 'View Count: 60')).toBeVisible()
  await expect.poll(async () => (await contenuto(idLibero)).view_count).toBe(60)
  await page.keyboard.press('Escape')
  await expect(foglioLibero).toBeHidden()
  await expect(page).not.toHaveURL(/contenuto=/)

  // the run reads new views of the post: the View Count follows, and the content's version does not move
  const prima = (await contenuto(idCollegato)).updated_at
  const { error } = await dbLocale().from('instagram_contenuti').update({ views: 900 }).eq('shortcode', codice(20))
  if (error) throw error
  const dopo = await contenuto(idCollegato)
  expect(dopo).toMatchObject({ view_count: 900, view_count_da_instagram: true })
  expect(dopo.updated_at).toBe(prima)
  // views not read (null) never wipe the number
  await dbLocale().from('instagram_contenuti').update({ views: null }).eq('shortcode', codice(20))
  expect((await contenuto(idCollegato)).view_count).toBe(900)

  // a person pastes the link of the post that has views into the free content: it takes them at once, and becomes read only
  await creaPost(22, 'Un reel con le views da incollare', { views: 321, metriche_stato: 'lette', metriche_il: new Date().toISOString() })
  await page.goto(`/marketing/contenuti?contenuto=${idLibero}`)
  const foglioUrl = page.getByRole('dialog', { name: libero, exact: true })
  const url = foglioUrl.getByLabel('URL', { exact: true })
  await url.fill(permalink(22))
  await url.press('Enter')
  await expect.poll(async () => (await contenuto(idLibero)).view_count).toBe(321)
  expect((await contenuto(idLibero)).view_count_da_instagram).toBe(true)
  await page.reload()
  await expect(page.getByRole('dialog', { name: libero, exact: true }).getByTestId('view-count-da-instagram')).toContainText('321')
})

test('dal pannello del contenuto: «Usa la data di Instagram» e «Scollega»; «Elimina» dice che il post resta tra i Pubblicati', async ({ page }) => {
  test.setTimeout(120_000)
  const due = aggiungiGiorni(oggiRoma(), -2)
  await creaPost(30, 'Il reel di prova del pannello del contenuto')
  const nome = `E2E pubblicati ${RUN} contenuto collegato`
  const id = await creaContenuto(nome, { url: permalink(30), post_date: due })

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?vista=tabella&q=${encodeURIComponent(nome)}`)
  await page.getByRole('region', { name: 'Piano editoriale', exact: true }).getByRole('link', { name: nome, exact: true }).click()
  const foglio = page.getByRole('dialog', { name: nome, exact: true })
  const blocco = foglio.getByRole('region', { name: 'Post su Instagram' })
  await expect(blocco).toContainText('Pubblicato su Instagram')
  // the proposals are gone: a content without a post shows no block
  await expect(blocco.getByRole('link', { name: 'Apri nei Pubblicati' })).toHaveAttribute('href', new RegExp(`/marketing/pubblicati\\?reel=${mediaId(30)}`))

  await foglio.getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domanda = page.getByRole('dialog', { name: `Eliminare il contenuto «${nome}»?` })
  await expect(domanda).toContainText('Il post di Instagram collegato resta tra i Pubblicati, senza contenuto.')
  await expect(domanda).not.toContainText('Da collegare')
  await domanda.getByRole('button', { name: 'Annulla' }).click()

  await expect(blocco).toContainText(`Post Date ${formatData(due)}, su Instagram ${formatData(ieri())}`)
  await blocco.getByRole('button', { name: 'Usa la data di Instagram' }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, `Post Date: ${formatData(ieri())}`)).toBeVisible()
  expect((await contenuto(id)).post_date).toBe(ieri())

  const scollega = blocco.getByRole('button', { name: `Scollega il post da «${nome}»` })
  await expect(scollega).toHaveAttribute('aria-disabled', 'false')
  await scollega.focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, `Scollegato: non lo ripropongo per «${nome}».`)).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBeNull()
  // the block goes away with the link: nothing proposes another post
  await expect(blocco).toContainText('Scollegato')
})

test('«Collegato da solo» e «Non più su Instagram» nel pannello del contenuto; un post non più su Instagram non è tra i Pubblicati', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(40, 'Il reel di prova collegato dal giro')
  const daSolo = `E2E pubblicati ${RUN} collegato dal giro`
  const idDaSolo = await creaContenuto(daSolo, { url: permalink(40) })
  const { error } = await dbLocale().from('marketing_abbinamenti').upsert({
    shortcode: codice(40), contenuto_id: idDaSolo, esito: 'automatico', punteggio: 92, somiglianza: 0.81, giorni: 0, motivi: ['stessa_data', 'didascalia_simile'],
  })
  if (error) throw error
  await creaPost(41, 'Un reel di prova archiviato su Instagram', { eliminato_il: new Date().toISOString() })
  const sparito = `E2E pubblicati ${RUN} non più su Instagram`
  const idSparito = await creaContenuto(sparito, { url: permalink(41) })

  await accedi(page, 'marketing')
  await apriPagina(page, RUN)
  await expect(riga(page, 40)).toBeVisible()
  await expect(riga(page, 41)).toHaveCount(0)

  await page.goto(`/marketing/contenuti?contenuto=${idDaSolo}`)
  await expect(page.getByRole('dialog', { name: daSolo, exact: true }).getByRole('region', { name: 'Post su Instagram' })).toContainText(
    'Collegato da solo: stessa data e didascalia simile.',
  )
  await page.goto(`/marketing/contenuti?contenuto=${idSparito}`)
  const foglioSparito = page.getByRole('dialog', { name: sparito, exact: true })
  await expect(foglioSparito.getByRole('region', { name: 'Post su Instagram' })).toContainText('Il post non è più su Instagram (eliminato o archiviato).')
  await foglioSparito.getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domanda = page.getByRole('dialog', { name: `Eliminare il contenuto «${sparito}»?` })
  await expect(domanda).toContainText('Su Instagram e su Notion non cambia niente.')
  await expect(domanda).not.toContainText('Pubblicati')
  await domanda.getByRole('button', { name: 'Annulla' }).click()
})

test('il video editor collega ma non ha «Aggiorna da Instagram»; il setter non entra', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(50, 'Il reel di prova per il video editor')
  const nome = `E2E pubblicati ${RUN} editor`
  const id = await creaContenuto(nome, { post_date: null })

  await accedi(page, 'editor')
  await apriPagina(page, RUN)
  await expect(page.getByRole('button', { name: 'Aggiorna da Instagram' })).toHaveCount(0)
  await expect(page.getByTestId('stato-post-instagram')).toContainText('Si aggiornano ogni notte.')
  await riga(page, 50).getByTestId('collega').click()
  await page.getByTestId('foglio-collega').getByRole('button', { name: `Collega a «${nome}»` }).click()
  await expect.poll(async () => (await contenuto(id)).url).toBe(permalink(50))
  // nor from the route the button calls: refused before any run
  const risposta = await page.request.post('/api/marketing/instagram/aggiorna', { headers: { origin: new URL(page.url()).origin } })
  expect(risposta.status()).toBe(403)
  expect(await risposta.json()).toEqual({ errore: 'Aggiorna da Instagram lo usano l’admin e il marketing.' })
  await page.context().clearCookies()

  for (const ruolo of ['setter', 'closer'] as const) {
    await accedi(page, ruolo)
    await page.goto('/marketing/pubblicati')
    await expect(page).not.toHaveURL(/\/marketing/)
    await expect(page.getByText('Pubblicati', { exact: true })).toHaveCount(0)
    await page.context().clearCookies()
  }
})

test('i vecchi indirizzi di Post di Instagram e Analisi portano ai Pubblicati con un redirect permanente', async ({ page }) => {
  const id = '17900000000000001'
  const uuid = '7e1f3a2b-0000-4000-8000-000000000001'
  const casi: [string, string][] = [
    ['/marketing/instagram', '/marketing/pubblicati'],
    ['/marketing/analisi', '/marketing/pubblicati'],
    [`/marketing/analisi?reel=${id}&scheda=perche&periodo=90`, `/marketing/pubblicati?periodo=90&reel=${id}&scheda=perche`],
    ['/marketing/analisi?verdetto=cambiare&senza_contenuto=1&ordine=views', '/marketing/pubblicati?cambiare=1&piano=fuori'],
    [`/marketing/instagram?contenuto=${uuid}`, `/marketing/pubblicati?contenuto=${uuid}`],
  ]
  // the redirect comes before the login: a person not logged in goes to the new address after the login
  for (const [vecchio, nuovo] of casi) {
    const risposta = await page.request.get(vecchio, { maxRedirects: 0 })
    expect(risposta.status(), vecchio).toBe(308)
    const dove = new URL(risposta.headers().location, 'http://localhost')
    expect(`${dove.pathname}${dove.search}`, vecchio).toBe(nuovo)
  }
  await accedi(page, 'admin')
  await page.goto(`/marketing/analisi?reel=${id}`)
  await expect(page).toHaveURL(new RegExp(`/marketing/pubblicati\\?reel=${id}$`))
  await expect(page.getByTestId('pannello-reel')).toBeVisible({ timeout: 60_000 })
  await page.goto('/marketing/instagram')
  await expect(page).toHaveURL(/\/marketing\/pubblicati$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Pubblicati' })).toBeVisible()
  // the Analisi and Post di Instagram tabs and menu items are gone
  await expect(schede(page).getByRole('link')).toHaveText(['Piano editoriale', 'Pubblicati', 'Spunti'])
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Post di Instagram|^Analisi/ })).toHaveCount(0)
})

test('«Aggiorna da Instagram» senza token: la frase del token mancante, mai una chiamata a Meta', async ({ page }) => {
  test.setTimeout(120_000)
  const { data: token } = await dbLocale().rpc('instagram_token')
  test.skip(Boolean(token), 'Nel Vault locale c’è un token: il bottone chiamerebbe Instagram.')

  await accedi(page, 'marketing')
  await apriPagina(page)
  await page.getByRole('button', { name: 'Aggiorna da Instagram' }).click()
  await expect(page.getByText('Instagram non è collegato: l’admin incolla il token in Impostazioni › Chiavi e collegamenti.').first()).toBeVisible({ timeout: 30_000 })
})

test('dopo un giro fallito: «Ultimo tentativo», mai «Aggiornati»; «Aggiorna da Instagram» riparte subito', async ({ page }) => {
  test.setTimeout(120_000)
  const errore = 'Instagram non è collegato: l’admin incolla il token in Impostazioni › Chiavi e collegamenti.'
  const { error } = await dbLocale()
    .from('instagram_contenuti_stato')
    .update({
      ultimo_giro_il: new Date(Date.now() - 60_000).toISOString(),
      ultimo_giro_esito: 'fallito',
      // failed for the token: the only cause that lets the next tap start at once (Meta's limits wait 5 minutes)
      ultimo_giro_causa: 'senza_token',
      ultimo_giro_motivo: 'manuale',
      ultimo_giro_letti: 0,
      ultimo_errore: errore,
      ultimo_errore_il: new Date().toISOString(),
    })
    .eq('id', true)
  if (error) throw error

  await accedi(page, 'marketing')
  await apriPagina(page)
  const stato = page.getByTestId('stato-post-instagram')
  await expect(stato).toContainText(/Ultimo tentativo oggi alle \d{2}:\d{2}: non riuscito/)
  await expect(stato).not.toContainText('Aggiornati')
  await expect(stato).not.toContainText('post letti')
  await expect(stato).toContainText(errore)

  const { data: token } = await dbLocale().rpc('instagram_token')
  test.skip(Boolean(token), 'Nel Vault locale c’è un token: il bottone chiamerebbe Instagram.')
  await page.getByRole('button', { name: 'Aggiorna da Instagram' }).click()
  await expect(toast(page, errore)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-sonner-toast]').getByText(/riprova tra/)).toHaveCount(0)
})

test('senza le statistiche di Instagram: i numeri restano «–», la pagina lo dice e il View Count a mano resta', async ({ page }) => {
  test.setTimeout(120_000)
  const db = dbLocale()
  // every post of the page as not read: the line says why, nothing is invented
  const { data: tutti } = await db.from('instagram_contenuti').select('media_id, views, reach, saved, shares, metriche_stato')
  try {
    await db
      .from('instagram_contenuti')
      .update({ views: null, reach: null, saved: null, shares: null, metriche_stato: 'senza_permesso' })
      .not('media_id', 'is', null)
    await accedi(page, 'marketing')
    await apriPagina(page)
    await expect(page.getByTestId('pubblicati-senza-statistiche')).toContainText('Views, Reach, Salvati e Condivisioni arrivano dalle statistiche di Instagram')
    await expect(page.getByTestId('pubblicati-senza-statistiche')).toContainText('il View Count del Piano editoriale si scrive a mano')
    await expect(page.getByTestId('num-views').first()).toHaveText('–')
  } finally {
    for (const p of tutti ?? []) {
      await db
        .from('instagram_contenuti')
        .update({ views: p.views, reach: p.reach, saved: p.saved, shares: p.shares, metriche_stato: p.metriche_stato })
        .eq('media_id', p.media_id)
    }
  }
})

test('sul telefono: card, niente scroll di lato, bottoni da 44 px, nei due temi; «Pubblicati» accesa in «Altro»', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000)
  await creaPost(60, 'Un reel di prova con una didascalia lunga '.repeat(8), { views: 1234, reach: 987, saved: 12, shares: 5, metriche_stato: 'lette', metriche_il: new Date().toISOString() })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const tema of ['scuro', 'chiaro']) {
    await context.addCookies([{ name: 'alpha_tema', value: tema, url: baseURL! }])
    await accedi(page, 'marketing')
    await apriPagina(page, RUN)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), tema).toBe(tema === 'chiaro' ? 'rgb(245, 239, 232)' : 'rgb(18, 18, 20)')
    expect(await page.evaluate(() => document.documentElement.scrollWidth), tema).toBeLessThanOrEqual(390)
    const card = page.locator(`li[data-riga-post="${mediaId(60)}"]`)
    await expect(card).toBeVisible()
    await expect(card).toContainText('1.234')
    await expect(card.getByTestId('collega')).toBeVisible()
    for (const bottone of await card.getByRole('button').all()) expect((await bottone.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
    for (const link of await card.getByRole('link').all()) expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5)
    // the table is not on screen at 390 px
    await expect(page.getByTestId('tabella-pubblicati')).toBeHidden()
    // the filters are one button; the sheet opens, scrolls nothing sideways and closes with the focus back on the button
    await page.getByTestId('filtri-apri').click()
    const foglio = page.getByTestId('filtri-foglio')
    await expect(foglio.getByRole('combobox', { name: 'Periodo' })).toBeVisible()
    await foglio.getByRole('button', { name: 'Fatto' }).click()
    await expect(foglio).toBeHidden()
    // «Collega»: the sheet takes the screen
    await card.getByTestId('collega').click()
    const collega = page.getByTestId('foglio-collega')
    await expect(collega).toBeVisible()
    expect((await collega.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(389)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), tema).toBeLessThanOrEqual(390)
    await page.keyboard.press('Escape')
    await expect(collega).toBeHidden()
    await page.context().clearCookies()
  }
  await context.addCookies([{ name: 'alpha_tema', value: 'scuro', url: baseURL! }])
  await accedi(page, 'marketing')
  await apriPagina(page)
  const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
  await barra.getByRole('button', { name: /^Altro/ }).click()
  const altro = page.getByRole('dialog', { name: 'Altro' })
  await expect(altro.getByRole('group', { name: 'Marketing' }).getByRole('link', { name: 'Pubblicati', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')
})

test('a 1280 px la tabella sta nella pagina: nessuno scroll di lato, nei due temi', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000)
  for (const tema of ['scuro', 'chiaro']) {
    await context.addCookies([{ name: 'alpha_tema', value: tema, url: baseURL! }])
    await accedi(page, 'marketing')
    await apriPagina(page)
    await expect(page.getByTestId('tabella-pubblicati')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth), tema).toBeLessThanOrEqual(1280)
    await page.context().clearCookies()
  }
})

test('il giro intero contro il Graph finto: i post letti, e il View Count del contenuto collegato segue le views', async ({ page }) => {
  test.setTimeout(180_000)
  const finto = process.env.E2E_GRAPH_FINTO
  test.skip(!finto, 'Serve il dev server avviato con E2E_GRAPH_FINTO e e2e/graph-finto.mjs')
  const db = dbLocale()
  const { data: token } = await db.rpc('instagram_token')
  test.skip(Boolean(token), 'Nel Vault locale c’è già un token.')
  const risposta = await fetch(`${finto}/__azzera`).catch(() => null)
  test.skip(!risposta?.ok, 'Il Graph finto non risponde.')

  // The fake Graph returns only its own posts: a complete listing marks every other post as no longer on Instagram
  // and drops their proposals. Both are put back at the end, so the next tests and the screenshots see the seed.
  const { data: presenti, error: errorePresenti } = await db.from('instagram_contenuti').select('media_id').is('eliminato_il', null)
  if (errorePresenti) throw errorePresenti
  const { data: propostePrima, error: erroreProposteePrima } = await db.from('marketing_abbinamenti').select('*').eq('esito', 'proposto')
  if (erroreProposteePrima) throw erroreProposteePrima
  // a content that points at a post the fake Graph will give (GraphFinto02, with its statistics) before the post is read at all
  const nome = `E2E pubblicati ${RUN} giro finto`
  const idGiro = await creaContenuto(nome, { url: 'https://www.instagram.com/reel/GraphFinto02/', view_count: 3 })
  expect(await contenuto(idGiro)).toMatchObject({ view_count: 3, view_count_da_instagram: false })

  // the test without a token has just run a manual update: within 5 minutes the lease would answer "appena fatto"
  const { error: erroreStato } = await db.from('instagram_contenuti_stato').update({ ultimo_giro_il: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', true)
  if (erroreStato) throw erroreStato

  // a test token in the local Vault with the admin's session, removed at the end (it never reaches Meta)
  const admin = await sessioneAdmin()
  const { error } = await admin.rpc('instagram_imposta_token', { p_token: `IGAAe2eFinto${RUN}QwErTyUiOpAsDf` })
  if (error) throw error
  try {
    await accedi(page, 'marketing')
    await apriPagina(page)
    await page.getByRole('button', { name: 'Aggiorna da Instagram' }).click()
    await expect(page.getByText(/^Aggiornato: 5 post letti/)).toBeVisible({ timeout: 60_000 })
    const conteggio = (await (await fetch(`${finto}/__richieste`)).json()) as { totale: number }
    expect(conteggio.totale).toBeGreaterThan(0)

    // the run wrote the views of the post and the content took them: Instagram's number, not the hand-written one
    const { data: post } = await db.from('instagram_contenuti').select('views').eq('shortcode', 'GraphFinto02').single()
    expect(post?.views).toBeGreaterThan(0)
    await expect.poll(async () => (await contenuto(idGiro)).view_count).toBe(post?.views)
    expect((await contenuto(idGiro)).view_count_da_instagram).toBe(true)
    // and the Pubblicati page shows the same number in the row of the post
    await apriPagina(page)
    await expect(page.locator('tr[data-riga-post]').filter({ hasText: nome }).locator('td[data-colonna="views"]')).toContainText(String(post?.views).replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
  } finally {
    await admin.rpc('instagram_togli_token')
    await db.from('instagram_contenuti').delete().like('shortcode', 'GraphFinto%')
    const ids = (presenti ?? []).map((p) => p.media_id)
    if (ids.length) await db.from('instagram_contenuti').update({ eliminato_il: null }).in('media_id', ids)
    await db.from('marketing_abbinamenti').delete().eq('esito', 'proposto')
    if (propostePrima?.length) await db.from('marketing_abbinamenti').upsert(propostePrima)
  }
})
