import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { UTENTI } from './utenti'

/**
 * Sign-in with a code or a link sent by email (CLAUDE.md section 7), against the
 * local Supabase and Mailpit. The emails are read from Mailpit's API.
 *
 * The code and the link are in the email only when the local Supabase has the
 * template of supabase/config.toml ([auth.email.template.magic_link]), which it
 * reads at `supabase start`. An instance started before that sends Supabase's
 * default email (a link of its own, no code): then the code and the token of
 * the link are asked to the admin API instead (generateLink), the same values
 * Supabase would have put in the email, and the test says so in its annotations.
 */

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const ADMIN = UTENTI.admin.email
const FRASE_INVIATA = 'Se l’indirizzo è registrato, ti abbiamo scritto: apri il link o inserisci il codice.'

type MessaggioElenco = { ID: string; Created: string }

async function idPosta(email: string): Promise<Set<string>> {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  const j = (await r.json()) as { messages?: MessaggioElenco[] }
  return new Set((j.messages ?? []).map((m) => m.ID))
}

/** The first email to `email` that was not there before, or null after the wait. */
async function aspettaMail(email: string, giaViste: Set<string>, attesaMs = 12_000): Promise<string | null> {
  const fine = Date.now() + attesaMs
  while (Date.now() < fine) {
    const ora = await idPosta(email)
    const nuovo = [...ora].find((id) => !giaViste.has(id))
    if (nuovo) {
      const r = await fetch(`${MAILPIT}/api/v1/message/${nuovo}`)
      const m = (await r.json()) as { HTML?: string }
      return m.HTML ?? ''
    }
    await new Promise((res) => setTimeout(res, 400))
  }
  return null
}

/** The link of the button, pointed at the server under test (the email carries the Site URL). */
function linkDa(html: string): string | null {
  const m = html.match(/href="([^"]*\/auth\/conferma\?[^"]+)"/)
  if (!m) return null
  const url = new URL(m[1].replace(/&amp;/g, '&'))
  return `${BASE}${url.pathname}${url.search}`
}

function codiceDa(html: string): string | null {
  return html.match(/>\s*(\d{8})\s*</)?.[1] ?? null
}

/** Code and link of the email just sent; from the admin API if the email does not carry them (see above). */
async function accessoDa(email: string, giaViste: Set<string>) {
  const html = await aspettaMail(email, giaViste)
  expect(html, 'una mail di accesso è arrivata in Mailpit').not.toBeNull()
  const codice = codiceDa(html!)
  const link = linkDa(html!)
  if (codice && link) return { codice, link, dallaMail: true }

  test.info().annotations.push({
    type: 'template',
    description: 'Il Supabase locale non ha ancora il template (riavvialo con supabase stop e start): codice e token dall’API admin.',
  })
  const { data, error } = await dbLocale().auth.admin.generateLink({ type: 'magiclink', email })
  expect(error).toBeNull()
  const props = data.properties!
  return {
    codice: props.email_otp,
    link: `${BASE}/auth/conferma?token_hash=${props.hashed_token}&type=email`,
    dallaMail: false,
  }
}

async function chiediCodice(page: Page, email: string, da?: string) {
  await page.goto(da ? `/login?da=${encodeURIComponent(da)}` : '/login')
  await page.getByLabel('Indirizzo di posta').fill(email)
  await page.getByRole('button', { name: 'Invia il codice' }).click()
  await expect(page.getByTestId('accesso-codice-codice')).toBeVisible()
}

function passoCodice(page: Page) {
  return page.getByTestId('accesso-codice-codice')
}

test.describe('accesso con codice e link', () => {
  test('l’admin entra con il codice ricevuto per email', async ({ page }) => {
    const viste = await idPosta(ADMIN)
    await chiediCodice(page, ADMIN)

    const passo = passoCodice(page)
    await expect(passo).toContainText(FRASE_INVIATA)
    await expect(passo).toContainText(ADMIN)
    await expect(passo.getByLabel('Codice di accesso')).toBeFocused()
    // the pause before a new code is counted, the button is off meanwhile
    await expect(passo.getByRole('button', { name: /^Invia di nuovo tra \d+ second/ })).toBeDisabled()

    const { codice } = await accessoDa(ADMIN, viste)
    await passo.getByLabel('Codice di accesso').fill(codice)
    await passo.getByRole('button', { name: 'Entra' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Panoramica' })).toBeVisible()
  })

  test('il codice incollato con uno spazio nel mezzo entra lo stesso, e si torna dov’ero diretto', async ({ page }) => {
    const viste = await idPosta(UTENTI.setter.email)
    await chiediCodice(page, UTENTI.setter.email.toUpperCase(), '/today')

    const { codice } = await accessoDa(UTENTI.setter.email, viste)
    const passo = passoCodice(page)
    await passo.getByLabel('Codice di accesso').fill(`${codice.slice(0, 3)} ${codice.slice(3)}`)
    await passo.getByRole('button', { name: 'Entra' }).click()

    await expect(page).toHaveURL('/today')
  })

  test('il magic link entra, anche aperto da un altro browser; un secondo uso dice che è scaduto', async ({
    page,
    browser,
  }) => {
    const viste = await idPosta(ADMIN)
    // asked from this browser…
    await chiediCodice(page, ADMIN)
    const { link } = await accessoDa(ADMIN, viste)

    // …opened in another one: no cookie of this session, no verifier
    const altro = await browser.newContext({ locale: 'it-IT', baseURL: BASE })
    try {
      const pagina = await altro.newPage()
      await pagina.goto(link)
      await expect(pagina).toHaveURL(`${BASE}/`)
      await expect(pagina.getByRole('heading', { name: 'Panoramica' })).toBeVisible()

      // a second browser, same link: already used
      const terzo = await browser.newContext({ locale: 'it-IT', baseURL: BASE })
      try {
        const p3 = await terzo.newPage()
        await p3.goto(link)
        await expect(p3).toHaveURL(/\/login\?errore=link-scaduto/)
        await expect(p3.getByText('Il link è scaduto o è già stato usato: chiedine uno nuovo.')).toBeVisible()
      } finally {
        await terzo.close()
      }
    } finally {
      await altro.close()
    }
  })

  test('un indirizzo non registrato riceve la stessa risposta e non arriva niente', async ({ page }) => {
    const sconosciuto = `e2e.sconosciuto.${Date.now()}@alpha.test`
    const db = dbLocale()
    const t0 = Date.now()
    await chiediCodice(page, sconosciuto)
    const durataSconosciuto = Date.now() - t0

    await expect(passoCodice(page)).toContainText(FRASE_INVIATA)
    // the same wait as for a real address: the answer does not give the address away
    expect(durataSconosciuto).toBeGreaterThan(1000)

    expect(await aspettaMail(sconosciuto, new Set(), 3000)).toBeNull()
    // and nobody was created: the invite gate is where it was
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
    expect(data.users.some((u) => u.email === sconosciuto)).toBe(false)
  })

  test('un account disattivato riceve la stessa risposta, poi viene rifiutato come con Google', async ({ page }) => {
    const email = `e2e.disattivato.${Date.now()}@alpha.test`
    const db = dbLocale()
    await db.from('invites').insert({ email, ruolo: 'setter' })
    const { data: creato } = await db.auth.admin.createUser({ email, email_confirm: true })
    try {
      await db.from('profiles').update({ attivo: false }).eq('id', creato.user!.id)

      const viste = await idPosta(email)
      await chiediCodice(page, email)
      await expect(passoCodice(page)).toContainText(FRASE_INVIATA)

      const { codice } = await accessoDa(email, viste)
      await passoCodice(page).getByLabel('Codice di accesso').fill(codice)
      await passoCodice(page).getByRole('button', { name: 'Entra' }).click()

      await expect(page).toHaveURL(/\/login\?errore=disattivato/)
      await expect(page.getByText('Account disattivato. Contatta l’amministratore.')).toBeVisible()
      // no session left: the app stays closed
      await page.goto('/sales')
      await expect(page).toHaveURL(/\/login/)
    } finally {
      if (creato.user) await db.auth.admin.deleteUser(creato.user.id).catch(() => undefined)
      await db.from('invites').delete().eq('email', email)
    }
  })

  test('lo stesso vale per il link di un account disattivato', async ({ page }) => {
    const email = `e2e.disattivato.link.${Date.now()}@alpha.test`
    const db = dbLocale()
    await db.from('invites').insert({ email, ruolo: 'setter' })
    const { data: creato } = await db.auth.admin.createUser({ email, email_confirm: true })
    try {
      await db.from('profiles').update({ attivo: false }).eq('id', creato.user!.id)
      const viste = await idPosta(email)
      await chiediCodice(page, email)
      const { link } = await accessoDa(email, viste)

      await page.goto(link)
      await expect(page).toHaveURL(/\/login\?errore=disattivato/)
      await expect(page.getByText('Account disattivato. Contatta l’amministratore.')).toBeVisible()
    } finally {
      if (creato.user) await db.auth.admin.deleteUser(creato.user.id).catch(() => undefined)
      await db.from('invites').delete().eq('email', email)
    }
  })

  test('un codice sbagliato dà un errore chiaro e si può riprovare', async ({ page }) => {
    const viste = await idPosta(ADMIN)
    await chiediCodice(page, ADMIN)
    const { codice } = await accessoDa(ADMIN, viste)
    const sbagliato = codice.startsWith('9') ? `0${codice.slice(1)}` : `9${codice.slice(1)}`

    const passo = passoCodice(page)
    await passo.getByLabel('Codice di accesso').fill(sbagliato)
    await passo.getByRole('button', { name: 'Entra' }).click()
    await expect(passo.getByRole('alert')).toContainText('Il codice non è valido o è scaduto')
    await expect(page).toHaveURL(/\/login/)

    // the right one still works
    await passo.getByLabel('Codice di accesso').fill(codice)
    await passo.getByRole('button', { name: 'Entra' }).click()
    await expect(page).toHaveURL('/')
  })

  test('i controlli del modulo: indirizzo non valido, codice di cinque cifre', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Indirizzo di posta').fill('non-un-indirizzo')
    await page.getByRole('button', { name: 'Invia il codice' }).click()
    await expect(page.getByText('Scrivi un indirizzo valido')).toBeVisible()
    await expect(page.getByTestId('accesso-codice-codice')).toHaveCount(0)

    const viste = await idPosta(ADMIN)
    await page.getByLabel('Indirizzo di posta').fill(ADMIN)
    await page.getByRole('button', { name: 'Invia il codice' }).click()
    const passo = passoCodice(page)
    await passo.getByLabel('Codice di accesso').fill('1234567')
    await passo.getByRole('button', { name: 'Entra' }).click()
    await expect(passo.getByText('Il codice ha 8 cifre')).toBeVisible()
    await aspettaMail(ADMIN, viste)

    // "Cambia email" goes back to the first step with the address still there
    await passo.getByRole('button', { name: 'Cambia email' }).click()
    await expect(page.getByLabel('Indirizzo di posta')).toHaveValue(ADMIN)
  })

  test('«Invia di nuovo» si riaccende dopo 60 secondi e manda un altro codice', async ({ page }) => {
    await page.clock.install()
    const viste = await idPosta(ADMIN)
    await page.goto('/login')
    await page.getByLabel('Indirizzo di posta').fill(ADMIN)
    await page.getByRole('button', { name: 'Invia il codice' }).click()
    const passo = passoCodice(page)
    await expect(passo).toBeVisible()
    await aspettaMail(ADMIN, viste)

    const ancora = passo.getByRole('button', { name: /^Invia di nuovo tra/ })
    await expect(ancora).toBeDisabled()
    await page.clock.runFor(61_000)
    const di_nuovo = passo.getByRole('button', { name: 'Invia di nuovo', exact: true })
    await expect(di_nuovo).toBeEnabled()

    const dopoPrima = await idPosta(ADMIN)
    await di_nuovo.click()
    await expect(passo).toContainText('Codice inviato di nuovo')
    expect(await aspettaMail(ADMIN, dopoPrima)).not.toBeNull()
    await expect(passo.getByRole('button', { name: /^Invia di nuovo tra/ })).toBeDisabled()
  })
})

test.describe('la route del link', () => {
  test('risponde solo a GET: HEAD e POST sono rifiutati e non consumano niente', async ({ request }) => {
    const head = await request.head('/auth/conferma?token_hash=abcdefabcdefabcdefabcdef&type=email', { maxRedirects: 0 })
    expect(head.status()).toBe(405)
    const post = await request.post('/auth/conferma', { maxRedirects: 0 })
    expect(post.status()).toBe(405)
  })

  test('parametri mancanti, strani o un token inventato portano al login con il messaggio del link scaduto', async ({
    request,
  }) => {
    for (const query of [
      '',
      '?token_hash=x&type=email',
      '?token_hash=abcdefabcdefabcdefabcdef&type=recovery',
      '?token_hash=abcdefabcdefabcdefabcdef&type=email',
      '?token_hash=../../etc/passwd&type=email',
    ]) {
      const r = await request.get(`/auth/conferma${query}`, { maxRedirects: 0 })
      expect(r.status(), query).toBe(307)
      expect(r.headers()['location'], query).toContain('/login?errore=link-scaduto')
      expect(r.headers()['cache-control'], query).toBe('no-store')
    }
  })

  test('«da» fuori dall’app non porta mai fuori: si finisce a casa propria', async ({ page, browser }) => {
    const viste = await idPosta(ADMIN)
    await chiediCodice(page, ADMIN)
    const { link } = await accessoDa(ADMIN, viste)

    const altro = await browser.newContext({ locale: 'it-IT', baseURL: BASE })
    try {
      const p = await altro.newPage()
      await p.goto(`${link}&da=${encodeURIComponent('https://evil.example.com/x')}`)
      await expect(p).toHaveURL(`${BASE}/`)
    } finally {
      await altro.close()
    }
  })

  test('accesso già fatto: /login rimanda dentro (la sessione del codice è una sessione vera)', async ({ page }) => {
    const viste = await idPosta(ADMIN)
    await chiediCodice(page, ADMIN)
    const { codice } = await accessoDa(ADMIN, viste)
    await passoCodice(page).getByLabel('Codice di accesso').fill(codice)
    await passoCodice(page).getByRole('button', { name: 'Entra' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/login')
    await expect(page).toHaveURL('/')
  })
})
