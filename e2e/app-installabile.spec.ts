import { expect, test } from '@playwright/test'

// The browser fetches the manifest and the icons without cookies: they must
// never land behind the login, or the app would not install.
test('manifest e icone si leggono senza accesso', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest', { maxRedirects: 0 })
  expect(manifest.status()).toBe(200)
  const dati = await manifest.json()
  expect(dati).toMatchObject({ name: 'Alpha Management', short_name: 'Alpha', display: 'standalone', start_url: '/' })
  for (const icona of dati.icons as { src: string }[]) {
    expect((await request.get(icona.src, { maxRedirects: 0 })).status(), icona.src).toBe(200)
  }
  for (const percorso of ['/favicon.ico', '/apple-icon.png', '/icon.png']) {
    expect((await request.get(percorso, { maxRedirects: 0 })).status(), percorso).toBe(200)
  }
})

test('la pagina dichiara manifest e icona per iPhone', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-icon\.png/)
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Alpha')
})
