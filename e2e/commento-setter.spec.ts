import { expect, test, type Page } from '@playwright/test'

import { COMMENTO, SCALA_IN_TARGET, SCALA_QUALITA, SCALE_COMMENTO, TESTI_COMMENTO } from '../lib/setting/commento'
import { ID_ADMIN, ID_CLOSER, ID_SETTER, dbLocale } from './db'
import { accedi } from './utenti'

// Days far from every period the other tests look at
const GIORNO_SETTER = '2020-02-10'
const GIORNO_ADMIN = '2020-02-11'
const GIORNO_VECCHIO = '2020-02-13'
const MESE = '2020-02'
const LEAD = 'E2E Marketing'
const COSA_FRENAVA = TESTI_COMMENTO[0].domanda

async function pulisci() {
  const db = dbLocale()
  await db.from('setter_daily_reports').delete().eq('setter_id', ID_SETTER).in('data', [GIORNO_SETTER, GIORNO_ADMIN, GIORNO_VECCHIO])
  await db.from('setter_daily_reports').delete().eq('setter_id', ID_ADMIN).in('data', [GIORNO_SETTER, GIORNO_ADMIN])
  await db.from('leads').delete().like('nome', `${LEAD}%`)
}

test.beforeEach(pulisci)
test.afterAll(pulisci)

async function riga(setterId: string, data: string) {
  const { data: r, error } = await dbLocale()
    .from('setter_daily_reports')
    .select('dm_outbound, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, note')
    .eq('setter_id', setterId)
    .eq('data', data)
    .maybeSingle()
  if (error) throw error
  return r
}

function scala(page: Page, domanda: string) {
  return page.getByRole('radiogroup', { name: domanda })
}

test('il setter: con i numeri il giorno è «Da completare», due tocchi lo completano e tutto resta dopo il ricaricamento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'setter')
  await page.goto(`/today?data=${GIORNO_SETTER}`)

  const nelGiorno = page.getByTestId('da-completare-giorno')
  const nellaSezione = page.getByTestId('da-completare-sezione')
  // a day without DM or conversations asks for nothing
  await expect(page.getByTestId('commento-giornata')).toBeVisible()
  await expect(nelGiorno).toHaveCount(0)
  await expect(nellaSezione).toHaveCount(0)

  // with the volumes: right under the conversations, before the calls
  const conversazioni = page.getByRole('region', { name: 'Conversazioni' })
  await expect(conversazioni.getByTestId('commento-giornata')).toBeVisible()
  const commento = (await page.getByTestId('commento-giornata').boundingBox())!
  const call = (await page.getByRole('region', { name: 'Call', exact: true }).boundingBox())!
  expect(commento.y).toBeLessThan(call.y)

  // numbers first: the report saves, and the day asks for the two scales
  await page.getByRole('button', { name: 'DM outbound: più 5' }).click()
  await expect(nelGiorno).toBeVisible()
  await expect(nellaSezione).toBeVisible()
  await expect(page.getByTestId('stato-salvato')).toBeVisible()
  await expect.poll(async () => (await riga(ID_SETTER, GIORNO_SETTER))?.dm_outbound).toBe(5)

  // the reminder in the sticky bar says what is missing and leads to the questions, from wherever he is
  await expect(nelGiorno).toHaveAttribute('href', '#commento-giornata')
  await expect(nelGiorno).toHaveAccessibleDescription(COMMENTO.daCompletareSpiegazione)
  expect((await nelGiorno.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.getByRole('region', { name: 'Call', exact: true }).scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await nelGiorno.click()
  await expect(page).toHaveURL(/#commento-giornata$/)
  const domanda = page.getByText(SCALA_IN_TARGET.domanda, { exact: true })
  await expect(domanda).toBeInViewport()
  // clear of the two sticky bars (top bar 65px, save state 44px)
  expect((await page.getByTestId('commento-giornata').boundingBox())!.y).toBeGreaterThanOrEqual(65 + 44)

  // every option says what it means, on screen and to a screen reader, and fits the phone
  const target = scala(page, SCALA_IN_TARGET.domanda)
  const qualita = scala(page, SCALA_QUALITA.domanda)
  await expect(page.getByText(SCALA_IN_TARGET.spiegazione!, { exact: true })).toBeVisible()
  for (const [gruppo, s] of [
    [target, SCALA_IN_TARGET],
    [qualita, SCALA_QUALITA],
  ] as const) {
    await expect(gruppo.getByRole('radio')).toHaveCount(3)
    for (const o of s.opzioni) {
      const opzione = gruppo.getByRole('radio', { name: o.etichetta, exact: true })
      await expect(opzione).toContainText(o.definizione)
      await expect(opzione).toHaveAccessibleDescription(o.definizione)
      await expect(opzione).toHaveAttribute('aria-checked', 'false')
      expect((await opzione.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  // one scale is not enough
  await target.getByRole('radio', { name: 'Circa metà' }).click()
  await expect(target.getByRole('radio', { name: 'Circa metà' })).toHaveAttribute('aria-checked', 'true')
  await expect(nelGiorno).toBeVisible()
  // both: done
  await qualita.getByRole('radio', { name: 'Medie' }).click()
  await expect(nelGiorno).toHaveCount(0)
  await expect(nellaSezione).toHaveCount(0)
  // a tap on the chosen one clears it, and the reminder is back
  await qualita.getByRole('radio', { name: 'Medie' }).click()
  await expect(qualita.getByRole('radio', { name: 'Medie' })).toHaveAttribute('aria-checked', 'false')
  await expect(nelGiorno).toBeVisible()
  await qualita.getByRole('radio', { name: 'Scarse' }).click()
  await expect(nelGiorno).toHaveCount(0)

  // the texts, saved like the numbers, each with its example
  await expect(page.getByLabel(COSA_FRENAVA)).toHaveAttribute('placeholder', /sono solo curioso/)
  await expect(page.getByLabel('Altro da segnalare?')).toHaveAttribute('placeholder', 'Quello che non sta nelle domande sopra')
  await page.getByLabel(COSA_FRENAVA).fill('Sono solo curiosi, ci devono pensare')
  await page.getByLabel(/Cosa chiedevano i lead/).fill('Chiedono se serve la palestra')
  await page.getByLabel(/Cosa chiedevano i lead/).press('Tab')
  await expect
    .poll(async () => riga(ID_SETTER, GIORNO_SETTER))
    .toMatchObject({
      dm_outbound: 5,
      lead_in_target: 'circa_meta',
      qualita_conversazioni: 'scarse',
      cosa_frenava: 'Sono solo curiosi, ci devono pensare',
      domande_contenuti: 'Chiedono se serve la palestra',
    })
  await expect(page.getByTestId('stato-salvato')).toBeVisible()

  await page.reload()
  await expect(scala(page, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Circa metà' })).toHaveAttribute('aria-checked', 'true')
  await expect(scala(page, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Scarse' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByLabel(COSA_FRENAVA)).toHaveValue('Sono solo curiosi, ci devono pensare')
  await expect(page.getByLabel(/Cosa chiedevano i lead/)).toHaveValue('Chiedono se serve la palestra')
  await expect(page.getByTestId('da-completare-giorno')).toHaveCount(0)
})

test('un giorno compilato prima che le domande esistessero non è «Da completare»', async ({ page }) => {
  const { error } = await dbLocale().from('setter_daily_reports').insert({
    setter_id: ID_SETTER,
    data: GIORNO_VECCHIO,
    dm_outbound: 7,
    conversazioni: 2,
    created_by: ID_SETTER,
    created_at: '2026-09-20T10:00:00Z',
  })
  if (error) throw error
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'setter')
  await page.goto(`/today?data=${GIORNO_VECCHIO}`)
  await expect(page.getByTestId('commento-giornata')).toBeVisible()
  await expect(page.getByTestId('stato-salvato')).toBeVisible()
  // he can still answer; nothing asks him to
  await expect(page.getByTestId('da-completare-giorno')).toHaveCount(0)
  await expect(page.getByTestId('da-completare-sezione')).toHaveCount(0)
})

test('l’admin legge per il marketing cosa dicono i lead: dal setting e dalle call del periodo', async ({ page }) => {
  const db = dbLocale()
  const { error } = await db.from('setter_daily_reports').insert({
    setter_id: ID_SETTER,
    data: GIORNO_SETTER,
    dm_outbound: 12,
    conversazioni: 4,
    lead_in_target: 'pochi',
    qualita_conversazioni: 'buone',
    cosa_frenava: 'Non ho tempo per una call',
    domande_contenuti: 'Hanno scritto dopo il reel sulla pancia',
    note: 'Giornata con molte richieste',
    created_by: ID_SETTER,
  })
  if (error) throw error
  // a call the setter booked, held and lost that month, with the closer's reason
  const { data: lead, error: e1 } = await db
    .from('leads')
    .insert({ nome: `${LEAD} Persa`, setter_id: ID_SETTER, fonte: 'dm_inbound', created_by: ID_SETTER })
    .select('id')
    .single()
  if (e1) throw e1
  const { error: e2 } = await db.from('calls').insert({
    lead_id: lead.id,
    setter_id: ID_SETTER,
    closer_id: ID_CLOSER,
    tipo: 'discovery',
    programmata_il: '2020-02-12T15:00:00Z',
    stato: 'svolta',
    qualificata: true,
    esito: 'persa',
    obiezione_principale: 'Fuori budget',
    note_closer: 'Riprovare a marzo',
    // the setter's own note: his side of the call, never in "Dalle call"
    note: 'Nota del setter riservata',
    created_by: ID_SETTER,
  })
  if (e2) throw e2
  // a day with text and one answer only, and an older call with the closer's notes only
  const { error: e3 } = await db.from('setter_daily_reports').insert({
    setter_id: ID_SETTER,
    data: GIORNO_ADMIN,
    dm_inbound: 6,
    qualita_conversazioni: 'medie',
    domande_contenuti: 'Chiedono se serve la palestra',
    created_by: ID_SETTER,
  })
  if (e3) throw e3
  const { error: e4 } = await db.from('calls').insert({
    lead_id: lead.id,
    setter_id: ID_SETTER,
    closer_id: ID_CLOSER,
    tipo: 'discovery',
    programmata_il: '2020-02-05T15:00:00Z',
    stato: 'svolta',
    qualificata: false,
    esito: 'follow_up',
    note_closer: 'Solo le note, senza motivo',
    created_by: ID_SETTER,
  })
  if (e4) throw e4

  await accedi(page, 'admin')
  await page.goto(`/setting?mese=${MESE}`)
  const sezione = page.getByTestId('commenti-marketing')
  await expect(sezione.getByRole('heading', { name: 'Per il marketing: cosa dicono i lead' })).toBeVisible()

  // counted in SQL: one day at "Pochi", one at "Buone", out of one answered day each
  const target = sezione.getByTestId('conteggi-lead_in_target')
  await expect(target.getByRole('row', { name: /^Pochi/ }).getByRole('cell').first()).toHaveText('1')
  await expect(target.getByRole('row', { name: /^Quasi tutti/ }).getByRole('cell').first()).toHaveText('0')
  await expect(target).toContainText('1 giorno con una risposta')
  const qualita = sezione.getByTestId('conteggi-qualita_conversazioni')
  await expect(qualita.getByRole('row', { name: /^Buone/ }).getByRole('cell').first()).toHaveText('1')
  // each level keeps its meaning next to the count
  for (const s of SCALE_COMMENTO) {
    for (const o of s.opzioni) await expect(sezione.getByTestId(`conteggi-${s.campo}`)).toContainText(o.definizione)
  }

  const giorni = sezione.getByTestId('giorni-commentati')
  const giorno = giorni.getByRole('listitem').filter({ hasText: '10/02/2020' })
  await expect(giorno).toContainText('Loris Setter')
  await expect(giorno).toContainText('Lead in target: Pochi')
  await expect(giorno).toContainText('Qualità delle conversazioni: Buone')
  await expect(giorno).toContainText('Cosa frenava i leadNon ho tempo per una call')
  await expect(giorno).toContainText('Hanno scritto dopo il reel sulla pancia')
  await expect(giorno).toContainText('Altre noteGiornata con molte richieste')
  // never a list or a count of the days left to complete: a day shows only what was answered
  await expect(page.getByText('Da completare')).toHaveCount(0)
  const soloQualita = giorni.getByRole('listitem').filter({ hasText: '11/02/2020' })
  await expect(soloQualita).toContainText('Qualità delle conversazioni: Medie')
  await expect(soloQualita).not.toContainText('Lead in target')
  await expect(sezione.getByText(/non indicato|non scritto/)).toHaveCount(0)

  // from the calls: the closer's reason for not closing
  const call = sezione
    .getByTestId('motivi-non-chiusura')
    .getByRole('listitem')
    .filter({ hasText: `${LEAD} Persa` })
    .filter({ hasText: '12/02/2020' })
  await expect(call).toContainText('Esito: Persa')
  await expect(call).toContainText('Closer: Lorenzo Closer')
  await expect(call).toContainText('Motivo di non chiusuraFuori budget')
  await expect(call).toContainText('Note aggiuntiveRiprovare a marzo')
  const soloNote = sezione.getByTestId('motivi-non-chiusura').getByRole('listitem').filter({ hasText: '05/02/2020' })
  await expect(soloNote).toContainText('Note aggiuntiveSolo le note, senza motivo')
  await expect(soloNote).not.toContainText('Motivo di non chiusura')
  await expect(sezione.getByText('Nota del setter riservata')).toHaveCount(0)
  // shares of a column with one decimal, aligned
  await expect(target.getByRole('row', { name: /^Pochi/ }).getByRole('cell').nth(1)).toHaveText('100,0%')

  // one setter at a time, the period kept: his reports and the calls he booked
  await sezione.getByLabel('Setter').selectOption({ label: 'Dany Montagnolo' })
  await expect(page).toHaveURL(new RegExp(`mese=${MESE}.*setter=${ID_ADMIN}`))
  await expect(sezione.getByText('Nessun commento dei setter nel periodo')).toBeVisible()
  await expect(sezione.getByText('Nessun motivo di non chiusura nel periodo')).toBeVisible()
  await sezione.getByLabel('Setter').selectOption({ label: 'Loris Setter' })
  await expect(sezione.getByTestId('giorni-commentati')).toContainText('Non ho tempo per una call')
  await expect(sezione.getByTestId('motivi-non-chiusura')).toContainText('Fuori budget')
})

test('l’admin scrive le risposte con la giornata e le corregge, senza «Da completare»', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/setting?mese=${MESE}`)
  await page.getByTestId('aggiungi-giornata').click()
  const foglio = page.getByRole('dialog')
  // exact: «Pochi» and «Cosa chiedevano» contain «chi» too
  await foglio.getByLabel('Chi', { exact: true }).selectOption({ label: 'Loris Setter' })
  await foglio.getByLabel('Giorno', { exact: true }).fill(GIORNO_ADMIN)
  await foglio.getByLabel('DM outbound', { exact: true }).fill('9')
  // nothing is required from the admin
  await expect(foglio.getByTestId('commento-giornata')).toBeVisible()
  await expect(foglio.getByText('Da completare')).toHaveCount(0)
  await scala(page, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' }).click()
  await foglio.getByLabel(COSA_FRENAVA).fill('Mi alleno già in palestra')
  await foglio.getByRole('button', { name: 'Salva la giornata' }).click()
  await expect(page.getByText('Giornata aggiunta')).toBeVisible()
  expect(await riga(ID_SETTER, GIORNO_ADMIN)).toMatchObject({
    dm_outbound: 9,
    lead_in_target: 'quasi_tutti',
    qualita_conversazioni: null,
    cosa_frenava: 'Mi alleno già in palestra',
  })

  // the correction sheet opens on the saved answers
  await page.reload()
  await page.getByRole('button', { name: 'Correggi il report di Loris Setter del 11/02/2020' }).filter({ visible: true }).click()
  const correzione = page.getByRole('dialog')
  await expect(scala(page, SCALA_IN_TARGET.domanda).getByRole('radio', { name: 'Quasi tutti' })).toHaveAttribute('aria-checked', 'true')
  await scala(page, SCALA_QUALITA.domanda).getByRole('radio', { name: 'Medie' }).click()
  await correzione.getByLabel(COSA_FRENAVA).fill('')
  await correzione.getByRole('button', { name: 'Salva la correzione' }).click()
  await expect(page.getByText('Report corretto')).toBeVisible()
  expect(await riga(ID_SETTER, GIORNO_ADMIN)).toMatchObject({
    lead_in_target: 'quasi_tutti',
    qualita_conversazioni: 'medie',
    cosa_frenava: null,
  })
})

for (const ruolo of ['closer', 'coach'] as const) {
  test(`${ruolo}: la sezione per il marketing non si raggiunge`, async ({ page }) => {
    await dbLocale().from('setter_daily_reports').insert({
      setter_id: ID_SETTER,
      data: GIORNO_SETTER,
      dm_outbound: 3,
      cosa_frenava: 'Obiezione riservata',
      created_by: ID_SETTER,
    })
    await accedi(page, ruolo)
    await page.goto(`/setting?mese=${MESE}`)
    await expect(page).not.toHaveURL(/\/setting\?mese=/)
    await expect(page.getByTestId('commenti-marketing')).toHaveCount(0)
    await expect(page.getByText('Obiezione riservata')).toHaveCount(0)
  })
}
