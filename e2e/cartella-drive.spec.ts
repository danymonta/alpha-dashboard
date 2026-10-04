import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { COOKIE_PICKER_E2E, CONFIG_PICKER_E2E, MIME_CARTELLA, SCOPE_DRIVE_FILE, SCRIPT_GOOGLE } from '../lib/google/picker'
import { dbLocale, ID_ADMIN, ID_CLOSER, PRODOTTO_6_MESI } from './db'
import { accedi } from './utenti'

/**
 * The link to the client's Google Drive folder (Dany, 04/10/2026): the admin
 * adds it, opens it and takes it away from the client sheet, on the phone too;
 * the closer, who reads his clients and his sales, never sees it.
 */
const NOME = 'Cliente Con Cartella'
const URL_DRIVE = 'https://drive.google.com/drive/folders/e2e-cartella-53'

function oggiRoma() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

async function creaCliente() {
  const db = dbLocale()
  const { data, error } = await db
    .from('clients')
    .insert({ nome: NOME, closer_id: ID_CLOSER, created_by: ID_ADMIN })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

test.afterEach(async () => {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').eq('nome', NOME)
  for (const c of clienti ?? []) {
    await db.from('pm_progetti').delete().eq('client_id', c.id)
    await db.from('sales').delete().eq('client_id', c.id)
    // the folder link goes with the client (on delete cascade)
    await db.from('clients').delete().eq('id', c.id)
  }
})

test.describe('a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('l’admin collega la cartella Drive, la apre e toglie il link', async ({ page, context }) => {
    // several pages and actions compiled on the first hit by the dev server
    test.setTimeout(90_000)
    const id = await creaCliente()
    // the folder opens in a new tab: Google Drive answered locally, never on the network
    await context.route('https://drive.google.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Drive</title><p>Cartella</p>' }),
    )

    await accedi(page, 'admin')
    await page.goto(`/clients/${id}`)
    const riga = page.getByTestId('cartella-drive')
    await expect(riga).toContainText('Nessuna cartella collegata')

    await riga.getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
    const campo = foglio.getByLabel('Link della cartella')
    await campo.fill('https://example.com/cartella')
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(foglio.getByText('Incolla il link di una cartella di Google Drive')).toBeVisible()

    await campo.fill(URL_DRIVE)
    await foglio.getByRole('button', { name: 'Salva' }).click()
    // the toast, exact: getByText alone also matches the row's «Nessuna cartella collegata»
    await expect(page.getByText('Cartella collegata', { exact: true })).toBeVisible()
    await expect(foglio).toBeHidden()

    const link = riga.getByRole('link', { name: /Cartella Drive/ })
    await expect(link).toHaveAttribute('href', URL_DRIVE)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const { data: salvata } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id).single()
    expect(salvata?.url).toBe(URL_DRIVE)

    // no sideways scroll on the phone, the pencil is a 44px target
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const matita = riga.getByRole('button', { name: 'Modifica il link della cartella Drive' })
    const box = await matita.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)

    const [scheda] = await Promise.all([page.waitForEvent('popup'), link.click()])
    await expect(scheda).toHaveURL(URL_DRIVE)
    await scheda.close()

    // the pencil opens on the saved link; "Togli il link" asks first
    await matita.click()
    await expect(foglio.getByLabel('Link della cartella')).toHaveValue(URL_DRIVE)
    await foglio.getByRole('button', { name: 'Togli il link' }).click()
    const domanda = page.getByRole('dialog', { name: /^Eliminare il link alla cartella Drive/ })
    await expect(domanda).toContainText('La cartella su Google Drive resta com’è')
    await domanda.getByRole('button', { name: 'Elimina' }).click()
    await expect(page.getByText('Link tolto')).toBeVisible()
    await expect(riga).toContainText('Nessuna cartella collegata')
    await expect(riga.getByRole('link')).toHaveCount(0)

    const { data: dopo } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id)
    expect(dopo).toEqual([])
  })
})

test('il closer non vede mai la cartella Drive del suo cliente', async ({ page }) => {
  test.setTimeout(90_000)
  const id = await creaCliente()
  const db = dbLocale()
  const oggi = oggiRoma()
  const fine = new Date(`${oggi}T12:00:00Z`)
  fine.setUTCMonth(fine.getUTCMonth() + 6)
  fine.setUTCDate(fine.getUTCDate() - 1)
  const { data: vendita, error } = await db
    .from('sales')
    .insert({
      client_id: id,
      product_id: PRODOTTO_6_MESI,
      tipo: 'nuovo',
      closer_id: ID_CLOSER,
      data_vendita: oggi,
      data_inizio: oggi,
      data_fine: fine.toISOString().slice(0, 10),
      valore_contratto: 2400,
      numero_rate: 2,
      created_by: ID_ADMIN,
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await db.from('clienti_cartelle').insert({ client_id: id, url: URL_DRIVE, created_by: ID_ADMIN })
  if (e2) throw e2

  await accedi(page, 'closer')
  // the client sheet is the admin's: the closer is sent back to his own pages
  await page.goto(`/clients/${id}`)
  await expect(page).not.toHaveURL(new RegExp(`/clients/${id}`))
  expect(await page.content()).not.toContain('drive.google.com')

  // his sales list and his sale: the client is there, the folder never
  await page.goto('/my-sales')
  await expect(page.getByText(NOME).filter({ visible: true }).first()).toBeVisible()
  expect(await page.content()).not.toContain('drive.google.com')
  await page.goto(`/sales/${vendita.id}`)
  await expect(page.getByText(NOME).filter({ visible: true }).first()).toBeVisible()
  const html = await page.content()
  expect(html).not.toContain('drive.google.com')
  expect(html).not.toContain('Cartella Drive')
})

// ---------------------------------------------------------------------------
// "Scegli da Drive" (04/10/2026): the Google Picker, never the real Google
// ---------------------------------------------------------------------------

const ID_CARTELLA = '1E2eCartellaScelta_DaDrive-0123456789'
const TOKEN_FINTO = 'token-finto-e2e-ya29'

type CompitoFinto = {
  /** What Google's sign-in answers: a token, or one of its errors. */
  accesso: 'ok' | 'popup_failed_to_open' | 'popup_closed' | 'access_denied'
  /** What the person does in the Picker, or the Picker's own error. */
  picker: 'cartella' | 'file' | 'annulla' | 'errore'
  /** The libraries arrive only when the app loads Google's scripts (answered locally by the test). */
  tardi?: boolean
}

/**
 * A fake Google on window, before the page loads: the app finds the libraries
 * already there and never adds their scripts (with `tardi`, they arrive when
 * the app loads the scripts, which the test answers locally). It records what
 * the app asked.
 */
async function googleFinto(page: Page, compito: CompitoFinto) {
  await page.addInitScript(
    ({ compito, token, id, mime }) => {
      const w = window as unknown as Record<string, unknown>
      const registro: Record<string, unknown>[] = []
      w.__driveFinto = { compito, registro }
      const finto = () => (w.__driveFinto as { compito: typeof compito }).compito
      class DocsView {
        impostazioni: Record<string, unknown> = {}
        constructor(vista: string) {
          this.impostazioni.vista = vista
        }
        setIncludeFolders(v: boolean) {
          this.impostazioni.cartelle = v
          return this
        }
        setSelectFolderEnabled(v: boolean) {
          this.impostazioni.sceltaCartella = v
          return this
        }
        setMimeTypes(v: string) {
          this.impostazioni.mime = v
          return this
        }
        setOwnedByMe(v: boolean) {
          this.impostazioni.mie = v
          return this
        }
      }
      class PickerBuilder {
        impostazioni: Record<string, unknown> = { viste: [] as unknown[] }
        callback: (dati: Record<string, unknown>) => void = () => undefined
        setAppId(v: string) {
          this.impostazioni.appId = v
          return this
        }
        setOAuthToken(v: string) {
          this.impostazioni.token = v
          return this
        }
        setDeveloperKey(v: string) {
          this.impostazioni.chiave = v
          return this
        }
        setLocale(v: string) {
          this.impostazioni.lingua = v
          return this
        }
        setTitle(v: string) {
          this.impostazioni.titolo = v
          return this
        }
        addView(v: DocsView) {
          ;(this.impostazioni.viste as unknown[]).push(v.impostazioni)
          return this
        }
        setCallback(fn: (dati: Record<string, unknown>) => void) {
          this.callback = fn
          return this
        }
        build() {
          registro.push({ picker: this.impostazioni })
          const cb = this.callback
          return {
            setVisible: () =>
              setTimeout(() => {
                const scelta = finto().picker
                if (scelta === 'annulla') return cb({ action: 'cancel' })
                if (scelta === 'errore') return cb({ action: 'error' })
                cb({
                  action: 'picked',
                  docs: [
                    {
                      id: scelta === 'file' ? 'unFileQualsiasi-123' : id,
                      mimeType: scelta === 'file' ? 'application/pdf' : mime,
                      name: 'Cartella del cliente',
                      // never used: the URL is rebuilt from the id
                      url: 'https://esempio.invalid/non-drive',
                    },
                  ],
                })
              }, 50),
            dispose: () => undefined,
          }
        }
      }
      const google = {
        accounts: {
          oauth2: {
            initTokenClient: (config: {
              client_id: string
              scope: string
              include_granted_scopes?: boolean
              callback: (r: Record<string, unknown>) => void
              error_callback?: (e: { type: string }) => void
            }) => {
              registro.push({
                token: { client_id: config.client_id, scope: config.scope, altri_permessi: config.include_granted_scopes },
              })
              return {
                requestAccessToken: () =>
                  setTimeout(() => {
                    const accesso = finto().accesso
                    if (accesso === 'ok') config.callback({ access_token: token, expires_in: 3599 })
                    else if (accesso === 'access_denied') config.callback({ error: 'access_denied' })
                    else config.error_callback?.({ type: accesso })
                  }, 50),
              }
            },
          },
        },
        picker: {
          ViewId: { FOLDERS: 'folders' },
          DocsView,
          PickerBuilder,
          Action: { PICKED: 'picked', CANCEL: 'cancel', ERROR: 'error' },
          Response: { ACTION: 'action', DOCUMENTS: 'docs' },
          Document: { ID: 'id', MIME_TYPE: 'mimeType', NAME: 'name' },
        },
      }
      const installa = () => {
        w.google = google
        w.gapi = { load: (_: string, o: { callback: () => void }) => setTimeout(o.callback, 0) }
      }
      w.__installaGoogle = installa
      if (!compito.tardi) installa()
    },
    { compito, token: TOKEN_FINTO, id: ID_CARTELLA, mime: MIME_CARTELLA },
  )
}

/** Every request to Google is refused and written down: the test must leave it empty. */
async function bloccaGoogle(context: BrowserContext) {
  const chiamate: string[] = []
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(google\.com|googleapis\.com|gstatic\.com)\//, (r) => {
    chiamate.push(r.request().url())
    return r.abort()
  })
  return chiamate
}

async function registro(page: Page) {
  return page.evaluate(() => (window as unknown as { __driveFinto: { registro: Record<string, unknown>[] } }).__driveFinto.registro)
}

async function impostaCompito(page: Page, compito: Partial<CompitoFinto>) {
  await page.evaluate((c) => {
    const f = (window as unknown as { __driveFinto: { compito: Record<string, unknown> } }).__driveFinto
    Object.assign(f.compito, c)
  }, compito)
}

const configurato = Boolean(
  (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
    (process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY || process.env.GOOGLE_PICKER_API_KEY) &&
    (process.env.NEXT_PUBLIC_GOOGLE_APP_ID || process.env.GOOGLE_APP_ID),
)

test('senza la configurazione di Google il bottone «Scegli da Drive» non c’è e resta il link', async ({ page }) => {
  test.skip(configurato, 'questo ambiente ha il Google Picker configurato')
  test.setTimeout(90_000)
  const id = await creaCliente()
  await accedi(page, 'admin')
  await page.goto(`/clients/${id}`)
  await page.getByTestId('cartella-drive').getByRole('button', { name: 'Aggiungi' }).click()
  const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
  await expect(foglio.getByLabel('Link della cartella')).toBeVisible()
  await expect(foglio.getByRole('button', { name: 'Scegli da Drive' })).toHaveCount(0)
})

test.describe('«Scegli da Drive» con la configurazione di prova, a 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: COOKIE_PICKER_E2E, value: '1', url: baseURL ?? 'http://localhost:3000' }])
  })

  test('si collega a Google, sceglie la cartella e la salva: il link rifatto dall’id, il token mai al server', async ({ page, context }) => {
    test.setTimeout(90_000)
    const id = await creaCliente()
    const google = await bloccaGoogle(context)
    // every request to our own server, body included: the token must never be there
    const alServer: string[] = []
    page.on('request', (r) => {
      if (r.url().startsWith('http://localhost')) alServer.push(`${r.url()} ${r.postData() ?? ''}`)
    })
    await googleFinto(page, { accesso: 'ok', picker: 'annulla' })

    await accedi(page, 'admin')
    await page.goto(`/clients/${id}`)
    const riga = page.getByTestId('cartella-drive')
    await riga.getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
    const bottone = foglio.getByRole('button', { name: 'Scegli da Drive' })
    await expect(bottone).toBeVisible()
    const box = await bottone.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    // the typed link stays, as the other way
    await expect(foglio.getByLabel('Link della cartella')).toBeVisible()

    // nothing chosen: the sheet comes back and says so
    await bottone.click()
    await expect(foglio.getByText('Nessuna cartella scelta: scegline una o incolla il link.')).toBeVisible()

    // the second time the token is still in memory: no second sign-in
    await impostaCompito(page, { picker: 'cartella' })
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(page.getByText('Cartella collegata', { exact: true })).toBeVisible()
    await expect(foglio).toBeHidden()

    const url = `https://drive.google.com/drive/folders/${ID_CARTELLA}`
    await expect(riga.getByRole('link', { name: /Cartella Drive/ })).toHaveAttribute('href', url)
    const { data: salvata } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id).single()
    expect(salvata?.url).toBe(url)

    const fatto = await registro(page)
    const accessi = fatto.filter((r) => 'token' in r)
    // drive.file only, never the login's scopes of the same client added to the token
    expect(accessi).toEqual([
      { token: { client_id: CONFIG_PICKER_E2E.clientId, scope: SCOPE_DRIVE_FILE, altri_permessi: false } },
    ])
    const picker = fatto.filter((r) => 'picker' in r).map((r) => r.picker)
    expect(picker).toHaveLength(2)
    expect(picker[1]).toEqual({
      appId: CONFIG_PICKER_E2E.appId,
      token: TOKEN_FINTO,
      chiave: CONFIG_PICKER_E2E.apiKey,
      lingua: 'it',
      titolo: 'Scegli la cartella del cliente',
      // the person's Drive with its folders; the folders shared with him (never "show folders" with "shared with me")
      viste: [
        { vista: 'folders', cartelle: true, sceltaCartella: true, mime: MIME_CARTELLA },
        { vista: 'folders', sceltaCartella: true, mime: MIME_CARTELLA, mie: false },
      ],
    })
    expect(alServer.some((r) => r.includes(TOKEN_FINTO))).toBe(false)
    expect(google).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('finestra bloccata, accesso negato, un file al posto della cartella: lo dice in italiano e non salva', async ({ page, context }) => {
    test.setTimeout(90_000)
    const id = await creaCliente()
    const google = await bloccaGoogle(context)
    await googleFinto(page, { accesso: 'popup_failed_to_open', picker: 'file' })

    await accedi(page, 'admin')
    await page.goto(`/clients/${id}`)
    await page.getByTestId('cartella-drive').getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })

    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(foglio.getByText('Il browser ha bloccato la finestra di Google')).toBeVisible()

    await impostaCompito(page, { accesso: 'access_denied' })
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(foglio.getByText('Senza il permesso di Google non posso aprire Drive')).toBeVisible()

    await impostaCompito(page, { accesso: 'ok' })
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(foglio.getByText('Hai scelto un file, non una cartella: scegli una cartella.')).toBeVisible()

    // the Picker's own error (a key Google refuses): the sheet comes back, nothing hangs
    await impostaCompito(page, { picker: 'errore' })
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(foglio.getByText('Google Drive non si è aperto: riprova o incolla il link.')).toBeVisible()
    await expect(foglio.getByRole('button', { name: 'Scegli da Drive' })).toBeEnabled()

    const { data } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id)
    expect(data).toEqual([])
    expect(google).toEqual([])

    // and the pasted link still saves
    await foglio.getByLabel('Link della cartella').fill(URL_DRIVE)
    await expect(foglio.getByRole('button', { name: 'Salva' })).toBeEnabled()
    await foglio.getByRole('button', { name: 'Salva' }).click()
    await expect(page.getByText('Cartella collegata', { exact: true })).toBeVisible()
    const { data: salvata } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id).single()
    expect(salvata?.url).toBe(URL_DRIVE)
  })

  test('tocco prima che Google sia caricato: nessuna finestra fuori dal tocco, il secondo tocco la apre', async ({ page, context }) => {
    test.setTimeout(90_000)
    const id = await creaCliente()
    const google = await bloccaGoogle(context)
    await googleFinto(page, { accesso: 'ok', picker: 'cartella', tardi: true })
    // Google's two scripts answered here, never by Google, and only when the test says so
    let rilascia!: () => void
    const caricati = new Promise<void>((r) => {
      rilascia = () => r()
    })
    for (const src of [SCRIPT_GOOGLE.identita, SCRIPT_GOOGLE.api]) {
      await page.route(src, async (r) => {
        await caricati
        await r.fulfill({ contentType: 'text/javascript', body: 'window.__installaGoogle()' })
      })
    }

    await accedi(page, 'admin')
    await page.goto(`/clients/${id}`)
    await page.getByTestId('cartella-drive').getByRole('button', { name: 'Aggiungi' }).click()
    const foglio = page.getByRole('dialog', { name: 'Cartella Drive', exact: true })
    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    rilascia()
    await expect(foglio.getByText('Google Drive è pronto: tocca di nuovo «Scegli da Drive».')).toBeVisible()
    // the first tap asked Google for nothing: its window would have opened after the tap
    expect((await registro(page)).filter((r) => 'token' in r)).toEqual([])

    await foglio.getByRole('button', { name: 'Scegli da Drive' }).click()
    await expect(page.getByText('Cartella collegata', { exact: true })).toBeVisible()
    const { data: salvata } = await dbLocale().from('clienti_cartelle').select('url').eq('client_id', id).single()
    expect(salvata?.url).toBe(`https://drive.google.com/drive/folders/${ID_CARTELLA}`)
    expect(google).toEqual([])
  })
})
