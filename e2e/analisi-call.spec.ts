import { expect, test, type Page } from '@playwright/test'

import {
  FINTO_CLAUDE,
  FINTO_FATHOM,
  eseguiPassiCall,
  mettiChiaveFathom,
  raggiungibile,
  rimettiLavoriCall,
  sessioneDb,
  statoLavoriCall,
  togliChiaveFathom,
} from './call-db'
import { ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { accedi } from './utenti'

/**
 * L'analisi di una call registrata, da capo a fondo (1.37.0, CLAUDE.md sezione 31), contro il
 * Fathom finto e il Claude finto, mai quelli veri: il link con l'esito, il passo che legge la
 * trascrizione e chiama Claude (e2e/claude-finto.mjs), la scheda del closer con il motivo e la
 * performance PROPOSTI (si decidono con un tocco), la valutazione che solo chi ha fatto la call
 * legge, e il lato del setter, senza registrazione, performance né trascrizione.
 */

const PREFISSO = 'E2E Analisi'
const LINK = 'https://fathom.video/share/FintoTrova01'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
})

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

test('persa con il link: Claude propone motivo e performance, il closer decide; il setter vede solo «Dalla call»', async ({ page, browser }) => {
  test.setTimeout(180_000)
  test.skip(!FINTO_FATHOM || !FINTO_CLAUDE, 'Servono E2E_FATHOM_FINTO ed E2E_CLAUDE_FINTO.')
  test.skip(!(await raggiungibile(FINTO_FATHOM, '/__richieste')), 'Il Fathom finto non risponde.')
  test.skip(!(await raggiungibile(FINTO_CLAUDE, '/__azzera')), 'Il Claude finto non risponde.')
  test.skip(!(await mettiChiaveFathom()), 'Nel Vault locale c’è già una chiave di Fathom.')
  const prima = await statoLavoriCall()
  const db = dbLocale()
  const nome = `${PREFISSO} ${Date.now()}`
  try {
    await fetch(`${FINTO_CLAUDE}/__azzera`)
    await fetch(`${FINTO_FATHOM}/__azzera`)
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await db.from('calls').update({ note_closer: 'Il lead ha detto di voler aspettare la prossima settimana per decidere' }).eq('id', callId)

    // the closer registers the outcome with the link
    await accedi(page, 'closer')
    await page.goto('/calls')
    await scheda(page, nome).getByRole('button', { name: 'Registra esito' }).click()
    const foglio = page.getByRole('dialog')
    await foglio.getByRole('button', { name: 'Persa', exact: true }).click()
    await foglio.getByLabel('Link della registrazione di Fathom').fill(LINK)
    await foglio.getByRole('button', { name: 'Verifica il link' }).click()
    await foglio.getByRole('button', { name: 'Continua con questa registrazione' }).click()
    await foglio.getByLabel(/Motivo di non chiusura/).fill('Ci pensa')
    await foglio.getByRole('button', { name: 'No', exact: true }).click()
    await expect(scheda(page, nome).getByText('non qualificata')).toBeVisible()

    // the analysis is queued by itself, once
    await expect.poll(async () => (await db.from('call_analisi').select('stato').eq('call_id', callId).maybeSingle()).data?.stato).toBe('in_coda')
    await page.reload()
    await expect(scheda(page, nome).getByTestId('analisi-in-coda')).toBeVisible()

    // the step: transcript from Fathom, then Claude
    expect(await eseguiPassiCall()).toBeGreaterThanOrEqual(1)
    const { data: analisi } = await db
      .from('call_analisi')
      .select('stato, esito_letto, in_target, recording_id, errore, tentativi')
      .eq('call_id', callId)
      .single()
    expect(analisi).toMatchObject({ stato: 'pronta', esito_letto: 'persa', in_target: 'si', recording_id: 9700001 })

    // what Claude was sent: the names, the figures of money and the links blanked on the server (the
    // transcript itself is not stored anywhere); Claude is told not to report health, and the answer is checked
    const richieste = (await (await fetch(`${FINTO_CLAUDE}/__ultime`)).json()) as { corpo: unknown }[]
    const inviato = JSON.stringify(richieste.map((r) => r.corpo))
    expect(richieste.length).toBeGreaterThanOrEqual(1)
    for (const vietata of ['Marco Rossi', 'Giulia', '1.500', 'fathom.video', 'esempio.test']) {
      expect(inviato, vietata).not.toContain(vietata)
    }
    expect(inviato).toContain('[lead]')
    expect(inviato).toContain('[importo]')
    // and what is saved: no transcript, no health, no figure, no name
    const { data: tutto } = await db.from('call_analisi').select('*').eq('call_id', callId).single()
    const salvato = JSON.stringify(tutto)
    for (const vietata of ['Raccontami da dove parti', 'ernia', 'pectus', 'incavato', '1.500', 'Marco', 'Giulia', 'esempio.test']) {
      expect(salvato, vietata).not.toContain(vietata)
    }

    // the card of the closer: the reason PROPOSED (one tap to use it), the performance PROPOSED
    await page.reload()
    const s = scheda(page, nome)
    await expect(s.getByTestId('analisi-call')).toBeVisible()
    await expect(s.getByTestId('motivo-proposto')).toContainText('Deve decidere')
    await expect(s.getByTestId('performance-call')).toBeVisible()
    const proposta = (await s.getByTestId('performance-proposta').textContent())!.replace(/^:\s*/, '')
    expect(proposta.length).toBeGreaterThan(2)
    // nothing is written by itself
    const { data: ancora } = await db.from('calls').select('performance, obiezione_principale').eq('id', callId).single()
    expect(ancora).toEqual({ performance: null, obiezione_principale: 'Ci pensa' })

    await s.getByRole('button', { name: /^Conferma «/ }).click()
    await expect.poll(async () => (await db.from('calls').select('performance').eq('id', callId).single()).data?.performance).not.toBeNull()
    await s.getByRole('button', { name: 'Usa come motivo di non chiusura' }).click()
    await expect.poll(async () => (await db.from('calls').select('obiezione_principale').eq('id', callId).single()).data?.obiezione_principale).toBe(
      'Deve decidere insieme alla compagna e teme il petto.',
    )

    // the setter: «Dalla call» and his own suggestions, no recording, no performance, no transcript
    const ctx = await browser.newContext()
    const setter = await ctx.newPage()
    await accedi(setter, 'setter')
    await setter.goto('/calls')
    const ss = scheda(setter, nome)
    await expect(ss.getByTestId('dalla-call')).toContainText('Il lead era in target')
    await expect(ss.getByTestId('spunti-per-te')).toContainText('quante sere a settimana')
    await expect(ss.getByTestId('registrazione-call')).toHaveCount(0)
    await expect(ss.getByTestId('performance-call')).toHaveCount(0)
    await expect(ss.getByTestId('analisi-call')).toHaveCount(0)
    await expect(setter.getByText('Raccontami')).toHaveCount(0)
    await ctx.close()

    // RLS, not only the page: the setter reads no recording, no analysis, no valuation; the admin neither the
    // valuation nor the setter's suggestions of a call he did not lead nor book
    const setterDb = await sessioneDb('setter')
    for (const tabella of ['call_registrazioni', 'call_analisi', 'call_valutazioni'] as const) {
      const { data } = await setterDb.from(tabella).select('call_id').eq('call_id', callId)
      expect(data, tabella).toEqual([])
    }
    const { data: suoi } = await setterDb.from('call_spunti_setter').select('call_id').eq('call_id', callId)
    expect(suoi).toHaveLength(1)
    const adminDb = await sessioneDb('admin')
    for (const tabella of ['call_valutazioni', 'call_spunti_setter'] as const) {
      const { data } = await adminDb.from(tabella).select('call_id').eq('call_id', callId)
      expect(data, tabella).toEqual([])
    }
    const { data: dallAdmin } = await adminDb.from('call_analisi').select('call_id').eq('call_id', callId)
    expect(dallAdmin).toHaveLength(1)
    const closerDb = await sessioneDb('closer')
    const { data: sua } = await closerDb.from('call_valutazioni').select('call_id').eq('call_id', callId)
    expect(sua).toHaveLength(1)
  } finally {
    await togliChiaveFathom()
    await rimettiLavoriCall(prima)
  }
})
