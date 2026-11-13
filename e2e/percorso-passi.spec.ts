import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { attivaDiProva, creaOnboardingDiProva, emailDiProva, pulisciClientiPercorso, registraCliente } from './percorso-db'
import { PASSWORD_SEED, attendiStreaming } from './utenti'

/*
 * The first two steps of the client's area (release B1a): the welcome video counted through
 * the iframe of YouTube (a fake one, served by page.route on the address of
 * youtube-nocookie.com, that speaks the same postMessage protocol), then the rules and the
 * consent, then the questionnaire's panel (B1b) with the estimate. At 390 px, with «Riduci movimento».
 * No request ever reaches Google.
 */
const PREFISSO = 'E2EPassi'

test.afterAll(async () => {
  await pulisciClientiPercorso(PREFISSO)
})

/**
 * The fake player: once the page says «listening» it plays a 12 second video at 4x speed,
 * one second of the video every 250 ms, as infoDelivery messages; then the end. A second
 * every message: never a jump forward, so every second counts.
 */
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
      manda({ event: 'infoDelivery', info: { currentTime: t, duration: 12, playerState: t < 12 ? 1 : 0 } })
      if (t >= 12) { clearInterval(timer); manda({ event: 'onStateChange', info: 0 }) }
      t += 1
    }, 250)
  })
</script></body></html>`

async function giocaYoutubeFinto(contesto: BrowserContext) {
  await contesto.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PLAYER_FINTO }),
  )
}

async function entraCome(page: Page, email: string) {
  attendiStreaming(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD_SEED)
  await page.getByRole('button', { name: 'Entra' }).click()
  await expect(page).toHaveURL(/\/percorso$/, { timeout: 30_000 })
}

test('benvenuto col video visto, regole e consenso, poi il questionario: a 390 px e con «Riduci movimento»', async ({ browser }) => {
  test.setTimeout(150_000)
  const nome = `${PREFISSO}Anna${Date.now().toString().slice(-5)}`
  const email = emailDiProva('passi')
  const { clientId } = await creaOnboardingDiProva(nome, email)
  await attivaDiProva(clientId)
  await registraCliente(clientId, email)

  const contesto = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await giocaYoutubeFinto(contesto)
  const page = await contesto.newPage()
  await entraCome(page, email)

  // the estimate and the timeline: the first stage is the current one, the others say what they wait for
  await expect(page.getByTestId('stima')).toContainText('all’inizio del tuo percorso')
  const timeline = page.getByRole('navigation', { name: 'Le tappe del tuo percorso' })
  await expect(timeline.getByRole('button', { name: 'Benvenuto, attuale' })).toHaveAttribute('aria-current', 'step')
  const questionario = timeline.getByRole('button', { name: 'Questionario, si sblocca dopo Benvenuto' })
  await expect(questionario).toHaveAttribute('aria-disabled', 'true')
  // aria-disabled and not disabled: the tap (here a key) still says what the stage waits for
  await questionario.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('timeline-suggerimento')).toHaveText('Si sblocca dopo: Benvenuto')

  // step 1: the button waits for the video
  const pannello = page.getByTestId('pannello-passo')
  await expect(pannello).toHaveAttribute('data-vista', 'passo:benvenuto')
  const azione = pannello.getByTestId('azione-passo')
  await expect(azione).toBeDisabled()
  await expect(pannello.getByTestId('perche-fermo')).toHaveText('Guarda il video almeno fino al 90% per andare avanti.')
  await pannello.getByRole('button', { name: 'Guarda il video' }).click()
  await expect(pannello.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]')).toBeVisible()
  await expect(pannello.getByTestId('video-avanzamento')).toContainText('Video visto', { timeout: 20_000 })
  await expect(azione).toBeEnabled()
  // the database counted the seconds, not the page
  const { data: visti } = await dbLocale().from('onboarding_video_visti').select('percentuale, visto_il').eq('client_id', clientId)
  expect(Number(visti?.[0]?.percentuale)).toBeGreaterThanOrEqual(90)
  expect(visti?.[0]?.visto_il).not.toBeNull()

  await azione.click()
  await expect(page.getByText('Passo completato').first()).toBeVisible()
  await expect(pannello).toHaveAttribute('data-vista', 'passo:regole')
  await expect(page.getByRole('heading', { level: 2, name: 'Le regole del percorso' })).toBeFocused()

  // step 2: every rule and the consent, then «Accetto e vado avanti»
  const regole = pannello.getByRole('group', { name: 'Le regole' }).getByRole('checkbox')
  const quante = await regole.count()
  expect(quante).toBeGreaterThan(0)
  await expect(pannello.getByTestId('perche-fermo')).toHaveText(`Mancano ${quante + 1} spunte per andare avanti.`)
  for (let i = 0; i < quante; i++) await regole.nth(i).click()
  await expect(pannello.getByTestId('perche-fermo')).toHaveText('Manca una spunta per andare avanti.')
  await pannello.getByTestId('consenso-salute').getByText('Ho letto e acconsento').click()
  await expect(azione).toBeEnabled()
  await azione.click()

  // B1b (1.79.0): the questionnaire opens right after the rules (the waiting panel comes after it, percorso-questionario.spec.ts)
  await expect(pannello).toHaveAttribute('data-vista', 'passo:questionario')
  await expect(page.getByRole('heading', { level: 2, name: 'Questionario iniziale' })).toBeFocused()
  await expect(pannello.getByRole('link', { name: 'Compila il questionario' })).toBeVisible()
  await expect(page.getByTestId('stima')).toBeVisible()
  const { data: consensi } = await dbLocale().from('clienti_consensi').select('tipo, versione').eq('client_id', clientId)
  expect(consensi).toEqual([{ tipo: 'salute', versione: '2026-11-12' }])

  // a completed stage read again
  await timeline.getByRole('button', { name: 'Benvenuto, completato' }).click()
  await expect(pannello).toHaveAttribute('data-vista', 'nodo:benvenuto')
  await expect(pannello.getByTestId('riepilogo-regole')).toContainText('Fatto il')
  await page.getByRole('button', { name: 'Torna al passo da fare' }).click()
  await expect(pannello).toHaveAttribute('data-vista', 'passo:questionario')

  // «I tuoi consensi»
  await page.getByRole('link', { name: 'I tuoi consensi' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'I tuoi consensi' })).toBeVisible()
  await expect(page.locator('[data-consenso="salute"]')).toContainText('Dato il')

  // 390 px: the page never scrolls sideways, the timeline scrolls inside its frame
  for (const percorso of ['/percorso', '/percorso/consensi']) {
    await page.goto(percorso)
    const misure = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(misure[0], `${percorso} senza scroll di lato`).toBeLessThanOrEqual(misure[1]!)
  }
  await contesto.close()
})
