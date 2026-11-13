import { expect, test } from '@playwright/test'

import { sessioneDb } from './call-db'
import { dbLocale } from './db'
import {
  aspettaCodice,
  attivaDiProva,
  creaOnboardingDiProva,
  emailDiProva,
  idPosta,
  invitoDi,
  linkDi,
  pulisciClientiPercorso,
} from './percorso-db'
import { accedi } from './utenti'

/*
 * «Area clienti» (release B2): the admin cannot open the area while a content still says
 * «[Da scrivere», a video has the placeholder id or a link is missing; with everything written
 * he opens it, and a normal invite (not a test client) registers and enters /percorso. At the
 * end the area is closed again and the contents are put back as they were. Local database only.
 */
const PREFISSO = 'E2EApertura'

type Blocco = { id: string; titolo: string | null; corpo: string | null; url: string | null; youtube_id: string | null }
let blocchiPrima: Blocco[] = []
let impostazioniPrima: { link_prenotazione: string | null; link_community: string | null } | null = null

test.beforeAll(async () => {
  const db = dbLocale()
  const { data } = await db.from('onboarding_impostazioni').select('link_prenotazione, link_community').single()
  impostazioniPrima = data
  // a placeholder in the CMS, so the first try is refused whatever the state of the seed
  const { data: blocchi } = await db.from('contenuti_blocchi').select('id, titolo, corpo, url, youtube_id')
  blocchiPrima = blocchi ?? []
  await db.from('onboarding_impostazioni').update({ link_prenotazione: null }).eq('id', true)
})

test.afterAll(async () => {
  const admin = await sessioneDb('admin')
  await admin.rpc('onboarding_chiudi_ai_clienti')
  const db = dbLocale()
  for (const b of blocchiPrima) {
    await db.from('contenuti_blocchi').update({ titolo: b.titolo, corpo: b.corpo, url: b.url, youtube_id: b.youtube_id }).eq('id', b.id)
  }
  if (impostazioniPrima) await db.from('onboarding_impostazioni').update(impostazioniPrima).eq('id', true)
  await pulisciClientiPercorso(PREFISSO)
})

test('l’admin non apre l’area con un segnaposto, poi la apre e un invito normale funziona', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await accedi(page, 'admin')
  await page.goto('/settings/onboarding')
  const area = page.getByTestId('area-clienti')
  await expect(area).toContainText('Chiusa ai clienti')

  // what is missing is on the card before any tap, and «Apri ai clienti» waits for it
  const problemi = area.getByTestId('area-manca')
  await expect(problemi).toBeVisible()
  await expect(problemi).toContainText('Prima di aprire l’area clienti:')
  await expect(problemi).toContainText('pagina di prenotazione')
  await expect(problemi).toContainText('«[Da scrivere»')
  await expect(area.getByTestId('apri-area')).toHaveAttribute('aria-disabled', 'true')
  await area.getByTestId('apri-area').click({ force: true })
  await expect(page.getByTestId('area-clienti-foglio')).toHaveCount(0)
  const { data: chiusa } = await dbLocale().from('onboarding_impostazioni').select('aperto_ai_clienti').single()
  expect(chiusa?.aperto_ai_clienti).toBe(false)

  // a direct PATCH of the admin is refused too
  const admin = await sessioneDb('admin')
  const { error: patch } = await admin.from('onboarding_impostazioni').update({ aperto_ai_clienti: true }).eq('id', true)
  expect(patch?.code).toBe('42501')

  // everything written: the contents without placeholders, the two links
  const db = dbLocale()
  for (const b of blocchiPrima) {
    const testo = (t: string | null) => (t && t.includes('[Da scrivere') ? 'Testo scritto per la prova.' : t)
    await db
      .from('contenuti_blocchi')
      .update({
        titolo: testo(b.titolo),
        corpo: testo(b.corpo),
        url: b.url?.includes('da-scrivere') ? 'https://example.com/coach-plus' : b.url,
        youtube_id: b.youtube_id === 'XXXXXXXXXXX' ? 'AbCdEfGhIjK' : b.youtube_id,
      })
      .eq('id', b.id)
  }
  await db
    .from('onboarding_impostazioni')
    .update({ link_prenotazione: 'https://calendar.app.google/e2eFinto', link_community: 'https://t.me/+e2eFinto' })
    .eq('id', true)

  await page.reload()
  await expect(area.getByTestId('area-manca')).toHaveCount(0)
  await area.getByTestId('apri-area').click()
  await page.getByTestId('area-clienti-si').click()
  await page.getByTestId('area-clienti-si').click()
  await expect(page.getByText('Area clienti aperta').first()).toBeVisible({ timeout: 15_000 })
  await expect(area).toContainText('Aperta ai clienti')

  // a normal invite, not a test client: the link opens, the client registers and enters
  const nome = `${PREFISSO}Sara${Date.now().toString().slice(-5)}`
  const email = emailDiProva('apertura')
  const { clientId } = await creaOnboardingDiProva(nome, email)
  await attivaDiProva(clientId, false)
  const invito = await invitoDi(clientId)
  expect(invito?.prova).toBe(false)
  const link = await linkDi(clientId)
  const contesto = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const cliente = await contesto.newPage()
  await cliente.goto(link!)
  await expect(cliente.getByRole('heading', { name: `Ciao ${nome}.` })).toBeVisible()
  await cliente.getByRole('button', { name: 'Continua' }).click()
  await expect(cliente).toHaveURL(/\/join\/registrati$/)
  const viste = await idPosta(email)
  await cliente.getByRole('button', { name: 'Inviami il codice' }).click()
  const mail = await aspettaCodice(email, viste)
  expect(mail?.codice).toBeTruthy()
  await cliente.getByLabel('Il codice', { exact: true }).fill(mail!.codice!)
  await cliente.getByRole('button', { name: 'Entra nel percorso' }).click()
  await expect(cliente).toHaveURL(/\/percorso$/, { timeout: 30_000 })
  await expect(cliente.getByTestId('pannello-passo')).toHaveAttribute('data-vista', 'passo:benvenuto')
  await contesto.close()

  // the admin closes it again: the account just made stays
  await page.reload()
  await area.getByTestId('chiudi-area').click()
  await page.getByTestId('area-clienti-si').click()
  await page.getByTestId('area-clienti-si').click()
  await expect(page.getByText('Area clienti chiusa').first()).toBeVisible({ timeout: 15_000 })
  const { data: account } = await db.from('clienti_account').select('stato').eq('client_id', clientId).single()
  expect(account?.stato).toBe('attivo')
})
