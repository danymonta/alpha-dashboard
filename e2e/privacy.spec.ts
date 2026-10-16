import { expect, test } from '@playwright/test'

// The privacy policy is the Meta app's Privacy Policy URL and, with
// #cancellazione-dati, its Data deletion instructions URL: Meta's crawler and
// anyone coming from Instagram read it without an account (CLAUDE.md section 22).

const EMAIL = 'join@percorsoalpha.com'

test('il crawler di Meta legge /privacy senza essere mandato al login', async ({ request }) => {
  const risposta = await request.get('/privacy', {
    maxRedirects: 0,
    headers: { 'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
  })
  expect(risposta.status()).toBe(200)
  const html = await risposta.text()
  expect(html).toContain('id="cancellazione-dati"')
  expect(html).toContain(EMAIL)
})

test('l’informativa si apre senza sessione, con le istruzioni per la cancellazione', async ({ browser, baseURL }) => {
  // a brand-new context: no session cookie at all
  const contesto = await browser.newContext({ baseURL })
  const page = await contesto.newPage()

  const risposta = await page.goto('/privacy')
  expect(risposta?.status()).toBe(200)
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page).toHaveTitle('Informativa privacy · Percorso Alpha')
  await expect(page.getByRole('heading', { level: 1, name: 'Informativa privacy' })).toBeVisible()
  await expect(page.getByText('Ultimo aggiornamento: 16 ottobre 2026')).toBeVisible()
  // the posts and reels of the account, read for the content calendar (1.33.0): never the comments or who liked;
  // from 1.35.0 their captions and numbers go into the DM recap, so the old «nothing to an AI» is gone
  const posts = page.getByText(/legge anche l’elenco dei post e dei reel pubblicati dall’account/)
  await expect(posts).toBeVisible()
  await expect(posts).toContainText('entrano anche nel riepilogo dei messaggi diretti')
  await expect(posts).not.toContainText('non manda niente di questo a un’intelligenza artificiale')
  // the Insight of the last 24 hours (1.35.0): the DM text goes to Anthropic and stays at most 30 days
  const metaEAi = page.getByRole('region', { name: /Meta e l’intelligenza artificiale/ })
  await expect(metaEAi.getByText('Riepilogo dei messaggi diretti.', { exact: true })).toBeVisible()
  await expect(metaEAi).toContainText('il testo dei messaggi viene inviato ad Anthropic PBC (Stati Uniti)')
  await expect(metaEAi).toContainText('per al massimo 30 giorni')
  await expect(metaEAi).toContainText('quanti contatti arrivano da ciascun nostro post o reel')
  await expect(metaEAi).toContainText('Il riepilogo descritto qui sotto, invece, usa il testo.')
  // the reel analysis (1.36.0): frames, caption and transcript to Anthropic, the audio to Groq, the video never kept
  await expect(metaEAi.getByText('Analisi dei reel.', { exact: true })).toBeVisible()
  await expect(metaEAi).toContainText('I fotogrammi, la didascalia e la trascrizione del parlato vengono inviati ad Anthropic PBC')
  await expect(metaEAi).toContainText('la traccia audio viene inviata a Groq (Stati Uniti) per essere trascritta e non viene conservata')
  await expect(metaEAi).toContainText('lo cancella subito: non lo conserva')
  // the analysis of the recorded calls (1.37.0): the transcript to Anthropic, cleaned, never kept; the health stays out
  await expect(metaEAi.getByText('Analisi delle call.', { exact: true })).toBeVisible()
  await expect(metaEAi).toContainText('ne legge la trascrizione e la invia ad Anthropic PBC (Stati Uniti)')
  await expect(metaEAi).toContainText('Il gestionale non conserva la registrazione né la trascrizione')
  await expect(metaEAi).toContainText('senza dati sulla salute')
  await expect(metaEAi).toContainText('Se non vuoi che una call venga registrata o analizzata')
  await expect(metaEAi.getByText('Spunti per i contenuti.', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: /Con chi condividiamo i dati/ })).toContainText('la trascrizione dell’audio dei nostri reel')
  const conservazione = page.getByRole('region', { name: /Per quanto tempo li conserviamo/ })
  await expect(conservazione).toContainText('il video e l’audio non si conservano')
  await expect(conservazione).toContainText('al massimo 24 mesi dalla call')
  await expect(conservazione).toContainText('al massimo 26 settimane')
  await expect(conservazione).toContainText('il riepilogo e i messaggi letti per prepararlo, al massimo 30 giorni')
  await expect(conservazione).toContainText('Contatti per contenuto')
  await expect(page.getByRole('region', { name: /Come chiedere la cancellazione dei dati/ })).toContainText(
    'Puoi chiederci di cancellare i tuoi messaggi dal riepilogo dei messaggi diretti',
  )
  // Claude connected to the content calendar (1.34.0): the team's own Claude accounts, the calendar only
  await expect(page.getByText(/collegare il proprio account Claude \(Anthropic\) al calendario dei contenuti/)).toBeVisible()
  // minors (Dany, 10/10/2026): under 14 nothing kept, 14 to 17 the rules of everyone
  const minori = page.getByRole('region', { name: /Minori/ })
  await expect(minori).toContainText('Sotto i 14 anni chiudiamo la conversazione con gentilezza e non conserviamo i suoi messaggi')
  await expect(minori).toContainText('Tra i 14 e i 17 anni non proponiamo niente senza il coinvolgimento dei genitori')
  await expect(page.getByRole('heading', { level: 2, name: /Minori/ })).toHaveAttribute('id', 'minori')

  // indexable, unlike the rest of the app
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index, follow/)

  // the index leads to the deletion instructions, the same address Meta links to
  const cancellazione = page.getByRole('heading', { level: 2, name: /Come chiedere la cancellazione dei dati/ })
  await expect(cancellazione).toHaveAttribute('id', 'cancellazione-dati')
  await page
    .getByRole('navigation', { name: 'Indice' })
    .getByRole('link', { name: /Come chiedere la cancellazione dei dati/ })
    .click()
  await expect(page).toHaveURL(/\/privacy#cancellazione-dati$/)
  await expect(cancellazione).toBeInViewport()

  const sezione = page.getByRole('region', { name: /Come chiedere la cancellazione dei dati/ })
  await expect(sezione.getByText('«Cancellazione dati»')).toBeVisible()
  await expect(sezione.getByRole('link', { name: EMAIL })).toHaveAttribute('href', `mailto:${EMAIL}`)
  await expect(sezione.getByRole('link', { name: 'Scrivi per la cancellazione' })).toHaveAttribute(
    'href',
    `mailto:${EMAIL}?subject=Cancellazione%20dati`,
  )

  // nothing of the app around it: no shell, no Google button
  await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toHaveCount(0)

  await contesto.close()
})

test('a 390 px la pagina non scorre di lato', async ({ browser, baseURL }) => {
  const contesto = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } })
  const page = await contesto.newPage()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Informativa privacy' })).toBeVisible()

  const { larghezza, visibile } = await page.evaluate(() => ({
    larghezza: document.documentElement.scrollWidth,
    visibile: document.documentElement.clientWidth,
  }))
  expect(larghezza).toBeLessThanOrEqual(visibile)

  // the deletion anchor works on the phone too
  await page.goto('/privacy#cancellazione-dati')
  await expect(page.getByRole('heading', { level: 2, name: /Come chiedere la cancellazione dei dati/ })).toBeInViewport()

  await contesto.close()
})
