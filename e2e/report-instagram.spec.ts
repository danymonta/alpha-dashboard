import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, etichettaGiorno, oggiRoma } from '../lib/date'
import { formatNumero } from '../lib/format'
import type { Database } from '../lib/supabase/database.types'
import { COMMENTO_OBBLIGATORIO, COMMENTO_OBBLIGATORIO_DAL, SCALA_IN_TARGET, SCALA_QUALITA, TESTI_COMMENTO } from '../lib/setting/commento'
import {
  COMMENTO_DI_PROVA,
  ID_ADMIN,
  ID_SETTER,
  creaPropostaInstagram,
  dbLocale,
  pulisciProposteInstagram,
  ricalcolaPropostaInstagram,
  statoPropostaInstagram,
  type NumeriPropostaDiProva,
} from './db'
import { PAGINE, UTENTI, accedi } from './utenti'

// The setter's report proposed from the Instagram DMs (08/10/2026): a card in
// "Oggi" for each day still to decide. The admin decides them too, from the
// "Setter" page (e2e/approva-admin.spec.ts).

const CAMPI = ['dm_outbound', 'dm_inbound', 'follow_up', 'conversazioni', 'call_proposte', 'discovery_prenotate'] as const

// invented numbers, far from the seed's, so a wrong copy shows
const DA_INSTAGRAM: NumeriPropostaDiProva = {
  dm_outbound: 53,
  dm_inbound: 4,
  follow_up: 16,
  conversazioni: 21,
  call_proposte: 4,
  discovery_prenotate: 2,
}

const MIEI: NumeriPropostaDiProva = {
  dm_outbound: 31,
  dm_inbound: 7,
  follow_up: 9,
  conversazioni: 12,
  call_proposte: 3,
  discovery_prenotate: 1,
}

const oggi = () => oggiRoma()
const giornoFa = (n: number) => aggiungiGiorni(oggiRoma(), -n)

type RigaReport = NumeriPropostaDiProva & {
  id: string
  contenuto_pubblicato: boolean
  cosa_frenava: string | null
  domande_contenuti: string | null
  note: string | null
  lead_in_target: Database['public']['Enums']['quota_in_target'] | null
  qualita_conversazioni: Database['public']['Enums']['qualita_conversazioni'] | null
}

async function leggiReport(giorno: string): Promise<RigaReport | null> {
  const { data, error } = await dbLocale()
    .from('setter_daily_reports')
    .select(
      `id, ${CAMPI.join(', ')}, contenuto_pubblicato, cosa_frenava, domande_contenuti, note, lead_in_target, qualita_conversazioni`,
    )
    .eq('setter_id', ID_SETTER)
    .eq('data', giorno)
    .maybeSingle()
    .overrideTypes<RigaReport | null, { merge: false }>()
  if (error) throw error
  return data
}

type Commento = Pick<RigaReport, 'lead_in_target' | 'qualita_conversazioni' | 'cosa_frenava'>

const SENZA_COMMENTO: Commento = { lead_in_target: null, qualita_conversazioni: null, cosa_frenava: null }

/**
 * The six numbers of the seed setter's day set as given (the row created if
 * missing), with the comment of the day: from 08/10/2026 he decides a day
 * with activity only with it, and these tests are about the numbers.
 */
async function scriviNumeri(giorno: string, numeri: NumeriPropostaDiProva, commento: Commento = COMMENTO_DI_PROVA) {
  const { error } = await dbLocale()
    .from('setter_daily_reports')
    .upsert({ setter_id: ID_SETTER, data: giorno, created_by: ID_SETTER, ...numeri, ...commento }, { onConflict: 'setter_id,data' })
  if (error) throw error
}

/** The day as it was before the test: its numbers (and what the form tests touch) back, or no row at all. */
async function ripristina(giorno: string, prima: RigaReport | null) {
  const db = dbLocale()
  if (prima) {
    // the proposals only ever write the six numbers; the form tests a note and the switch
    const numeri = Object.fromEntries(CAMPI.map((c) => [c, prima[c]])) as NumeriPropostaDiProva
    const { error } = await db
      .from('setter_daily_reports')
      .update({
        ...numeri,
        note: prima.note,
        contenuto_pubblicato: prima.contenuto_pubblicato,
        // the comment written for the test, or by the step of the card
        lead_in_target: prima.lead_in_target,
        qualita_conversazioni: prima.qualita_conversazioni,
        cosa_frenava: prima.cosa_frenava,
      })
      .eq('id', prima.id)
    if (error) throw error
  } else {
    const { error } = await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).eq('data', giorno)
    if (error) throw error
  }
}

const ZERO: NumeriPropostaDiProva = {
  dm_outbound: 0,
  dm_inbound: 0,
  follow_up: 0,
  conversazioni: 0,
  call_proposte: 0,
  discovery_prenotate: 0,
}

/** The toast (sonner's region), not the polite status with the same words. */
function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

function scheda(page: Page, giorno: string) {
  return page.locator(`[data-testid="proposta-instagram"][data-giorno="${giorno}"]`)
}

/**
 * The form's and the cards' server actions (POST to /today), as a slow phone
 * network sees them: each waits `ms` before going, or fails while `offline`.
 */
async function reteLenta(page: Page, { ms = 0 }: { ms?: number } = {}) {
  const rete = { offline: false }
  await page.route(
    (url) => url.pathname === '/today',
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      if (rete.offline) return route.abort('internetdisconnected')
      if (ms > 0) await new Promise((r) => setTimeout(r, ms))
      return route.fallback()
    },
  )
  return rete
}

function campoNumero(page: Page, etichetta: string) {
  return page.getByTestId('report-campi').getByRole('group', { name: etichetta }).getByRole('textbox')
}

function numeriDi(riga: RigaReport | null) {
  return riga ? Object.fromEntries(CAMPI.map((c) => [c, riga[c]])) : null
}

/** The answers of "Com’è andata la giornata": never touched by a proposal. */
function domandeDi(riga: RigaReport | null) {
  return {
    lead_in_target: riga?.lead_in_target ?? null,
    qualita_conversazioni: riga?.qualita_conversazioni ?? null,
    cosa_frenava: riga?.cosa_frenava ?? null,
    domande_contenuti: riga?.domande_contenuti ?? null,
    note: riga?.note ?? null,
  }
}

test.describe('Il report da Instagram, nella giornata del setter', () => {
  test('Conferma copia i numeri nel report di ieri, le domande della giornata restano', async ({ page }) => {
    const giorno = giornoFa(1)
    const prima = await leggiReport(giorno)
    try {
      // a day without his numbers: the plain card
      await scriviNumeri(giorno, ZERO)
      const domandePrima = domandeDi(await leggiReport(giorno))
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM, { chatLette: 87, chatIncerte: 3 })

      await accedi(page, 'setter')
      await page.goto('/today')
      const card = scheda(page, giorno)
      await expect(card.getByRole('heading', { name: 'Da Instagram · ieri' })).toBeVisible()
      await expect(card).toContainText(
        'Calcolati dai DM dell’account: controlla e conferma. Le domande della giornata restano tue.',
      )
      await expect(card.getByTestId('proposta-chat')).toHaveText('87 chat lette · 3 chat lunghe: lì qualcosa può sfuggire')
      // the six numbers with the words of the form, in its order
      const etichette = await card.locator('dt').allInnerTexts()
      expect(etichette).toEqual([
        'DM outbound',
        'DM inbound',
        'Follow up',
        'Conversazioni',
        'Call proposte',
        'Discovery prenotate',
      ])
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText('53')
      await expect(card.getByRole('button', { name: 'Tieni i miei' })).toHaveCount(0)

      await card.getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(toast(page, 'Report di ieri compilato con i numeri di Instagram')).toBeVisible()
      await expect(card).toHaveCount(0)
      // the last card gone: the focus on the page title, and a status says what happened
      await expect(page.locator('#titolo-giorno')).toBeFocused()
      await expect(page.getByTestId('annuncio-proposte')).toHaveText('Report di ieri compilato con i numeri di Instagram')

      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual(DA_INSTAGRAM)
      // the questions of the day are his: untouched
      expect(domandeDi(dopo)).toEqual(domandePrima)
      expect(await statoPropostaInstagram(id)).toBe('confermata')

      // the day's report shows them, and the card does not come back
      await page.goto(`/today?data=${giorno}`)
      await expect(page.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('53')
      await expect(page.getByRole('group', { name: 'Follow up' }).getByRole('textbox')).toHaveValue('16')
      await expect(page.getByTestId('proposta-instagram')).toHaveCount(0)
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('Correggi apre i numeri da cambiare, e il report prende quelli corretti', async ({ page }) => {
    const giorno = giornoFa(5)
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, ZERO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      const card = scheda(page, giorno)
      await expect(card.getByRole('heading', { name: `Da Instagram · ${etichettaGiorno(giorno, oggi()).toLowerCase()}` })).toBeVisible()
      await expect(card.getByTestId('proposta-chat')).toHaveText('40 chat lette')

      await card.getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      await expect(foglio.getByRole('heading', { name: `Correggi i numeri di ${etichettaGiorno(giorno, oggi()).toLowerCase()}` })).toBeVisible()
      // the same steppers as "Oggi", filled with Instagram's numbers
      await expect(foglio.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('53')
      await expect(foglio.getByRole('group', { name: 'Discovery prenotate' }).getByRole('textbox')).toHaveValue('2')
      await foglio.getByRole('button', { name: 'DM outbound: meno 1' }).click()
      await foglio.getByRole('group', { name: 'Conversazioni' }).getByRole('textbox').fill('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()

      await expect(
        toast(page, `Report di ${etichettaGiorno(giorno, oggi()).toLowerCase()} compilato con i tuoi numeri`),
      ).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(card).toHaveCount(0)

      expect(numeriDi(await leggiReport(giorno))).toEqual({ ...DA_INSTAGRAM, dm_outbound: 52, conversazioni: 25 })
      expect(await statoPropostaInstagram(id)).toBe('confermata')

      // the toast opens that day, where the questions are still his to answer
      await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Apri il giorno' }).click()
      await expect(page).toHaveURL(`/today?data=${giorno}`)
      await expect(page.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('52')
      await expect(page.getByRole('group', { name: 'Conversazioni' }).getByRole('textbox')).toHaveValue('25')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('con i suoi numeri già scritti li mette accanto, e «Tieni i miei» li lascia', async ({ page }) => {
    const giorno = giornoFa(6)
    const altro = giornoFa(7)
    const prima = await leggiReport(giorno)
    const primaAltro = await leggiReport(altro)
    try {
      await scriviNumeri(giorno, MIEI)
      await scriviNumeri(altro, ZERO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      // an older day too: the cards go from the most recent
      const idAltro = await creaPropostaInstagram(altro, ZERO)

      await accedi(page, 'setter')
      await page.goto('/today')
      const card = scheda(page, giorno)
      const giorni = await page.getByTestId('proposta-instagram').evaluateAll((el) => el.map((e) => e.getAttribute('data-giorno')))
      expect(giorni).toEqual([giorno, altro])

      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText('tu 31 · Instagram 53')
      await expect(card.locator('[data-campo="discovery_prenotate"] dd')).toHaveText('tu 1 · Instagram 2')
      await expect(card.getByRole('button', { name: 'Usa quelli di Instagram' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Conferma', exact: true })).toHaveCount(0)

      await card.getByRole('button', { name: 'Tieni i miei' }).click()
      await expect(toast(page, `Report di ${etichettaGiorno(giorno, oggi()).toLowerCase()}: tenuti i tuoi numeri`)).toBeVisible()
      await expect(card).toHaveCount(0)
      // the focus moves on to the next card
      await expect(scheda(page, altro).getByRole('heading', { level: 2 })).toBeFocused()

      expect(numeriDi(await leggiReport(giorno))).toEqual(MIEI)
      expect(await statoPropostaInstagram(id)).toBe('scartata')
      expect(await statoPropostaInstagram(idAltro)).toBe('da_confermare')
    } finally {
      await pulisciProposteInstagram([giorno, altro])
      await ripristina(giorno, prima)
      await ripristina(altro, primaAltro)
    }
  })

  test('sulla rete lenta, due +1 appena toccati arrivano prima della conferma, mai dopo', async ({ page }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(2)
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${giorno}`)
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      const card = scheda(page, giorno)
      await expect(card.getByRole('button', { name: 'Usa quelli di Instagram' })).toBeVisible()

      await reteLenta(page, { ms: 1500 })
      // the first +1 saves after the debounce and stays in flight; the second waits behind it
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await page.waitForTimeout(700)
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await card.getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      // the form stops until the page reloads it with the decided numbers
      await expect(page.getByTestId('report-sospeso')).toHaveText('Aggiorno il report con la tua scelta…')
      await expect(page.getByTestId('report-campi')).toHaveAttribute('inert', '')

      const fatto = `Report di ${etichettaGiorno(giorno, oggi()).toLowerCase()} compilato con i numeri di Instagram`
      await expect(toast(page, fatto)).toBeVisible({ timeout: 20_000 })
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('53')
      await expect(page.getByTestId('report-campi')).not.toHaveAttribute('inert', '')
      // nothing of the form lands after the decision, even a moment later
      await page.waitForTimeout(2000)
      expect(numeriDi(await leggiReport(giorno))).toEqual(DA_INSTAGRAM)
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('mentre la conferma è in volo il form è fermo: un tocco sullo switch non la annulla', async ({ page }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(3)
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      const switchPrima = (await leggiReport(giorno))?.contenuto_pubblicato

      await accedi(page, 'setter')
      await page.goto(`/today?data=${giorno}`)
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      const interruttore = page.getByRole('switch', { name: /Contenuto pubblicato/ })
      await expect(interruttore).toHaveAttribute('aria-checked', String(switchPrima))

      await reteLenta(page, { ms: 1500 })
      await scheda(page, giorno).getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      await page.waitForTimeout(200)
      await expect(page.getByTestId('report-campi')).toHaveAttribute('inert', '')
      // the tap lands nowhere: the fields take nothing while the decision is on its way
      await interruttore.click({ force: true })
      await expect(interruttore).toHaveAttribute('aria-checked', String(switchPrima))

      const fatto = `Report di ${etichettaGiorno(giorno, oggi()).toLowerCase()} compilato con i numeri di Instagram`
      await expect(toast(page, fatto)).toBeVisible({ timeout: 20_000 })
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('53')
      await page.waitForTimeout(2000)
      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual(DA_INSTAGRAM)
      expect(dopo?.contenuto_pubblicato).toBe(switchPrima)
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('un salvataggio del form non riuscito: la scheda non decide, poi lo salva prima di confermare', async ({ page }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(4)
    const prima = await leggiReport(giorno)
    const nota = `Testo importante scritto offline ${Date.now()}`
    try {
      await scriviNumeri(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${giorno}`)
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      const rete = await reteLenta(page)

      // written without a connection, and left: the save fails, nothing will send it again
      rete.offline = true
      await page.getByLabel('Altro da segnalare?').fill(nota)
      await page.keyboard.press('Tab')
      await expect(page.getByText('Non salvato. Connessione assente. Riprova.', { exact: true })).toBeVisible()

      // still offline: the card does not decide over a report that is not saved
      const card = scheda(page, giorno)
      await card.getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      await expect(card.getByRole('alert')).toHaveText('Prima salva il report di quel giorno: tocca Riprova qui sotto.')
      await expect(page.getByTestId('report-campi')).not.toHaveAttribute('inert', '')
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      // back online: the note goes first, then the decision
      rete.offline = false
      await card.getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      const fatto = `Report di ${etichettaGiorno(giorno, oggi()).toLowerCase()} compilato con i numeri di Instagram`
      await expect(toast(page, fatto)).toBeVisible({ timeout: 20_000 })
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('53')
      await expect(page.getByLabel('Altro da segnalare?')).toHaveValue(nota)

      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual(DA_INSTAGRAM)
      expect(dopo?.note).toBe(nota)
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('una proposta ricalcolata dopo che la pagina l’ha letta non si conferma: prima i numeri nuovi', async ({ page }) => {
    const giorno = giornoFa(1)
    const prima = await leggiReport(giorno)
    const NUOVI: NumeriPropostaDiProva = { ...DA_INSTAGRAM, dm_outbound: 9, follow_up: 2 }
    try {
      await scriviNumeri(giorno, ZERO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      const card = scheda(page, giorno)
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText('53')

      // the admin's "Ricalcola ieri", while the card is on screen
      await ricalcolaPropostaInstagram(id, NUOVI)
      await card.getByRole('button', { name: 'Conferma', exact: true }).click()
      const cambiati = 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo.'
      await expect(card.getByRole('alert')).toHaveText(cambiati)
      await expect(toast(page, cambiati)).toBeVisible()
      // the card shows the new numbers; nothing was written
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText('9')
      expect(numeriDi(await leggiReport(giorno))).toEqual(ZERO)
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      // seen, confirmed: the report takes the numbers on the card
      await card.getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(toast(page, 'Report di ieri compilato con i numeri di Instagram')).toBeVisible()
      expect(numeriDi(await leggiReport(giorno))).toEqual(NUOVI)
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('ricalcolata col foglio Correggi aperto: i contatori prendono i numeri nuovi, le sue correzioni restano', async ({ page }) => {
    const giorno = giornoFa(1)
    const prima = await leggiReport(giorno)
    const NUOVI: NumeriPropostaDiProva = { ...DA_INSTAGRAM, dm_outbound: 9, follow_up: 2 }
    try {
      await scriviNumeri(giorno, ZERO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await scheda(page, giorno).getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      const passo = (etichetta: string) => foglio.getByRole('group', { name: etichetta }).getByRole('textbox')
      await expect(passo('DM outbound')).toHaveValue('53')
      await passo('Conversazioni').fill('25')

      // the admin's "Ricalcola ieri", while the sheet is open
      await ricalcolaPropostaInstagram(id, NUOVI)
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(foglio.getByRole('alert')).toHaveText(
        'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo.',
      )
      // the numbers he did not touch follow Instagram's new ones; his correction stays
      await expect(foglio.getByText('Instagram 9', { exact: true })).toBeVisible()
      await expect(passo('DM outbound')).toHaveValue('9')
      await expect(passo('Follow up')).toHaveValue('2')
      await expect(passo('Conversazioni')).toHaveValue('25')
      expect(numeriDi(await leggiReport(giorno))).toEqual(ZERO)
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      // seen, confirmed: Instagram's new numbers and his correction, never the old ones
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(toast(page, 'Report di ieri compilato con i tuoi numeri')).toBeVisible()
      expect(numeriDi(await leggiReport(giorno))).toEqual({ ...NUOVI, conversazioni: 25 })
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('dal foglio Correggi, un salvataggio del form non riuscito ha la frase del foglio e un nuovo tocco salva e conferma', async ({ page }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(4)
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${giorno}`)
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      const rete = await reteLenta(page)

      // a +1 without a connection: the form's save fails
      rete.offline = true
      await page.getByRole('button', { name: 'DM outbound: più 1' }).click()
      await expect(page.getByText('Non salvato. Connessione assente. Riprova.', { exact: true })).toBeVisible()

      await scheda(page, giorno).getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      const conversazioni = foglio.getByRole('group', { name: 'Conversazioni' }).getByRole('textbox')
      await conversazioni.fill('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      // the form's Riprova is behind the sheet: the sheet says what to do from here
      await expect(foglio.getByRole('alert')).toHaveText(
        'Il report di quel giorno non si è salvato: controlla la connessione e tocca di nuovo «Conferma questi numeri».',
      )
      await expect(conversazioni).toHaveValue('25')
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      // back online: the same tap saves the form first, then confirms his numbers
      rete.offline = false
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      const fatto = `Report di ${etichettaGiorno(giorno, oggi()).toLowerCase()} compilato con i tuoi numeri`
      await expect(toast(page, fatto)).toBeVisible({ timeout: 20_000 })
      expect(numeriDi(await leggiReport(giorno))).toEqual({ ...DA_INSTAGRAM, conversazioni: 25 })
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('a 390 px la scheda e il foglio stanno nello schermo, con tocchi da 44 px', async ({ page }) => {
    const giorno = giornoFa(1)
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, { ...MIEI, dm_outbound: 1234 })
      await creaPropostaInstagram(giorno, { ...DA_INSTAGRAM, dm_outbound: 9999 }, { chatLette: 120, chatIncerte: 1 })

      await page.setViewportSize({ width: 390, height: 844 })
      await accedi(page, 'setter')
      await page.goto('/today')
      const card = scheda(page, giorno)
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText(
        `tu ${formatNumero(1234)} · Instagram ${formatNumero(9999)}`,
      )
      await expect(card.getByTestId('proposta-chat')).toHaveText('120 chat lette · 1 chat lunga: lì qualcosa può sfuggire')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

      for (const nome of ['Usa quelli di Instagram', 'Tieni i miei', 'Correggi']) {
        const box = await card.getByRole('button', { name: nome }).boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(44)
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
      }

      await card.getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      await expect(foglio.getByText(`Instagram ${formatNumero(9999)} · tu ${formatNumero(1234)}`)).toBeVisible()
      const invia = foglio.getByRole('button', { name: 'Conferma questi numeri' })
      await invia.scrollIntoViewIfNeeded()
      await expect(invia).toBeInViewport()
      expect((await invia.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      expect(await foglio.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('l’admin vede la proposta solo nella pagina Setter, in «Tracciamento da approvare»', async ({ page }) => {
    test.setTimeout(300_000)
    const giorno = giornoFa(1)
    try {
      await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      await accedi(page, 'admin')
      // "Oggi" is the setter's: the admin lands on his own page
      await page.goto('/today')
      await expect(page).toHaveURL('/')

      for (const { url } of [...PAGINE.admin, { nome: 'i-miei-numeri', url: '/my-numbers' }]) {
        await page.goto(url)
        if (url === '/setting') {
          // he decides it too (08/10/2026): one card, with the setter's name
          const card = page.getByTestId('da-approvare').getByTestId('proposta-instagram')
          await expect(card, url).toHaveCount(1)
          await expect(card.getByRole('heading', { level: 3 }), url).toContainText(UTENTI.setter.nome)
          continue
        }
        await expect(page.getByTestId('proposta-instagram'), url).toHaveCount(0)
        // the card's title (the changelog may tell the admin about the card in its own words)
        await expect(page.getByRole('heading', { name: /^Da Instagram ·/ }), url).toHaveCount(0)
        await expect(page.getByText('Calcolati dai DM dell’account'), url).toHaveCount(0)
      }
    } finally {
      await pulisciProposteInstagram([giorno])
    }
  })
})

// The comment of the day required from 08/10/2026 (Dany: "che sia lui o
// Instagram poi a caricare deve lui sempre lasciare un commento della
// giornata"): on a day from then on, with activity after the decision, the
// card asks the three answers first and saves them with the decision.
test.describe('Il commento della giornata prima della decisione sulla proposta', () => {
  const PRIMA_DEL_DAL = aggiungiGiorni(COMMENTO_OBBLIGATORIO_DAL, -1)
  const COSA_FRENAVA = TESTI_COMMENTO[0].domanda

  function scalaNel(foglio: ReturnType<Page['getByRole']>, domanda: string) {
    return foglio.getByRole('radiogroup', { name: domanda })
  }

  test('Conferma chiede prima il commento: senza risposte non decide, con le tre le salva insieme ai numeri', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, ZERO, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await page.setViewportSize({ width: 390, height: 844 })
      await accedi(page, 'setter')
      // another day open below: the card goes by the report as the page read it
      await page.goto(`/today?data=${PRIMA_DEL_DAL}`)
      const card = scheda(page, giorno)
      const conferma = card.getByRole('button', { name: 'Conferma', exact: true })
      await conferma.click()

      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await expect(foglio).toBeVisible()
      await expect(foglio).toContainText(COMMENTO_OBBLIGATORIO.passo.descrizione('oggi'))
      // opened on its header: the title is in view, not scrolled away
      await expect(foglio.getByRole('heading', { name: COMMENTO_OBBLIGATORIO.passo.titolo })).toBeInViewport()
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      // a tap without the answers: each one says what is missing, nothing is decided
      const invia = foglio.getByRole('button', { name: 'Conferma', exact: true })
      await invia.click()
      await expect(foglio.getByTestId('errore-lead_in_target')).toHaveText(COMMENTO_OBBLIGATORIO.errore.lead_in_target)
      await expect(foglio.getByTestId('errore-qualita_conversazioni')).toHaveText(
        COMMENTO_OBBLIGATORIO.errore.qualita_conversazioni,
      )
      await expect(foglio.getByTestId('errore-cosa_frenava')).toHaveText(COMMENTO_OBBLIGATORIO.errore.cosa_frenava)
      // the first one missing takes the focus
      await expect(scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' })).toBeFocused()
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      expect(await foglio.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Medie' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Prima vogliono vedere altri contenuti')
      await expect(foglio.getByTestId(/^errore-/)).toHaveCount(0)
      await invia.scrollIntoViewIfNeeded()
      expect((await invia.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await invia.click()

      await expect(toast(page, 'Report di oggi compilato con i numeri di Instagram')).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(card).toHaveCount(0)
      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual(DA_INSTAGRAM)
      expect(dopo).toMatchObject({
        lead_in_target: 'quasi_tutti',
        qualita_conversazioni: 'medie',
        cosa_frenava: 'Prima vogliono vedere altri contenuti',
      })
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('«Tieni i miei» sul giorno aperto: il passo parte dalle risposte già nel form, e le salva', async ({ page }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      // one answer in the form below, a moment before the decision
      await page
        .getByTestId('report-campi')
        .getByRole('radiogroup', { name: SCALA_IN_TARGET.domanda })
        .getByRole('radio', { name: 'Pochi' })
        .click()
      const tieni = scheda(page, giorno).getByRole('button', { name: 'Tieni i miei' })
      await tieni.click()

      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await expect(scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Pochi' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      // closed: nothing decided, the focus back on the button
      await page.keyboard.press('Escape')
      await expect(foglio).toHaveCount(0)
      await expect(tieni).toBeFocused()
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      await tieni.click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Scarse' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Sono solo curiosi')
      await foglio.getByRole('button', { name: 'Tieni i miei' }).click()

      await expect(toast(page, 'Report di oggi: tenuti i tuoi numeri')).toBeVisible()
      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual(MIEI)
      expect(dopo).toMatchObject({ lead_in_target: 'pochi', qualita_conversazioni: 'scarse', cosa_frenava: 'Sono solo curiosi' })
      expect(await statoPropostaInstagram(id)).toBe('scartata')
      // the day reloads with the answers: nothing missing any more
      await expect(page.getByLabel(COSA_FRENAVA)).toHaveValue('Sono solo curiosi')
      await expect(page.getByTestId('da-completare-giorno')).toHaveCount(0)
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('Correggi: dopo i numeri il passo del commento nello stesso foglio, con la strada per tornare ai numeri', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, ZERO, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${PRIMA_DEL_DAL}`)
      await scheda(page, giorno).getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      await foglio.getByRole('group', { name: 'Conversazioni' }).getByRole('textbox').fill('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()

      // the step takes the numbers' place, and the focus
      const passo = foglio.getByTestId('passo-commento')
      await expect(passo).toBeFocused()
      await expect(foglio.getByRole('heading', { name: COMMENTO_OBBLIGATORIO.passo.titolo })).toBeVisible()
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')

      // back to the numbers: his correction and his answer are still there
      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Circa metà' }).click()
      await foglio.getByRole('button', { name: COMMENTO_OBBLIGATORIO.passo.indietro }).click()
      await expect(foglio.getByRole('group', { name: 'Conversazioni' }).getByRole('textbox')).toHaveValue('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Circa metà' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Buone' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Ci devono pensare')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()

      await expect(toast(page, 'Report di oggi compilato con i tuoi numeri')).toBeVisible()
      await expect(foglio).toHaveCount(0)
      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual({ ...DA_INSTAGRAM, conversazioni: 25 })
      expect(dopo).toMatchObject({ lead_in_target: 'circa_meta', qualita_conversazioni: 'buone', cosa_frenava: 'Ci devono pensare' })
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('con il commento già scritto non chiede niente; un giorno prima dell’08/10 nemmeno', async ({ page }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    const primaVecchio = await leggiReport(PRIMA_DEL_DAL)
    try {
      await scriviNumeri(giorno, ZERO)
      await scriviNumeri(PRIMA_DEL_DAL, ZERO, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      const idVecchio = await creaPropostaInstagram(PRIMA_DEL_DAL, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${PRIMA_DEL_DAL}`)
      await scheda(page, giorno).getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(toast(page, 'Report di oggi compilato con i numeri di Instagram')).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(await statoPropostaInstagram(id)).toBe('confermata')
      expect(await leggiReport(giorno)).toMatchObject(COMMENTO_DI_PROVA)

      await scheda(page, PRIMA_DEL_DAL).getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(
        toast(page, `Report di ${etichettaGiorno(PRIMA_DEL_DAL, oggi()).toLowerCase()} compilato con i numeri di Instagram`),
      ).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(await statoPropostaInstagram(idVecchio)).toBe('confermata')
      expect(await leggiReport(PRIMA_DEL_DAL)).toMatchObject(SENZA_COMMENTO)
    } finally {
      await pulisciProposteInstagram([giorno, PRIMA_DEL_DAL])
      await ripristina(giorno, prima)
      await ripristina(PRIMA_DEL_DAL, primaVecchio)
    }
  })
  // The step keeps the proposal as the card showed it at the tap: a proposal
  // recomputed while the step is open, with the page read again behind it, is
  // refused, never confirmed with numbers he has not seen
  const RICALCOLATI: NumeriPropostaDiProva = {
    dm_outbound: 70,
    dm_inbound: 9,
    follow_up: 30,
    conversazioni: 40,
    call_proposte: 6,
    discovery_prenotate: 3,
  }
  const CAMBIATI = 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo.'

  /** The app back in front: "Oggi" reads the page again if the proposals changed. */
  async function tornaInPrimoPiano(page: Page) {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  }

  test('Conferma: la proposta ricalcolata col passo aperto non si conferma, prima i numeri nuovi; le risposte restano', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, ZERO, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${PRIMA_DEL_DAL}`)
      const card = scheda(page, giorno)
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText('53')
      await card.getByRole('button', { name: 'Conferma', exact: true }).click()
      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await expect(foglio).toBeVisible()

      // recomputed meanwhile, and the page read again behind the step
      await ricalcolaPropostaInstagram(id, RICALCOLATI)
      await tornaInPrimoPiano(page)
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText('70')

      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Medie' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Prima vogliono vedere altri contenuti')
      await foglio.getByRole('button', { name: 'Conferma', exact: true }).click()

      // refused: the step closes on the card with the new numbers, nothing written
      await expect(toast(page, CAMBIATI)).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(card.getByRole('alert')).toHaveText(CAMBIATI)
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')
      const rifiutato = await leggiReport(giorno)
      expect(numeriDi(rifiutato)).toEqual(ZERO)
      expect(rifiutato).toMatchObject(SENZA_COMMENTO)

      // seen, confirmed: the step opens with his answers, the report takes the new numbers
      await card.getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(foglio.getByLabel(COSA_FRENAVA)).toHaveValue('Prima vogliono vedere altri contenuti')
      await foglio.getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(toast(page, 'Report di oggi compilato con i numeri di Instagram')).toBeVisible()
      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual(RICALCOLATI)
      expect(dopo).toMatchObject({
        lead_in_target: 'quasi_tutti',
        qualita_conversazioni: 'medie',
        cosa_frenava: 'Prima vogliono vedere altri contenuti',
      })
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('Correggi: ricalcolata col passo aperto, si torna ai numeri nuovi con la correzione; mai i numeri vecchi', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, ZERO, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto(`/today?data=${PRIMA_DEL_DAL}`)
      await scheda(page, giorno).getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      const contatore = (etichetta: string) => foglio.getByRole('group', { name: etichetta }).getByRole('textbox')
      await contatore('Conversazioni').fill('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(foglio.getByTestId('passo-commento')).toBeFocused()

      await ricalcolaPropostaInstagram(id, RICALCOLATI)
      await tornaInPrimoPiano(page)
      await expect(scheda(page, giorno).locator('[data-campo="dm_outbound"] dd')).toHaveText('70')

      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Circa metà' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Buone' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Ci devono pensare')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()

      // refused: back to the numbers, Instagram's new ones where he did not touch, his correction kept
      await expect(foglio.getByRole('alert')).toHaveText(CAMBIATI)
      await expect(foglio.getByTestId('passo-commento')).toHaveCount(0)
      await expect(contatore('DM outbound')).toHaveValue('70')
      await expect(contatore('Follow up')).toHaveValue('30')
      await expect(contatore('Conversazioni')).toHaveValue('25')
      expect(await statoPropostaInstagram(id)).toBe('da_confermare')
      expect(numeriDi(await leggiReport(giorno))).toEqual(ZERO)

      // seen: the step again, with his answers, then the new numbers and his correction
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(foglio.getByLabel(COSA_FRENAVA)).toHaveValue('Ci devono pensare')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(toast(page, 'Report di oggi compilato con i tuoi numeri')).toBeVisible()
      const dopo = await leggiReport(giorno)
      expect(numeriDi(dopo)).toEqual({ ...RICALCOLATI, conversazioni: 25 })
      expect(dopo).toMatchObject({ lead_in_target: 'circa_meta', qualita_conversazioni: 'buone', cosa_frenava: 'Ci devono pensare' })
      expect(await statoPropostaInstagram(id)).toBe('confermata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('il passo riaperto prende le risposte scritte dopo nel form, non quelle rimaste nel passo', async ({ page }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      const tieni = scheda(page, giorno).getByRole('button', { name: 'Tieni i miei' })
      await tieni.click()
      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Buone' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Dal passo')
      await page.keyboard.press('Escape')
      await expect(foglio).toHaveCount(0)

      // then, in the form below: another level and another text
      const campi = page.getByTestId('report-campi')
      await campi.getByRole('radiogroup', { name: SCALA_IN_TARGET.domanda }).getByRole('radio', { name: 'Pochi' }).click()
      await campi.getByLabel(COSA_FRENAVA).fill('Dal form, scritto dopo')

      // the step again: the form's answers where they changed, the step's where they did not
      await tieni.click()
      await expect(scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Pochi' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Buone' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(foglio.getByLabel(COSA_FRENAVA)).toHaveValue('Dal form, scritto dopo')
      await foglio.getByRole('button', { name: 'Tieni i miei' }).click()

      await expect(toast(page, 'Report di oggi: tenuti i tuoi numeri')).toBeVisible()
      expect(await leggiReport(giorno)).toMatchObject({
        ...MIEI,
        lead_in_target: 'pochi',
        qualita_conversazioni: 'buone',
        cosa_frenava: 'Dal form, scritto dopo',
      })
      expect(await statoPropostaInstagram(id)).toBe('scartata')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('decisa altrove mentre scrive il commento: la scheda se ne va e le sue risposte restano nel report', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      await scheda(page, giorno).getByRole('button', { name: 'Tieni i miei' }).click()
      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Pochi' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Buone' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Una frase lunga scritta con cura')

      // meanwhile the admin keeps his numbers, from the "Setter" page
      const { error } = await dbLocale()
        .from('report_proposte_instagram')
        .update({ stato: 'scartata', deciso_da: ID_ADMIN })
        .eq('id', id)
      if (error) throw error
      await foglio.getByRole('button', { name: 'Tieni i miei' }).click()

      await expect(toast(page, 'Questa proposta è già stata scartata.')).toBeVisible()
      await expect(toast(page, COMMENTO_OBBLIGATORIO.passo.salvato)).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(scheda(page, giorno)).toHaveCount(0)
      expect(await leggiReport(giorno)).toMatchObject({
        ...MIEI,
        lead_in_target: 'pochi',
        qualita_conversazioni: 'buone',
        cosa_frenava: 'Una frase lunga scritta con cura',
      })
      // the day starts again from the decided report: his answers there, nothing missing
      await expect(page.getByTestId('report-campi').getByLabel(COSA_FRENAVA)).toHaveValue(
        'Una frase lunga scritta con cura',
      )
      await expect(page.getByTestId('da-completare-giorno')).toHaveCount(0)
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  /** The admin decides the proposal from his page meanwhile (another device). */
  async function decideLAdmin(id: string, stato: 'confermata' | 'scartata') {
    const { error } = await dbLocale().from('report_proposte_instagram').update({ stato, deciso_da: ID_ADMIN }).eq('id', id)
    if (error) throw error
  }

  test('decisa altrove col passo aperto, poi l’app torna in primo piano: il passo resta, e le risposte si salvano', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      await scheda(page, giorno).getByRole('button', { name: 'Tieni i miei' }).click()
      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Pochi' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Buone' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Una frase lunga scritta con cura')

      // the admin keeps his numbers; he looks at a chat in Instagram and comes back:
      // the page reads the decided day again behind the step
      await decideLAdmin(id, 'scartata')
      await tornaInPrimoPiano(page)
      await expect(page.getByTestId('proposta-decisa-da')).toHaveText(
        `${UTENTI.admin.nome} ha tenuto i tuoi numeri per questo giorno.`,
      )

      // the step is still there, with what he wrote
      await expect(foglio).toBeVisible()
      await expect(scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Pochi' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(foglio.getByLabel(COSA_FRENAVA)).toHaveValue('Una frase lunga scritta con cura')
      await foglio.getByRole('button', { name: 'Tieni i miei' }).click()

      await expect(toast(page, 'Questa proposta è già stata scartata.')).toBeVisible()
      await expect(toast(page, COMMENTO_OBBLIGATORIO.passo.salvato)).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(scheda(page, giorno)).toHaveCount(0)
      expect(await leggiReport(giorno)).toMatchObject({
        ...MIEI,
        lead_in_target: 'pochi',
        qualita_conversazioni: 'buone',
        cosa_frenava: 'Una frase lunga scritta con cura',
      })
      // the form of that day, already read again at the foreground, reads the answers saved into it
      await expect(page.getByTestId('report-campi').getByLabel(COSA_FRENAVA)).toHaveValue(
        'Una frase lunga scritta con cura',
      )
      await expect(page.getByTestId('da-completare-giorno')).toHaveCount(0)
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('decisa altrove col passo di Correggi aperto, poi in primo piano: numeri e passo restano, le risposte si salvano', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      await scheda(page, giorno).getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      const contatore = (etichetta: string) => foglio.getByRole('group', { name: etichetta }).getByRole('textbox')
      await contatore('Conversazioni').fill('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(foglio.getByTestId('passo-commento')).toBeFocused()
      await scalaNel(foglio, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Circa metà' }).click()
      await scalaNel(foglio, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Medie' }).click()
      await foglio.getByLabel(COSA_FRENAVA).fill('Il tempo per allenarsi')

      await decideLAdmin(id, 'confermata')
      await tornaInPrimoPiano(page)
      await expect(page.getByTestId('proposta-decisa-da')).toHaveText(
        `${UTENTI.admin.nome} ha confermato i numeri di Instagram per questo giorno.`,
      )

      // back to the numbers and on again: the sheet, his correction and his answers are all still there
      await foglio.getByRole('button', { name: COMMENTO_OBBLIGATORIO.passo.indietro }).click()
      await expect(contatore('Conversazioni')).toHaveValue('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(foglio.getByLabel(COSA_FRENAVA)).toHaveValue('Il tempo per allenarsi')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()

      await expect(toast(page, 'Questa proposta è già stata confermata.')).toBeVisible()
      await expect(toast(page, COMMENTO_OBBLIGATORIO.passo.salvato)).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(scheda(page, giorno)).toHaveCount(0)
      // the decision was the admin's: his numbers stay, his answers go in
      expect(await leggiReport(giorno)).toMatchObject({
        ...MIEI,
        lead_in_target: 'circa_meta',
        qualita_conversazioni: 'medie',
        cosa_frenava: 'Il tempo per allenarsi',
      })
      await expect(page.getByTestId('report-campi').getByLabel(COSA_FRENAVA)).toHaveValue('Il tempo per allenarsi')
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })

  test('decisa altrove col passo aperto, poi chiuso senza decidere: la scheda se ne va e il focus resta sulla pagina', async ({
    page,
  }) => {
    const giorno = oggi()
    const prima = await leggiReport(giorno)
    try {
      await scriviNumeri(giorno, MIEI, SENZA_COMMENTO)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'setter')
      await page.goto('/today')
      await expect(campoNumero(page, 'DM outbound')).toHaveValue('31')
      await scheda(page, giorno).getByRole('button', { name: 'Tieni i miei' }).click()
      const foglio = page.getByRole('dialog', { name: COMMENTO_OBBLIGATORIO.passo.titolo })
      await expect(foglio).toBeVisible()

      await decideLAdmin(id, 'scartata')
      await tornaInPrimoPiano(page)
      await expect(page.getByTestId('proposta-decisa-da')).toBeVisible()
      await expect(foglio).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(foglio).toHaveCount(0)
      await expect(scheda(page, giorno)).toHaveCount(0)
      // never lost on the body with the card: on the page title
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
      // closing writes nothing
      expect(await leggiReport(giorno)).toMatchObject({ ...MIEI, ...SENZA_COMMENTO })
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristina(giorno, prima)
    }
  })
})
