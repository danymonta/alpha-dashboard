import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

test('l’admin scarica il backup completo; gli altri no', async ({ page, browser }) => {
  await accedi(page, 'admin')
  const risposta = await page.request.get('/api/backup')
  expect(risposta.status()).toBe(200)
  expect(risposta.headers()['content-disposition']).toMatch(/backup-alpha-\d{4}-\d{2}-\d{2}\.json\.gz/)
  const corpo = await risposta.body()
  const backup = JSON.parse(gunzipSync(corpo).toString('utf8'))
  expect(backup.formato).toBe(1)
  // every table of the schema, a new one included without touching the code
  for (const tabella of ['clients', 'sales', 'payments', 'expenses', 'profiles', 'pm_progetti', 'audit_log']) {
    expect(Array.isArray(backup.tabelle[tabella]), tabella).toBe(true)
  }
  expect(backup.tabelle.sales.length).toBeGreaterThan(0)
  expect(backup.utenti.length).toBeGreaterThan(0)
  if (process.env.E2E_SALVA_BACKUP) await writeFile(process.env.E2E_SALVA_BACKUP, corpo)

  const altro = await browser.newPage()
  await accedi(altro, 'setter')
  expect((await altro.request.get('/api/backup')).status()).toBe(403)
  await altro.close()
})

test('il cron del backup vuole il suo segreto', async ({ request }) => {
  const senza = await request.get('/api/cron/backup')
  expect([401, 500]).toContain(senza.status())
})
