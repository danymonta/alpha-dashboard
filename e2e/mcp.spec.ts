import { randomUUID } from 'node:crypto'

import { expect, test, type Browser, type Page } from '@playwright/test'

import { oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { BOZZA_REEL } from '../lib/marketing/etichette'
import { ICP } from '../lib/marketing/icp'
import { CONSENSO, MESSAGGI_AUTORIZZAZIONE } from '../lib/mcp/consenso'
import {
  ID_MARKETING,
  dbLocale,
  eliminaClientMcp,
  impostaProfilo,
  leggiContenuto,
  pulisciContenuti,
  registraClientMcp,
} from './db'
import {
  CALLBACK_E2E,
  apriConsenso,
  catturaCallback,
  chiamataGrezza,
  claimsDi,
  clientMcp,
  dataApiConToken,
  datiRisultato,
  nuovaAutorizzazione,
  rinnova,
  scambiaCodice,
  testoRisultato,
  type Autorizzazione,
  type Token,
} from './mcp-helpers'
import { UTENTI, accedi, type RuoloSeed } from './utenti'

/**
 * Claude connected to Alpha Management (MCP, 09/10/2026), end to end on the
 * local stack: a public client registered by hand, Supabase Auth's OAuth 2.1
 * server, the consent page, the token exchange as Claude does it, then /mcp
 * with the SDK's own client and the Data API with the same token. Local only:
 * supabase/config.toml has [auth.oauth_server] enabled = true. Contents start
 * with PREFISSO and go away at the end; the marketing seed account gets its
 * role and state back.
 */
const PREFISSO = 'E2E MCP '
const NOME_CLIENT = 'Claude Code (E2E)'
const FILTRO = 'Da Claude si usa solo il calendario dei contenuti.'
const FINALE = 'Didascalia scritta da Claude: tre trazioni al giorno, ogni giorno.'
const MESSAGGIO = 'Trazioni ogni giorno: il messaggio scritto da Claude.'
const STRUMENTI_TEAM = [
  'cambia_status',
  'crea_contenuti',
  'elenco_contenuti',
  'etichette_contenuti',
  'icp',
  'leggi_contenuto',
  'modifica_contenuto',
  'scrivi_sezione',
  'spunti_contenuti',
]

test.describe.configure({ mode: 'serial' })

let clientId = ''
/** The marketing person's connection, from the first consent until «Scollega». */
let marketing: { a: Autorizzazione; token: Token } | null = null
let idReel = ''

test.beforeAll(async () => {
  await pulisciContenuti(PREFISSO)
  clientId = await registraClientMcp({ nome: NOME_CLIENT, redirect: CALLBACK_E2E })
})

test.afterAll(async () => {
  await impostaProfilo(ID_MARKETING, { ruolo: 'marketing', attivo: true })
  await pulisciContenuti(PREFISSO)
  if (clientId) await eliminaClientMcp(clientId)
})

function baseDi(page: Page): string {
  const url = test.info().project.use.baseURL ?? new URL(page.url()).origin
  return url.replace(/\/+$/, '')
}

/** The consent card, by its heading. */
function scheda(page: Page, titolo: string) {
  return page.getByRole('region', { name: titolo })
}

/** A person in a browser of their own. */
async function persona(browser: Browser, ruolo: RuoloSeed) {
  const pagina = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await accedi(pagina, ruolo)
  return pagina
}

/** First consent of `page`'s person: «Consenti», then the code for the tokens. */
async function consentiEScambia(page: Page, state: string) {
  const callback = await catturaCallback(page)
  const a = nuovaAutorizzazione(clientId, baseDi(page), state)
  await apriConsenso(page, a)
  await expect(page.getByRole('heading', { level: 1, name: CONSENSO.titolo })).toBeVisible()
  const arrivo = callback.prossima()
  await page.getByRole('button', { name: CONSENSO.consenti, exact: true }).click()
  const url = await arrivo
  expect(url.searchParams.get('state')).toBe(state)
  const codice = url.searchParams.get('code')
  expect(codice, 'codice nel callback').toBeTruthy()
  return { a, token: await scambiaCodice(a, codice as string) }
}

test('il marketing collega Claude: consenso, token e strumenti sul calendario', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'marketing')
  const base = baseDi(page)
  const callback = await catturaCallback(page)

  // 2. the authorization lands on the consent page
  const a = nuovaAutorizzazione(clientId, base, 'prova')
  await apriConsenso(page, a)
  await expect(page).toHaveURL(/\/oauth\/consent\?authorization_id=/)

  // 3. who connects, where the browser goes back, what Claude may do and never sees
  const carta = scheda(page, CONSENSO.titolo)
  await expect(carta.getByRole('heading', { level: 1, name: CONSENSO.titolo })).toBeVisible()
  await expect(carta).toContainText(NOME_CLIENT)
  await expect(carta).toContainText(`${UTENTI.marketing.nome} (Marketing)`)
  await expect(carta).toContainText(CONSENSO.loopback)
  await expect(carta).toContainText(`${CONSENSO.maiVistoInizio} ${CONSENSO.maiVisto}`)
  // Claude Code has no «Connetti»: the warning names its own sign-in
  await expect(carta).toContainText(CONSENSO.phishingClaudeCode)
  await expect(carta).not.toContainText('Connetti')
  await expect(carta).not.toContainText(CONSENSO.azioneAdmin)
  const [larghezza, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(larghezza, 'scroll orizzontale a 390 px').toBeLessThanOrEqual(finestra)
  for (const nome of [CONSENSO.consenti, CONSENSO.rifiuta]) {
    const box = await page.getByRole('button', { name: nome, exact: true }).boundingBox()
    expect(box?.height ?? 0, nome).toBeGreaterThanOrEqual(44)
  }

  // 4. «Consenti»: back to Claude Code with the code and the same state
  const arrivo = callback.prossima()
  await page.getByRole('button', { name: CONSENSO.consenti, exact: true }).click()
  const url = await arrivo
  expect(url.origin + url.pathname).toBe(CALLBACK_E2E)
  expect(url.searchParams.get('state')).toBe('prova')
  const codice = url.searchParams.get('code')
  expect(codice).toBeTruthy()

  // 5. the code for the tokens, form-encoded as Claude does it
  const token = await scambiaCodice(a, codice as string)
  expect(token.access_token).toBeTruthy()
  expect(token.refresh_token, 'Supabase dà sempre un refresh token').toBeTruthy()
  const claims = claimsDi(token.access_token)
  expect(claims.client_id).toBe(clientId)
  expect(typeof claims.session_id).toBe('string')
  // GoTrue copies the user's aud (lib/mcp/auth.ts accepts the string or an array with it)
  expect([claims.aud].flat()).toEqual(['authenticated'])
  test.info().annotations.push({ type: 'aud', description: JSON.stringify(claims.aud) })
  marketing = { a, token }

  // 6. the SDK's client on /mcp: the tools of the marketing, then a content created by Claude
  const mcp = await clientMcp(base, token.access_token)
  try {
    const { tools } = await mcp.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(STRUMENTI_TEAM)

    // the ideal client profile, before any content: read-only, the same text as the code
    const icp = await mcp.callTool({ name: 'icp', arguments: {} })
    expect(icp.isError, testoRisultato(icp)).toBeFalsy()
    expect(datiRisultato<{ profilo: string }>(icp).profilo).toBe(ICP)

    // the weekly brief (1.37.0): read only, the themes in words, never a name or a figure of money
    const spunti = await mcp.callTool({ name: 'spunti_contenuti', arguments: {} })
    expect(spunti.isError, testoRisultato(spunti)).toBeFalsy()
    const brief = datiRisultato<{ in_breve: string; idee: { name: string; script: { hook: string } }[] }>(spunti)
    expect(brief.in_breve.length).toBeGreaterThan(0)
    expect(brief.idee.length).toBeGreaterThan(0)
    expect(JSON.stringify(brief)).not.toMatch(/€|Loris|Dany/)

    const oggi = oggiRoma()
    const creato = await mcp.callTool({
      name: 'crea_contenuti',
      arguments: { contenuti: [{ name: `${PREFISSO}reel`, post_date: oggi, sezioni: { finale: FINALE } }] },
    })
    expect(creato.isError, testoRisultato(creato)).toBeFalsy()
    const esito = datiRisultato<{ creati: number; contenuti: { id: string; sezioni_scritte: string[] }[] }>(creato)
    expect(esito.creati).toBe(1)
    expect(esito.contenuti[0].sezioni_scritte).toEqual(['finale'])
    idReel = esito.contenuti[0].id

    // the row in the database: a Reel Topic of today, the template's rough draft, the caption, written as her
    const riga = await leggiContenuto(idReel)
    expect(riga).toMatchObject({
      nome: `${PREFISSO}reel`,
      tipo: 'reel',
      stato: 'not_started',
      post_date: oggi,
      bozza: BOZZA_REEL,
      finale: FINALE,
      created_by: ID_MARKETING,
    })

    const letto = await mcp.callTool({ name: 'leggi_contenuto', arguments: { id: idReel } })
    expect(letto.isError, testoRisultato(letto)).toBeFalsy()
    const lettura = datiRisultato<{ sezioni: { chiave: string; testo: string; impronta: string }[] }>(letto)
    const sezione = (chiave: string) => lettura.sezioni.find((s) => s.chiave === chiave)
    expect(sezione('bozza')?.testo).toBe(BOZZA_REEL)
    expect(sezione('finale')?.testo).toBe(FINALE)

    // a fingerprint that is not the saved text's: «cambiata», nothing written, not an error
    const vecchia = await mcp.callTool({
      name: 'scrivi_sezione',
      arguments: { id: idReel, sezione: 'finale', testo: 'Testo che non deve arrivare', impronta: '0'.repeat(32) },
    })
    expect(vecchia.isError).toBeFalsy()
    expect(datiRisultato(vecchia)).toMatchObject({
      esito: 'cambiata',
      attuale: FINALE,
      impronta: sezione('finale')?.impronta,
    })
    expect((await leggiContenuto(idReel))?.finale).toBe(FINALE)

    const status = await mcp.callTool({ name: 'cambia_status', arguments: { id: idReel, status: 'To be edited' } })
    expect(status.isError, testoRisultato(status)).toBeFalsy()
    expect((await leggiContenuto(idReel))?.stato).toBe('to_be_edited')

    // every write changes the version and gives the new one with the values it covers: Claude's own
    // write a moment before never comes back as «cambiato»
    const messaggio = await mcp.callTool({
      name: 'scrivi_sezione',
      arguments: { id: idReel, sezione: 'messaggio', testo: MESSAGGIO, impronta: sezione('messaggio')?.impronta },
    })
    expect(messaggio.isError, testoRisultato(messaggio)).toBeFalsy()
    const scritta = datiRisultato<{ esito: string; contenuto: { versione: string; Status: string } }>(messaggio)
    expect(scritta.esito).toBe('salvata')
    expect(scritta.contenuto.Status).toBe('To be edited')
    const dopoLaSezione = await mcp.callTool({
      name: 'modifica_contenuto',
      arguments: { id: idReel, versione: scritta.contenuto.versione, campi: { audio: 'Audio dopo lo script' } },
    })
    expect(datiRisultato(dopoLaSezione)).toMatchObject({ esito: 'salvato', contenuto: { Audio: 'Audio dopo lo script' } })
    expect(await leggiContenuto(idReel)).toMatchObject({ messaggio: MESSAGGIO, audio: 'Audio dopo lo script' })

    // 8. the properties over the version read: an edit in the app in between wins, nothing written
    const prima = datiRisultato<{ contenuto: { versione: string } }>(
      await mcp.callTool({ name: 'leggi_contenuto', arguments: { id: idReel, sezioni: ['finale'] } }),
    ).contenuto.versione
    const { error } = await dbLocale()
      .from('marketing_contenuti')
      .update({ audio: 'Audio scelto nell’app' })
      .eq('id', idReel)
    if (error) throw error
    const corsa = await mcp.callTool({
      name: 'modifica_contenuto',
      arguments: { id: idReel, versione: prima, campi: { audio: 'Audio di Claude' } },
    })
    expect(corsa.isError).toBeFalsy()
    const cambiato = datiRisultato<{ esito: string; contenuto: { versione: string; Audio: string } }>(corsa)
    expect(cambiato.esito).toBe('cambiato')
    expect(cambiato.contenuto.Audio).toBe('Audio scelto nell’app')
    expect((await leggiContenuto(idReel))?.audio).toBe('Audio scelto nell’app')
    // over the version it has just been given, the same change goes through
    const salvato = await mcp.callTool({
      name: 'modifica_contenuto',
      arguments: { id: idReel, versione: cambiato.contenuto.versione, campi: { audio: 'Audio di Claude' } },
    })
    expect(datiRisultato(salvato)).toMatchObject({ esito: 'salvato' })
    expect((await leggiContenuto(idReel))?.audio).toBe('Audio di Claude')
  } finally {
    await mcp.close()
  }

  // 7. the app shows what Claude wrote: the row with its Status, the page with the caption
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/marketing/contenuti')
  await expect(
    page.getByRole('button', { name: `To be edited: cambia lo Status di ${PREFISSO}reel`, exact: true }).first(),
  ).toBeVisible()
  await page.goto(`/marketing/contenuti/${idReel}`)
  await expect(page.getByText(FINALE)).toBeVisible()
})

test('ricollegare chiede sempre un tocco: Continua dà il codice, Annulla lo nega', async ({ page }) => {
  test.setTimeout(90_000)
  await accedi(page, 'marketing')
  const base = baseDi(page)
  const callback = await catturaCallback(page)

  // 9. already consented: «Ricollega Claude», and the callback waits for the tap
  const seconda = nuovaAutorizzazione(clientId, base, 'seconda')
  await apriConsenso(page, seconda)
  await expect(page.getByRole('heading', { level: 1, name: CONSENSO.titoloRicollega })).toBeVisible()
  await expect(page.getByText(CONSENSO.phishingRicollegaClaudeCode)).toBeVisible()
  await page.waitForTimeout(500)
  expect(callback.chiamate, 'nessun ritorno a Claude senza tocco').toHaveLength(0)
  const arrivo = callback.prossima()
  await page.getByRole('button', { name: CONSENSO.continua, exact: true }).click()
  const continua = await arrivo
  expect(continua.searchParams.get('state')).toBe('seconda')
  const codice = continua.searchParams.get('code')
  expect(codice).toBeTruthy()
  // a code that works
  expect((await scambiaCodice(seconda, codice as string)).access_token).toBeTruthy()

  // «Annulla»: Claude gets access_denied with its state, never the code
  const terza = nuovaAutorizzazione(clientId, base, 'terza')
  const idTerza = await apriConsenso(page, terza)
  await expect(page.getByRole('heading', { level: 1, name: CONSENSO.titoloRicollega })).toBeVisible()
  const arrivoAnnulla = callback.prossima()
  await page.getByRole('button', { name: CONSENSO.annulla, exact: true }).click()
  const annulla = await arrivoAnnulla
  expect(annulla.searchParams.get('error')).toBe('access_denied')
  expect(annulla.searchParams.get('state')).toBe('terza')
  expect(annulla.searchParams.has('code')).toBe(false)

  // the same page again: already used
  await page.goto(`/oauth/consent?authorization_id=${idTerza}`)
  await expect(page.getByText(MESSAGGI_AUTORIZZAZIONE.usata)).toBeVisible()
})

test('con il token di Claude le Data API aprono solo il calendario', async () => {
  // 10. the token used straight on PostgREST, as a leaked token would be
  expect(marketing, 'il primo test ha collegato Claude').not.toBeNull()
  const db = dataApiConToken(marketing!.token.access_token)

  const profili = await db.from('profiles').select('id')
  expect(profili.error?.code).toBe('42501')
  expect(profili.error?.message).toBe(FILTRO)

  const contenuti = await db.from('marketing_contenuti').select('id')
  expect(contenuti.error).toBeNull()
  expect(contenuti.data?.length ?? 0).toBeGreaterThan(0)

  const metriche = await db.rpc('metriche_periodo', { p_da: '2026-10-01', p_a: '2026-10-31' })
  expect(metriche.error?.code).toBe('42501')

  // the Insight (1.35.0): the leads per post and their counted days (vede_marketing() is true for
  // this token: only the filter and <table>_mai_da_oauth stop it), the recaps, and its RPC
  for (const tabella of ['instagram_contenuti_dm', 'instagram_contenuti_dm_giorni', 'insight_recap'] as const) {
    const righe = await db.from(tabella).select('*')
    expect(righe.error?.code, tabella).toBe('42501')
  }
  const insight = await db.rpc('insight_stato')
  expect(insight.error?.code).toBe('42501')

  // the calls and the weekly brief (1.37.0): the brief only through spunti_per_claude, never the tables
  for (const tabella of ['marketing_spunti', 'call_registrazioni', 'call_analisi', 'call_analisi_setter', 'lead_contenuto'] as const) {
    const righe = await db.from(tabella).select('*')
    expect(righe.error?.code, tabella).toBe('42501')
  }
  const numeri = await db.rpc('call_numeri_periodo', { p_da: '2026-10-01', p_a: '2026-10-31', p_per: 'totale' })
  expect(numeri.error?.code).toBe('42501')
  const brief = await db.rpc('spunti_per_claude', {})
  expect(brief.error).toBeNull()

  const nomeProgetto = `${PREFISSO}progetto`
  const progetto = await db.rpc('pm_crea_progetto', { p_nome: nomeProgetto, p_reparto_id: randomUUID() })
  expect(progetto.error?.code).toBe('42501')
  const { count: progetti } = await dbLocale()
    .from('pm_progetti')
    .select('id', { count: 'exact', head: true })
    .eq('nome', nomeProgetto)
  expect(progetti).toBe(0)

  const { data: vendita } = await dbLocale().from('sales').select('id').limit(1).single()
  const rate = async () =>
    (await dbLocale().from('payments').select('id', { count: 'exact', head: true }).eq('sale_id', vendita!.id)).count
  const primaRate = await rate()
  const piano = await db.rpc('inserisci_piano', {
    p_sale_id: vendita!.id,
    p_rate: [{ scadenza: '2026-11-01', importo: 1 }],
  })
  expect(piano.error?.code).toBe('42501')
  expect(await rate()).toBe(primaRate)

  const foto = await db.storage.from('avatari').list()
  expect(foto.error !== null || (foto.data ?? []).length === 0).toBe(true)
})

test('Scollega in App collegate chiude Claude: 401, rinnovo rifiutato, consenso da rifare', async ({ page }) => {
  test.setTimeout(90_000)
  expect(marketing, 'il primo test ha collegato Claude').not.toBeNull()
  await accedi(page, 'marketing')
  const base = baseDi(page)

  // 11. her own connection, with today's date
  await page.goto('/account?scheda=account')
  const sezione = page.getByRole('region', { name: 'App collegate' })
  await expect(sezione.getByText(NOME_CLIENT, { exact: true })).toBeVisible()
  await expect(sezione.getByText(`collegata il ${formatData(oggiRoma())}`)).toBeVisible()
  await sezione.getByRole('button', { name: `Scollega ${NOME_CLIENT}` }).click()
  const dialogo = page.getByRole('dialog', { name: `Scollegare ${NOME_CLIENT}?` })
  await dialogo.getByRole('button', { name: 'Scollega', exact: true }).click()
  await expect(page.locator('[data-sonner-toast]').getByText(`${NOME_CLIENT} scollegato`)).toBeVisible()
  await expect(sezione.getByText(NOME_CLIENT, { exact: true })).toHaveCount(0)

  // the next call: 401 with the resource metadata, so Claude starts over
  const dopo = await chiamataGrezza(base, marketing!.token.access_token)
  expect(dopo.status).toBe(401)
  expect(dopo.headers.get('www-authenticate') ?? '').toContain(
    `resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
  )

  // the refresh token is dead too: GoTrue answers 400 with its own body (not RFC invalid_grant)
  const refresh = await rinnova(clientId, marketing!.token.refresh_token as string)
  expect(refresh.status).toBe(400)
  test.info().annotations.push({ type: 'refresh dopo Scollega', description: JSON.stringify(refresh.corpo) })

  // the consent was revoked: the full card again
  await apriConsenso(page, nuovaAutorizzazione(clientId, base, 'dopo-scollega'))
  await expect(page.getByRole('heading', { level: 1, name: CONSENSO.titolo })).toBeVisible()
  await expect(page.getByRole('button', { name: CONSENSO.consenti, exact: true })).toBeVisible()
})

test('l’admin elimina da Claude solo con il Name esatto', async ({ browser }) => {
  test.setTimeout(90_000)
  // 12. his consent card has the delete line; his tools have elimina_contenuto
  const page = await persona(browser, 'admin')
  const base = baseDi(page)
  const callback = await catturaCallback(page)
  const a = nuovaAutorizzazione(clientId, base, 'admin')
  await apriConsenso(page, a)
  await expect(scheda(page, CONSENSO.titolo)).toContainText(CONSENSO.azioneAdmin)
  const arrivo = callback.prossima()
  await page.getByRole('button', { name: CONSENSO.consenti, exact: true }).click()
  const codice = (await arrivo).searchParams.get('code') as string
  const token = await scambiaCodice(a, codice)

  const mcp = await clientMcp(base, token.access_token)
  try {
    const { tools } = await mcp.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([...STRUMENTI_TEAM, 'elimina_contenuto'].sort())
    const elimina = tools.find((t) => t.name === 'elimina_contenuto')
    expect(elimina?.annotations?.destructiveHint).toBe(true)

    const nome = `${PREFISSO}da eliminare`
    const creato = datiRisultato<{ contenuti: { id: string }[] }>(
      await mcp.callTool({ name: 'crea_contenuti', arguments: { contenuti: [{ name: nome }] } }),
    )
    const id = creato.contenuti[0].id

    const sbagliato = await mcp.callTool({ name: 'elimina_contenuto', arguments: { id, name: `${nome} bis` } })
    expect(sbagliato.isError).toBe(true)
    expect(await leggiContenuto(id)).not.toBeNull()

    const giusto = await mcp.callTool({ name: 'elimina_contenuto', arguments: { id, name: `${nome} ` } })
    expect(giusto.isError, testoRisultato(giusto)).toBeFalsy()
    expect(await leggiContenuto(id)).toBeNull()
  } finally {
    await mcp.close()
    await page.context().close()
  }
})

test('chi non può collegare Claude torna a Claude con un rifiuto, mai con un codice', async ({ browser, page }) => {
  test.setTimeout(120_000)
  // 13. the setter: the refusal card, «Torna a Claude» → access_denied with the state
  const setter = await persona(browser, 'setter')
  try {
    const callback = await catturaCallback(setter)
    await apriConsenso(setter, nuovaAutorizzazione(clientId, baseDi(setter), 'setter'))
    await expect(setter.getByRole('heading', { level: 1, name: CONSENSO.titoloNonAmmesso })).toBeVisible()
    await expect(setter.getByText(CONSENSO.nonAmmesso)).toBeVisible()
    const arrivo = callback.prossima()
    await setter.getByRole('button', { name: CONSENSO.tornaAClaude, exact: true }).click()
    const rifiuto = await arrivo
    expect(rifiuto.searchParams.get('error')).toBe('access_denied')
    expect(rifiuto.searchParams.get('state')).toBe('setter')
    expect(rifiuto.searchParams.has('code')).toBe(false)
  } finally {
    await setter.context().close()
  }

  // a person demoted after an old consent: Supabase approves on the spot, the code never leaves
  await accedi(page, 'marketing')
  marketing = await consentiEScambia(page, 'di-nuovo')
  await impostaProfilo(ID_MARKETING, { ruolo: 'setter' })
  try {
    const callback = await catturaCallback(page)
    await apriConsenso(page, nuovaAutorizzazione(clientId, baseDi(page), 'retrocessa'))
    await expect(page.getByRole('heading', { level: 1, name: CONSENSO.titoloNonAmmesso })).toBeVisible()
    const arrivo = callback.prossima()
    await page.getByRole('button', { name: CONSENSO.tornaAClaude, exact: true }).click()
    const rifiuto = await arrivo
    expect(rifiuto.searchParams.get('error')).toBe('access_denied')
    expect(rifiuto.searchParams.get('state')).toBe('retrocessa')
    expect(rifiuto.searchParams.has('code')).toBe(false)

    // and her live token stops at the door: 403 insufficient_scope
    const chiamata = await chiamataGrezza(baseDi(page), marketing.token.access_token)
    expect(chiamata.status).toBe(403)
    expect(chiamata.headers.get('www-authenticate') ?? '').toContain('error="insufficient_scope"')
  } finally {
    await impostaProfilo(ID_MARKETING, { ruolo: 'marketing' })
  }
  // a pause, not a disconnection: the role given back, the same token works again, no new consent
  expect((await chiamataGrezza(baseDi(page), marketing.token.access_token)).status).toBe(200)
})

test('se i bundle non arrivano il tocco funziona lo stesso: un POST nativo, 303 verso Claude', async ({ browser }) => {
  test.setTimeout(90_000)
  // 13b. a content blocker, or a network that drops halfway: the page's own scripts never
  // arrive, React's inline ones still show the card, and the tap is a native form post. With
  // Referrer-Policy no-referrer browsers sent `Origin: null` on it and Next refused the action
  // (500): same-origin keeps the Origin, and no Referer still leaves the site.
  const setter = await persona(browser, 'setter')
  try {
    await catturaCallback(setter)
    await setter.route('**/_next/static/**', (route) =>
      route.request().resourceType() === 'script' ? route.abort() : route.continue(),
    )
    const consenso = setter.waitForResponse((r) => new URL(r.url()).pathname === '/oauth/consent')
    await apriConsenso(setter, nuovaAutorizzazione(clientId, baseDi(setter), 'senza-bundle'))
    expect((await consenso).headers()['referrer-policy']).toBe('same-origin')
    await expect(setter.getByRole('heading', { level: 1, name: CONSENSO.titoloNonAmmesso })).toBeVisible()

    const post = setter.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/oauth/consent',
    )
    await setter.getByRole('button', { name: CONSENSO.tornaAClaude, exact: true }).click()
    const risposta = await post
    expect(risposta.request().headers()['next-action'], 'un POST nativo, non il fetch di React').toBeUndefined()
    expect(risposta.status()).toBe(303)
    const verso = new URL(risposta.headers()['location'] ?? '')
    expect(verso.origin + verso.pathname).toBe(CALLBACK_E2E)
    expect(verso.searchParams.get('error')).toBe('access_denied')
    expect(verso.searchParams.get('state')).toBe('senza-bundle')
    expect(verso.searchParams.has('code')).toBe(false)
  } finally {
    await setter.context().close()
  }
})

test('con i bundle lenti il tocco è già un POST nativo: «Consenti» risponde 303 col codice', async ({ browser }) => {
  test.setTimeout(90_000)
  // 13c. the usual case on a phone's network: the bundles arrive, but after the tap. The form's
  // action is "" (useActionState's progressive enhancement) and React's inline scripts do not
  // catch the submit, so a tap before hydration is a native form post too, never replayed as a
  // fetch: same-origin keeps its Origin and the action answers 303 to Claude with the code.
  const editor = await persona(browser, 'editor')
  let rilascia = () => {}
  const cancello = new Promise<void>((risolvi) => {
    rilascia = risolvi
  })
  try {
    await editor.route('**/_next/static/**', async (route) => {
      if (route.request().resourceType() !== 'script') return route.continue()
      // slow, never aborted: held until the tap has its answer, then let through
      await cancello
      await route.continue().catch(() => {})
    })
    const a = nuovaAutorizzazione(clientId, baseDi(editor), 'bundle-lenti')
    await apriConsenso(editor, a, 'commit')
    const consenti = editor.getByRole('button', { name: CONSENSO.consenti, exact: true })
    await expect(consenti).toBeVisible()
    const idratato = await consenti.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactFiber')))
    expect(idratato, 'la pagina non è ancora idratata').toBe(false)
    expect(await consenti.evaluate((el) => el.closest('form')?.getAttribute('action'))).toBe('')

    const post = editor.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/oauth/consent',
    )
    await consenti.click()
    const risposta = await post
    rilascia()
    expect(risposta.request().headers()['next-action'], 'un POST nativo, non il fetch di React').toBeUndefined()
    expect(risposta.status()).toBe(303)
    const verso = new URL(risposta.headers()['location'] ?? '')
    expect(verso.origin + verso.pathname).toBe(CALLBACK_E2E)
    expect(verso.searchParams.get('state')).toBe('bundle-lenti')
    // the Location is where the browser goes (Playwright's routes never see a redirect's next hop)
    const codice = verso.searchParams.get('code')
    expect(codice, 'codice nel Location').toBeTruthy()
    // and the code is good: the exchange Claude makes
    expect((await scambiaCodice(a, codice as string)).access_token).toBeTruthy()
  } finally {
    rilascia()
    await editor.context().close()
  }
})

test('un account disattivato è fermo con il suo token, non scollegato: torna con la riattivazione', async ({ baseURL }) => {
  // 14. deactivation blocks at once (403), but it is a pause: Team changes only profiles, the
  // OAuth session stays and Supabase keeps renewing the token, so reactivation lets the same
  // connection in again without a new consent. Only «Scollega» closes it (CLAUDE.md, section 28).
  expect(marketing, 'il test prima ha ricollegato Claude').not.toBeNull()
  const base = (baseURL ?? '').replace(/\/+$/, '')
  expect((await chiamataGrezza(base, marketing!.token.access_token)).status).toBe(200)
  await impostaProfilo(ID_MARKETING, { attivo: false })
  let rinnovato = ''
  try {
    const chiamata = await chiamataGrezza(base, marketing!.token.access_token)
    expect(chiamata.status).toBe(403)
    expect(chiamata.headers.get('www-authenticate') ?? '').toContain('error="insufficient_scope"')
    const corpo = (await chiamata.json()) as { messaggio?: string }
    expect(corpo.messaggio).toContain('Il tuo account non può usare Alpha Management da Claude')

    // the session is not closed: the refresh token still gives a new token, which waits at the door too
    const refresh = await rinnova(clientId, marketing!.token.refresh_token as string)
    expect(refresh.status, JSON.stringify(refresh.corpo)).toBe(200)
    rinnovato = String(refresh.corpo?.access_token ?? '')
    expect(rinnovato).toBeTruthy()
    expect((await chiamataGrezza(base, rinnovato)).status).toBe(403)
  } finally {
    await impostaProfilo(ID_MARKETING, { attivo: true })
  }
  expect((await chiamataGrezza(base, marketing!.token.access_token)).status).toBe(200)
  expect((await chiamataGrezza(base, rinnovato)).status).toBe(200)
})

test('i metadati della risorsa dicono l’indirizzo di /mcp e il server di Supabase', async ({ request, baseURL }) => {
  // 15. what Claude reads after the 401
  const base = (baseURL ?? '').replace(/\/+$/, '')
  const risposta = await request.get('/.well-known/oauth-protected-resource/mcp')
  expect(risposta.status()).toBe(200)
  const json = (await risposta.json()) as { resource: string; authorization_servers: string[] }
  expect(json.resource).toBe(`${base}/mcp`)
  expect(json.authorization_servers).toEqual([`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`])
})
