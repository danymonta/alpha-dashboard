import { expect, test, type Browser, type Page } from '@playwright/test'

import { aggiungiGiorni, etichettaGiorno, nomeGiorno, oggiRoma } from '../lib/date'
import { formatNumero } from '../lib/format'
import { COMMENTO_OBBLIGATORIO } from '../lib/setting/commento'
import type { Database } from '../lib/supabase/database.types'
import {
  COMMENTO_DI_PROVA,
  ID_ADMIN,
  ID_SETTER,
  contaProposteDaDecidere,
  creaPropostaInstagram,
  dbLocale,
  decisionePropostaInstagram,
  pulisciProposteInstagram,
  type NumeriPropostaDiProva,
} from './db'
import { UTENTI, accedi } from './utenti'

// The admin decides the setters' days from Instagram too (Dany, 08/10/2026:
// "Anche tu, con una scheda e la notifica"): a section on top of the "Setter"
// page and a number on its item; the first decision wins, his or the setter's,
// and the setter sees on his day who decided.

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

const ZERO: NumeriPropostaDiProva = {
  dm_outbound: 0,
  dm_inbound: 0,
  follow_up: 0,
  conversazioni: 0,
  call_proposte: 0,
  discovery_prenotate: 0,
}

type Riga = Database['public']['Tables']['setter_daily_reports']['Row']

const oggi = () => oggiRoma()
const giornoFa = (n: number) => aggiungiGiorni(oggiRoma(), -n)
const LORIS = UTENTI.setter.nome.split(' ')[0]

/** "Loris Setter · ieri, martedì 07/10", as the admin's card says it. */
function titoloScheda(giorno: string) {
  const data = `${nomeGiorno(giorno)} ${giorno.slice(8, 10)}/${giorno.slice(5, 7)}`
  return `${UTENTI.setter.nome} · ${giorno === giornoFa(1) ? `ieri, ${data}` : data}`
}

const giornoMinuscolo = (giorno: string) => etichettaGiorno(giorno, oggi()).toLowerCase()

/** The seed setter's report of a day, every column. */
async function leggiRiga(giorno: string): Promise<Riga | null> {
  const { data, error } = await dbLocale()
    .from('setter_daily_reports')
    .select('*')
    .eq('setter_id', ID_SETTER)
    .eq('data', giorno)
    .maybeSingle()
  if (error) throw error
  return data
}

function numeriDi(riga: Riga | null) {
  return riga ? Object.fromEntries(CAMPI.map((c) => [c, riga[c]])) : null
}

/**
 * The day set as given: its six numbers (the row created if missing), with
 * the comment of the day (from 08/10/2026 Loris decides a day with activity
 * only with it, and these tests are about the numbers), or no report at all.
 */
async function preparaGiorno(giorno: string, numeri: NumeriPropostaDiProva | null) {
  const db = dbLocale()
  if (numeri === null) {
    const { error } = await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).eq('data', giorno)
    if (error) throw error
    return
  }
  const { error } = await db
    .from('setter_daily_reports')
    .upsert(
      { setter_id: ID_SETTER, data: giorno, created_by: ID_SETTER, ...numeri, ...COMMENTO_DI_PROVA },
      { onConflict: 'setter_id,data' },
    )
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

/** The toast (sonner's region), not the polite status with the same words. */
function toast(page: Page, testo: string) {
  return page.locator('[data-sonner-toast]').getByText(testo, { exact: true })
}

function sezione(page: Page) {
  return page.getByTestId('da-approvare')
}

function scheda(page: Page, giorno: string) {
  return page.locator(`[data-testid="proposta-instagram"][data-giorno="${giorno}"]`)
}

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Navigazione principale' })
}

/**
 * The item's name with the days to approve; Loris's "Oggi" may also say his
 * days without the comment of the day (08/10/2026), never the admin's items.
 */
function nomeDaApprovare(etichetta: string, numero: number): RegExp {
  const commenti = etichetta === 'Oggi' ? '(, \\d+ comment[oi] da scrivere)?' : ''
  return new RegExp(`^${etichetta}, ${numero} ${numero === 1 ? 'giornata' : 'giornate'} da approvare${commenti}$`)
}

async function accediIn(browser: Browser, ruolo: 'setter' | 'admin') {
  const pagina = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await accedi(pagina, ruolo)
  return pagina
}

test.describe('Tracciamento da approvare, nella pagina Setter dell’admin', () => {
  test('l’admin conferma, corregge e tiene quelli di Loris; il numero cala e Loris vede chi ha deciso', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    const conferma = giornoFa(1)
    const correzione = giornoFa(2)
    const tieni = giornoFa(3)
    const giorni = [conferma, correzione, tieni]
    const prima = await Promise.all(giorni.map(leggiRiga))
    try {
      // no report on the first day: the confirmation creates it
      await preparaGiorno(conferma, null)
      await preparaGiorno(correzione, ZERO)
      await preparaGiorno(tieni, MIEI)
      const idConferma = await creaPropostaInstagram(conferma, DA_INSTAGRAM, { chatLette: 87, chatIncerte: 3 })
      const idCorrezione = await creaPropostaInstagram(correzione, DA_INSTAGRAM)
      const idTieni = await creaPropostaInstagram(tieni, DA_INSTAGRAM)
      const riga = await leggiRiga(tieni)
      const quante = await contaProposteDaDecidere()
      expect(quante).toBeGreaterThanOrEqual(3)

      await page.setViewportSize({ width: 1440, height: 900 })
      await accedi(page, 'admin')
      await page.goto('/sales')
      // the number next to "Setter", said in words to screen readers
      const nav = sidebar(page)
      await expect(nav.getByRole('link', { name: nomeDaApprovare('Setter', quante) })).toBeVisible()
      await expect(nav.getByTestId('conteggio-da-approvare')).toHaveText(String(quante))
      await nav.getByRole('link', { name: /^Setter/ }).click()
      await expect(page).toHaveURL(/\/setting$/)

      // the section on top of the page, a card per day, the most recent first
      const blocco = sezione(page)
      await expect(blocco.getByRole('heading', { level: 2, name: `Tracciamento da approvare (${quante})` })).toBeVisible()
      const ordine = await blocco
        .getByTestId('proposta-instagram')
        .evaluateAll((el) => el.map((e) => e.getAttribute('data-giorno')))
      expect(ordine.filter((g) => giorni.includes(g ?? ''))).toEqual(giorni)

      // 1. no numbers of Loris that day: "Conferma", and his report is born with Instagram's
      const primaScheda = scheda(page, conferma)
      await expect(primaScheda.getByRole('heading', { level: 3, name: titoloScheda(conferma) })).toBeVisible()
      await expect(primaScheda).toContainText(`Calcolati dai DM dell’account per il report di ${LORIS}`)
      await expect(primaScheda.getByTestId('proposta-chat')).toHaveText('87 chat lette · 3 chat lunghe: lì qualcosa può sfuggire')
      await expect(primaScheda.locator('[data-campo="dm_outbound"] dd')).toHaveText('53')
      await expect(primaScheda.getByRole('button', { name: `Tieni quelli di ${LORIS}` })).toHaveCount(0)
      await primaScheda.getByRole('button', { name: 'Conferma', exact: true }).click()
      await expect(toast(page, `Report di ${LORIS} di ieri compilato con i numeri di Instagram`)).toBeVisible()
      await expect(primaScheda).toHaveCount(0)
      // the focus moves on to the next card
      await expect(scheda(page, correzione).getByRole('heading', { level: 3 })).toBeFocused()

      const nata = await leggiRiga(conferma)
      expect(numeriDi(nata)).toEqual(DA_INSTAGRAM)
      expect(nata?.created_by).toBe(ID_ADMIN)
      expect(await decisionePropostaInstagram(idConferma)).toEqual({ stato: 'confermata', deciso_da: ID_ADMIN })
      // the number goes down
      await expect(nav.getByRole('link', { name: nomeDaApprovare('Setter', quante - 1) })).toBeVisible()

      // 2. "Correggi": the same steppers, from Instagram's numbers
      await scheda(page, correzione).getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      await expect(
        foglio.getByRole('heading', { name: `Correggi i numeri di ${LORIS} di ${giornoMinuscolo(correzione)}` }),
      ).toBeVisible()
      await expect(foglio.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('53')
      await foglio.getByRole('button', { name: 'DM outbound: meno 1' }).click()
      await foglio.getByRole('group', { name: 'Conversazioni' }).getByRole('textbox').fill('25')
      await foglio.getByRole('button', { name: 'Conferma questi numeri' }).click()
      await expect(
        toast(page, `Report di ${LORIS} di ${giornoMinuscolo(correzione)} compilato con i numeri corretti`),
      ).toBeVisible()
      await expect(foglio).toHaveCount(0)
      await expect(scheda(page, correzione)).toHaveCount(0)
      expect(numeriDi(await leggiRiga(correzione))).toEqual({ ...DA_INSTAGRAM, dm_outbound: 52, conversazioni: 25 })
      expect(await decisionePropostaInstagram(idCorrezione)).toEqual({ stato: 'confermata', deciso_da: ID_ADMIN })

      // 3. his numbers already written: side by side, and "Tieni quelli di Loris" leaves them
      const terza = scheda(page, tieni)
      await expect(terza.locator('[data-campo="dm_outbound"] dd')).toHaveText(`${LORIS} 31 · Instagram 53`)
      await expect(terza.getByRole('button', { name: 'Usa quelli di Instagram' })).toBeVisible()
      await terza.getByRole('button', { name: `Tieni quelli di ${LORIS}` }).click()
      await expect(toast(page, `Report di ${LORIS} di ${giornoMinuscolo(tieni)}: tenuti i suoi numeri`)).toBeVisible()
      await expect(terza).toHaveCount(0)
      // the report as he wrote it, every column
      expect(await leggiRiga(tieni)).toEqual(riga)
      expect(await decisionePropostaInstagram(idTieni)).toEqual({ stato: 'scartata', deciso_da: ID_ADMIN })

      const rimaste = await contaProposteDaDecidere()
      expect(rimaste).toBe(quante - 3)
      if (rimaste === 0) {
        // the last one decided: the section says so, the number goes away
        await expect(blocco).toContainText('Niente più da approvare.')
        await expect(nav.getByRole('link', { name: /^Setter$/ })).toBeVisible()
        await expect(nav.getByTestId('conteggio-da-approvare')).toHaveCount(0)
        await page.reload()
        await expect(sezione(page)).toHaveCount(0)
      }

      // Loris, in "Oggi": who decided his days, never a card for them
      const loris = await accediIn(browser, 'setter')
      await loris.goto(`/today?data=${conferma}`)
      await expect(loris.getByTestId('proposta-decisa-da')).toHaveText(
        `${UTENTI.admin.nome} ha confermato i numeri di Instagram per questo giorno.`,
      )
      await expect(loris.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('53')
      for (const giorno of giorni) await expect(scheda(loris, giorno)).toHaveCount(0)
      // corrected in "Correggi": never "ha confermato i numeri di Instagram"
      await loris.goto(`/today?data=${correzione}`)
      await expect(loris.getByTestId('proposta-decisa-da')).toHaveText(
        `${UTENTI.admin.nome} ha corretto i numeri di Instagram per questo giorno.`,
      )
      await expect(loris.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('52')
      await loris.goto(`/today?data=${tieni}`)
      await expect(loris.getByTestId('proposta-decisa-da')).toHaveText(
        `${UTENTI.admin.nome} ha tenuto i tuoi numeri per questo giorno.`,
      )
      // never the proposal's numbers in that line
      await expect(loris.getByTestId('proposta-decisa-da')).not.toContainText('53')
      await loris.context().close()
    } finally {
      await pulisciProposteInstagram(giorni)
      for (const [i, giorno] of giorni.entries()) await ripristinaGiorno(giorno, prima[i])
    }
  })

  test('vale la prima decisione: Loris decide prima, la scheda dell’admin al tocco lo dice e se ne va', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(4)
    const prima = await leggiRiga(giorno)
    try {
      await preparaGiorno(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      const sue = await contaProposteDaDecidere(ID_SETTER)

      await page.setViewportSize({ width: 1440, height: 900 })
      await accedi(page, 'admin')
      await page.goto('/setting')
      const card = scheda(page, giorno)
      await expect(card.getByRole('button', { name: 'Usa quelli di Instagram' })).toBeVisible()

      // Loris sees his own number on "Oggi", and keeps his numbers first
      const loris = await accediIn(browser, 'setter')
      await loris.goto(`/today?data=${giorno}`)
      const navLoris = sidebar(loris)
      await expect(navLoris.getByRole('link', { name: nomeDaApprovare('Oggi', sue) })).toBeVisible()
      await scheda(loris, giorno).getByRole('button', { name: 'Tieni i miei' }).click()
      await expect(toast(loris, `Report di ${giornoMinuscolo(giorno)}: tenuti i tuoi numeri`)).toBeVisible()
      await expect(
        navLoris.getByRole('link', { name: sue > 1 ? nomeDaApprovare('Oggi', sue - 1) : /^Oggi(, \d+ comment[oi] da scrivere)?$/ }),
      ).toBeVisible()
      // he decided it himself: no line about who decided
      await expect(loris.getByTestId('proposta-decisa-da')).toHaveCount(0)

      // the admin's card, still on screen: the tap says it is decided, and the card goes
      await card.getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      await expect(toast(page, 'Questa proposta è già stata scartata.')).toBeVisible()
      await expect(card).toHaveCount(0)
      expect(numeriDi(await leggiRiga(giorno))).toEqual(MIEI)
      expect(await decisionePropostaInstagram(id)).toEqual({ stato: 'scartata', deciso_da: ID_SETTER })
      await loris.context().close()
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristinaGiorno(giorno, prima)
    }
  })

  test('se Loris cambia i suoi numeri mentre l’admin guarda, la conferma si ferma e li mostra', async ({ page }) => {
    const giorno = giornoFa(5)
    const prima = await leggiRiga(giorno)
    try {
      await preparaGiorno(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      await accedi(page, 'admin')
      await page.goto('/setting')
      const card = scheda(page, giorno)
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText(`${LORIS} 31 · Instagram 53`)

      // Loris corrects his own day in "Oggi" meanwhile
      await preparaGiorno(giorno, { ...MIEI, dm_outbound: 40 })
      await card.getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      const cambiati = `${LORIS} ha cambiato i suoi numeri di quel giorno: ricontrollali e decidi di nuovo.`
      await expect(card.getByRole('alert')).toHaveText(cambiati)
      // the card shows his new numbers; nothing was written
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText(`${LORIS} 40 · Instagram 53`)
      expect(numeriDi(await leggiRiga(giorno))).toEqual({ ...MIEI, dm_outbound: 40 })
      expect(await decisionePropostaInstagram(id)).toEqual({ stato: 'da_confermare', deciso_da: null })

      // seen, confirmed
      await card.getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      await expect(toast(page, `Report di ${LORIS} di ${giornoMinuscolo(giorno)} compilato con i numeri di Instagram`)).toBeVisible()
      expect(numeriDi(await leggiRiga(giorno))).toEqual(DA_INSTAGRAM)
      expect(await decisionePropostaInstagram(id)).toEqual({ stato: 'confermata', deciso_da: ID_ADMIN })
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristinaGiorno(giorno, prima)
    }
  })

  test('Loris ha Oggi aperto su quel giorno mentre l’admin decide: il suo form non riscrive i numeri vecchi', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(6)
    const prima = await leggiRiga(giorno)
    try {
      await preparaGiorno(giorno, MIEI)
      const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

      // Loris opens that day first: the form holds his 31
      const loris = await accediIn(browser, 'setter')
      await loris.goto(`/today?data=${giorno}`)
      const outbound = loris.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')
      await expect(outbound).toHaveValue('31')

      // the admin, on another device, uses Instagram's numbers
      await page.setViewportSize({ width: 1440, height: 900 })
      await accedi(page, 'admin')
      await page.goto('/setting')
      await scheda(page, giorno).getByRole('button', { name: 'Usa quelli di Instagram' }).click()
      await expect(toast(page, `Report di ${LORIS} di ${giornoMinuscolo(giorno)} compilato con i numeri di Instagram`)).toBeVisible()
      expect(numeriDi(await leggiRiga(giorno))).toEqual(DA_INSTAGRAM)

      // Loris taps on the screen he still has: the save is refused, the day reloads
      await loris.getByRole('button', { name: 'Follow up: più 1' }).click()
      await expect(
        toast(loris, 'Il report di questo giorno è cambiato da un’altra parte: ricarico i numeri salvati. Rifai l’ultima modifica, se serve.'),
      ).toBeVisible()
      await expect(outbound).toHaveValue('53')
      await expect(loris.getByRole('group', { name: 'Follow up' }).getByRole('textbox')).toHaveValue('16')
      await expect(loris.getByTestId('proposta-decisa-da')).toHaveText(
        `${UTENTI.admin.nome} ha confermato i numeri di Instagram per questo giorno.`,
      )
      // the admin's decision is still in the report, and still his
      const dopo = await leggiRiga(giorno)
      expect(numeriDi(dopo)).toEqual(DA_INSTAGRAM)
      expect(dopo?.created_by).toBe(ID_SETTER)
      expect(await decisionePropostaInstagram(id)).toEqual({ stato: 'confermata', deciso_da: ID_ADMIN })

      // from the reloaded day his taps save as always
      await loris.getByRole('button', { name: 'Follow up: più 1' }).click()
      await expect(loris.getByTestId('stato-salvato')).toBeVisible()
      await expect.poll(async () => (await leggiRiga(giorno))?.follow_up).toBe(17)
      expect((await leggiRiga(giorno))?.created_by).toBe(ID_SETTER)

      // changed again elsewhere (the admin's sheet in "Setter"): back to the app, the day is read again
      const { error } = await dbLocale()
        .from('setter_daily_reports')
        .update({ dm_outbound: 70 })
        .eq('setter_id', ID_SETTER)
        .eq('data', giorno)
      if (error) throw error
      await loris.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await expect(outbound).toHaveValue('70')
      await expect(loris.getByRole('group', { name: 'Follow up' }).getByRole('textbox')).toHaveValue('17')
      await loris.context().close()
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristinaGiorno(giorno, prima)
    }
  })

  test('a 768 px e con un nome lungo: le schede in una colonna, niente esce dalle righe né dai bottoni', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const giorno = giornoFa(1)
    const vecchio = giornoFa(4)
    const prima = await Promise.all([leggiRiga(giorno), leggiRiga(vecchio)])
    try {
      await preparaGiorno(giorno, MIEI)
      await preparaGiorno(vecchio, null)
      await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      await creaPropostaInstagram(vecchio, DA_INSTAGRAM)

      await accedi(page, 'admin')
      /** Nothing of a card spills out: no label over the numbers, no word out of a button. */
      const nienteFuori = () =>
        sezione(page).evaluate((el) =>
          [...el.querySelectorAll('[data-testid="proposta-instagram"] :is(dt, dd, button)')]
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => e.textContent),
        )

      for (const larghezza of [768, 900, 1024, 1280, 1440]) {
        await page.setViewportSize({ width: larghezza, height: 1000 })
        await page.goto('/setting')
        await expect(scheda(page, giorno)).toBeVisible()
        expect(await nienteFuori(), `a ${larghezza} px`).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(larghezza)
        // two columns only where each card keeps its room
        const larghezze = await sezione(page)
          .getByTestId('proposta-instagram')
          .evaluateAll((el) => el.map((e) => e.getBoundingClientRect().width))
        for (const w of larghezze) expect(w, `a ${larghezza} px`).toBeGreaterThanOrEqual(400)
      }

      // a longer first name on the phone: it goes on two lines, inside its button and its row
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/setting')
      await expect(scheda(page, giorno)).toBeVisible()
      await sezione(page).evaluate((el, nome) => {
        for (const e of el.querySelectorAll('[data-testid="proposta-instagram"] :is(dd span, button)')) {
          for (const nodo of e.childNodes) {
            if (nodo.nodeType === Node.TEXT_NODE && nodo.textContent?.includes(nome)) {
              nodo.textContent = nodo.textContent.replace(nome, 'Massimiliano')
            }
          }
        }
      }, LORIS)
      await expect(scheda(page, giorno).getByRole('button', { name: 'Tieni quelli di Massimiliano' })).toBeVisible()
      expect(await nienteFuori()).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      const tieni = await scheda(page, giorno).getByRole('button', { name: 'Tieni quelli di Massimiliano' }).boundingBox()
      expect(tieni?.height).toBeGreaterThanOrEqual(44)
    } finally {
      await pulisciProposteInstagram([giorno, vecchio])
      await ripristinaGiorno(giorno, prima[0])
      await ripristinaGiorno(vecchio, prima[1])
    }
  })

  test('il closer e il coach non vedono niente: né il numero né le giornate', async ({ page, browser }) => {
    const giorno = giornoFa(1)
    try {
      await creaPropostaInstagram(giorno, DA_INSTAGRAM)
      for (const ruolo of ['closer', 'coach'] as const) {
        const pagina = ruolo === 'closer' ? page : await (await browser.newContext()).newPage()
        await accedi(pagina, ruolo)
        await expect(pagina.getByTestId('conteggio-da-approvare')).toHaveCount(0)
        await expect(pagina.getByRole('link', { name: /giornat[ae] da approvare/ })).toHaveCount(0)
        // the admin's page is not theirs: they land on their own
        await pagina.goto('/setting')
        await expect(pagina).not.toHaveURL(/\/setting$/)
        await expect(pagina.getByTestId('da-approvare')).toHaveCount(0)
        await expect(pagina.getByText('Tracciamento da approvare')).toHaveCount(0)
        if (pagina !== page) await pagina.context().close()
      }
    } finally {
      await pulisciProposteInstagram([giorno])
    }
  })

  test('a 390 px: il numero su «Altro» e su «Oggi», la sezione e il foglio senza scroll di lato', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000)
    const giorno = giornoFa(1)
    const prima = await leggiRiga(giorno)
    try {
      await preparaGiorno(giorno, { ...MIEI, dm_outbound: 1234 })
      await creaPropostaInstagram(giorno, { ...DA_INSTAGRAM, dm_outbound: 9999 }, { chatLette: 120, chatIncerte: 1 })
      const quante = await contaProposteDaDecidere()

      await page.setViewportSize({ width: 390, height: 844 })
      await accedi(page, 'admin')
      await page.goto('/sales')
      const barra = page.getByRole('navigation', { name: 'Navigazione' })
      // "Setter" sits in "Altro": the button carries the number (with the outcomes to record, if any)
      const altro = barra.getByRole('button', {
        name: new RegExp(`^Altro, (\\d+ esit[io] da registrare, )?${quante} giornat[ae] da approvare$`),
      })
      await expect(altro).toBeVisible()
      await altro.click()
      const foglioAltro = page.getByRole('dialog', { name: 'Altro' })
      await foglioAltro.getByRole('link', { name: nomeDaApprovare('Setter', quante) }).click()
      await expect(page).toHaveURL(/\/setting$/)

      const card = scheda(page, giorno)
      await expect(card.getByRole('heading', { name: titoloScheda(giorno) })).toBeVisible()
      await expect(card.locator('[data-campo="dm_outbound"] dd')).toHaveText(
        `${LORIS} ${formatNumero(1234)} · Instagram ${formatNumero(9999)}`,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      for (const nome of ['Usa quelli di Instagram', `Tieni quelli di ${LORIS}`, 'Correggi']) {
        const box = await card.getByRole('button', { name: nome }).boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(44)
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
      }
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: '.shots/admin-setter-da-approvare-390.png', fullPage: true })

      await card.getByRole('button', { name: 'Correggi' }).click()
      const foglio = page.getByRole('dialog')
      await expect(foglio.getByText(`Instagram ${formatNumero(9999)} · ${LORIS} ${formatNumero(1234)}`)).toBeVisible()
      const invia = foglio.getByRole('button', { name: 'Conferma questi numeri' })
      await invia.scrollIntoViewIfNeeded()
      await expect(invia).toBeInViewport()
      expect((await invia.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      expect(await foglio.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

      // Loris on his phone: the number on "Oggi", in the bar
      const loris = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
      await accedi(loris, 'setter')
      const sue = await contaProposteDaDecidere(ID_SETTER)
      await expect(
        loris.getByRole('navigation', { name: 'Navigazione' }).getByRole('link', { name: nomeDaApprovare('Oggi', sue) }),
      ).toBeVisible()
      expect(await loris.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await loris.context().close()
    } finally {
      await pulisciProposteInstagram([giorno])
      await ripristinaGiorno(giorno, prima)
    }
  })
})

// The comment of the day is the setter's (08/10/2026): the admin decides his
// days without it and never writes it; the setter finds it still to write.
// No number, no sign of it on the admin's pages (CLAUDE.md section 17).
test('l’admin conferma senza commento, Loris lo ritrova da scrivere; all’admin nessun numero né segno', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  const giorno = oggi()
  const prima = await leggiRiga(giorno)
  try {
    // no report of Loris that day: the admin's confirmation creates it, without the comment
    await preparaGiorno(giorno, null)
    const id = await creaPropostaInstagram(giorno, DA_INSTAGRAM)

    await page.setViewportSize({ width: 1440, height: 900 })
    await accedi(page, 'admin')
    await page.goto('/setting')
    const card = scheda(page, giorno)
    await expect(card).toBeVisible()
    // the admin's card never says whether the comment is there
    await expect(card).not.toContainText(COMMENTO_OBBLIGATORIO.manca)
    await card.getByRole('button', { name: 'Conferma', exact: true }).click()
    await expect(toast(page, `Report di ${LORIS} di oggi compilato con i numeri di Instagram`)).toBeVisible()
    // never a step of the comment for him
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const nata = await leggiRiga(giorno)
    expect(numeriDi(nata)).toEqual(DA_INSTAGRAM)
    expect(nata).toMatchObject({ lead_in_target: null, qualita_conversazioni: null, cosa_frenava: null })
    expect(await decisionePropostaInstagram(id)).toEqual({ stato: 'confermata', deciso_da: ID_ADMIN })

    // nothing on the admin's side: no number, no reminder, on any of his items
    const nav = sidebar(page)
    await expect(nav.getByTestId('conteggio-commenti')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /comment[oi] da scrivere/ })).toHaveCount(0)
    await expect(page.getByText(COMMENTO_OBBLIGATORIO.manca)).toHaveCount(0)
    await expect(page.getByText(COMMENTO_OBBLIGATORIO.giorni)).toHaveCount(0)

    // Loris, in "Oggi": his day has Instagram's numbers and still asks for the comment
    const loris = await accediIn(browser, 'setter')
    await loris.goto('/today')
    await expect(loris.getByTestId('proposta-decisa-da')).toHaveText(
      `${UTENTI.admin.nome} ha confermato i numeri di Instagram per questo giorno.`,
    )
    await expect(loris.getByRole('group', { name: 'DM outbound' }).getByRole('textbox')).toHaveValue('53')
    await expect(loris.getByTestId('da-completare-giorno')).toContainText(COMMENTO_OBBLIGATORIO.manca)
    await expect(sidebar(loris).getByRole('link', { name: /^Oggi, (\d+ giornat[ae] da approvare, )?\d+ comment[oi] da scrivere$/ })).toBeVisible()
    await loris.context().close()
  } finally {
    await pulisciProposteInstagram([giorno])
    await ripristinaGiorno(giorno, prima)
  }
})
