import { expect, test, type Page, type Route } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import type { Database } from '../lib/supabase/database.types'
import { ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

type Riga = Database['public']['Tables']['setter_daily_reports']['Row']

function campo(page: Page, etichetta: string) {
  return page.getByRole('group', { name: etichetta }).getByRole('textbox')
}

/** The seed setter's report of a day, every column. */
async function rigaDelGiorno(giorno: string): Promise<Riga | null> {
  const { data, error } = await dbLocale()
    .from('setter_daily_reports')
    .select('*')
    .eq('setter_id', ID_SETTER)
    .eq('data', giorno)
    .maybeSingle()
  if (error) throw error
  return data
}

/** The day with only these DM outbound (written as another device would). */
async function impostaGiorno(giorno: string, dmOutbound: number) {
  const db = dbLocale()
  const { error } = await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).eq('data', giorno)
  if (error) throw error
  const { error: e2 } = await db
    .from('setter_daily_reports')
    .insert({ setter_id: ID_SETTER, data: giorno, created_by: ID_SETTER, dm_outbound: dmOutbound })
  if (e2) throw e2
}

/** A change made elsewhere (the admin's sheet in "Setter", another device). */
async function cambiaAltrove(giorno: string, dmOutbound: number) {
  const { error } = await dbLocale()
    .from('setter_daily_reports')
    .update({ dm_outbound: dmOutbound })
    .eq('setter_id', ID_SETTER)
    .eq('data', giorno)
  if (error) throw error
}

/** The day back as it was before the test: the same row, or none. */
async function ripristinaGiorno(giorno: string, prima: Riga | null) {
  const db = dbLocale()
  const { error } = await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).eq('data', giorno)
  if (error) throw error
  if (prima) {
    // dm_totali is computed by the database
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dm_totali, ...riga } = prima
    const { error: e2 } = await db.from('setter_daily_reports').insert(riga)
    if (e2) throw e2
  }
}

/** The phone switches to another app and back (Loris between Instagram and "Oggi"). */
async function tornaSullApp(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** The save of "Oggi" (a server action posted to the page) reaches the server, its answer never comes back. */
async function perdiLaRisposta(page: Page, volte = 1) {
  let perse = 0
  await page.route(
    (url) => url.pathname === '/today',
    async (route: Route) => {
      if (route.request().method() !== 'POST' || perse >= volte) return route.fallback()
      perse++
      await route.fetch()
      await route.abort('internetdisconnected')
    },
  )
}

const toastCambiato = (page: Page) => page.locator('[data-sonner-toast]').getByText(/cambiato da un’altra parte/)

async function attendiSalvataggio(page: Page) {
  await expect(page.getByText('Salvataggio…')).toBeVisible()
  await expect(page.getByTestId('stato-salvato')).toBeVisible()
}

test.describe('Oggi, report giornaliero del setter', () => {
  test.beforeEach(async ({ page }) => {
    await accedi(page, 'setter')
  })

  test('un tocco su +5 si salva da solo e resta dopo il ricaricamento', async ({ page }) => {
    await page.goto('/today')
    const dm = campo(page, 'DM outbound')
    const prima = Number(await dm.inputValue())

    await page.getByRole('button', { name: 'DM outbound: più 5' }).click()
    await expect(dm).toHaveValue(String(prima + 5))
    await attendiSalvataggio(page)

    await page.reload()
    await expect(campo(page, 'DM outbound')).toHaveValue(String(prima + 5))
  })

  test('si può scrivere il numero direttamente', async ({ page }) => {
    await page.goto('/today')
    const conversazioni = campo(page, 'Conversazioni')
    // Always a different value: rewriting the same number fires no change
    const nuovo = String(Number(await conversazioni.inputValue()) + 13)

    await conversazioni.fill(nuovo)
    await conversazioni.press('Tab')
    await attendiSalvataggio(page)

    await page.reload()
    await expect(campo(page, 'Conversazioni')).toHaveValue(nuovo)
  })

  test('un giorno senza report si crea al primo tocco', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -2)
    await dbLocale()
      .from('setter_daily_reports')
      .delete()
      .eq('setter_id', ID_SETTER)
      .eq('data', giorno)

    await page.goto(`/today?data=${giorno}`)
    await expect(page.getByText('Non ancora compilato')).toBeVisible()
    await expect(campo(page, 'Call proposte')).toHaveValue('0')
    // no row yet: nothing for the database to add up
    await expect(page.getByTestId('dm-totali')).toContainText('DM totali: 0')

    await page.getByRole('button', { name: 'Call proposte: più 1' }).click()
    await attendiSalvataggio(page)
    await expect(page.getByText(/avviato/)).toBeVisible()

    await page.reload()
    await expect(campo(page, 'Call proposte')).toHaveValue('1')
  })

  test('cambiare scheda salva solo quello che aspetta: mai un report vuoto, mai un salvataggio a vuoto', async ({
    page,
  }) => {
    const vuoto = aggiungiGiorni(oggiRoma(), -46)
    const pieno = aggiungiGiorni(oggiRoma(), -47)
    const primaVuoto = await rigaDelGiorno(vuoto)
    const primaPieno = await rigaDelGiorno(pieno)
    try {
      await ripristinaGiorno(vuoto, null)
      await impostaGiorno(pieno, 9)
      const versione = (await rigaDelGiorno(pieno))?.updated_at

      // an untouched day without a report: switching tab creates nothing
      await page.goto(`/today?data=${vuoto}`)
      await expect(page.getByText('Non ancora compilato')).toBeVisible()
      await tornaSullApp(page)
      await page.waitForTimeout(1500)
      expect(await rigaDelGiorno(vuoto)).toBeNull()

      // a saved day, nothing changed: switching tab writes nothing
      await page.goto(`/today?data=${pieno}`)
      await expect(campo(page, 'DM outbound')).toHaveValue('9')
      await tornaSullApp(page)
      await page.waitForTimeout(1500)
      expect((await rigaDelGiorno(pieno))?.updated_at).toBe(versione)

      // a change still waiting goes out when the tab is left
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await tornaSullApp(page)
      await expect.poll(async () => (await rigaDelGiorno(pieno))?.dm_outbound).toBe(10)
    } finally {
      await ripristinaGiorno(vuoto, primaVuoto)
      await ripristinaGiorno(pieno, primaPieno)
    }
  })

  test('ogni numero dice cosa conta e la strategy non si compila più', async ({ page }) => {
    await page.goto('/today')

    for (const aiuto of [
      'Persone nuove a cui scrivi tu per primo',
      'Persone nuove che ti chiedono informazioni e a cui rispondi',
      'Chi ti risponde e a cui rispondi, anche il giorno dopo',
      'Solleciti a chi non ti ha ancora risposto',
      'Persone a cui proponi una call',
    ]) {
      await expect(page.getByText(aiuto, { exact: true })).toBeVisible()
    }
    await expect(page.getByTestId('dm-totali')).toContainText('= outbound + inbound + follow up')
    await expect(page.getByText('Non entrano nei DM totali.', { exact: true })).toBeVisible()

    // The setter books discovery calls only: no strategy counter any more
    await expect(page.getByRole('group', { name: /strategy/i })).toHaveCount(0)
    await expect(campo(page, 'Discovery prenotate')).toBeVisible()
    // held and qualified are the closer's, recorded on each call: not in the report
    await expect(page.getByRole('group', { name: 'Discovery svolte' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Call qualificate' })).toHaveCount(0)

    const legenda = page.getByTestId('legenda')
    await legenda.getByText('Cosa significa ogni numero').click()
    await expect(legenda.getByText('DM totali', { exact: true })).toBeVisible()
    await expect(legenda.getByText('Prenotate da DM inbound', { exact: true })).toBeVisible()
    await expect(legenda.getByText('Prenotate da DM outbound', { exact: true })).toBeVisible()
  })

  test('i tre DM stanno insieme sopra il loro totale, le conversazioni a parte', async ({ page }) => {
    await page.goto('/today')

    const etichette = await page.locator('[role="group"] label').allInnerTexts()
    expect(etichette.slice(0, 5)).toEqual(['DM outbound', 'DM inbound', 'Follow up', 'Conversazioni', 'Call proposte'])

    // the three parts of DM totali, then the line with their sum
    const messaggi = page.getByRole('region', { name: 'Messaggi' })
    await expect(messaggi.getByRole('group')).toHaveCount(3)
    await expect(messaggi.getByTestId('dm-totali')).toBeVisible()
    await expect(messaggi.getByRole('group', { name: 'Conversazioni' })).toHaveCount(0)
    // conversations in a group of their own, which says they are not in the total
    const conversazioni = page.getByRole('region', { name: 'Conversazioni' })
    await expect(conversazioni.getByRole('group')).toHaveCount(1)
    await expect(conversazioni).toContainText('Non entrano nei DM totali.')
  })

  test('DM totali è quello che calcola il database, e si aggiorna dopo ogni salvataggio', async ({ page }) => {
    const giorno = aggiungiGiorni(oggiRoma(), -3)
    const db = dbLocale()
    const { data: prima, error } = await db
      .from('setter_daily_reports')
      .select('id, dm_outbound, dm_inbound, follow_up, conversazioni')
      .eq('setter_id', ID_SETTER)
      .eq('data', giorno)
      .maybeSingle()
    if (error) throw error

    try {
      await page.goto(`/today?data=${giorno}`)
      const valore = page.getByTestId('dm-totali-valore')

      for (const [etichetta, n] of [
        ['DM outbound', '12'],
        ['DM inbound', '3'],
        ['Follow up', '2'],
      ] as const) {
        await campo(page, etichetta).fill(n)
        await campo(page, etichetta).press('Tab')
      }
      await expect(page.getByTestId('stato-salvato')).toBeVisible()
      await expect(valore).toHaveText('17')
      const { data: salvato } = await db
        .from('setter_daily_reports')
        .select('dm_totali')
        .eq('setter_id', ID_SETTER)
        .eq('data', giorno)
        .single()
      expect(salvato?.dm_totali).toBe(17)

      // conversations never move it
      const conv = campo(page, 'Conversazioni')
      await conv.fill(String(Number(await conv.inputValue()) + 7))
      await conv.press('Tab')
      await attendiSalvataggio(page)
      await expect(valore).toHaveText('17')

      // the page loads it from the saved row
      await page.reload()
      await expect(page.getByTestId('dm-totali')).toContainText('DM totali: 17')
    } finally {
      // leave the seed as it was
      if (prima) {
        const { id, ...numeri } = prima
        await db.from('setter_daily_reports').update(numeri).eq('id', id)
      } else {
        await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).eq('data', giorno)
      }
    }
  })

  test('una risposta persa dopo il salvataggio: il tocco dopo salva, senza «cambiato da un’altra parte»', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const giorno = aggiungiGiorni(oggiRoma(), -43)
    const prima = await rigaDelGiorno(giorno)
    try {
      await impostaGiorno(giorno, 10)
      await page.goto(`/today?data=${giorno}`)
      const dm = campo(page, 'DM outbound')
      await expect(dm).toHaveValue('10')

      // the save lands, the phone never hears back
      await perdiLaRisposta(page)
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByText('Non salvato. Connessione assente. Riprova.', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await rigaDelGiorno(giorno))?.dm_outbound).toBe(11)

      // the next tap goes out over its own lost save: saved, never "changed elsewhere"
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByTestId('stato-salvato')).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await rigaDelGiorno(giorno))?.dm_outbound).toBe(12)
      await expect(dm).toHaveValue('12')

      // the same with "Riprova": the very values that landed, saved
      await page.unrouteAll({ behavior: 'wait' })
      await perdiLaRisposta(page)
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByText('Non salvato. Connessione assente. Riprova.', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await rigaDelGiorno(giorno))?.dm_outbound).toBe(13)
      await page.getByRole('button', { name: 'Riprova', exact: true }).click()
      await expect(page.getByTestId('stato-salvato')).toBeVisible({ timeout: 20_000 })
      await expect(dm).toHaveValue('13')
      expect((await rigaDelGiorno(giorno))?.dm_outbound).toBe(13)
      await expect(toastCambiato(page)).toHaveCount(0)

      // a lost save and then a real change elsewhere: that one is still refused, and the day reloads
      await page.unrouteAll({ behavior: 'wait' })
      await perdiLaRisposta(page)
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByText('Non salvato. Connessione assente. Riprova.', { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await rigaDelGiorno(giorno))?.dm_outbound).toBe(14)
      await cambiaAltrove(giorno, 50)
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(toastCambiato(page)).toBeVisible({ timeout: 20_000 })
      await expect(dm).toHaveValue('50')
      expect((await rigaDelGiorno(giorno))?.dm_outbound).toBe(50)
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await ripristinaGiorno(giorno, prima)
    }
  })

  test('tornando sull’app senza rete Oggi resta lì; con la rete si rilegge solo se il giorno è cambiato', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    const giorno = aggiungiGiorni(oggiRoma(), -44)
    const prima = await rigaDelGiorno(giorno)
    try {
      await impostaGiorno(giorno, 7)
      await page.goto(`/today?data=${giorno}`)
      const dm = campo(page, 'DM outbound')
      await expect(dm).toHaveValue('7')
      await expect(page.getByTestId('stato-salvato')).toBeVisible()

      // every read of the page again (router.refresh), and every page the browser loads
      const riletture: string[] = []
      page.on('request', (r) => {
        if (r.method() === 'GET' && r.headers()['rsc'] === '1' && new URL(r.url()).pathname === '/today') {
          riletture.push(r.url())
        }
      })
      // a full browser navigation (a refresh that failed) loads a new document
      const navigazioni: string[] = []
      page.on('load', () => navigazioni.push(page.url()))

      // changed elsewhere while the phone has no connection
      await cambiaAltrove(giorno, 30)
      await context.setOffline(true)
      await tornaSullApp(page)
      await page.waitForTimeout(3000)
      expect(navigazioni).toEqual([])
      expect(page.url()).toContain(`/today?data=${giorno}`)
      await expect(page.getByTestId('report-campi')).toBeVisible()
      await expect(dm).toHaveValue('7')
      expect(riletture).toEqual([])

      // "on line" but nothing gets through (a weak signal): the same
      await context.setOffline(false)
      await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'))
      await tornaSullApp(page)
      await page.waitForTimeout(3000)
      expect(navigazioni).toEqual([])
      await expect(page.getByTestId('report-campi')).toBeVisible()
      await expect(dm).toHaveValue('7')
      expect(riletture).toEqual([])
      await page.unroute('**/rest/v1/**')

      // the connection back: the day changed, it is read again
      await tornaSullApp(page)
      await expect(dm).toHaveValue('30')
      await expect(page.getByTestId('stato-salvato')).toBeVisible()
      expect(riletture.length).toBeGreaterThan(0)

      // nothing changed since: back to the app, nothing is read again
      riletture.length = 0
      await tornaSullApp(page)
      await page.waitForTimeout(3000)
      expect(riletture).toEqual([])
      expect(navigazioni).toEqual([])

      // and the taps save over the day read again
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByTestId('stato-salvato')).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await rigaDelGiorno(giorno))?.dm_outbound).toBe(31)
    } finally {
      await context.setOffline(false)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await ripristinaGiorno(giorno, prima)
    }
  })

  test('un salvataggio rifiutato e subito niente rete: il giorno salvato prende lo schermo, mai la pagina d’errore', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    const giorno = aggiungiGiorni(oggiRoma(), -45)
    const prima = await rigaDelGiorno(giorno)
    try {
      await impostaGiorno(giorno, 10)
      await page.goto(`/today?data=${giorno}`)
      const dm = campo(page, 'DM outbound')
      await expect(dm).toHaveValue('10')
      // a full browser navigation (a refresh that failed) loads a new document
      const navigazioni: string[] = []
      page.on('load', () => navigazioni.push(page.url()))

      // changed elsewhere; the refusal comes back, then the connection drops
      await cambiaAltrove(giorno, 40)
      let rifiuti = 0
      await page.route(
        (url) => url.pathname === '/today',
        async (route: Route) => {
          if (route.request().method() !== 'POST' || rifiuti > 0) return route.fallback()
          rifiuti++
          const risposta = await route.fetch()
          await context.setOffline(true)
          await route.fulfill({ response: risposta })
        },
      )
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(toastCambiato(page)).toBeVisible({ timeout: 20_000 })
      await expect(dm).toHaveValue('40')
      await expect(page.getByTestId('report-sospeso')).toHaveCount(0)
      await expect(page.getByTestId('stato-salvato')).toBeVisible()
      expect(navigazioni).toEqual([])
      expect((await rigaDelGiorno(giorno))?.dm_outbound).toBe(40)

      // the connection back: his next tap saves over the day it shows
      await context.setOffline(false)
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByTestId('stato-salvato')).toBeVisible({ timeout: 20_000 })
      await expect.poll(async () => (await rigaDelGiorno(giorno))?.dm_outbound).toBe(41)
    } finally {
      await context.setOffline(false)
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await ripristinaGiorno(giorno, prima)
    }
  })

  test('un giorno di due mesi fa si corregge ancora, il futuro non esiste', async ({ page }) => {
    const passato = aggiungiGiorni(oggiRoma(), -60)
    await page.goto(`/today?data=${passato}`)
    await expect(page.getByLabel('Scegli il giorno del report')).toHaveValue(passato)

    const follow = campo(page, 'Follow up')
    const prima = Number(await follow.inputValue())
    await page.getByRole('button', { name: 'Follow up: più 1' }).click()
    await attendiSalvataggio(page)
    await page.reload()
    await expect(campo(page, 'Follow up')).toHaveValue(String(prima + 1))

    // leave the seed as it was
    await page.getByRole('button', { name: 'Follow up: meno 1' }).click()
    await attendiSalvataggio(page)

    await page.goto(`/today?data=${aggiungiGiorni(oggiRoma(), 1)}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oggi')
    await expect(page.getByRole('link', { name: 'Giorno successivo' })).toHaveCount(0)
  })
})

test('l’admin non compila il report del setter', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/today')
  await expect(page).toHaveURL('/')
})
