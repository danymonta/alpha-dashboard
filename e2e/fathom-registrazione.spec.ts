import { expect, test, type Page } from '@playwright/test'

import { ID_CLOSER, creaCallDiProva, dbLocale } from './db'
import { FINTO_FATHOM, mettiChiaveFathom, raggiungibile, togliChiaveFathom } from './call-db'
import { accedi } from './utenti'

/**
 * La registrazione di Fathom con l'esito (1.37.0, CLAUDE.md sezione 31), contro il Fathom
 * finto (e2e/fathom-finto.mjs, mai quello vero): il link obbligatorio per una call svolta, la
 * verifica, «Call non registrata», la scheda con trascrizione e riassunto letti adesso. Serve il
 * dev server avviato con E2E_FATHOM_FINTO.
 */

const PREFISSO = 'E2E Fathom'
const LINK = 'https://fathom.video/share/FintoTrova01'

test.afterAll(async () => {
  await dbLocale().from('leads').delete().like('nome', `${PREFISSO}%`)
})

function nomeUnico(etichetta: string) {
  return `${PREFISSO} ${etichetta} ${Date.now()}`
}

function scheda(page: Page, nome: string) {
  return page.getByRole('article', { name: nome })
}

async function apriEsito(page: Page, nome: string) {
  await scheda(page, nome).getByRole('button', { name: /Registra esito|Cambia esito/ }).click()
  return page.getByRole('dialog')
}

async function conFathomFinto(corpo: () => Promise<void>) {
  test.skip(!FINTO_FATHOM, 'Serve E2E_FATHOM_FINTO e il Fathom finto.')
  test.skip(!(await raggiungibile(FINTO_FATHOM, '/__richieste')), 'Il Fathom finto non risponde.')
  const nostra = await mettiChiaveFathom()
  test.skip(!nostra, 'Nel Vault locale c’è già una chiave di Fathom.')
  try {
    await corpo()
  } finally {
    await togliChiaveFathom()
  }
}

test.describe('La registrazione con l’esito, closer', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'closer')
  })

  test('persa: il link si verifica su Fathom, poi il motivo; la scheda legge trascrizione e riassunto adesso', async ({ page }) => {
    test.setTimeout(90_000)
    await conFathomFinto(async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      const nome = nomeUnico('Link')
      const callId = await creaCallDiProva(nome, ID_CLOSER)
      await fetch(`${FINTO_FATHOM}/__azzera`)
      await page.goto('/calls')
      const foglio = await apriEsito(page, nome)
      await foglio.getByRole('button', { name: 'Persa', exact: true }).click()

      // the step comes first, with its way out and the words on Claude
      const passo = foglio.getByTestId('passo-registrazione')
      await expect(passo).toBeVisible()
      await expect(foglio.getByTestId('registrazione-analisi')).toContainText('Claude, un’intelligenza artificiale')
      await expect(foglio.getByRole('button', { name: 'Call non registrata' })).toBeVisible()
      const verifica = foglio.getByRole('button', { name: 'Verifica il link' })
      await expect(verifica).toBeDisabled()
      // targets of 44 px, no sideways scroll
      for (const b of [verifica, foglio.getByRole('button', { name: 'Call non registrata' })]) {
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      // a link that is not an address says so; nothing is saved
      const campo = foglio.getByLabel('Link della registrazione di Fathom')
      await campo.fill('non è un link')
      await verifica.click()
      await expect(foglio.getByRole('alert')).toBeVisible()
      const { data: prima } = await dbLocale().from('calls').select('stato, link_registrazione').eq('id', callId).single()
      expect(prima).toEqual({ stato: 'programmata', link_registrazione: null })

      // the right link is found on Fathom (the fake), with its length
      await campo.fill(LINK)
      await verifica.click()
      await expect(foglio.getByTestId('registrazione-risposta')).toContainText('Trovata su Fathom')
      await foglio.getByRole('button', { name: 'Continua con questa registrazione' }).click()

      // then the reason, as always
      await foglio.getByLabel(/Motivo di non chiusura/).fill('Fuori budget')
      await foglio.getByRole('button', { name: 'No', exact: true }).click()
      await expect(scheda(page, nome).getByText('non qualificata')).toBeVisible()

      const { data: call } = await dbLocale().from('calls').select('stato, esito, link_registrazione').eq('id', callId).single()
      expect(call).toEqual({ stato: 'svolta', esito: 'persa', link_registrazione: LINK })
      const { data: reg } = await dbLocale().from('call_registrazioni').select('stato, recording_id').eq('call_id', callId).single()
      expect(reg).toMatchObject({ stato: 'collegata', recording_id: 9700001 })

      // the card: the recording, and the transcript and the summary read from Fathom when opened
      const riga = scheda(page, nome).getByTestId('registrazione-riga')
      await expect(riga).toContainText('Su Fathom')
      await fetch(`${FINTO_FATHOM}/__azzera`)
      await scheda(page, nome).getByRole('button', { name: 'Trascrizione' }).click()
      const trascrizione = page.getByTestId('trascrizione')
      await expect(trascrizione).toContainText('Raccontami da dove parti', { timeout: 20_000 })
      await expect(page.getByText('Letta adesso da Fathom: l’app non la conserva.')).toBeVisible()
      await page.keyboard.press('Escape')
      await scheda(page, nome).getByRole('button', { name: 'Riassunto di Fathom' }).click()
      await expect(page.getByTestId('riassunto-fathom')).toContainText('Price was the main concern', { timeout: 20_000 })
      await page.keyboard.press('Escape')

      // never saved: no table holds the text
      const { data: righe } = await dbLocale().from('call_registrazioni').select('*').eq('call_id', callId)
      expect(JSON.stringify(righe)).not.toContain('Raccontami')
      const richieste = (await (await fetch(`${FINTO_FATHOM}/__richieste`)).json()) as { percorsi: string[]; include: boolean }
      expect(richieste.include).toBe(false)
      expect(richieste.percorsi.some((p) => p.endsWith('/transcript'))).toBe(true)
    })
  })

  test('«Call non registrata»: un tocco, senza motivo; si cambia dalla scheda', async ({ page }) => {
    const nome = nomeUnico('Non registrata')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')
    const foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Persa', exact: true }).click()
    await foglio.getByRole('button', { name: 'Call non registrata' }).click()
    // the reason of a lost call is still asked
    await expect(foglio.getByLabel(/Motivo di non chiusura/)).toBeVisible()
    await foglio.getByLabel(/Motivo di non chiusura/).fill('Ha cambiato idea')
    await foglio.getByRole('button', { name: 'Sì', exact: true }).click()
    await expect(scheda(page, nome).getByTestId('registrazione-riga')).toHaveText('Call non registrata')
    const { data: reg } = await dbLocale().from('call_registrazioni').select('stato').eq('call_id', callId).single()
    expect(reg).toEqual({ stato: 'non_registrata' })
    const { data: call } = await dbLocale().from('calls').select('link_registrazione').eq('id', callId).single()
    expect(call?.link_registrazione).toBeNull()
  })

  test('senza la chiave di Fathom il link si salva lo stesso e lo dice', async ({ page }) => {
    const { data: chiave } = await dbLocale().rpc('fathom_chiave')
    test.skip(Boolean(chiave), 'Nel Vault locale c’è una chiave di Fathom.')
    const nome = nomeUnico('Senza chiave')
    const callId = await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')
    const foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Persa', exact: true }).click()
    await foglio.getByLabel('Link della registrazione di Fathom').fill(LINK)
    await foglio.getByRole('button', { name: 'Verifica il link' }).click()
    await expect(foglio.getByTestId('registrazione-risposta')).toContainText('Fathom non è collegato')
    await foglio.getByRole('button', { name: 'Salva il link così' }).click()
    await foglio.getByLabel(/Motivo di non chiusura/).fill('Ci pensa')
    await foglio.getByRole('button', { name: 'No', exact: true }).click()
    await expect(scheda(page, nome).getByTestId('registrazione-riga')).toBeVisible()
    const { data: call } = await dbLocale().from('calls').select('link_registrazione').eq('id', callId).single()
    expect(call?.link_registrazione).toBe(LINK)
  })

  test('no show e cancellata non chiedono la registrazione', async ({ page }) => {
    const nome = nomeUnico('No show')
    await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')
    const foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'No show', exact: true }).click()
    await expect(page.getByText(`${nome}: no show`)).toBeVisible()
    await expect(page.getByTestId('passo-registrazione')).toHaveCount(0)
  })

  test('una call svolta con l’esito già registrato non lo chiede di nuovo cambiando esito', async ({ page }) => {
    const nome = nomeUnico('Cambia')
    await creaCallDiProva(nome, ID_CLOSER)
    await page.goto('/calls')
    let foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Persa', exact: true }).click()
    await foglio.getByRole('button', { name: 'Call non registrata' }).click()
    await foglio.getByLabel(/Motivo di non chiusura/).fill('Boh')
    await foglio.getByRole('button', { name: 'No', exact: true }).click()
    await expect(scheda(page, nome).getByText('Persa')).toBeVisible()
    foglio = await apriEsito(page, nome)
    await foglio.getByRole('button', { name: 'Follow-up', exact: true }).click()
    await expect(foglio.getByTestId('passo-registrazione')).toHaveCount(0)
  })
})

test('il setter non vede la registrazione né la scrive', async ({ page }) => {
  const nome = nomeUnico('Setter')
  const callId = await creaCallDiProva(nome, ID_CLOSER)
  await dbLocale().from('call_registrazioni').upsert({ call_id: callId, stato: 'non_registrata' })
  await dbLocale()
    .from('calls')
    .update({ stato: 'svolta', esito: 'persa', qualificata: false, obiezione_principale: 'Prezzo', link_registrazione: 'https://fathom.video/share/E2eSetterNo' })
    .eq('id', callId)
  await accedi(page, 'setter')
  await page.goto('/calls')
  await expect(scheda(page, nome)).toBeVisible()
  await expect(scheda(page, nome).getByTestId('registrazione-call')).toHaveCount(0)
  await expect(scheda(page, nome).getByTestId('performance-call')).toHaveCount(0)
  await expect(page.getByText('E2eSetterNo')).toHaveCount(0)
  await expect(page.getByText('Su Fathom')).toHaveCount(0)
})
