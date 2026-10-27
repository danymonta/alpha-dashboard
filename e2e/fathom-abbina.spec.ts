import { expect, test } from '@playwright/test'

import { CHIAVE_FINTA, FINTO_FATHOM, mettiChiaveFathom, raggiungibile, togliChiaveFathom } from './call-db'
import { ID_ADMIN, ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

/**
 * «Cerca su Fathom e analizza» in Marketing › Dalle call (1.65.0), against the fake Fathom
 * (e2e/fathom-finto.mjs, never the real one): a held call without a recording whose lead has
 * the name of a meeting near its time gets that recording, and its analysis goes in the queue.
 * Needs the dev server started with E2E_FATHOM_FINTO.
 */

const LINK_FINTI = 'https://fathom.video/calls/77000%'

test('the held call without a recording is found on Fathom and goes to Claude', async ({ page }) => {
  test.setTimeout(90_000)
  test.skip(!FINTO_FATHOM, 'Serve E2E_FATHOM_FINTO e il Fathom finto.')
  test.skip(!(await raggiungibile(FINTO_FATHOM, '/__richieste')), 'Il Fathom finto non risponde.')
  const nostra = await mettiChiaveFathom()
  test.skip(!nostra, 'Nel Vault locale c’è già una chiave di Fathom.')

  const db = dbLocale()
  let leadId: string | null = null
  try {
    // the fake's meeting 5, «Lead Finto 5 and Dany»: its time, so the call is near it
    const elenco = await fetch(`${FINTO_FATHOM}/external/v1/meetings?cursor=4`, { headers: { 'x-api-key': CHIAVE_FINTA } })
    const riunione = ((await elenco.json()) as { items: { recording_start_time: string; url: string }[] }).items[0]
    const { data: lead } = await db
      .from('leads')
      .insert({ nome: 'Lead Finto', setter_id: ID_SETTER, fonte: 'dm_inbound', created_by: ID_SETTER })
      .select('id')
      .single()
    leadId = lead!.id
    const { data: call, error } = await db
      .from('calls')
      .insert({
        lead_id: leadId,
        setter_id: ID_SETTER,
        closer_id: ID_ADMIN,
        tipo: 'discovery',
        programmata_il: new Date(Date.parse(riunione.recording_start_time) + 5 * 60_000).toISOString(),
        stato: 'svolta',
        qualificata: true,
        esito: 'persa',
        obiezione_principale: 'Tempo',
        created_by: ID_SETTER,
      })
      .select('id')
      .single()
    if (error) throw error

    await accedi(page, 'admin')
    await page.goto('/marketing/dalle-call?giorni=14')
    await expect(page.getByTestId('dalle-call-senza')).toBeVisible()
    await page.getByTestId('cerca-fathom').click()
    await expect(page.getByText(/Trovate su Fathom \d+ call su \d+/)).toBeVisible({ timeout: 30_000 })

    const { data: dopo } = await db.from('calls').select('link_registrazione').eq('id', call!.id).single()
    expect(dopo?.link_registrazione).toBe(riunione.url)
    const { data: reg } = await db.from('call_registrazioni').select('recording_id, link_verificato').eq('call_id', call!.id).single()
    expect(reg?.recording_id).toBe(9700005)
    expect(reg?.link_verificato).toBe(riunione.url)
    const { data: analisi } = await db.from('call_analisi').select('stato, motivo').eq('call_id', call!.id).single()
    expect(analisi?.stato).toMatch(/in_coda|in_corso/)
    await expect(page.getByTestId('dalle-call-in-analisi')).toBeVisible()
  } finally {
    // whatever else the fake matched in the local seed goes back as it was
    await db.from('calls').update({ link_registrazione: null }).like('link_registrazione', LINK_FINTI)
    if (leadId) await db.from('leads').delete().eq('id', leadId)
    await togliChiaveFathom()
  }
})
