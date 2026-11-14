import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { sessioneDb } from './call-db'
import { ID_ADMIN, ID_COACH, ID_EDITOR, dbLocale } from './db'
import {
  attivaDiProva,
  creaOnboardingDiProva,
  emailDiProva,
  idPosta,
  invitoDi,
  postaDi,
  primiPassiFatti,
  pulisciClientiPercorso,
  registraCliente,
} from './percorso-db'
import { PASSWORD_SEED, accedi, attendiStreaming } from './utenti'

/*
 * The path up to the launch (release B2), with the client and the team side by side: the
 * client books the call, the coach confirms it with the Meet link («Tocca a te» reaches
 * Mailpit), the client joins the community and introduces himself, the coach marks the call
 * held and ticks the goal's task, the client reads the goal and ticks the test week, the
 * coach confirms the tests (the reviewer sees «Test da rivedere» and never the
 * questionnaire), delivers the programme with a compulsory video, the client watches it and
 * reads «Il tuo percorso è iniziato». The coach never sees the payment; a suspended client is
 * «In pausa». Local database only, YouTube served by page.route.
 */
const PREFISSO = 'E2ETeam'
const MEET = 'https://meet.google.com/abc-defg-hij'

let impostazioniPrima: { link_prenotazione: string | null; link_community: string | null; avvisa_cliente_email: boolean } | null = null

test.beforeAll(async () => {
  const db = dbLocale()
  const { data } = await db.from('onboarding_impostazioni').select('link_prenotazione, link_community, avvisa_cliente_email').single()
  impostazioniPrima = data
  const { error } = await db
    .from('onboarding_impostazioni')
    .update({
      link_prenotazione: 'https://calendar.app.google/e2eFinto',
      link_community: 'https://t.me/+e2eFinto',
      avvisa_cliente_email: true,
    })
    .eq('id', true)
  if (error) throw error
})

test.afterAll(async () => {
  if (impostazioniPrima) await dbLocale().from('onboarding_impostazioni').update(impostazioniPrima).eq('id', true)
  await pulisciClientiPercorso(PREFISSO)
})

const PLAYER_FINTO = `<!doctype html><html><body style="background:#000">
<script>
  let avviato = false
  window.addEventListener('message', (e) => {
    let d = e.data
    try { d = JSON.parse(d) } catch {}
    if (!d || d.event !== 'listening' || avviato) return
    avviato = true
    const manda = (m) => parent.postMessage(JSON.stringify(m), '*')
    manda({ event: 'onStateChange', info: 1 })
    let t = 0
    const timer = setInterval(() => {
      manda({ event: 'infoDelivery', info: { currentTime: t, duration: 30, playerState: t < 30 ? 1 : 0 } })
      if (t >= 30) { clearInterval(timer); manda({ event: 'onStateChange', info: 0 }) }
      t += 1
    }, 250)
  })
</script></body></html>`

async function giocaYoutubeFinto(contesto: BrowserContext) {
  await contesto.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PLAYER_FINTO }),
  )
}

async function entraCliente(browser: Browser, email: string) {
  const contesto = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await contesto.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' })
  await giocaYoutubeFinto(contesto)
  const page = await contesto.newPage()
  attendiStreaming(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await expect(page).toHaveURL(/\/percorso$/, { timeout: 30_000 })
  return { contesto, page }
}

async function vista(page: Page, attesa: string) {
  await page.reload()
  await expect(page.getByTestId('pannello-passo')).toHaveAttribute('data-vista', attesa, { timeout: 15_000 })
}

/** The coach's sheet: the dialog opened by its button, then its own confirm. */
async function foglio(page: Page, testId: string, riempi?: () => Promise<void>) {
  await page.getByTestId(testId).click()
  await expect(page.getByTestId(`${testId}-foglio`)).toBeVisible()
  if (riempi) await riempi()
  await page.getByTestId(`${testId}-si`).click()
  await expect(page.getByTestId(`${testId}-foglio`)).toBeHidden({ timeout: 15_000 })
}

async function nessunPagamento(page: Page) {
  const testo = (await page.locator('main').innerText()).toLowerCase()
  expect(testo).not.toContain('pagamento')
  expect(testo).not.toContain('invito')
  expect(testo).not.toContain('registro')
}

test('dalla prenotazione al lancio, con il coach e il revisore', async ({ browser }) => {
  test.setTimeout(300_000)
  const nome = `${PREFISSO}Mario${Date.now().toString().slice(-5)}`
  const email = emailDiProva('team')
  const { clientId } = await creaOnboardingDiProva(nome, email, { coach: ID_COACH, revisore: ID_EDITOR, responsabile: ID_ADMIN })
  await attivaDiProva(clientId)
  await registraCliente(clientId, email)
  await primiPassiFatti(clientId)
  const db = dbLocale()

  // the client books
  const { contesto: cc, page: cliente } = await entraCliente(browser, email)
  const pannello = cliente.getByTestId('pannello-passo')
  await expect(pannello).toHaveAttribute('data-vista', 'passo:prenotazione')
  await expect(pannello.getByTestId('apri-calendario')).toHaveAttribute('href', 'https://calendar.app.google/e2eFinto')
  const azione = pannello.getByTestId('azione-passo')
  await expect(azione).toHaveAttribute('aria-disabled', 'true')
  await expect(pannello.getByTestId('perche-fermo')).toHaveText('Scrivi il giorno e l’ora che hai scelto per andare avanti.')
  const domani = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  await pannello.getByLabel('Giorno della call').fill(domani)
  await pannello.getByLabel('Ora').fill('18:00')
  await azione.click()
  // 1.84.0: the client does not wait for the coach, the community opens at once
  await expect(pannello).toHaveAttribute('data-vista', 'passo:community', { timeout: 15_000 })
  await expect(pannello.getByTestId('community-intanto')).toHaveText(
    'Marco conferma la tua call e ti scrive sul tuo gruppo Telegram. Intanto entra nella community e presentati.',
  )
  await expect(pannello.getByTestId('card-call')).toHaveAttribute('data-stato', 'da_confermare')
  await expect(pannello.getByRole('button')).not.toContainText(['Ho prenotato'])

  // the coach confirms with the Meet link: «Tocca a te» reaches the client
  const contestoCoach = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const coach = await contestoCoach.newPage()
  await accedi(coach, 'coach')
  await coach.goto('/onboarding')
  await expect(coach.getByTestId('code-team')).toContainText('Call da confermare')
  await coach.goto(`/onboarding/${clientId}`)
  await expect(coach.getByTestId('scheda-incaricato')).toBeVisible()
  await expect(coach.getByTestId('riquadro-questionario')).toBeVisible()
  await nessunPagamento(coach)
  const vistePrima = await idPosta(email)
  await foglio(coach, 'conferma-call', async () => {
    await coach.getByLabel('Link di Google Meet').fill(MEET)
  })
  await expect(coach.getByText('Il cliente ha ricevuto l’avviso per email.').first()).toBeVisible()
  await expect
    .poll(async () => (await postaDi(email)).filter((m) => !vistePrima.has(m.ID)).map((m) => m.Subject), { timeout: 20_000 })
    .toContain('Tocca a te: il prossimo passo del tuo percorso')

  // the community: the username, the request, the presentation
  await vista(cliente, 'passo:community')
  await expect(pannello.getByTestId('card-call')).toHaveAttribute('data-stato', 'prenotata')
  await expect(pannello.getByTestId('entra-call')).toHaveAttribute('href', MEET)
  await pannello.getByLabel('Il tuo username di Telegram').fill('@Mario_E2E')
  await pannello.getByRole('button', { name: 'Salva lo username' }).click()
  await expect(pannello.getByTestId('username-telegram')).toContainText('@mario_e2e')
  await expect(pannello.getByTestId('entra-community')).toHaveAttribute('href', 'https://t.me/+e2eFinto')
  await pannello.getByRole('button', { name: 'Ho inviato la richiesta' }).click()
  await expect(pannello.getByTestId('presentazione')).toBeVisible({ timeout: 15_000 })
  await pannello.getByRole('button', { name: 'Copia la presentazione' }).click()
  await expect(cliente.getByText('Presentazione copiata').first()).toBeVisible()
  const copiata = await cliente.evaluate(() => navigator.clipboard.readText())
  expect(copiata).toContain(nome)
  expect(copiata).not.toContain('**')
  await pannello.getByRole('button', { name: 'Mi sono presentato' }).click()
  await expect(pannello).toHaveAttribute('data-vista', 'attesa:call', { timeout: 15_000 })
  await expect(pannello.getByTestId('card-call')).toBeVisible()

  // the call is past: the coach marks it held, then ticks the goal's task
  await db
    .from('clienti_call')
    .update({ inizio: new Date(Date.now() - 3_600_000).toISOString() })
    .eq('client_id', clientId)
    .eq('tipo', 'onboarding')
  await coach.reload()
  await foglio(coach, 'esito-call', async () => {
    await coach.getByTestId('esito-svolta').check()
  })
  await vista(cliente, 'attesa:obiettivo')
  await expect(cliente.getByRole('heading', { level: 2 })).toHaveText('Marco sta impostando il tuo obiettivo su Coach Plus.')

  // «Segna obiettivo impostato»: the task completed and «Tocca a te» to the client, in this order too
  await coach.reload()
  await expect(coach.getByTestId('obiettivo-impostato')).toBeVisible()
  const vistePrimaObiettivo = await idPosta(email)
  await foglio(coach, 'obiettivo-impostato')
  await expect(coach.getByText('Il cliente ha ricevuto l’avviso per email.').first()).toBeVisible()
  await expect
    .poll(async () => (await postaDi(email)).filter((m) => !vistePrimaObiettivo.has(m.ID)).length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const { data: task } = await db
    .from('pm_task')
    .select('stato')
    .eq('chiave_onboarding', 'obiettivo_smart')
    .in('progetto_id', (await db.from('pm_progetti').select('id').eq('client_id', clientId)).data!.map((p) => p.id))
  expect(task?.map((t) => t.stato)).toEqual(['completato'])

  // the goal, then the test week ticked one item at a time
  await vista(cliente, 'passo:obiettivo')
  await pannello.getByTestId('azione-passo').click()
  await expect(pannello).toHaveAttribute('data-vista', 'passo:test', { timeout: 15_000 })
  const voci = pannello.locator('[data-voce][data-spuntata="false"]')
  const quante = await voci.count()
  expect(quante).toBeGreaterThan(1)
  for (let i = 0; i < quante - 1; i++) {
    await pannello.locator('[data-voce][data-spuntata="false"]').first().getByRole('checkbox').click()
    await expect(pannello.locator('[data-voce][data-spuntata="true"]')).toHaveCount(i + 1)
  }
  await expect(pannello.getByText(`${quante - 1} di ${quante} fatte`)).toBeVisible()
  // the last tick asks first: «Non ancora» sends nothing, «Sì, invia» sends the week to the coach
  await pannello.locator('[data-voce][data-spuntata="false"]').first().getByRole('checkbox').click()
  await expect(pannello.getByTestId('test-conferma')).toBeVisible()
  await pannello.getByRole('button', { name: 'Non ancora' }).click()
  await expect(pannello.getByTestId('test-conferma')).toHaveCount(0)
  await expect(pannello).toHaveAttribute('data-vista', 'passo:test')
  await pannello.locator('[data-voce][data-spuntata="false"]').first().getByRole('checkbox').click()
  await pannello.getByRole('button', { name: 'Sì, invia' }).click()
  await expect(pannello).toHaveAttribute('data-vista', 'attesa:test', { timeout: 15_000 })

  // the coach confirms the tests: the reviewer sees «Test da rivedere», never the questionnaire
  await coach.reload()
  await foglio(coach, 'test-ricevuti')
  const contestoRevisore = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const revisore = await contestoRevisore.newPage()
  await accedi(revisore, 'editor')
  await revisore.goto('/onboarding')
  await expect(revisore.getByTestId('code-team')).toContainText('Test da rivedere')
  await revisore.goto(`/onboarding/${clientId}`)
  await expect(revisore.getByTestId('scheda-incaricato')).toBeVisible()
  await expect(revisore.getByTestId('riquadro-questionario')).toHaveCount(0)
  await nessunPagamento(revisore)
  await contestoRevisore.close()

  // the coach delivers the programme with a compulsory video
  await vista(cliente, 'attesa:programma')
  await coach.reload()
  await foglio(coach, 'aggiungi-consegna', async () => {
    await coach.getByLabel('Titolo').fill('Come leggere il programma')
    await coach.getByLabel('Link del video di YouTube').fill('https://youtu.be/AbCdEfGhIjK')
    await coach.getByLabel('Il cliente deve guardarlo fino in fondo per partire').check()
  })
  await foglio(coach, 'consegna-programma')

  // the client watches it and the path starts
  await vista(cliente, 'passo:programma')
  const consegna = pannello.locator('[data-consegna][data-tipo="video"]')
  await expect(consegna).toContainText('Come leggere il programma')
  await expect(pannello.getByTestId('azione-passo')).toHaveAttribute('aria-disabled', 'true')
  await consegna.getByRole('button', { name: 'Guarda il video' }).click()
  await expect(consegna.getByTestId('video-avanzamento')).toContainText('Video visto', { timeout: 20_000 })
  await expect(pannello.getByTestId('azione-passo')).not.toHaveAttribute('aria-disabled', 'true')
  await pannello.getByTestId('azione-passo').click()
  await expect(pannello).toHaveAttribute('data-vista', 'lancio', { timeout: 15_000 })
  await expect(cliente.getByRole('heading', { level: 2, name: 'Il tuo percorso è iniziato' })).toBeVisible()
  await expect(pannello.getByTestId('dopo-lancio').getByTestId('card-call')).toContainText('Il tuo prossimo checkpoint')
  await expect(cliente.getByRole('button', { name: 'Inizio percorso, completato' })).toBeVisible()
  const { data: percorso } = await db.from('onboarding_percorsi').select('stato').eq('client_id', clientId).single()
  expect(percorso?.stato).toBe('completato')
  const misure = await cliente.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(misure[0]).toBeLessThanOrEqual(misure[1]!)
  await cc.close()

  // a suspended client is «In pausa» for the coach, without the reason
  const nomePausa = `${PREFISSO}Pausa${Date.now().toString().slice(-5)}`
  const emailPausa = emailDiProva('pausa')
  const { clientId: idPausa } = await creaOnboardingDiProva(nomePausa, emailPausa, { coach: ID_COACH, responsabile: ID_ADMIN })
  await attivaDiProva(idPausa)
  await registraCliente(idPausa, emailPausa)
  const invito = await invitoDi(idPausa)
  const admin = await sessioneDb('admin')
  const { error: eRevoca } = await admin.rpc('onboarding_revoca', { p_invito: invito!.id, p_motivo: 'Prova e2e del percorso' })
  expect(eRevoca).toBeNull()
  await coach.goto('/onboarding')
  await expect(coach.getByTestId('gruppo-in_pausa')).toContainText(nomePausa)
  await expect(coach.getByTestId('gruppo-completati')).toContainText(nome)
  await expect(coach.locator('main')).not.toContainText('Prova e2e del percorso')
  await coach.goto(`/onboarding/${idPausa}`)
  await expect(coach.getByTestId('scheda-incaricato')).toContainText('In pausa')
  await contestoCoach.close()
})
