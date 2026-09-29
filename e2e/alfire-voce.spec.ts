import { expect, test } from '@playwright/test'

import { accedi } from './utenti'

// Runs against the fake model (e2e/llm-finto.mjs), like alfire-chat.spec.ts
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

// a fake microphone: Chromium feeds a tone, the fake model transcribes it
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

test('il vocale finisce nella casella: si rilegge e si manda con Invio', async ({ page, context }) => {
  await context.grantPermissions(['microphone'])
  await accedi(page, 'admin')
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  const casella = pannello.getByLabel('Scrivi ad Alfire')

  await pannello.getByRole('button', { name: 'Parla con Alfire' }).click()
  // speak for a moment: a recording under 1 KB is taken for a mistaken tap and dropped
  await page.waitForTimeout(1500)
  await pannello.getByRole('button', { name: 'Ferma e trascrivi' }).click()

  // the transcript waits in the box, nothing sent yet
  await expect(casella).toHaveValue('Quanto ho incassato questo mese?')
  await expect(pannello.getByText('Questo mese hai incassato 6.950,00 €.')).toHaveCount(0)

  await casella.press('Enter')
  await expect(pannello.getByText('Questo mese hai incassato 6.950,00 €.')).toBeVisible()
  await expect(casella).toHaveValue('')
})
