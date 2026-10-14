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
  await expect(page.getByText('Ultimo aggiornamento: 14 ottobre 2026')).toBeVisible()
  // the posts and reels of the account, read for the content calendar (1.33.0): never the comments or who liked
  await expect(page.getByText(/legge anche l’elenco dei post e dei reel pubblicati dall’account/)).toBeVisible()
  // Claude connected to the content calendar (1.34.0): the team's own Claude accounts, the calendar only
  await expect(page.getByText(/collegare il proprio account Claude \(Anthropic\) al calendario dei contenuti/)).toBeVisible()
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
