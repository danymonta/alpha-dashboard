import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { dbLocale, ID_ADMIN, ID_SETTER } from './db'
import type { Database } from '../lib/supabase/database.types'
import { accedi, NOTIFICA_BACKUP_SEED, NOTIFICA_PROMEMORIA_SEED, NOTIFICA_RIEPILOGO_SEED, PASSWORD_SEED, UTENTI } from './utenti'

/**
 * The notification center (1.41.0): the bell with the red dot, the list, the
 * email as it was, read / read all / delete, and nobody reads another person's.
 * The three notifications of the admin are the seed's (55_notifiche.sql); every
 * test puts them back as they were.
 */
const HTML = '<!doctype html><html lang="it"><body><p>Settimana dal 10/10 al 16/10 di prova</p><a href="https://example.test/x">Un link</a></body></html>'

async function ripristina() {
  const db = dbLocale()
  const { error: e0 } = await db.from('notifiche').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e0) throw e0
  // the keys of the alerts are remembered apart (an alert the admin deleted is not created again): forget the tests' ones
  const { error: e1 } = await db.from('notifiche_avvisi_emessi').delete().like('chiave', 'e2e/%')
  if (e1) throw e1
  const base = { destinatario_id: ID_ADMIN, corpo_html: HTML, email_inviata: true }
  const { error } = await db.from('notifiche').insert([
    {
      ...base,
      id: NOTIFICA_RIEPILOGO_SEED,
      tipo: 'riepilogo_settimana',
      titolo: 'Riepilogo della settimana di prova',
      anteprima: 'Cash della settimana 3.200,00 €.',
      link: '/',
      chiave: 'e2e/riepilogo',
      created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
    {
      ...base,
      id: NOTIFICA_PROMEMORIA_SEED,
      tipo: 'promemoria_rinnovo',
      titolo: 'Call di rinnovo con Mario Esempio',
      anteprima: 'Il percorso finisce il 18/11/2026.',
      link: '/clients/00000000-0000-4000-8000-000000000000',
      email_inviata: false,
      chiave: 'e2e/promemoria',
      letta_il: new Date(Date.now() - 86_400_000).toISOString(),
      created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    },
    {
      ...base,
      id: NOTIFICA_BACKUP_SEED,
      tipo: 'backup',
      titolo: 'Backup settimanale di prova',
      anteprima: 'Il backup è partito per email.',
      link: '/settings/export',
      chiave: 'e2e/backup',
      letta_il: new Date(Date.now() - 86_400_000).toISOString(),
      created_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    },
  ])
  if (error) throw error
}

test.beforeEach(async () => {
  await ripristina()
})
test.afterAll(async () => {
  await ripristina()
})

// the bell is in the top bar twice (phone and desktop): the visible one
const campanella = (page: Page) => page.locator('[data-testid="campanella"]:visible')
const conteggio = (page: Page) => page.locator('[data-testid="campanella-conteggio"]:visible')

test('la campanella ha il pallino rosso col numero, e il nome lo dice', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/')
  await expect(campanella(page)).toHaveAccessibleName('Notifiche, 1 da leggere')
  await expect(conteggio(page)).toHaveText('1')
  // the dot is a sign, never the only one: the digits are hidden from screen readers
  await expect(conteggio(page)).toHaveAttribute('aria-hidden', 'true')
  const box = await campanella(page).boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
})

test('la lista: le più recenti per prime, da leggere in grassetto e con le parole, email inviata o no', async ({ page }) => {
  await accedi(page, 'admin')
  await campanella(page).click()
  await expect(page).toHaveURL(/\/notifiche$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Notifiche' })).toBeVisible()

  const righe = page.getByTestId('notifica')
  await expect(righe).toHaveCount(3)
  await expect(righe.nth(0)).toContainText('Riepilogo della settimana di prova')
  await expect(righe.nth(1)).toContainText('Call di rinnovo con Mario Esempio')
  await expect(righe.nth(2)).toContainText('Backup settimanale di prova')

  await expect(righe.nth(0)).toHaveAttribute('data-letta', 'no')
  await expect(righe.nth(0).getByTestId('da-leggere')).toHaveText('Da leggere')
  await expect(righe.nth(1)).toHaveAttribute('data-letta', 'si')
  await expect(righe.nth(1).getByTestId('da-leggere')).toHaveCount(0)
  // the email: icon and words, not colour
  await expect(righe.nth(0).getByTestId('email-inviata')).toHaveText('Email inviata')
  await expect(righe.nth(1).getByTestId('email-non-partita')).toHaveText('Email non partita')
  await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText('1 da leggere')
  // the bell is lit on its own page
  await expect(campanella(page)).toHaveAttribute('aria-current', 'page')
})

test('aprirla la segna letta: il pallino sparisce, l’email è mostrata com’era, in un riquadro senza script', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/notifiche')
  await page.getByTestId('notifica').first().getByRole('link').first().click()
  await expect(page).toHaveURL(new RegExp(`/notifiche/${NOTIFICA_RIEPILOGO_SEED}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Riepilogo della settimana di prova' })).toBeVisible()

  // the email as it was, in a sandboxed frame
  const riquadro = page.getByTestId('corpo-notifica')
  const sandbox = (await riquadro.getAttribute('sandbox')) ?? ''
  expect(sandbox).not.toContain('allow-scripts')
  expect(sandbox).not.toContain('allow-same-origin')
  await expect(page.frameLocator('[data-testid="corpo-notifica"]').getByText('Settimana dal 10/10 al 16/10 di prova')).toBeVisible()
  const documento = (await riquadro.getAttribute('srcdoc')) ?? ''
  expect(documento).toContain('<base target="_blank">')
  expect(documento).toContain("default-src 'none'")

  // the button to what it is about
  await expect(page.getByRole('link', { name: 'Apri la Panoramica' })).toBeVisible()

  // marked read: the bell loses the dot, and the list says so
  await expect(campanella(page)).toHaveAccessibleName('Notifiche')
  await expect(conteggio(page)).toHaveCount(0)
  await page.getByRole('link', { name: 'Notifiche', exact: true }).first().click()
  await expect(page.getByTestId('notifica').first()).toHaveAttribute('data-letta', 'si')
  await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText('Hai letto tutto')
})

test('una notifica senza email dice perché e porta alla scheda', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/notifiche/${NOTIFICA_PROMEMORIA_SEED}`)
  await expect(page.getByText('L’email non è partita', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Apri la scheda del cliente' })).toBeVisible()
})

test('«Segna tutte come lette» azzera il conto', async ({ page }) => {
  const db = dbLocale()
  const { error } = await db.from('notifiche').update({ letta_il: null }).eq('destinatario_id', ID_ADMIN)
  if (error) throw error
  await accedi(page, 'admin')
  await page.goto('/notifiche')
  await expect(campanella(page)).toHaveAccessibleName('Notifiche, 3 da leggere')
  await page.getByTestId('segna-tutte-lette').click()
  await expect(page.getByText('Tutte le notifiche sono segnate come lette')).toBeVisible()
  await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText('Hai letto tutto')
  await expect(page.getByTestId('segna-tutte-lette')).toBeDisabled()
  await expect(campanella(page)).toHaveAccessibleName('Notifiche')
})

test('elimina dalla riga: prima la domanda, poi sparisce', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/notifiche')
  await page.getByRole('button', { name: 'Elimina la notifica «Backup settimanale di prova»' }).click()
  await expect(page.getByRole('dialog')).toContainText('Non si può annullare')
  await expect(page.getByRole('dialog')).toContainText('resta nella tua posta')
  // nothing is deleted on the first tap
  await expect(page.getByTestId('notifica')).toHaveCount(3)
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
  await expect(page.getByText('Notifica eliminata')).toBeVisible()
  await expect(page.getByTestId('notifica')).toHaveCount(2)
})

test('elimina dal dettaglio e torna alla lista', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto(`/notifiche/${NOTIFICA_BACKUP_SEED}`)
  await page.getByRole('button', { name: 'Elimina' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
  await expect(page).toHaveURL(/\/notifiche$/)
  await expect(page.getByTestId('notifica')).toHaveCount(2)
  // and the link of the deleted one says so
  await page.goto(`/notifiche/${NOTIFICA_BACKUP_SEED}`)
  await expect(page.getByText('Questa notifica non c’è più')).toBeVisible()
})

test('dal profilo si arriva al centro notifiche, col numero', async ({ page }) => {
  await accedi(page, 'admin')
  await page.goto('/account?scheda=account')
  const voce = page.getByTestId('link-notifiche-account')
  await expect(voce).toContainText('1 da leggere')
  await voce.click()
  await expect(page).toHaveURL(/\/notifiche$/)
})

test('il setter non vede quelle dell’admin: stato vuoto, nessun pallino; e vede solo le sue', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/notifiche')
  await expect(page.getByText('Nessuna notifica')).toBeVisible()
  await expect(page.getByTestId('notifica')).toHaveCount(0)
  await expect(campanella(page)).toHaveAccessibleName('Notifiche')
  await expect(conteggio(page)).toHaveCount(0)
  // the admin's notification by its address: not found
  await page.goto(`/notifiche/${NOTIFICA_RIEPILOGO_SEED}`)
  await expect(page.getByText('Questa notifica non c’è più')).toBeVisible()

  const db = dbLocale()
  const { error } = await db.from('notifiche').insert({
    destinatario_id: ID_SETTER,
    tipo: 'backup',
    titolo: 'Solo del setter',
    corpo_html: HTML,
    chiave: 'e2e/setter',
  })
  if (error) throw error
  await page.goto('/notifiche')
  await expect(page.getByTestId('notifica')).toHaveCount(1)
  await expect(page.getByTestId('notifica')).toContainText('Solo del setter')
  await expect(campanella(page)).toHaveAccessibleName('Notifiche, 1 da leggere')
})

test('a 390 px la lista e il dettaglio non scorrono di lato e la campanella si tocca', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto('/')
  await expect(campanella(page)).toBeVisible()
  const box = await campanella(page).boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await campanella(page).click()
  await expect(page.getByTestId('notifica')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.goto(`/notifiche/${NOTIFICA_RIEPILOGO_SEED}`)
  await expect(page.getByTestId('corpo-notifica')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})


// ---------------------------------------------------------------------------
// The in-app alerts (1.42.0): they exist only in the app, no email
// ---------------------------------------------------------------------------
const AVVISI = [
  {
    tipo: 'rate_in_ritardo',
    chiave: 'e2e/avviso-rate',
    titolo: '2 rate sono andate in ritardo',
    anteprima: '800,00 € da incassare, la più vecchia scaduta il 12/10/2026.',
    dettagli: ['Mario Esempio · Rata 2 di 4 · 500,00 € · scaduta il 12/10/2026', 'Giulia Prova · Rata 1 di 3 · 300,00 € · scaduta il 17/10/2026'],
    link: '/payments?vista=ritardo',
    bottone: 'Apri Incassi',
    url: /\/payments\?vista=ritardo$/,
  },
  {
    tipo: 'chiave_in_scadenza',
    chiave: 'e2e/avviso-scade',
    titolo: 'Il token di Instagram scade il 24/10/2026: rigeneralo in Impostazioni › Chiavi e collegamenti',
    anteprima: 'Mancano 5 giorni. Dopo non si leggono più i DM, i post e l’Insight.',
    dettagli: ['Meta › Alpha DM Reader › Instagram › Genera token.'],
    link: '/settings/chiavi',
    bottone: 'Apri Chiavi e collegamenti',
    url: /\/settings\/chiavi$/,
  },
  {
    tipo: 'chiave_rifiutata',
    chiave: 'e2e/avviso-rifiutata',
    titolo: 'Fathom ha rifiutato la chiave API: generane una nuova in Impostazioni › Chiavi e collegamenti',
    anteprima: 'Le registrazioni delle call non si leggono.',
    dettagli: null,
    link: '/settings/chiavi',
    bottone: 'Apri Chiavi e collegamenti',
    url: /\/settings\/chiavi$/,
  },
  {
    tipo: 'proposta_da_approvare',
    chiave: 'e2e/avviso-proposta',
    titolo: 'Da approvare: il tracciamento di Loris di ieri, domenica 18/10',
    anteprima: 'Sono i numeri contati dai DM: confermali, correggili o tieni quelli del setter.',
    dettagli: null,
    link: '/setting#da-approvare',
    bottone: 'Apri il tracciamento da approvare',
    url: /\/setting(#da-approvare)?$/,
  },
  {
    tipo: 'spesa_claude',
    chiave: 'e2e/avviso-spesa',
    titolo: 'La spesa di Claude è all’80% del limite: le analisi dei reel',
    anteprima: '20,40 $ su 25,00 $ questo mese.',
    dettagli: ['Puoi alzare il limite del mese nelle impostazioni.'],
    link: '/settings/instagram#analisi-reel',
    bottone: 'Apri le impostazioni delle analisi',
    url: /\/settings\/instagram(#analisi-reel)?$/,
  },
] as const

async function emettiAvvisi() {
  const db = dbLocale()
  // the unread count is the alerts' alone: a request of the previous test may still be marking the recap read
  await db.from('notifiche').update({ letta_il: new Date().toISOString() }).eq('id', NOTIFICA_RIEPILOGO_SEED)
  for (const a of AVVISI) {
    const { error } = await db.rpc('notifiche_avviso', {
      p_destinatari: [ID_ADMIN],
      p_tipo: a.tipo,
      p_titolo: a.titolo,
      p_anteprima: a.anteprima,
      p_dettagli: (a.dettagli ?? null) as never,
      p_link: a.link,
      p_chiave: a.chiave,
    })
    if (error) throw error
  }
}

test.describe('gli avvisi solo nell’app', () => {
  test('la lista li mostra con «Solo nell’app», non «Email inviata», e il conto dei da leggere', async ({ page }) => {
    await emettiAvvisi()
    await accedi(page, 'admin')
    await page.goto('/notifiche')
    const righe = page.getByTestId('notifica')
    await expect(righe).toHaveCount(3 + AVVISI.length)
    await expect(page.getByTestId('solo-app')).toHaveCount(AVVISI.length)
    for (const a of AVVISI) {
      const riga = righe.filter({ hasText: a.titolo })
      await expect(riga).toHaveCount(1)
      await expect(riga.getByTestId('solo-app')).toHaveText('Solo nell’app')
      await expect(riga.getByTestId('email-inviata')).toHaveCount(0)
      await expect(riga.getByTestId('email-non-partita')).toHaveCount(0)
      await expect(riga.getByTestId('da-leggere')).toHaveText('Da leggere')
    }
    // the emails keep their words
    await expect(righe.filter({ hasText: 'Riepilogo della settimana di prova' }).getByTestId('email-inviata')).toHaveText('Email inviata')
    await expect(page.getByTestId('notifiche-riga-conteggio')).toHaveText(`${AVVISI.length} da leggere`)
    await expect(campanella(page)).toHaveAccessibleName(`Notifiche, ${AVVISI.length} da leggere`)
    // each kind says what it is in words, next to its icon
    for (const parola of ['Rate in ritardo', 'Chiave in scadenza', 'Chiave da rifare', 'Da approvare', 'Spesa di Claude']) {
      await expect(righe.getByText(parola, { exact: true }).first()).toBeVisible()
    }
  })

  for (const a of AVVISI) {
    test(`${a.tipo}: il dettaglio è un testo (nessun riquadro d’email) e il bottone porta alla pagina giusta`, async ({ page }) => {
      await emettiAvvisi()
      await accedi(page, 'admin')
      await page.goto('/notifiche')
      await page.getByTestId('notifica').filter({ hasText: a.titolo }).getByRole('link').first().click()
      await expect(page.getByRole('heading', { level: 1, name: a.titolo })).toBeVisible()
      await expect(page.getByTestId('solo-app')).toHaveText('Solo nell’app')
      await expect(page.getByTestId('corpo-avviso')).toContainText(a.anteprima)
      for (const riga of a.dettagli ?? []) await expect(page.getByTestId('righe-avviso')).toContainText(riga)
      await expect(page.getByTestId('corpo-notifica')).toHaveCount(0)
      await expect(page.getByText('L’email non è partita')).toHaveCount(0)
      // opened = read
      await expect(conteggio(page)).toHaveText(String(AVVISI.length - 1), { timeout: 10_000 })

      const bottone = page.getByRole('link', { name: a.bottone })
      await expect(bottone).toHaveAttribute('href', a.link)
      await bottone.click()
      await expect(page).toHaveURL(a.url)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    })
  }

  test('un avviso eliminato dall’admin non torna: la stessa chiave non si emette due volte', async ({ page }) => {
    await emettiAvvisi()
    await accedi(page, 'admin')
    await page.goto('/notifiche')
    const titolo = AVVISI[1].titolo
    await page.getByRole('button', { name: `Elimina la notifica «${titolo}»` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click()
    await expect(page.getByText('Notifica eliminata')).toBeVisible()
    // the next evening's scan says it again: nothing is written
    await emettiAvvisi()
    await page.reload()
    await expect(page.getByTestId('notifica').filter({ hasText: titolo })).toHaveCount(0)
    await expect(page.getByTestId('notifica')).toHaveCount(3 + AVVISI.length - 1)
  })

  test('due emissioni della stessa chiave scrivono una riga sola', async () => {
    await emettiAvvisi()
    await emettiAvvisi()
    const { data } = await dbLocale().from('notifiche').select('chiave').like('chiave', 'e2e/avviso-%')
    expect(data).toHaveLength(AVVISI.length)
  })

  test('a 390 px la lista con gli avvisi e un dettaglio non scorrono di lato', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await emettiAvvisi()
    await accedi(page, 'admin')
    await page.goto('/notifiche')
    await expect(page.getByTestId('notifica')).toHaveCount(3 + AVVISI.length)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.getByTestId('notifica').filter({ hasText: AVVISI[0].titolo }).getByRole('link').first().click()
    await expect(page.getByTestId('corpo-avviso')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const bottone = await page.getByRole('link', { name: AVVISI[0].bottone }).boundingBox()
    expect(bottone?.height).toBeGreaterThanOrEqual(44)
  })

  test('il setter non riceve mai gli avvisi dell’admin', async ({ page }) => {
    await emettiAvvisi()
    await accedi(page, 'setter')
    await page.goto('/notifiche')
    await expect(page.getByTestId('notifica')).toHaveCount(0)
    await expect(conteggio(page)).toHaveCount(0)
  })
})

// The events that create an alert, with the real functions of the database (as the nightly job and the steps of
// Claude's work call them): a new proposal tells the admin once, the spend crossing 80% and 100% once each.
test.describe('gli avvisi nati dagli eventi', () => {
  const GIORNO = aggiungiGiorni(oggiRoma(), -9)
  type Collegamento = { setter_id: string | null; account_username: string | null; account_id: string | null }
  let prima: Collegamento | null = null

  test.beforeEach(async () => {
    const db = dbLocale()
    const { data } = await db.from('instagram_collegamento').select('setter_id, account_username, account_id').maybeSingle()
    prima = data
    const { error } = await db
      .from('instagram_collegamento')
      .update({ setter_id: ID_SETTER, account_username: 'alpha.prova', account_id: '17841400000000001' })
      .eq('id', true)
    if (error) throw error
    await db.from('report_proposte_instagram').delete().eq('setter_id', ID_SETTER).eq('data', GIORNO)
    await db.from('notifiche_avvisi_emessi').delete().like('chiave', 'proposta/%')
  })
  test.afterEach(async () => {
    const db = dbLocale()
    await db.from('report_proposte_instagram').delete().eq('setter_id', ID_SETTER).eq('data', GIORNO)
    await db.from('notifiche_avvisi_emessi').delete().like('chiave', 'proposta/%')
    await db.from('notifiche_avvisi_emessi').delete().like('chiave', 'spesa/%')
    await db.from('notifiche').delete().in('tipo', ['proposta_da_approvare', 'spesa_claude'])
    if (prima) await db.from('instagram_collegamento').update(prima).eq('id', true)
  })

  const salva = (dm: number) =>
    dbLocale().rpc('instagram_salva_proposta', {
      p_setter: ID_SETTER,
      p_data: GIORNO,
      p_dm_outbound: dm,
      p_dm_inbound: 5,
      p_follow_up: 3,
      p_conversazioni: 4,
      p_call_proposte: 2,
      p_chat_lette: 12,
      p_chat_incerte: 1,
    })

  test('una proposta nuova avvisa l’admin, con il nome vero del setter e il link alla scheda; un ricalcolo no', async ({ page }) => {
    const { data: id, error } = await salva(10)
    expect(error).toBeNull()
    await salva(11)
    await salva(11)
    const { data } = await dbLocale().from('notifiche').select('titolo, link, canale, destinatario_id').eq('chiave', `proposta/${id}`)
    expect(data).toHaveLength(1)
    expect(data?.[0].destinatario_id).toBe(ID_ADMIN)
    expect(data?.[0].link).toBe('/setting#da-approvare')
    expect(data?.[0].canale).toBe('app')
    expect(data?.[0].titolo).toMatch(/^Da approvare: il tracciamento di Loris di /)

    await accedi(page, 'admin')
    await page.goto('/notifiche')
    const riga = page.getByTestId('notifica').filter({ hasText: 'Da approvare: il tracciamento di Loris' })
    await expect(riga).toHaveCount(1)
    await expect(riga.getByTestId('solo-app')).toBeVisible()
    // and the setter is told nothing from here
    const { data: delSetter } = await dbLocale().from('notifiche').select('id').eq('destinatario_id', ID_SETTER).eq('tipo', 'proposta_da_approvare')
    expect(delSetter).toHaveLength(0)
  })

  test('la spesa di Claude: 80% e 100% una volta sola ciascuno, per le analisi dei reel e per le call', async () => {
    const db = dbLocale()
    const { data: m0 } = await db.from('marketing_lavori_stato').select('*').maybeSingle()
    const { data: c0 } = await db.from('call_lavori_stato').select('*').maybeSingle()
    const mese = oggiRoma().slice(0, 7)
    const passo = async (tabella: 'marketing' | 'call', input: number) => {
      const lease = { passo_id: crypto.randomUUID(), passo_cosa: 'analisi', passo_rif: 'x', lease_fino_al: new Date(Date.now() + 300_000).toISOString() }
      const { error } = await db.from(tabella === 'marketing' ? 'marketing_lavori_stato' : 'call_lavori_stato').update(lease as never).eq('id', true)
      if (error) throw error
      const rpc = tabella === 'marketing' ? 'marketing_passo_finito' : 'call_passo_finito'
      const { error: e2 } = await db.rpc(rpc, { p_passo: lease.passo_id, p_esito: 'ok', p_contatori: { input } })
      if (e2) throw e2
    }
    try {
      const nuovoMese = `${mese}-01`
      const azzera = { mese: nuovoMese, token_input: 0, token_cache_scritti: 0, token_cache_letti: 0, token_output: 0, costo_mese_usd: 0 }
      await db.from('marketing_lavori_stato').update({ ...azzera, secondi_audio: 0, costo_max_mese: 25 }).eq('id', true)
      await db.from('call_lavori_stato').update({ ...azzera, costo_max_mese: 10 }).eq('id', true)
      await passo('marketing', 5_000_000) // 10 $ of 25
      await passo('marketing', 6_000_000) // 22 $ of 25: over 80%
      await passo('marketing', 600_000) // 23,2 $: still over 80%, no new alert
      await passo('marketing', 2_000_000) // 27,2 $: over 100%
      await passo('marketing', 1_000_000) // and again: nothing
      await passo('call', 2_000_000) // 4 $ of 10
      await passo('call', 2_500_000) // 9 $ of 10: over 80%
      const { data } = await db.from('notifiche').select('chiave, link, titolo, anteprima').eq('tipo', 'spesa_claude').order('chiave')
      expect(data?.map((r) => r.chiave)).toEqual([
        `spesa/call/${mese}/80`,
        `spesa/reel/${mese}/100`,
        `spesa/reel/${mese}/80`,
      ])
      const per = Object.fromEntries((data ?? []).map((r) => [r.chiave, r]))
      expect(per[`spesa/reel/${mese}/100`].anteprima).toMatch(/sono ferme fino al 1° /)
      expect(per[`spesa/reel/${mese}/80`].link).toBe('/settings/instagram#analisi-reel')
      expect(per[`spesa/call/${mese}/80`].link).toBe('/settings/fathom')
    } finally {
      if (m0) await db.from('marketing_lavori_stato').update(m0 as never).eq('id', true)
      if (c0) await db.from('call_lavori_stato').update(c0 as never).eq('id', true)
    }
  })
})

// The cron routes against the local dev server started WITHOUT a Resend key: the notifications are saved
// anyway and a second run the same day does not double them. Opt in with E2E_CRON_NOTIFICHE=1 (it hits
// whatever E2E_BASE_URL points at: never against a server that has a real Resend key).
test.describe('i cron salvano le notifiche anche senza email', () => {
  test.skip(process.env.E2E_CRON_NOTIFICHE !== '1' || !process.env.CRON_SECRET, 'E2E_CRON_NOTIFICHE=1 e CRON_SECRET')
  const intestazioni = () => ({ authorization: `Bearer ${process.env.CRON_SECRET}` })

  test('backup e giornaliero: righe una volta sola dopo due giri', async ({ request }) => {
    const db = dbLocale()
    await db.from('notifiche').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await db.from('notifiche_avvisi_emessi').delete().neq('chiave', '')
    await db.from('rate_notificate').delete().neq('payment_id', '00000000-0000-0000-0000-000000000000')
    const oggi = oggiRoma()

    for (const percorso of ['/api/cron/backup', '/api/cron/giornaliero', '/api/cron/backup', '/api/cron/giornaliero']) {
      const risposta = await request.get(percorso, { headers: intestazioni() })
      const corpo = await risposta.json()
      // no email key on this server: nothing leaves
      expect(JSON.stringify(corpo)).toMatch(/non configurata/)
    }

    const { data: backup } = await db.from('notifiche').select('destinatario_id, email_inviata, link').eq('chiave', `backup/${oggi}`)
    const { data: admin } = await db.from('profiles').select('id').eq('ruolo', 'admin').eq('attivo', true)
    expect(backup).toHaveLength(admin?.length ?? 0)
    expect(backup?.every((r) => !r.email_inviata && r.link === '/settings/export')).toBe(true)

    // the reminders: the same count after a third run
    const { count: prima } = await db.from('notifiche').select('id', { count: 'exact', head: true })
    await request.get('/api/cron/giornaliero', { headers: intestazioni() })
    const { count: dopo } = await db.from('notifiche').select('id', { count: 'exact', head: true })
    expect(dopo).toBe(prima)

    // what the nights saved, by kind (printed for whoever runs it)
    const { data: tutte } = await db.from('notifiche').select('tipo, chiave, email_inviata, destinatario_id')
    const perTipo: Record<string, number> = {}
    for (const r of tutte ?? []) perTipo[r.tipo] = (perTipo[r.tipo] ?? 0) + 1
    console.log('notifiche salvate dai cron (righe per tipo):', JSON.stringify(perTipo), 'admin attivi:', admin?.length)
    // never two rows with the same recipient and key
    const chiavi = (tutte ?? []).map((r) => `${r.destinatario_id}|${r.chiave}`)
    expect(new Set(chiavi).size).toBe(chiavi.length)
  })
  test('la sera: le rate in ritardo e le chiavi diventano avvisi solo nell’app, una volta sola dopo due giri', async ({ request }) => {
    const db = dbLocale()
    await db.from('notifiche').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await db.from('notifiche_avvisi_emessi').delete().neq('chiave', '')
    await db.from('rate_notificate').delete().neq('payment_id', '00000000-0000-0000-0000-000000000000')
    const oggi = oggiRoma()
    const { data: attese } = await db.from('payments').select('id').eq('stato', 'prevista').lt('scadenza', oggi)
    const { data: admin } = await db.from('profiles').select('id').eq('ruolo', 'admin').eq('attivo', true)
    expect(attese?.length ?? 0).toBeGreaterThan(0)

    const r1 = await (await request.get('/api/cron/giornaliero', { headers: intestazioni() })).json()
    expect(r1.avvisi).toEqual(expect.objectContaining({ rate: attese?.length }))
    const r2 = await (await request.get('/api/cron/giornaliero', { headers: intestazioni() })).json()
    expect(r2.avvisi).toEqual(expect.objectContaining({ rate: 0, collegamenti: 0 }))

    const { data: rate } = await db
      .from('notifiche')
      .select('destinatario_id, canale, email_inviata, link, dettagli, corpo_html')
      .eq('chiave', `rate-in-ritardo/${oggi}`)
    expect(rate).toHaveLength(admin?.length ?? 0)
    expect(rate?.every((r) => r.canale === 'app' && !r.email_inviata && r.link === '/payments?vista=ritardo' && r.corpo_html === null)).toBe(true)
    expect(String((rate?.[0].dettagli as string[])[0])).toMatch(/· Rata \d+ di \d+ · .*€ · scaduta il \d\d\/\d\d\/\d{4}$/)
    const { count } = await db.from('rate_notificate').select('payment_id', { count: 'exact', head: true })
    expect(count).toBe(attese?.length)

    // never two rows with the same recipient and key, whatever else the nights saved
    const { data: tutte } = await db.from('notifiche').select('chiave, destinatario_id')
    const chiavi = (tutte ?? []).map((r) => `${r.destinatario_id}|${r.chiave}`)
    expect(new Set(chiavi).size).toBe(chiavi.length)
  })
  // The same sentence as FRASI_ERRORE.token (lib/instagram/report.ts, server only): if it changes, this test says so.
  const TOKEN_RIFIUTATO =
    'Il token di Instagram è scaduto o non è più valido: generane uno nuovo dal pannello Meta e incollalo di nuovo.'

  test('la sera: il token di Instagram che scade, poi quello rifiutato da Meta, ognuno una volta sola', async ({ request }) => {
    const db = dbLocale()
    const { data: gia } = await db.rpc('instagram_token')
    test.skip(Boolean(gia), 'Nel Vault locale c’è già un token.')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
    const sessione = createClient<Database>(url, chiave, { auth: { persistSession: false } })
    const { error: accesso } = await sessione.auth.signInWithPassword({ email: UTENTI.admin.email, password: PASSWORD_SEED })
    if (accesso) throw accesso
    const { data: prima } = await db.from('instagram_collegamento').select('*').maybeSingle()
    await db.from('notifiche').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await db.from('notifiche_avvisi_emessi').delete().neq('chiave', '')
    const { error } = await sessione.rpc('instagram_imposta_token', { p_token: 'IGAAe2eFintoAvvisiQwErTyUiOpAsDfGh' })
    if (error) throw error
    try {
      const fine = new Date(Date.now() + 3 * 86_400_000)
      await db.from('instagram_collegamento').update({ token_scade_il: fine.toISOString(), ultimo_errore: null, ultimo_errore_il: null }).eq('id', true)
      await request.get('/api/cron/giornaliero', { headers: intestazioni() })
      await request.get('/api/cron/giornaliero', { headers: intestazioni() })
      const { data: scade } = await db.from('notifiche').select('tipo, canale, link, chiave, titolo').like('chiave', 'instagram-token-scade/%')
      expect(scade).toHaveLength(1)
      expect(scade?.[0]).toMatchObject({ tipo: 'chiave_in_scadenza', canale: 'app', link: '/settings/chiavi' })
      expect(scade?.[0].chiave).toBe(`instagram-token-scade/${oggiRoma(fine)}`)
      expect(scade?.[0].titolo).toMatch(/^Il token di Instagram scade il \d\d\/\d\d\/\d{4}: rigeneralo in Impostazioni › Chiavi e collegamenti$/)

      // Meta refuses it: one alert for the day of the error, however many nights it fails the same day
      await db
        .from('instagram_collegamento')
        .update({ token_scade_il: new Date(Date.now() + 40 * 86_400_000).toISOString(), ultimo_errore: TOKEN_RIFIUTATO, ultimo_errore_il: new Date().toISOString() })
        .eq('id', true)
      await request.get('/api/cron/giornaliero', { headers: intestazioni() })
      await request.get('/api/cron/giornaliero', { headers: intestazioni() })
      const { data: rifiutato } = await db.from('notifiche').select('tipo, canale').like('chiave', 'instagram-token-rifiutato/%')
      expect(rifiutato).toEqual([{ tipo: 'chiave_rifiutata', canale: 'app' }])
    } finally {
      await sessione.rpc('instagram_togli_token')
      if (prima) {
        await db
          .from('instagram_collegamento')
          .update({ token_scade_il: prima.token_scade_il, token_aggiornato_il: prima.token_aggiornato_il, ultimo_errore: prima.ultimo_errore, ultimo_errore_il: prima.ultimo_errore_il })
          .eq('id', true)
      }
      await db.from('notifiche').delete().like('chiave', 'instagram-token-%')
    }
  })
})
