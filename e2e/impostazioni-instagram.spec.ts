import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { formatOra, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import type { Database } from '../lib/supabase/database.types'
import { dbLocale, ID_SETTER } from './db'
import { accedi, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * Impostazioni › Instagram e Messenger (Dany, 08/10/2026; Messenger and the
 * Insight from 1.35.0): the admin connects the account whose DMs precompile
 * the setter's report. The token goes in and never comes back (not in the
 * page, not in its HTML, not in an action's answer); the excluded chats, who
 * works the DMs. The setter and the coach never open it. Instagram is never
 * called: "Ricalcola ieri" is not tapped here (the reader's tests use a fake
 * Graph API).
 *
 * From 1.35.0: the Page token for Messenger, proved against the fake Graph
 * (e2e/graph-finto.mjs, only with E2E_GRAPH_FINTO: never graph.facebook.com);
 * an exclusion that also deletes the chat's messages saved in the Insight;
 * the Messenger chats to exclude, from insight_chat_messenger; the read-only
 * block «Insight ultime 24h».
 */

// invented, shaped like a token: never a real one
const TOKEN = `IGAAe2eFinto${Date.now()}QwErTyUiOp`
const USERNAME = `e2e.prova.${Date.now().toString(36)}`
const RUN = Date.now().toString(36)
// a Page token as Meta shapes them, with the fake Graph's mark: never a real one
const TOKEN_PAGINA = `EAAe2eFintoPagina${Date.now()}QwErTyUiOp`
const PAGINA_FINTA = 'Percorso Alpha (finta)'
const TOKEN_PAGINA_NON_VALIDO =
  'Il token della Pagina non è valido o non ha accesso ai messaggi: generane uno nuovo da Meta › Messenger › Impostazioni dell’API e incollalo qui.'
const CANCELLA_MESSAGGI = 'Cancella anche i suoi messaggi già salvati nell’Insight'

/** A toast by its whole text. */
function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

type Collegamento = Database['public']['Tables']['instagram_collegamento']['Row']
let iniziale: Collegamento | null = null
let tokenGiaPresente = false

/** The admin's own session on the local database: instagram_togli_token as he calls it. */
async function sessioneAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave || !url.includes('127.0.0.1')) throw new Error('I test e2e girano solo contro il Supabase locale')
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email: UTENTI.admin.email, password: PASSWORD_SEED })
  if (error) throw error
  return db
}

test.beforeAll(async () => {
  const db = dbLocale()
  const { data, error } = await db.from('instagram_collegamento').select('*').maybeSingle()
  if (error) throw error
  iniziale = data
  const { data: token, error: erroreToken } = await db.rpc('instagram_token')
  if (erroreToken) throw erroreToken
  tokenGiaPresente = typeof token === 'string' && token.length > 0
})

test.afterAll(async () => {
  const db = dbLocale()
  await db.from('instagram_esclusi').delete().eq('username', USERNAME)
  if (!tokenGiaPresente) {
    const { data: token } = await db.rpc('instagram_token')
    if (token) {
      const { error } = await (await sessioneAdmin()).rpc('instagram_togli_token')
      if (error) throw error
    }
  }
  // the connection as it was before the test (setter, last run, last error)
  if (iniziale) {
    const campi = {
      setter_id: iniziale.setter_id,
      account_username: iniziale.account_username,
      account_id: iniziale.account_id,
      token_aggiornato_il: iniziale.token_aggiornato_il,
      token_scade_il: iniziale.token_scade_il,
      ultimo_calcolo_il: iniziale.ultimo_calcolo_il,
      ultimo_calcolo_giorno: iniziale.ultimo_calcolo_giorno,
      ultimo_calcolo_chat: iniziale.ultimo_calcolo_chat,
      ultimo_errore: iniziale.ultimo_errore,
      ultimo_errore_il: iniziale.ultimo_errore_il,
      updated_by: iniziale.updated_by,
    }
    const { error } = await db.from('instagram_collegamento').update(campi).eq('id', true)
    if (error) throw error
  }
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('l’admin collega Instagram: il token non torna mai, esclude una chat, sceglie chi lavora i DM', async ({ page }) => {
    test.skip(tokenGiaPresente, 'C’è già un token nel Vault locale: il test non lo sovrascrive')
    // several pages and actions compiled on the first hit by the dev server
    test.setTimeout(120_000)
    const db = dbLocale()

    // every answer of a server action, to look for the token in it
    const risposte: Promise<string>[] = []
    page.on('response', (r) => {
      if (r.request().method() === 'POST') risposte.push(r.text().catch(() => ''))
    })

    await accedi(page, 'admin')
    await page.goto('/settings')
    // the settings by category (1.38.0): Instagram and Messenger sits in «Chiavi e collegamenti»
    await expect(page.getByRole('region', { name: 'Chiavi e collegamenti' })).toBeVisible()
    await page.getByRole('link', { name: /Instagram e Messenger/ }).click()
    await expect(page).toHaveURL(/\/settings\/instagram$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Instagram e Messenger' })).toBeVisible()

    const stato = page.getByTestId('instagram-stato')
    await expect(stato).toContainText('Non collegato')
    // the posts of the content calendar read with the same token (1.33.0)
    await expect(stato).toContainText('Post e reel')
    await expect(stato.getByRole('link', { name: 'Post di Instagram' })).toHaveAttribute('href', '/marketing/instagram')
    // nothing to recompute without a token
    await expect(page.getByRole('button', { name: 'Ricalcola ieri' })).toBeDisabled()
    await expect(page.getByText('Prima salva il token.')).toBeVisible()
    // the token is not pasted here any more (1.38.0): this page points to the one that has it
    await expect(page.getByLabel('Token di accesso')).toHaveCount(0)
    await page.getByRole('region', { name: 'Token', exact: true }).getByRole('link', { name: 'Chiavi e collegamenti' }).click()
    await expect(page).toHaveURL(/\/settings\/chiavi#instagram$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Chiavi e collegamenti' })).toBeVisible()

    // the token: a password field, never prefilled, pasted the messy way
    const instagram = page.getByRole('region', { name: 'Instagram', exact: true })
    await expect(instagram).toContainText('Non collegato')
    const campo = instagram.getByLabel('Token di accesso')
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(campo).toHaveAttribute('autocomplete', 'off')
    await expect(campo).toHaveValue('')
    await campo.fill(`  "IG_TOKEN=${TOKEN}"  `)
    const salva = instagram.getByRole('button', { name: 'Salva il token' })
    expect((await salva.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await salva.click()

    const scade = formatData(oggiRoma(new Date(Date.now() + 60 * 86_400_000)))
    await expect(page.getByTestId('instagram-token-salvato')).toHaveText(`Token salvato, scade il ${scade}`)
    await expect(instagram).toContainText(`Salvato, scade il ${scade}`)
    await expect(instagram.getByLabel('Token nuovo')).toHaveValue('')

    // in Vault, cleaned as the DM Reader does
    const { data: salvato } = await db.rpc('instagram_token')
    expect(salvato).toBe(TOKEN)

    // never on the page: not in the DOM, not in any field, not in the HTML, not in an action's answer
    expect(await page.content()).not.toContain(TOKEN)
    const valori = await page.locator('input, textarea').evaluateAll((campi) =>
      campi.map((c) => (c as HTMLInputElement).value),
    )
    expect(valori.join('\n')).not.toContain(TOKEN)
    await page.reload()
    expect(await page.content()).not.toContain(TOKEN)
    const html = await (await page.request.get('/settings/chiavi')).text()
    expect(html).toContain('Token salvato')
    expect(html).not.toContain(TOKEN)
    const htmlInstagram = await (await page.request.get('/settings/instagram')).text()
    expect(htmlInstagram).not.toContain(TOKEN)
    expect((await Promise.all(risposte)).join('\n')).not.toContain(TOKEN)

    // the guide beside the key: closed at first, the path of Meta and the three permissions inside
    const guida = instagram.getByTestId('guida-instagram')
    await expect(guida).toHaveJSProperty('open', false)
    const riassunto = guida.locator('summary')
    expect((await riassunto.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await riassunto.click()
    await expect(guida).toHaveJSProperty('open', true)
    await expect(guida).toContainText('developers.facebook.com › Le mie app › Alpha DM Reader')
    await expect(guida).toContainText('Configurazione API con Business Login')
    await expect(guida).toContainText('instagram_business_manage_insights')
    await expect(guida).toContainText('Non incollare mai una chiave in chat')

    // five days left: the warning, in words, from seven days before (the night run renews it every week)
    await db
      .from('instagram_collegamento')
      .update({ token_scade_il: new Date(Date.now() + 5 * 86_400_000).toISOString() })
      .eq('id', true)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Instagram', exact: true })).toContainText('Scade tra 5 giorni')
    await expect(page.getByTestId('chiavi-da-sistemare')).toContainText('Il token di Instagram scade tra 5 giorni')
    await db
      .from('instagram_collegamento')
      .update({ token_scade_il: new Date(Date.now() + 50 * 86_400_000).toISOString() })
      .eq('id', true)

    // expired, and the last error of the night: in evidence, with when (on Chiavi e collegamenti and on Instagram e Messenger)
    await db
      .from('instagram_collegamento')
      .update({ token_scade_il: new Date(Date.now() - 3_600_000).toISOString() })
      .eq('id', true)
    await db.rpc('instagram_errore', { p_messaggio: 'Prova e2e: Instagram non ha risposto' })
    await page.reload()
    await expect(page.getByTestId('instagram-token-scaduto')).toHaveText(
      'Token Instagram scaduto: generane uno nuovo dal pannello Meta e incollalo qui.',
    )
    await expect(page.getByRole('region', { name: 'Instagram', exact: true })).toContainText(
      `Scaduto il ${formatData(oggiRoma(new Date(Date.now() - 3_600_000)))}`,
    )
    await page.goto('/settings/instagram')
    await expect(page.getByTestId('instagram-token-scaduto')).toHaveText(
      'Token Instagram scaduto: generane uno nuovo dal pannello Meta e incollalo qui.',
    )
    const errore = page.getByTestId('instagram-ultimo-errore')
    await expect(errore).toContainText('Prova e2e: Instagram non ha risposto')
    await expect(errore).toContainText(/oggi alle \d{2}:\d{2}/)
    await expect(stato).toContainText(`Scaduto il ${formatData(oggiRoma(new Date(Date.now() - 3_600_000)))}`)

    // refused by Meta (code 190) well before its date: never "Scaduto il" with a day still to come
    await db
      .from('instagram_collegamento')
      .update({ token_scade_il: new Date(Date.now() + 50 * 86_400_000).toISOString() })
      .eq('id', true)
    // FRASI_ERRORE.token (lib/instagram/report.ts is server-only)
    await db.rpc('instagram_errore', {
      p_messaggio:
        'Il token di Instagram è scaduto o non è più valido: generane uno nuovo dal pannello Meta e incollalo di nuovo.',
    })
    await page.reload()
    await expect(page.getByTestId('instagram-token-scaduto')).toBeVisible()
    await expect(stato).toContainText('Non più valido: Instagram lo ha rifiutato')
    await expect(stato).not.toContainText('Scaduto il')

    // an excluded chat: added without @ and in lowercase, refused twice, removed after the question
    const escluse = page.getByRole('region', { name: 'Chat escluse' })
    await expect(escluse).toContainText('non contano mai')
    await escluse.getByLabel('Username').fill('nome con spazi')
    await escluse.getByRole('button', { name: 'Escludi la chat' }).click()
    await expect(escluse.getByText(/Uno username di Instagram/)).toBeVisible()

    await escluse.getByLabel('Username').fill(`@${USERNAME.toUpperCase()}`)
    await escluse.getByLabel('Motivo (facoltativo)').fill('Account di prova')
    await escluse.getByRole('button', { name: 'Escludi la chat' }).click()
    const elenco = escluse.getByTestId('instagram-esclusi')
    await expect(elenco).toContainText(`@${USERNAME}`)
    await expect(elenco).toContainText('Account di prova')
    const { data: aggiunta } = await db.from('instagram_esclusi').select('username, motivo').eq('username', USERNAME)
    expect(aggiunta).toEqual([{ username: USERNAME, motivo: 'Account di prova' }])
    await expect(escluse.getByLabel('Username')).toHaveValue('')

    await escluse.getByLabel('Username').fill(USERNAME)
    await escluse.getByRole('button', { name: 'Escludi la chat' }).click()
    await expect(escluse.getByText(`@${USERNAME} è già tra le chat escluse.`)).toBeVisible()

    const cestino = escluse.getByRole('button', { name: `Elimina l’esclusione di @${USERNAME}` })
    expect((await cestino.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await cestino.click()
    const domanda = page.getByRole('dialog', { name: `Eliminare l’esclusione di @${USERNAME}?` })
    await expect(domanda).toContainText('Le sue chat tornano a contare nella proposta')
    await domanda.getByRole('button', { name: 'Elimina' }).click()
    await expect(domanda).toBeHidden()
    await expect(elenco).not.toContainText(`@${USERNAME}`)
    const { data: tolta } = await db.from('instagram_esclusi').select('username').eq('username', USERNAME)
    expect(tolta).toEqual([])

    // who works the DMs: the seed setter, saved
    const chi = page.getByRole('region', { name: 'Chi lavora i DM' })
    await expect(chi).toContainText('I numeri calcolati ogni notte vanno a questa persona da confermare.')
    const scelta = chi.getByLabel('Setter')
    expect((await scelta.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await scelta.selectOption({ label: UTENTI.setter.nome })
    await chi.getByRole('button', { name: 'Salva la scelta' }).click()
    await expect(page.getByText(`I DM di Instagram li lavora ${UTENTI.setter.nome}`)).toBeVisible()
    await expect(chi.getByRole('button', { name: 'Salva la scelta' })).toBeDisabled()
    const { data: collegamento } = await db.from('instagram_collegamento').select('setter_id').single()
    expect(collegamento?.setter_id).toBe(ID_SETTER)

    // the recompute is ready now, and says where the numbers are (not tapped: no Instagram here)
    const ricalcola = page.getByRole('region', { name: 'Ricalcola ieri' })
    await expect(ricalcola).toContainText(`e ${UTENTI.setter.nome} in Oggi: vale la prima scelta, tua o sua.`)
    await expect(ricalcola.getByRole('link', { name: 'Setter › Tracciamento da approvare' })).toHaveAttribute(
      'href',
      '/setting#da-approvare',
    )
    await expect(ricalcola.getByRole('button', { name: 'Ricalcola ieri' })).toBeEnabled()

    // no sideways scroll on the phone
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    // the token goes away after the question, on Chiavi e collegamenti (the Instagram one: Messenger has its own, 1.35.0)
    await page.goto('/settings/chiavi')
    await page.getByRole('region', { name: 'Instagram', exact: true }).getByRole('button', { name: 'Togli il token' }).click()
    const togli = page.getByRole('dialog', { name: 'Eliminare il token di Instagram?' })
    await expect(togli).toContainText('La proposta di ogni notte si ferma')
    await expect(togli).toContainText('la lettura dei post per il calendario dei contenuti')
    await togli.getByRole('button', { name: 'Elimina' }).click()
    await expect(togli).toBeHidden()
    await expect(page.getByRole('region', { name: 'Instagram', exact: true })).toContainText('Non collegato')
    const { data: dopo } = await db.rpc('instagram_token')
    expect(dopo).toBeNull()
  })
})

test.describe('Messenger a 390 px (1.35.0)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('l’admin collega la Pagina contro il Graph finto: il token non torna mai, poi lo toglie', async ({ page }) => {
    // several pages and actions compiled on the first hit by the dev server
    test.setTimeout(120_000)
    const finto = process.env.E2E_GRAPH_FINTO
    test.skip(!finto, 'Serve il dev server avviato con E2E_GRAPH_FINTO e e2e/graph-finto.mjs: mai graph.facebook.com')
    const db = dbLocale()
    const { data: giaPresente, error: erroreToken } = await db.rpc('messenger_token')
    if (erroreToken) throw erroreToken
    test.skip(Boolean(giaPresente), 'C’è già un token della Pagina nel Vault locale: il test non lo sovrascrive')
    const azzera = await fetch(`${finto}/__azzera`).catch(() => null)
    test.skip(!azzera?.ok, 'Il Graph finto non risponde.')
    const { data: prima, error: errorePrima } = await db.from('messenger_collegamento').select('*').maybeSingle()
    if (errorePrima) throw errorePrima

    // every answer of a server action, to look for the token in it
    const risposte: Promise<string>[] = []
    page.on('response', (r) => {
      if (r.request().method() === 'POST') risposte.push(r.text().catch(() => ''))
    })

    try {
      await accedi(page, 'admin')
      // the Page token is pasted in Chiavi e collegamenti (1.38.0); Instagram e Messenger only points there
      await page.goto('/settings/instagram')
      await expect(page.getByRole('heading', { level: 1, name: 'Instagram e Messenger' })).toBeVisible()
      await expect(page.getByLabel('Token della Pagina')).toHaveCount(0)
      await page.getByRole('region', { name: 'Messenger', exact: true }).getByRole('link', { name: 'Chiavi e collegamenti' }).click()
      await expect(page).toHaveURL(/\/settings\/chiavi#messenger$/)
      const messenger = page.getByRole('region', { name: 'Messenger', exact: true })
      const stato = messenger.getByTestId('messenger-stato')
      await expect(stato).toContainText('Non collegata')
      await expect(messenger).toContainText('Serve solo per leggere le chat Messenger nell’Insight. Non manda mai messaggi.')

      // a password field, never prefilled
      const campo = messenger.getByLabel('Token della Pagina')
      await expect(campo).toHaveAttribute('type', 'password')
      await expect(campo).toHaveAttribute('autocomplete', 'off')
      expect(await campo.getAttribute('name')).toBeNull()
      await expect(campo).toHaveValue('')
      const collega = messenger.getByRole('button', { name: 'Collega la Pagina' })
      expect((await collega.boundingBox())?.height).toBeGreaterThanOrEqual(44)

      // a token Meta refuses (the fake answers 190 to anything without its mark): nothing saved
      await campo.fill(`EAAprovaRifiutata${Date.now()}QwErTyUiOp`)
      await collega.click()
      await expect(messenger.getByRole('alert')).toHaveText(TOKEN_PAGINA_NON_VALIDO)
      await expect(campo).toHaveValue('')
      expect((await db.rpc('messenger_token')).data).toBeNull()
      await expect(stato).toContainText('Non collegata')

      // pasted the messy way: cleaned, proved on the Page and on its chats, then saved
      await campo.fill(`  FB_PAGE_TOKEN="${TOKEN_PAGINA}"  `)
      await collega.click()
      await expect(
        toast(page, `Pagina «${PAGINA_FINTA}» collegata: le chat Messenger arrivano nell’Insight dal prossimo recap.`),
      ).toBeVisible()
      await expect(stato).toContainText(`Collegata: Pagina «${PAGINA_FINTA}»`)
      await expect(campo).toHaveValue('')
      expect((await db.rpc('messenger_token')).data).toBe(TOKEN_PAGINA)
      // the Page and one conversation, on Messenger's version only
      const { percorsi } = (await (await fetch(`${finto}/__richieste`)).json()) as { percorsi: string[] }
      expect(percorsi).toEqual(expect.arrayContaining(['/v23.0/me', '/v23.0/me/conversations']))
      expect(percorsi.every((p) => p.startsWith('/v23.0/'))).toBe(true)

      // never on the page: not in the DOM, not in any field, not in the HTML, not in an action's answer
      expect(await page.content()).not.toContain(TOKEN_PAGINA)
      const valori = await page.locator('input, textarea').evaluateAll((campi) =>
        campi.map((c) => (c as HTMLInputElement).value),
      )
      expect(valori.join('\n')).not.toContain(TOKEN_PAGINA)
      await page.reload()
      await expect(stato).toContainText(`Collegata: Pagina «${PAGINA_FINTA}»`)
      expect(await page.content()).not.toContain(TOKEN_PAGINA)
      const html = await (await page.request.get('/settings/chiavi')).text()
      expect(html).toContain(`Collegata: Pagina «${PAGINA_FINTA}»`)
      expect(html).not.toContain(TOKEN_PAGINA)
      expect((await Promise.all(risposte)).join('\n')).not.toContain(TOKEN_PAGINA)

      // no sideways scroll on the phone
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

      // the token goes away after the question
      await messenger.getByRole('button', { name: 'Togli il token' }).click()
      const togli = page.getByRole('dialog', { name: 'Eliminare il token della Pagina?' })
      await expect(togli).toContainText('Le chat Messenger non arrivano più nell’Insight finché non incolli un token nuovo.')
      await togli.getByRole('button', { name: 'Elimina' }).click()
      await expect(togli).toBeHidden()
      await expect(stato).toContainText('Non collegata')
      expect((await db.rpc('messenger_token')).data).toBeNull()
    } finally {
      const { data: resta } = await db.rpc('messenger_token')
      if (resta) await (await sessioneAdmin()).rpc('messenger_togli_token')
      // the Page as it was before the test
      if (prima) {
        await db
          .from('messenger_collegamento')
          .update({
            pagina_id: prima.pagina_id,
            pagina_nome: prima.pagina_nome,
            token_aggiornato_il: prima.token_aggiornato_il,
            ultimo_errore: prima.ultimo_errore,
            ultimo_errore_il: prima.ultimo_errore_il,
            updated_by: prima.updated_by,
          })
          .eq('id', true)
      }
    }
  })
})

test('escludere una chat cancella anche i suoi messaggi salvati nell’Insight; le chat Messenger si scelgono dall’elenco (1.35.0)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const db = dbLocale()
  // invented chats, as a run of the Insight would have saved them
  const username = `e2e.dimentica.${RUN}`
  const psidUno = `9${Date.now()}`
  const psidDue = `8${Date.now()}`
  const nomeUno = `Lead Finto Uno ${RUN}`
  const nomeDue = `Lead Finto Due ${RUN}`
  const adesso = new Date().toISOString()
  const messaggi = [{ da: 'lead', il: adesso, testo: 'Ciao, vorrei sapere come funziona il percorso (chat inventata).' }]
  const conversazioni = [`e2e-ig-${RUN}`, `e2e-fb1-${RUN}`, `e2e-fb2-${RUN}`]
  const { error } = await db.from('insight_chat').insert([
    { canale: 'instagram', conversazione_id: conversazioni[0], username, messaggi, ultimo_il: adesso, ultimo_da: 'lead' },
    { canale: 'messenger', conversazione_id: conversazioni[1], utente_id: psidUno, nome: nomeUno, messaggi, ultimo_il: adesso, ultimo_da: 'lead' },
    { canale: 'messenger', conversazione_id: conversazioni[2], utente_id: psidDue, nome: nomeDue, messaggi, ultimo_il: adesso, ultimo_da: 'lead' },
  ])
  if (error) throw error
  /** How many chats of the Insight are left with that key. */
  async function chatSalvate(campo: 'username' | 'utente_id', valore: string) {
    const { count, error: erroreConta } = await db
      .from('insight_chat')
      .select('id', { count: 'exact', head: true })
      .eq(campo, valore)
    if (erroreConta) throw erroreConta
    return count
  }

  try {
    await accedi(page, 'admin')
    await page.goto('/settings/instagram')

    // Instagram: the box is checked by default, and the chat's messages go with the exclusion
    const escluse = page.getByRole('region', { name: 'Chat escluse', exact: true })
    const casella = escluse.getByRole('checkbox', { name: CANCELLA_MESSAGGI })
    await expect(casella).toBeChecked()
    await escluse.getByLabel('Username').fill(username)
    await escluse.getByRole('button', { name: 'Escludi la chat' }).click()
    await expect(toast(page, 'Chat esclusa e messaggi cancellati.')).toBeVisible()
    await expect(escluse.getByTestId('instagram-esclusi')).toContainText(`@${username}`)
    expect(await chatSalvate('username', username)).toBe(0)
    await expect(casella).toBeChecked()
    await expect(toast(page, 'Chat esclusa e messaggi cancellati.')).toHaveCount(0, { timeout: 10_000 })

    // Messenger: picked from the latest chats with a name the Insight has read, never typed
    const messenger = page.getByRole('region', { name: 'Chat Messenger escluse' })
    const scelta = messenger.getByLabel('Chat', { exact: true })
    await expect(scelta.locator('option', { hasText: nomeUno })).toHaveCount(1)
    await expect(scelta.locator('option', { hasText: nomeDue })).toHaveCount(1)
    expect((await scelta.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    // nothing chosen: refused before the database
    await messenger.getByRole('button', { name: 'Escludi la chat' }).click()
    await expect(messenger.getByText('Scegli una chat dell’elenco.')).toBeVisible()

    await scelta.selectOption({ label: nomeUno })
    await messenger.getByLabel('Motivo (facoltativo)').fill('Amico, non un lead')
    await expect(messenger.getByRole('checkbox', { name: CANCELLA_MESSAGGI })).toBeChecked()
    await messenger.getByRole('button', { name: 'Escludi la chat' }).click()
    await expect(toast(page, 'Chat esclusa e messaggi cancellati.')).toBeVisible()
    const elenco = messenger.getByTestId('messenger-esclusi')
    await expect(elenco).toContainText(nomeUno)
    await expect(elenco).toContainText('Amico, non un lead')
    expect(await chatSalvate('utente_id', psidUno)).toBe(0)
    // excluded, it is offered no more
    await expect(scelta.locator('option', { hasText: nomeUno })).toHaveCount(0)

    // without the box: excluded, its saved messages stay until their 30 days
    await scelta.selectOption({ label: nomeDue })
    const casellaMessenger = messenger.getByRole('checkbox', { name: CANCELLA_MESSAGGI })
    await casellaMessenger.click()
    await expect(casellaMessenger).not.toBeChecked()
    await messenger.getByRole('button', { name: 'Escludi la chat' }).click()
    await expect(toast(page, `${nomeDue} esclusa dall’Insight`)).toBeVisible()
    await expect(elenco).toContainText(nomeDue)
    expect(await chatSalvate('utente_id', psidDue)).toBe(1)
    const { data: esclusi } = await db
      .from('messenger_esclusi')
      .select('utente_id, nome, motivo')
      .in('utente_id', [psidUno, psidDue])
      .order('nome', { ascending: false })
    expect(esclusi).toEqual([
      { utente_id: psidUno, nome: nomeUno, motivo: 'Amico, non un lead' },
      { utente_id: psidDue, nome: nomeDue, motivo: null },
    ])

    // the trash asks first
    const cestino = elenco.getByRole('button', { name: `Elimina l’esclusione di ${nomeUno}` })
    expect((await cestino.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await cestino.click()
    const domanda = page.getByRole('dialog', { name: `Eliminare l’esclusione di ${nomeUno}?` })
    await expect(domanda).toContainText('La sua chat torna nell’Insight dal recap dopo.')
    await domanda.getByRole('button', { name: 'Elimina' }).click()
    await expect(domanda).toBeHidden()
    await expect(elenco).not.toContainText(nomeUno)
    const { count } = await db
      .from('messenger_esclusi')
      .select('utente_id', { count: 'exact', head: true })
      .eq('utente_id', psidUno)
    expect(count).toBe(0)
  } finally {
    await db.from('instagram_esclusi').delete().eq('username', username)
    await db.from('messenger_esclusi').delete().in('utente_id', [psidUno, psidDue])
    await db.from('insight_chat').delete().in('conversazione_id', conversazioni)
  }
})

test('il blocco «Insight ultime 24h»: ultimo recap, cache, pianificatore e il link all’Insight (1.35.0)', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const db = dbLocale()
  const { data: prima, error: errorePrima } = await db
    .from('insight_impostazioni')
    .select('attivo, ultimo_tick_il')
    .single()
  if (errorePrima) throw errorePrima
  // a finished run, invented: the latest for insight_stato() (created now, after
  // the seed's runs); with it, the warning a run adds when the token cannot read
  // the statistics (lib/insight/stato.ts)
  const finita = new Date().toISOString()
  const avvisoStatistiche =
    'Statistiche dei contenuti non disponibili: aggiungi il permesso instagram_business_manage_insights all’app Meta e incolla di nuovo il token in Impostazioni › Chiavi e collegamenti.'
  const { data: esecuzione, error } = await db
    .from('insight_esecuzioni')
    .insert({
      giorno: oggiRoma(),
      motivo: 'manuale',
      stato: 'pronta',
      passo: 'unione',
      creata_il: finita,
      iniziata_il: new Date(Date.now() - 5 * 60_000).toISOString(),
      finita_il: finita,
      chat_instagram: 12,
      chat_messenger: 3,
      chat_attribuite: 2,
      token_input: 40_000,
      token_cache_scritti: 9_100,
      token_cache_letti: 182_400,
      token_output: 12_000,
      costo_usd: 0.94,
      avvisi: [avvisoStatistiche],
    })
    .select('id')
    .single()
  if (error) throw error
  // on, and the last tick of pg_cron long ago: a dead scheduler
  const tick = new Date(Date.now() - 40 * 60_000).toISOString()
  const { error: erroreImp } = await db
    .from('insight_impostazioni')
    .update({ attivo: true, ultimo_tick_il: tick })
    .eq('id', true)
  if (erroreImp) throw erroreImp

  try {
    await accedi(page, 'admin')
    await page.goto('/settings/instagram')
    const blocco = page.getByRole('region', { name: 'Insight ultime 24h', exact: true })
    await expect(blocco).toContainText(
      `oggi alle ${formatOra(finita)} · 15 chat · 2 lead attribuiti a un post · 0,94 $ di Claude`,
    )
    await expect(blocco).toContainText('182.400 letti, 9.100 scritti')
    await expect(blocco.getByTestId('insight-avviso-statistiche')).toHaveText(avvisoStatistiche)
    await expect(blocco).toContainText('Attiva: recap pronto ogni giorno alle 19:00.')
    await expect(blocco).toContainText('Ultimo controllo')
    // the warning only while pg_cron has not ticked since (it may, between the update and here)
    const { data: ora } = await db.from('insight_impostazioni').select('ultimo_tick_il').single()
    if (ora?.ultimo_tick_il && Date.parse(ora.ultimo_tick_il) === Date.parse(tick)) {
      await expect(blocco.getByTestId('insight-pianificatore-fermo')).toBeVisible()
    }
    // whether the key is set: known on the server only, shown to the admin here (D23)
    await expect(blocco.getByTestId('insight-spento')).toHaveCount(process.env.ANTHROPIC_API_KEY?.trim() ? 0 : 1)
    const apri = blocco.getByRole('link', { name: 'Apri l’Insight' })
    await expect(apri).toHaveAttribute('href', '/insight')
    expect((await apri.boundingBox())?.height).toBeGreaterThanOrEqual(44)

    // the anchor the Insight links to, «Gestisci le chat escluse» (C42)
    await page.goto('/settings/instagram#chat-escluse')
    await expect(page.locator('#chat-escluse')).toHaveAttribute('aria-labelledby', 'titolo-esclusi')
    await expect(page.getByRole('region', { name: 'Chat escluse', exact: true })).toBeInViewport()
  } finally {
    await db.from('insight_esecuzioni').delete().eq('id', esecuzione.id)
    await db
      .from('insight_impostazioni')
      .update({ attivo: prima.attivo, ultimo_tick_il: prima.ultimo_tick_il })
      .eq('id', true)
  }
})

for (const ruolo of ['setter', 'coach'] as const) {
  test(`il ${ruolo} non apre Impostazioni › Instagram`, async ({ page }) => {
    test.setTimeout(60_000)
    await accedi(page, ruolo)
    await page.goto('/settings/instagram')
    await expect(page).not.toHaveURL(/\/settings/)
    await expect(page.getByRole('heading', { level: 1, name: 'Instagram' })).toHaveCount(0)
    await expect(page.getByText('Chat escluse')).toHaveCount(0)
  })
}
