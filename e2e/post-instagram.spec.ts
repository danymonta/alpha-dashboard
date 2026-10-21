import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import type { Database } from '../lib/supabase/database.types'
import { dbLocale } from './db'
import { accedi, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * «Post di Instagram» (1.33.0): the posts of the account and their links to
 * the content calendar. Posts, contents and proposals are written with the
 * local service role and removed at the end; every caption and shortcode is
 * invented. Instagram is never called: "Aggiorna da Instagram" is tapped only
 * with an empty local Vault (the sentence of the missing token), or against
 * the fake Graph API (e2e/graph-finto.mjs) when the dev server and this run
 * have E2E_GRAPH_FINTO.
 */

const STAMP = Date.now()
const RUN = STAMP.toString(36)
const codice = (n: number) => `E2e${RUN}P${n}`
const permalink = (n: number) => `https://www.instagram.com/reel/${codice(n)}/`
const ieri = () => aggiungiGiorni(oggiRoma(), -1)

type StatoGiro = Database['public']['Tables']['instagram_contenuti_stato']['Row']
type Abbinamento = Database['public']['Tables']['marketing_abbinamenti']['Row']
let statoIniziale: StatoGiro | null = null
let proposteIniziali: Abbinamento[] = []
const contenutiCreati: string[] = []

/** A post of the account, published yesterday at 18:30 in Rome (a reel unless said). */
async function creaPost(n: number, didascalia: string, extra: Partial<Database['public']['Tables']['instagram_contenuti']['Insert']> = {}) {
  const { error } = await dbLocale()
    .from('instagram_contenuti')
    .insert({
      media_id: `1795${STAMP}${n}`,
      shortcode: codice(n),
      permalink: permalink(n),
      media_type: 'VIDEO',
      media_product_type: 'REELS',
      reel: true,
      pubblicato_il: `${ieri()}T16:30:00Z`,
      didascalia,
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

/** A proposal of the run, as the service role writes it. */
async function proponi(n: number, contenutoId: string) {
  const { error } = await dbLocale().from('marketing_abbinamenti').upsert({
    shortcode: codice(n),
    contenuto_id: contenutoId,
    esito: 'proposto',
    punteggio: 76,
    somiglianza: 0.62,
    giorni: 0,
    motivi: ['stessa_data', 'didascalia_simile'],
  })
  if (error) throw error
}

async function contenuto(id: string) {
  const { data, error } = await dbLocale().from('marketing_contenuti').select('url, stato, post_date').eq('id', id).single()
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
const daCollegare = (page: Page) => page.locator('section[aria-labelledby="titolo-da-collegare"]')
const collegati = (page: Page) => page.locator('section[aria-labelledby="titolo-collegati"]')
const scheda = (page: Page, n: number) => page.locator(`[data-post="${codice(n)}"]`)

async function apriPagina(page: Page) {
  await page.goto('/marketing/instagram')
  await expect(page.getByRole('heading', { level: 1, name: 'Post di Instagram' })).toBeVisible({ timeout: 60_000 })
}

test.beforeAll(async () => {
  const db = dbLocale()
  const { data, error } = await db.from('instagram_contenuti_stato').select('*').maybeSingle()
  if (error) throw error
  statoIniziale = data
  // «Scollega», «Crea il contenuto» and «Rimetti» compute the proposals again: put them back at the end
  const { data: proposte, error: erroreProposte } = await db.from('marketing_abbinamenti').select('*').eq('esito', 'proposto')
  if (erroreProposte) throw erroreProposte
  proposteIniziali = proposte.filter((p) => !p.shortcode.startsWith('E2e'))
})

test.afterAll(async () => {
  const db = dbLocale()
  // the contents made from a post, by their URL
  const { data: daPost } = await db.from('marketing_contenuti').select('id').like('url', `%E2e${RUN}%`)
  const ids = [...contenutiCreati, ...(daPost ?? []).map((c) => c.id)]
  if (ids.length) await db.from('marketing_contenuti').delete().in('id', ids)
  await db.from('marketing_abbinamenti_rifiutati').delete().like('shortcode', `E2e${RUN}%`)
  await db.from('instagram_contenuti').delete().like('shortcode', `E2e${RUN}%`)
  // the proposals of the seed's posts as they were before this file
  await db.from('marketing_abbinamenti').delete().eq('esito', 'proposto')
  if (proposteIniziali.length) await db.from('marketing_abbinamenti').upsert(proposteIniziali)
  // the run's state as it was (spec R15: no error and no "appena fatto" left behind)
  if (statoIniziale) {
    const { id: _id, created_at: _c, updated_at: _u, ...campi } = statoIniziale
    void _id
    void _c
    void _u
    await db.from('instagram_contenuti_stato').update(campi).eq('id', true)
  }
})

test('il marketing collega un post proposto: l’URL nel contenuto, la scheda passa in Collegati', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(1, 'Trazioni senza sbarra, il primo esercizio di prova.')
  await creaPost(7, 'Un secondo post di prova, senza contenuto.')
  const id = await creaContenuto(`E2E post ${RUN} trazioni`)
  await proponi(1, id)

  await accedi(page, 'marketing')
  await apriPagina(page)
  // «Piano editoriale» stays lit on this tab of the area, and the tab says how many to link
  await expect(page.getByRole('navigation', { name: 'Sezioni del Marketing' }).getByRole('link', { name: /^Post di Instagram, \d+ da collegare$/ })).toHaveAttribute('aria-current', 'page')

  const card = daCollegare(page).locator(`[data-post="${codice(1)}"]`)
  await expect(card).toContainText('Forse è:')
  await expect(card).toContainText(`E2E post ${RUN} trazioni`)
  await expect(card).toContainText('stessa data, didascalia simile')
  await card.getByRole('button', { name: `Collega a «E2E post ${RUN} trazioni»` }).click()

  await expect(page.getByText(`Collegato a «E2E post ${RUN} trazioni».`, { exact: true })).toBeVisible()
  await expect(card).toBeHidden()
  await expect(collegati(page).locator(`[data-post="${codice(1)}"]`)).toContainText(`E2E post ${RUN} trazioni`)
  expect(await contenuto(id)).toMatchObject({ url: permalink(1), stato: 'posted', post_date: ieri() })
  // the focus is on a card title or on the section's title, never lost
  const focus = await page.evaluate(() => document.activeElement?.closest('section')?.getAttribute('aria-labelledby'))
  expect(focus).toBe('titolo-da-collegare')
})

test('«Collega e segna Posted» su un contenuto da montare: Posted e la Post Date del post', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(2, 'Il gancio di prova del secondo reel.')
  const id = await creaContenuto(`E2E post ${RUN} da montare`, { stato: 'to_be_edited', post_date: null })
  await proponi(2, id)

  await accedi(page, 'marketing')
  await apriPagina(page)
  const card = scheda(page, 2)
  await card.getByRole('button', { name: `Collega e segna Posted a «E2E post ${RUN} da montare»` }).click()
  await expect(page.getByText(`Collegato a «E2E post ${RUN} da montare».`, { exact: true })).toBeVisible()
  await expect.poll(() => contenuto(id)).toMatchObject({ url: permalink(2), stato: 'posted', post_date: ieri() })
})

test('«Scollega» lascia il no, «Annulla» lo toglie e ricollega, col segno «Collegato da solo» com’era', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(3, 'Un reel di prova già collegato.')
  const id = await creaContenuto(`E2E post ${RUN} collegato`, { url: permalink(3) })
  // the run had linked it
  const { error } = await dbLocale().from('marketing_abbinamenti').upsert({
    shortcode: codice(3),
    contenuto_id: id,
    esito: 'automatico',
    punteggio: 88,
    somiglianza: 0.77,
    giorni: 0,
    motivi: ['stessa_data', 'didascalia_simile'],
  })
  if (error) throw error
  const segno = async () =>
    (await dbLocale().from('v_instagram_post').select('collegato_da_solo').eq('shortcode', codice(3)).single()).data?.collegato_da_solo

  await accedi(page, 'marketing')
  await apriPagina(page)
  const riga = collegati(page).locator(`[data-post="${codice(3)}"]`)
  await riga.getByRole('button', { name: `Scollega il post da «E2E post ${RUN} collegato»` }).click()
  await expect(page.getByText(`Scollegato: non lo ripropongo per «E2E post ${RUN} collegato».`, { exact: true })).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBeNull()
  const rifiuti = () =>
    dbLocale().from('marketing_abbinamenti_rifiutati').select('shortcode').eq('shortcode', codice(3)).eq('contenuto_id', id)
  await expect.poll(async () => (await rifiuti()).data?.length).toBe(1)

  await page
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Scollegato' })
    .getByRole('button', { name: 'Annulla' })
    .click()
  await expect(page.getByText('Post di nuovo collegato.')).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBe(permalink(3))
  await expect.poll(async () => (await rifiuti()).data?.length).toBe(0)
  // everything as before the tap: «Collegato da solo» too
  await expect.poll(segno).toBe(true)
  await expect(collegati(page).locator(`[data-post="${codice(3)}"]`)).toContainText('Collegato da solo')
})

test('«Crea il contenuto» dal post: un contenuto Posted con l’URL, aperto nel pannello', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(4, `Un reel nato senza calendario ${RUN}\n#prova`)

  await accedi(page, 'marketing')
  await apriPagina(page)
  const card = scheda(page, 4)
  await expect(card).toContainText('Nessun contenuto simile nel calendario.')
  await card.getByRole('button', { name: /^Crea il contenuto dal post del / }).click()
  await expect(page.getByText('Contenuto creato dal post: completa Reel Type e Format.')).toBeVisible()

  const { data } = await dbLocale()
    .from('marketing_contenuti')
    .select('id, nome, stato, post_date, url, bozza')
    .eq('url', permalink(4))
    .single()
  expect(data).toMatchObject({ nome: `Un reel nato senza calendario ${RUN}`, stato: 'posted', post_date: ieri(), bozza: null })
  // the panel opens on it, with the address to share
  await expect(page).toHaveURL(new RegExp(`contenuto=${data?.id}`))
  await expect(page.getByRole('dialog')).toContainText(`Un reel nato senza calendario ${RUN}`)
})

test('«Crea il contenuto» dal post sul telefono: il toast va in basso e la X del pannello lo chiude subito', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(15, `Un reel dal telefono senza calendario ${RUN}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'marketing')
  await apriPagina(page)
  await scheda(page, 15).getByRole('button', { name: /^Crea il contenuto dal post del / }).click()
  await expect(toast(page, 'Contenuto creato dal post: completa Reel Type e Format.')).toBeVisible()
  const foglio = page.getByRole('dialog', { name: `Un reel dal telefono senza calendario ${RUN}`, exact: true })
  await expect(foglio).toBeVisible()

  // the tap where the X is, once the panel is in place (it slides in for 200 ms), while the toast is still there
  const chiudi = foglio.getByRole('button', { name: 'Chiudi il contenuto' })
  let x = (await chiudi.boundingBox())!
  await expect
    .poll(
      async () => {
        const ora = (await chiudi.boundingBox())!
        const fermo = Math.abs(ora.x - x.x) < 0.5 && Math.abs(ora.y - x.y) < 0.5
        x = ora
        return fermo
      },
      { intervals: [100] },
    )
    .toBe(true)
  await expect(toast(page, 'Contenuto creato dal post: completa Reel Type e Format.')).toBeVisible()
  const scatola = (await page.locator('[data-sonner-toast]').first().boundingBox())!
  expect(x.y + x.height <= scatola.y || x.y >= scatola.y + scatola.height, 'il toast copre la X').toBe(true)
  await page.mouse.click(x.x + x.width / 2, x.y + x.height / 2)
  await expect(foglio).toBeHidden({ timeout: 1500 })
})

test('«Annulla» di «Scollega» su un post collegato a mano: un segno «Collegato da solo» mandato dal browser non si scrive', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await creaPost(16, 'Un reel di prova collegato a mano.')
  const nome = `E2E post ${RUN} segno dal browser`
  const id = await creaContenuto(nome, { url: permalink(16) })
  const segno = async () =>
    (await dbLocale().from('v_instagram_post').select('collegato_da_solo').eq('shortcode', codice(16)).single()).data?.collegato_da_solo
  expect(await segno()).toBe(false)

  await accedi(page, 'editor')
  await page.goto(`/marketing/contenuti?contenuto=${id}`)
  const foglio = page.getByRole('dialog', { name: nome, exact: true })
  await foglio.getByRole('region', { name: 'Post su Instagram' }).getByRole('button', { name: `Scollega il post da «${nome}»` }).click()
  const scollegato = page.locator('[data-sonner-toast]').filter({ hasText: 'Scollegato' })
  await expect(scollegato).toBeVisible()
  await expect.poll(async () => (await contenuto(id)).url).toBeNull()

  // from here on the browser adds a «sign» of its own to every action on this content
  let riscritte = 0
  await page.route('**/*', async (route) => {
    const richiesta = route.request()
    const corpo = richiesta.postData()
    const coppia = `"contenuto_id":"${id}"`
    if (richiesta.method() === 'POST' && richiesta.headers()['next-action'] && corpo?.includes(coppia)) {
      riscritte++
      const falso = `${coppia},"automatico":{"punteggio":100,"somiglianza":1,"giorni":0,"motivi":["stessa_data","didascalia_simile","unico_del_giorno"]}`
      return route.continue({ postData: corpo.replace(coppia, falso) })
    }
    return route.continue()
  })
  await scollegato.getByRole('button', { name: 'Annulla' }).click()
  await expect(toast(page, 'Post di nuovo collegato.')).toBeVisible()
  expect(riscritte).toBeGreaterThan(0)
  await expect.poll(async () => (await contenuto(id)).url).toBe(permalink(16))
  // linked by hand it was, linked by hand it stays
  expect(await segno()).toBe(false)
  const { data: righe } = await dbLocale()
    .from('marketing_abbinamenti')
    .select('shortcode')
    .eq('contenuto_id', id)
    .eq('esito', 'automatico')
  expect(righe).toEqual([])
})

test('«Non va nel calendario» e «Rimetti»', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(5, 'Un post personale di prova.', { media_type: 'IMAGE', media_product_type: 'FEED', reel: false, permalink: `https://www.instagram.com/p/${codice(5)}/` })

  await accedi(page, 'marketing')
  await apriPagina(page)
  await scheda(page, 5).getByRole('button', { name: /^Non va nel calendario: il post del / }).click()
  await expect(page.getByText('Fuori dal calendario: lo trovi in fondo alla pagina.')).toBeVisible()
  await expect(daCollegare(page).locator(`[data-post="${codice(5)}"]`)).toBeHidden()
  const esclusi = page.locator('section[aria-labelledby="titolo-esclusi"]')
  await esclusi.locator('summary').click()
  await esclusi.locator(`[data-post="${codice(5)}"]`).getByRole('button', { name: /^Rimetti il post del / }).click()
  await expect(page.getByText('Rimesso: lo trovi in «Da collegare».')).toBeVisible()
  await expect(daCollegare(page).locator(`[data-post="${codice(5)}"]`)).toBeVisible()
})

test('«Scegli un contenuto» per un post senza proposte; il Name di una proposta apre il pannello qui', async ({ page }) => {
  test.setTimeout(120_000)
  const tre = aggiungiGiorni(oggiRoma(), -3)
  await creaPost(10, 'Un post di prova senza proposte.')
  const scelto = `E2E post ${RUN} scelto a mano`
  const id = await creaContenuto(scelto, { post_date: tre })
  await creaPost(11, 'Un post di prova con una proposta.')
  const proposto = `E2E post ${RUN} proposto`
  const idProposto = await creaContenuto(proposto)
  await proponi(11, idProposto)

  await accedi(page, 'marketing')
  await apriPagina(page)

  // the Name of a proposal opens the content in its panel, without leaving the page
  await scheda(page, 11).getByRole('link', { name: proposto, exact: true }).click()
  const foglio = page.getByRole('dialog', { name: proposto, exact: true })
  await expect(foglio).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/marketing/instagram\\?contenuto=${idProposto}$`))
  // the page is still there under the panel (hidden from the accessibility tree while the panel is open)
  await expect(page.locator('h1', { hasText: 'Post di Instagram' })).toBeAttached()
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await expect(page).toHaveURL(/\/marketing\/instagram$/)

  // a post with no proposal: «Scegli un contenuto», found by its Name
  await scheda(page, 10).getByRole('button', { name: /^Scegli un contenuto per il post del / }).click()
  const scelta = page.getByRole('dialog', { name: 'Scegli un contenuto' })
  await scelta.getByLabel('Cerca per Name').fill(`${RUN} scelto`)
  await expect(scelta.getByRole('status')).toHaveText('1 contenuto')
  await scelta.getByRole('button', { name: `Collega a «${scelto}»` }).click()
  await expect(toast(page, `Collegato a «${scelto}».`)).toBeVisible()
  await expect(daCollegare(page).locator(`[data-post="${codice(10)}"]`)).toBeHidden()
  await expect(collegati(page).locator(`[data-post="${codice(10)}"]`)).toContainText(scelto)
  // the Post Date stays as it was: it is written only when it is empty
  expect(await contenuto(id)).toMatchObject({ url: permalink(10), stato: 'posted', post_date: tre })
})

test('dal pannello del contenuto: «Forse è questo post», Collega, «Usa la data di Instagram», Scollega', async ({ page }) => {
  test.setTimeout(120_000)
  const due = aggiungiGiorni(oggiRoma(), -2)
  await creaPost(9, 'Il reel di prova del pannello, pubblicato ieri.')
  const nome = `E2E post ${RUN} dal pannello`
  const id = await creaContenuto(nome, { post_date: due })
  await proponi(9, id)

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?vista=tabella&q=${encodeURIComponent(nome)}`)
  // by CSS: with the panel open the page under it is out of the accessibility tree
  const voce = page.locator('nav[aria-label="Sezioni del Marketing"] a[href="/marketing/instagram"]')
  const daCollegareOra = async () => Number(/(\d+) da collegare$/.exec((await voce.getAttribute('aria-label')) ?? '')?.[1] ?? 0)
  const prima = await daCollegareOra()
  expect(prima).toBeGreaterThan(0)

  await page.getByRole('region', { name: 'Piano editoriale', exact: true }).getByRole('link', { name: nome, exact: true }).click()
  const foglio = page.getByRole('dialog', { name: nome, exact: true })
  const blocco = foglio.getByRole('region', { name: 'Post su Instagram' })
  await expect(blocco).toContainText('Forse è questo post:')
  await expect(blocco).toContainText('Il reel di prova del pannello')
  await expect(blocco).toContainText('stessa data, didascalia simile')

  // «Collega» from the keyboard: the URL field of the panel has the post, the block shows it linked,
  // and the focus goes to the block's title, never <body> (the button is gone)
  const titoloBlocco = blocco.getByRole('heading', { name: 'Post su Instagram' })
  await blocco.getByRole('button', { name: /^Collega: il post del / }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, `Collegato a «${nome}».`)).toBeVisible()
  await expect(titoloBlocco).toBeFocused()
  await expect(foglio.getByLabel('URL', { exact: true })).toHaveValue(permalink(9))
  await expect(blocco).toContainText('Pubblicato su Instagram')
  expect(await contenuto(id)).toMatchObject({ url: permalink(9), stato: 'posted', post_date: due })
  // the tab counts one post fewer to link
  await expect.poll(daCollegareOra).toBe(prima - 1)
  // deleting it now would send the post back to «Da collegare»: the question says so (cancelled here)
  await foglio.getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domanda = page.getByRole('dialog', { name: `Eliminare il contenuto «${nome}»?` })
  await expect(domanda).toContainText('Il post di Instagram collegato torna in «Da collegare».')
  await domanda.getByRole('button', { name: 'Annulla' }).click()
  await expect(domanda).toBeHidden()
  await expect(foglio).toBeVisible()

  // the Post Date differs from the day on Instagram: one tap takes it
  await expect(blocco).toContainText(`Post Date ${formatData(due)}, su Instagram ${formatData(ieri())}`)
  await blocco.getByRole('button', { name: 'Usa la data di Instagram' }).focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, `Post Date: ${formatData(ieri())}`)).toBeVisible()
  await expect(titoloBlocco).toBeFocused()
  await expect(foglio.getByLabel('Post Date')).toHaveValue(ieri())
  await expect(blocco.getByRole('button', { name: 'Usa la data di Instagram' })).toHaveCount(0)
  expect((await contenuto(id)).post_date).toBe(ieri())

  // «Scollega»: the URL goes, and the no stays for the next runs; the block stays (with the other
  // proposals the tap redid, never that post again), and the focus on its title. The block's
  // buttons stay busy (aria-disabled, still focusable) until the date's save has redrawn the
  // page: a key pressed before that does nothing, as for a person.
  const scollega = blocco.getByRole('button', { name: `Scollega il post da «${nome}»` })
  await expect(scollega).toHaveAttribute('aria-disabled', 'false')
  await scollega.focus()
  await page.keyboard.press('Enter')
  await expect(toast(page, `Scollegato: non lo ripropongo per «${nome}».`)).toBeVisible()
  await expect(foglio.getByLabel('URL', { exact: true })).toHaveValue('')
  await expect(titoloBlocco).toBeFocused()
  await expect(blocco).not.toContainText('Il reel di prova del pannello')
  await expect(titoloBlocco).toBeFocused()
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  await expect.poll(async () => (await contenuto(id)).url).toBeNull()
  const { data: rifiuti } = await dbLocale()
    .from('marketing_abbinamenti_rifiutati')
    .select('shortcode')
    .eq('shortcode', codice(9))
    .eq('contenuto_id', id)
  expect(rifiuti).toHaveLength(1)
})

test('in «Collegati»: «Collegato da solo» e «Non più su Instagram», anche nel pannello del contenuto', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(12, 'Il reel di prova collegato dal giro.')
  const daSolo = `E2E post ${RUN} collegato dal giro`
  const idDaSolo = await creaContenuto(daSolo, { url: permalink(12) })
  const { error } = await dbLocale().from('marketing_abbinamenti').upsert({
    shortcode: codice(12),
    contenuto_id: idDaSolo,
    esito: 'automatico',
    punteggio: 92,
    somiglianza: 0.81,
    giorni: 0,
    motivi: ['stessa_data', 'didascalia_simile'],
  })
  if (error) throw error
  await creaPost(13, 'Un reel di prova archiviato su Instagram.', { eliminato_il: new Date().toISOString() })
  const sparito = `E2E post ${RUN} non più su Instagram`
  await creaContenuto(sparito, { url: permalink(13) })

  await accedi(page, 'marketing')
  await apriPagina(page)
  const rigaDaSolo = collegati(page).locator(`[data-post="${codice(12)}"]`)
  await expect(rigaDaSolo).toContainText('Collegato da solo')
  await expect(rigaDaSolo.getByRole('link', { name: /^Apri su Instagram/ })).toHaveCount(1)
  const rigaSparita = collegati(page).locator(`[data-post="${codice(13)}"]`)
  await expect(rigaSparita).toContainText('Non più su Instagram')
  // a post no longer on Instagram has no link to open
  await expect(rigaSparita.getByRole('link', { name: /^Apri su Instagram/ })).toHaveCount(0)

  // the content's panel says the same, with the reasons of the run
  await rigaDaSolo.getByRole('link', { name: daSolo, exact: true }).click()
  const foglio = page.getByRole('dialog', { name: daSolo, exact: true })
  await expect(foglio.getByRole('region', { name: 'Post su Instagram' })).toContainText(
    'Collegato da solo: stessa data e didascalia simile.',
  )
  await page.keyboard.press('Escape')
  await expect(foglio).toBeHidden()
  await rigaSparita.getByRole('link', { name: sparito, exact: true }).click()
  const foglioSparito = page.getByRole('dialog', { name: sparito, exact: true })
  await expect(foglioSparito.getByRole('region', { name: 'Post su Instagram' })).toContainText(
    'Il post non è più su Instagram (eliminato o archiviato).',
  )
  // deleting it never sends that post to «Da collegare»: the question does not say so
  await foglioSparito.getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domanda = page.getByRole('dialog', { name: `Eliminare il contenuto «${sparito}»?` })
  await expect(domanda).toContainText('Su Instagram e su Notion non cambia niente.')
  await expect(domanda).not.toContainText('Da collegare')
  await domanda.getByRole('button', { name: 'Annulla' }).click()
})

test('nel pannello la domanda di «Elimina» è sempre quella del contenuto mostrato, anche col successivo', async ({ page }) => {
  test.setTimeout(120_000)
  const due = aggiungiGiorni(oggiRoma(), -2)
  await creaPost(14, 'Il reel di prova del contenuto collegato.')
  const collegato = `E2E post ${RUN} vicino collegato`
  const libero = `E2E post ${RUN} vicino libero`
  // newest Post Date first: the linked one, then the other
  await creaContenuto(collegato, { url: permalink(14) })
  await creaContenuto(libero, { post_date: due })

  await accedi(page, 'marketing')
  await page.goto(`/marketing/contenuti?vista=tabella&q=${encodeURIComponent(`E2E post ${RUN} vicino`)}`)
  await page.getByRole('region', { name: 'Piano editoriale', exact: true }).getByRole('link', { name: collegato, exact: true }).click()
  const primo = page.getByRole('dialog', { name: collegato, exact: true })
  await primo.getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domandaPrimo = page.getByRole('dialog', { name: `Eliminare il contenuto «${collegato}»?` })
  await expect(domandaPrimo).toContainText('Il post di Instagram collegato torna in «Da collegare».')
  await domandaPrimo.getByRole('button', { name: 'Annulla' }).click()
  await expect(domandaPrimo).toBeHidden()

  // the next content has no post: its question never says the previous one's
  await primo.getByRole('button', { name: 'Contenuto successivo' }).click()
  const secondo = page.getByRole('dialog', { name: libero, exact: true })
  await expect(secondo).toBeVisible()
  await secondo.getByRole('button', { name: 'Elimina il contenuto' }).click()
  const domandaSecondo = page.getByRole('dialog', { name: `Eliminare il contenuto «${libero}»?` })
  await expect(domandaSecondo).toContainText('Su Instagram e su Notion non cambia niente.')
  await expect(domandaSecondo).not.toContainText('Il post di Instagram collegato')
  await domandaSecondo.getByRole('button', { name: 'Annulla' }).click()
})

test('il video editor collega ma non ha «Aggiorna da Instagram»', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(6, 'Il reel di prova per il video editor.')
  const id = await creaContenuto(`E2E post ${RUN} editor`)
  await proponi(6, id)

  await accedi(page, 'editor')
  await apriPagina(page)
  await expect(page.getByRole('button', { name: 'Aggiorna da Instagram' })).toHaveCount(0)
  await expect(page.getByTestId('stato-post-instagram')).toContainText('Si aggiornano ogni notte.')
  await scheda(page, 6).getByRole('button', { name: `Collega a «E2E post ${RUN} editor»` }).click()
  await expect.poll(async () => (await contenuto(id)).url).toBe(permalink(6))
  // nor from the route the button calls: refused before any run
  const risposta = await page.request.post('/api/marketing/instagram/aggiorna', { headers: { origin: new URL(page.url()).origin } })
  expect(risposta.status()).toBe(403)
  expect(await risposta.json()).toEqual({ errore: 'Aggiorna da Instagram lo usano l’admin e il marketing.' })
})

test('il setter non entra', async ({ page }) => {
  test.setTimeout(60_000)
  await accedi(page, 'setter')
  await page.goto('/marketing/instagram')
  await expect(page).not.toHaveURL(/\/marketing/)
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
  // a minute after a failed run: it runs again (and fails the same way), never «riprova tra … minuti»
  await page.getByRole('button', { name: 'Aggiorna da Instagram' }).click()
  await expect(toast(page, errore)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-sonner-toast]').getByText(/riprova tra/)).toHaveCount(0)
})

test('sul telefono: niente scroll di lato, bottoni da 44 px, «Post di Instagram» accesa in «Altro»', async ({ page }) => {
  test.setTimeout(120_000)
  await creaPost(8, 'Un reel di prova con una didascalia lunga '.repeat(8))
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'marketing')
  await apriPagina(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  for (const bottone of await scheda(page, 8).getByRole('button').all()) {
    expect((await bottone.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  // 1.38.0: every page of the area is an item of the menu, lit on its own page. «Piano editoriale» is in the bar
  // and is not lit here; «Post di Instagram» is in «Altro», which the bar shows as the current place
  const barra = page.getByRole('navigation', { name: 'Navigazione', exact: true })
  await expect(barra.getByRole('link', { name: 'Piano editoriale', exact: true })).not.toHaveAttribute('aria-current', 'page')
  await barra.getByRole('button', { name: /^Altro/ }).click()
  const altro = page.getByRole('dialog', { name: 'Altro' })
  await expect(altro.getByRole('group', { name: 'Marketing' }).getByRole('link', { name: /^Post di Instagram/ })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.keyboard.press('Escape')
  await expect(altro).toBeHidden()

  // a content linked to that post, with another Post Date: its panel on this page takes
  // the whole screen, and the block «Post su Instagram» (long caption, «Usa la data di
  // Instagram») never scrolls sideways, in the panel or on the content's own page
  const nome = `E2E post ${RUN} sul telefono`
  const id = await creaContenuto(nome, { url: permalink(8), post_date: aggiungiGiorni(oggiRoma(), -3) })
  await page.goto(`/marketing/instagram?contenuto=${id}`)
  const foglio = page.getByRole('dialog', { name: nome, exact: true })
  await expect(foglio).toBeVisible()
  const blocco = foglio.getByRole('region', { name: 'Post su Instagram' })
  await expect(blocco.getByRole('button', { name: 'Usa la data di Instagram' })).toBeVisible()
  await blocco.getByRole('button', { name: 'Mostra tutto' }).click()
  expect((await foglio.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(389)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const [dentro, visibile] = await foglio.evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(dentro).toBeLessThanOrEqual(visibile)
  for (const bottone of await blocco.getByRole('button').all()) {
    expect((await bottone.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  await page.goto(`/marketing/contenuti/${id}`)
  await expect(page.getByRole('region', { name: 'Post su Instagram' }).getByRole('button', { name: 'Usa la data di Instagram' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('il giro intero contro il Graph finto', async ({ page }) => {
  test.setTimeout(180_000)
  const finto = process.env.E2E_GRAPH_FINTO
  test.skip(!finto, 'Serve il dev server avviato con E2E_GRAPH_FINTO e e2e/graph-finto.mjs')
  const db = dbLocale()
  const { data: token } = await db.rpc('instagram_token')
  test.skip(Boolean(token), 'Nel Vault locale c’è già un token.')
  const risposta = await fetch(`${finto}/__azzera`).catch(() => null)
  test.skip(!risposta?.ok, 'Il Graph finto non risponde.')

  // The fake Graph returns only its own posts: a complete listing marks every
  // other post as no longer on Instagram and drops their proposals. Both are
  // put back at the end, so the next tests and the screenshots see the seed.
  const { data: presenti, error: errorePresenti } = await db
    .from('instagram_contenuti')
    .select('media_id')
    .is('eliminato_il', null)
  if (errorePresenti) throw errorePresenti
  const { data: propostePrima, error: erroreProposteePrima } = await db
    .from('marketing_abbinamenti')
    .select('*')
    .eq('esito', 'proposto')
  if (erroreProposteePrima) throw erroreProposteePrima

  // The test without a token has just run a manual update: within 5 minutes the
  // lease would answer "appena fatto". The last run moved back 10 minutes
  // (afterAll puts the state row back as it was).
  const { error: erroreStato } = await db
    .from('instagram_contenuti_stato')
    .update({ ultimo_giro_il: new Date(Date.now() - 10 * 60_000).toISOString() })
    .eq('id', true)
  if (erroreStato) throw erroreStato

  // a test token in the local Vault with the admin's session, removed at the end
  // (it never reaches Meta: lib/instagram/richieste.ts)
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
  } finally {
    await admin.rpc('instagram_togli_token')
    await db.from('instagram_contenuti').delete().like('shortcode', 'GraphFinto%')
    const ids = (presenti ?? []).map((p) => p.media_id)
    if (ids.length) await db.from('instagram_contenuti').update({ eliminato_il: null }).in('media_id', ids)
    await db.from('marketing_abbinamenti').delete().eq('esito', 'proposto')
    if (propostePrima?.length) await db.from('marketing_abbinamenti').upsert(propostePrima)
  }
})
