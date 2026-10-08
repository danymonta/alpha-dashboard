import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import type { Database } from '../lib/supabase/database.types'
import { dbLocale, ID_SETTER } from './db'
import { accedi, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * Impostazioni › Instagram (Dany, 08/10/2026): the admin connects the account
 * whose DMs precompile the setter's report. The token goes in and never comes
 * back (not in the page, not in its HTML, not in an action's answer); the
 * excluded chats, who works the DMs. The setter and the coach never open it.
 * Instagram is never called: "Ricalcola ieri" is not tapped here (the
 * reader's tests use a fake Graph API).
 */

// invented, shaped like a token: never a real one
const TOKEN = `IGAAe2eFinto${Date.now()}QwErTyUiOp`
const USERNAME = `e2e.prova.${Date.now().toString(36)}`

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
    await page.getByRole('link', { name: /Instagram/ }).click()
    await expect(page).toHaveURL(/\/settings\/instagram$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Instagram' })).toBeVisible()

    const stato = page.getByTestId('instagram-stato')
    await expect(stato).toContainText('Non collegato')
    // nothing to recompute without a token
    await expect(page.getByRole('button', { name: 'Ricalcola ieri' })).toBeDisabled()
    await expect(page.getByText('Prima salva il token.')).toBeVisible()

    // the token: a password field, never prefilled, pasted the messy way
    const campo = page.getByLabel('Token di accesso')
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(campo).toHaveAttribute('autocomplete', 'off')
    await expect(campo).toHaveValue('')
    await campo.fill(`  "IG_TOKEN=${TOKEN}"  `)
    const salva = page.getByRole('button', { name: 'Salva il token' })
    expect((await salva.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await salva.click()

    const scade = formatData(oggiRoma(new Date(Date.now() + 60 * 86_400_000)))
    await expect(page.getByTestId('instagram-token-salvato')).toHaveText(`Token salvato, scade il ${scade}`)
    await expect(stato).toContainText(`Salvato, scade il ${scade}`)
    await expect(page.getByLabel('Token nuovo')).toHaveValue('')

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
    const html = await (await page.request.get('/settings/instagram')).text()
    expect(html).toContain('Token salvato')
    expect(html).not.toContain(TOKEN)
    expect((await Promise.all(risposte)).join('\n')).not.toContain(TOKEN)

    // expired, and the last error of the night: in evidence, with when
    await db
      .from('instagram_collegamento')
      .update({ token_scade_il: new Date(Date.now() - 3_600_000).toISOString() })
      .eq('id', true)
    await db.rpc('instagram_errore', { p_messaggio: 'Prova e2e: Instagram non ha risposto' })
    await page.reload()
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

    // the recompute is ready now, and says the numbers are the setter's (not tapped: no Instagram here)
    const ricalcola = page.getByRole('region', { name: 'Ricalcola ieri' })
    await expect(ricalcola).toContainText(`la proposta la vede solo ${UTENTI.setter.nome}`)
    await expect(ricalcola.getByRole('button', { name: 'Ricalcola ieri' })).toBeEnabled()

    // no sideways scroll on the phone
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    // the token goes away after the question
    await page.getByRole('button', { name: 'Togli il token' }).click()
    const togli = page.getByRole('dialog', { name: 'Eliminare il token di Instagram?' })
    await expect(togli).toContainText('La proposta di ogni notte si ferma')
    await togli.getByRole('button', { name: 'Elimina' }).click()
    await expect(togli).toBeHidden()
    await expect(stato).toContainText('Non collegato')
    const { data: dopo } = await db.rpc('instagram_token')
    expect(dopo).toBeNull()
  })
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
