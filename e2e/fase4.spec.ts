import { expect, test } from '@playwright/test'

import { aggiungiMesi, oggiRoma, primoDelMeseISO } from '../lib/date'
import { ID_CLOSER, ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

const EMAIL_INVITO = `e2e.invito.${Date.now()}@alpha.test`

test.afterAll(async () => {
  const db = dbLocale()
  await db.from('invites').delete().like('email', 'e2e.invito.%')
  // seed users back to their original state, whatever happened in the tests
  await db.from('profiles').update({ ruolo: 'closer', attivo: true }).eq('id', ID_CLOSER)
  await db.from('commission_rules').delete().eq('profile_id', ID_SETTER).neq('percentuale', 0.05)
  await db.from('commission_rules').update({ valida_al: null }).eq('profile_id', ID_SETTER).eq('percentuale', 0.05)
})

test.describe('Team', () => {
  test('invito ed eliminazione dell’invito', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/settings/team')

    await page.getByRole('button', { name: 'Invita' }).click()
    await page.getByLabel('Email Google').fill(EMAIL_INVITO)
    await page.getByLabel('Ruolo', { exact: true }).selectOption('setter')
    await page.getByRole('button', { name: 'Crea l’invito' }).click()

    const invito = page.getByTestId('inviti').getByRole('listitem', { name: EMAIL_INVITO })
    await expect(invito).toContainText('Setter')

    await invito.getByRole('button', { name: `Elimina l’invito a ${EMAIL_INVITO}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
    await expect(page.getByText(`Invito a ${EMAIL_INVITO} eliminato`)).toBeVisible()
    await expect(page.getByRole('listitem', { name: EMAIL_INVITO })).toHaveCount(0)
  })

  test('un profilo provvisorio si unisce a quello vero, poi la persona si elimina', async ({ page }) => {
    const db = dbLocale()
    const segnaposto = 'qa.segnaposto@prova.invalid'
    const vero = 'qa.vero@alpha.test'
    await db.from('invites').upsert([{ email: segnaposto, ruolo: 'setter' }, { email: vero, ruolo: 'setter' }])
    const { data: a } = await db.auth.admin.createUser({ email: segnaposto, email_confirm: true, user_metadata: { full_name: 'QA Segnaposto' } })
    const { data: b } = await db.auth.admin.createUser({ email: vero, email_confirm: true, user_metadata: { full_name: 'QA Vero' } })
    await db.from('setter_daily_reports').insert({ setter_id: a.user!.id, data: '2020-02-01', dm_outbound: 7 })

    try {
      await accedi(page, 'admin')
      await page.goto('/settings/team')

      await page.getByRole('button', { name: 'Unisci QA Segnaposto a un altro profilo' }).click()
      const unione = page.getByRole('dialog')
      await unione.getByLabel('Unisci a').selectOption({ label: `QA Vero · ${vero}` })
      await unione.getByRole('button', { name: 'Unisci' }).click()
      await expect(page.getByText('QA Segnaposto unito a QA Vero')).toBeVisible()
      await expect(page.getByTestId('membri').getByRole('listitem', { name: 'QA Segnaposto' })).toHaveCount(0)

      // the report moved: deleting the person says so first
      await page.getByRole('button', { name: 'Elimina dal team QA Vero' }).click()
      const conferma = page.getByRole('dialog')
      await expect(conferma).toContainText('1 report giornaliero')
      await conferma.getByRole('button', { name: 'Elimina' }).click()
      await expect(page.getByText('QA Vero eliminato dal team')).toBeVisible()
      await expect(page.getByTestId('membri').getByRole('listitem', { name: 'QA Vero' })).toHaveCount(0)
    } finally {
      for (const u of [a.user, b.user]) if (u) await db.auth.admin.deleteUser(u.id).catch(() => undefined)
      await db.from('invites').delete().in('email', [segnaposto, vero])
    }
  })

  test('il mio account non si disattiva e non cambia ruolo', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/settings/team')
    const io = page.getByTestId('membri').getByRole('listitem', { name: 'Dany Montagnolo' })
    await expect(io.getByRole('switch', { name: 'Dany Montagnolo attivo' })).toBeDisabled()
    await expect(io.getByLabel('Ruolo di Dany Montagnolo')).toBeDisabled()
  })

  test('cambio ruolo e disattivazione hanno effetto al prossimo accesso', async ({ page, browser }) => {
    await accedi(page, 'admin')
    await page.goto('/settings/team')
    const closer = page.getByTestId('membri').getByRole('listitem', { name: 'Lorenzo Closer' })
    const ruolo = closer.getByLabel('Ruolo di Lorenzo Closer')

    // making someone admin asks first; "Annulla" leaves everything as it was
    await ruolo.selectOption('admin')
    await page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(ruolo).toHaveValue('closer')

    await ruolo.selectOption('coach')
    await expect(page.getByText('Lorenzo Closer: ora coach')).toBeVisible()

    const lorenzo = await (await browser.newContext()).newPage()
    await accedi(lorenzo, 'closer')
    // a coach has no Economics: lands on their tasks
    await expect(lorenzo).toHaveURL('/task')
    await lorenzo.context().close()

    await closer.getByRole('switch', { name: 'Lorenzo Closer attivo' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Disattiva' }).click()
    await expect(page.getByText(/Lorenzo Closer disattivato/)).toBeVisible()

    const disattivato = await (await browser.newContext()).newPage()
    await accedi(disattivato, 'closer')
    await expect(disattivato).toHaveURL('/account-disattivato')
    await disattivato.context().close()
  })
})

test('regole provvigioni: una nuova regola chiude la precedente e non tocca lo storico', async ({ page }) => {
  const dal = aggiungiMesi(primoDelMeseISO(oggiRoma()), 1)
  await accedi(page, 'admin')
  await page.goto('/settings/commissions')

  await page.getByRole('button', { name: 'Nuova regola' }).click()
  await page.getByLabel('Collaboratore').selectOption({ label: 'Loris Setter' })
  await page.getByLabel('Percentuale').fill('7')
  await page.getByLabel('Vale dal').fill(dal)
  await page.getByRole('button', { name: 'Salva la regola' }).click()

  await expect(page.getByText('Regola salvata')).toBeVisible()
  const regole = page.getByTestId('regole')
  await expect(regole.getByRole('listitem').filter({ hasText: '7%' })).toContainText('Futura')
  await expect(regole.getByRole('listitem').filter({ hasText: '5%' })).toContainText(' al ')

  await page.goto('/settings/audit?tabella=commission_rules')
  await expect(page.getByTestId('registro')).toContainText('Regola provvigione creata')
})

test('export CSV: file leggibile da Excel, solo per l’admin', async ({ page, browser }) => {
  await accedi(page, 'admin')
  const mese = oggiRoma().slice(0, 7)

  const risposta = await page.request.get(`/api/export/costi?mese=${mese}`)
  expect(risposta.status()).toBe(200)
  expect(risposta.headers()['content-type']).toContain('text/csv')
  expect(risposta.headers()['content-disposition']).toContain(`costi-${mese}.csv`)
  const testo = await risposta.text()
  expect(testo.startsWith('﻿Data;Categoria;Descrizione;Importo;Ricorrente')).toBe(true)

  const vendite = await page.request.get(`/api/export/vendite?mese=${mese}`)
  expect((await vendite.text()).split('\r\n')[0]).toContain('Data vendita;Cliente;Tipo')

  const setter = await (await browser.newContext()).newPage()
  await accedi(setter, 'setter')
  const negato = await setter.request.get(`/api/export/costi?mese=${mese}`)
  expect(negato.status()).toBe(403)
  await setter.context().close()
})
