import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'

import { accedi } from './utenti'

// Runs against the fake model (e2e/llm-finto.mjs), like alfire-chat.spec.ts: its
// transcription grows with the audio, so the live text (the audio so far) is shorter
// than the final one (the whole recording)
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

// a fake microphone: Chromium feeds a tone, the fake model transcribes it
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

test('mentre detto il testo compare nella casella; allo stop il testo finale; si manda solo con Invio', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone'])
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  const casella = pannello.getByLabel('Scrivi ad Alfire')
  // what was typed before the tap stays, the dictation goes after it
  await casella.fill('Domanda:')

  await pannello.getByRole('button', { name: 'Parla con Alfire' }).click()
  // live: about every 2 seconds the audio so far becomes text, while still recording
  await expect(casella).toHaveValue(/^Domanda: Quanto ho/, { timeout: 15_000 })
  await expect(pannello.getByRole('button', { name: 'Ferma e trascrivi' })).toBeVisible()
  await expect(casella).toHaveAttribute('data-in-ascolto', 'true')
  await expect(casella).toHaveAttribute('readonly', '')
  const inDiretta = await casella.inputValue()

  // speak a little longer, then stop
  await page.waitForTimeout(2500)
  await pannello.getByRole('button', { name: 'Ferma e trascrivi' }).click()

  // the final transcription of the whole recording replaces the live text: longer, never doubled
  await expect(casella).not.toHaveAttribute('data-in-ascolto', 'true')
  await expect(casella).not.toHaveAttribute('readonly', '')
  const finale = await casella.inputValue()
  expect(finale.startsWith('Domanda: Quanto ho incassato questo mese?')).toBe(true)
  expect(finale.length).toBeGreaterThan(inDiretta.length)
  expect(finale.match(/Quanto ho/g)).toHaveLength(1)

  // nothing sent before Invio
  await expect(pannello.getByTestId('alfire-mio-messaggio')).toHaveCount(0)
  await expect(pannello.getByText('Questo mese hai incassato 6.950,00 €.')).toHaveCount(0)

  await casella.press('Enter')
  await expect(pannello.getByTestId('alfire-mio-messaggio')).toHaveText(finale)
  await expect(pannello.getByText('Questo mese hai incassato 6.950,00 €.')).toBeVisible()
  await expect(casella).toHaveValue('')
})

test('la route accetta le trascrizioni parziali, con gli stessi controlli', async ({ page }) => {
  await accedi(page, 'admin')
  const audio = (byte: number) => ({ name: 'voce.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(byte, 1) })

  const parziale = await page.request.post('/api/alfire/voce', { multipart: { audio: audio(1600), parziale: '1' } })
  expect(parziale.status()).toBe(200)
  expect(await parziale.json()).toEqual({ testo: 'Quanto ho' })

  // same limits: no audio is still an error, partial or not
  const vuoto = await page.request.post('/api/alfire/voce', { multipart: { parziale: '1' } })
  expect(vuoto.status()).toBe(400)
})

// The races and failures below answer /api/alfire/voce from the test (page.route): the
// server is never asked, the recorder in the page is what is checked.
type Voce = { parziale: boolean }

function richiestaVoce(route: Route): Voce {
  const corpo = route.request().postDataBuffer() ?? Buffer.alloc(0)
  return { parziale: corpo.includes(Buffer.from('name="parziale"')) }
}

async function apriPannello(page: Page, context: BrowserContext) {
  await context.grantPermissions(['microphone'])
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  return { pannello, casella: pannello.getByLabel('Scrivi ad Alfire'), mic: pannello.getByRole('button', { name: 'Parla con Alfire' }) }
}

/** A microphone that takes a while to open, like a phone or a permission prompt; every track is kept to check it ends. */
async function microfonoLento(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { tracce: MediaStreamTrack[] }
    w.tracce = []
    const originale = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (vincoli) => {
      await new Promise((r) => setTimeout(r, 800))
      const flusso = await originale(vincoli)
      w.tracce.push(...flusso.getTracks())
      return flusso
    }
  })
}

const tracce = (page: Page) =>
  page.evaluate(() => (window as unknown as { tracce: MediaStreamTrack[] }).tracce.map((t) => t.readyState))

test('un doppio tocco mentre il microfono si apre: un solo vocale, e dopo lo stop niente più audio', async ({
  page,
  context,
}) => {
  await microfonoLento(page)
  const richieste: Voce[] = []
  await page.route('**/api/alfire/voce', (route) => {
    const r = richiestaVoce(route)
    richieste.push(r)
    return route.fulfill({ json: { testo: r.parziale ? 'Testo in' : 'Testo finale.' } })
  })
  const { pannello, casella, mic } = await apriPannello(page, context)

  // two taps in the same instant, before React re-renders the button
  await mic.evaluate((b: HTMLButtonElement) => {
    b.click()
    b.click()
  })
  const ferma = pannello.getByRole('button', { name: 'Ferma e trascrivi' })
  await expect(ferma).toBeVisible()
  // nothing is sent while dictating: the suggested questions wait for the stop too
  await expect(pannello.getByRole('group', { name: 'Domande suggerite' }).getByRole('button').first()).toBeDisabled()
  await expect(casella).toHaveValue('Testo in', { timeout: 15_000 })
  await ferma.click()
  await expect(casella).toHaveValue('Testo finale.')

  const dopoLoStop = richieste.length
  await casella.fill('testo mio')
  await page.waitForTimeout(5000)
  // no second recorder: no audio leaves after the stop, the box is mine, the microphone is off
  expect(richieste.length).toBe(dopoLoStop)
  await expect(casella).toHaveValue('testo mio')
  expect(await tracce(page)).toEqual(['ended'])
})

test('il pannello si chiude mentre il microfono si apre: il microfono si spegne e non parte niente', async ({
  page,
  context,
}) => {
  await microfonoLento(page)
  let richieste = 0
  await page.route('**/api/alfire/voce', (route) => {
    richieste++
    return route.fulfill({ json: { testo: 'x' } })
  })
  const { pannello, mic } = await apriPannello(page, context)

  await mic.click()
  await page.keyboard.press('Escape')
  await expect(pannello).toHaveCount(0)
  await page.waitForTimeout(5000)
  expect(richieste).toBe(0)
  expect(await tracce(page)).toEqual(['ended'])
})

test('una parziale lenta, ancora in volo allo stop, non tocca il testo finale', async ({ page, context }) => {
  let parziali = 0
  let segnalaLenta!: () => void
  const lentaInVolo = new Promise<void>((r) => (segnalaLenta = r))
  let rilascia!: () => void
  const rilascio = new Promise<void>((r) => (rilascia = r))
  await page.route('**/api/alfire/voce', async (route) => {
    if (!richiestaVoce(route).parziale) return route.fulfill({ json: { testo: 'Testo finale completo.' } })
    parziali++
    if (parziali === 1) return route.fulfill({ json: { testo: 'Testo in' } })
    segnalaLenta()
    await rilascio
    // the page aborted it at the stop: answering may fail, and that is the point
    await route.fulfill({ json: { testo: 'Parziale in ritardo' } }).catch(() => {})
  })
  const { pannello, casella, mic } = await apriPannello(page, context)

  await mic.click()
  await expect(casella).toHaveValue('Testo in', { timeout: 15_000 })
  await lentaInVolo
  await pannello.getByRole('button', { name: 'Ferma e trascrivi' }).click()
  await expect(casella).toHaveValue('Testo finale completo.')
  rilascia()
  await page.waitForTimeout(1500)
  await expect(casella).toHaveValue('Testo finale completo.')
})

for (const [status, attese] of [
  [429, 1],
  [502, 2],
] as const) {
  test(`parziali che rispondono ${status}: dopo ${attese} basta, e la riga dice che il testo arriva allo stop`, async ({
    page,
    context,
  }) => {
    let parziali = 0
    await page.route('**/api/alfire/voce', (route) => {
      if (!richiestaVoce(route).parziale) return route.fulfill({ json: { testo: 'Testo finale.' } })
      parziali++
      return route.fulfill({ status, json: { errore: 'Non ora.' } })
    })
    const { pannello, casella, mic } = await apriPannello(page, context)

    await mic.click()
    await expect(pannello.getByText('Testo in diretta in pausa: arriva tutto allo stop.')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(5000)
    expect(parziali).toBe(attese)

    await pannello.getByRole('button', { name: 'Ferma e trascrivi' }).click()
    await expect(casella).toHaveValue('Testo finale.')
    // a partial that failed never speaks: only the final would
    await expect(pannello.getByRole('alert')).toHaveCount(0)
  })
}

test('la trascrizione finale non riesce dopo il testo in diretta: l’avviso dice che può mancare la fine', async ({
  page,
  context,
}) => {
  await page.route('**/api/alfire/voce', (route) =>
    richiestaVoce(route).parziale
      ? route.fulfill({ json: { testo: 'Quanto ho' } })
      : route.fulfill({ status: 429, json: { errore: 'Limite gratuito della voce raggiunto. Riprova tra poco o scrivi.' } }),
  )
  const { pannello, casella, mic } = await apriPannello(page, context)

  await mic.click()
  await expect(casella).toHaveValue('Quanto ho', { timeout: 15_000 })
  await pannello.getByRole('button', { name: 'Ferma e trascrivi' }).click()
  await expect(pannello.getByRole('alert')).toContainText(
    'Nella casella c’è solo il testo in diretta, forse incompleto: controllalo prima di inviarlo.',
  )
  await expect(casella).toHaveValue('Quanto ho')
  await expect(casella).not.toHaveAttribute('data-in-ascolto', 'true')
})

test('sul telefono la casella segue il dettato: le ultime parole restano in vista', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const parole = 'Quanto ho incassato questo mese e quanto viene dai rinnovi e dai nuovi clienti'.split(' ')
  let parziali = 0
  await page.route('**/api/alfire/voce', (route) => {
    parziali++
    // every partial a longer text: after a few the box stops growing and scrolls
    const testo = Array.from({ length: parziali * 2 }, () => parole.join(' ')).join(' ')
    return route.fulfill({ json: { testo } })
  })
  const { casella, mic } = await apriPannello(page, context)

  await mic.click()
  await expect.poll(() => parziali, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
  await expect
    .poll(() =>
      casella.evaluate((c: HTMLTextAreaElement) => ({
        scorre: c.scrollHeight > c.clientHeight,
        inFondo: Math.abs(c.scrollTop + c.clientHeight - c.scrollHeight) <= 2,
      })),
    )
    .toEqual({ scorre: true, inFondo: true })
})
