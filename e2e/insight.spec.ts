import { expect, test, type Locator, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { dbLocale } from './db'
import { accedi, type RuoloSeed } from './utenti'

/**
 * «Insight delle ultime 24h» (1.35.0): the artifact "Recap DM Alpha" in the
 * app, on the invented recaps of supabase/seeds/40_insight.sql (today and
 * yesterday, Instagram and Messenger). Never a real chat. The Fatto switches
 * these tests tap are put back as the seed has them at the end.
 */

const oggi = () => oggiRoma()
const ieri = () => aggiungiGiorni(oggiRoma(), -1)

const db = () => dbLocale()

async function headline(giorno: string, canale: 'instagram' | 'messenger'): Promise<string> {
  const { data, error } = await db().from('insight_recap').select('dati').eq('giorno', giorno).eq('canale', canale).single()
  if (error) throw error
  return (data as { dati: { headline: string } }).dati.headline
}

/** The seed's Fatto rows of today's Instagram recap: luca_prova done, the others untouched. */
async function rimettiFatti() {
  const { error } = await db().from('insight_fatto').delete().eq('giorno', oggi()).eq('canale', 'instagram').neq('chiave', 'luca_prova')
  if (error) throw error
  const { error: e2 } = await db()
    .from('insight_fatto')
    .upsert({ giorno: oggi(), canale: 'instagram', chiave: 'luca_prova', fatto: true }, { onConflict: 'giorno,canale,chiave' })
  if (e2) throw e2
}

test.beforeAll(async () => {
  // the seed's recaps are there: otherwise every check below would test an empty page
  const { count, error } = await db().from('insight_recap').select('giorno', { count: 'exact', head: true }).eq('giorno', oggi())
  if (error) throw error
  expect(count, 'mancano i recap di supabase/seeds/40_insight.sql: applica il seed').toBe(2)
  await rimettiFatti()
})

test.afterAll(async () => {
  await rimettiFatti()
})

function scheda(page: Page, username: string): Locator {
  return page.getByRole('article', { name: new RegExp(`@${username.replace(/\./g, '\\.')}`) })
}

function tessera(page: Page, etichetta: string): Locator {
  return page.getByRole('group', { name: 'Filtra le chat' }).getByRole('button', { name: new RegExp(etichetta) })
}

async function apriInsight(page: Page, ruolo: RuoloSeed, url = '/insight?canale=instagram') {
  await accedi(page, ruolo)
  await page.goto(url)
  await expect(page.getByRole('heading', { level: 1, name: 'Insight delle ultime 24h' })).toBeVisible()
}

test.describe('who opens it', () => {
  for (const ruolo of ['admin', 'setter'] as const) {
    test(`the ${ruolo} opens the Insight`, async ({ page }) => {
      await apriInsight(page, ruolo)
      await expect(page.getByText('Percorso Alpha · Inbox Instagram')).toBeVisible()
      await expect(page.getByRole('tab', { name: /^Instagram/ })).toHaveAttribute('aria-selected', 'true')
    })
  }

  for (const ruolo of ['closer', 'coach', 'editor', 'marketing'] as const) {
    test(`the ${ruolo} is sent back`, async ({ page }) => {
      await accedi(page, ruolo)
      await page.goto('/insight')
      await page.waitForURL((u) => !u.pathname.startsWith('/insight'))
      await expect(page.getByRole('heading', { name: 'Insight delle ultime 24h' })).toHaveCount(0)
    })
  }
})

test.describe('tabs and day', () => {
  test('the agenda counts today’s calls; the arrows move between tabs; the tab chosen comes back', async ({ page }) => {
    await apriInsight(page, 'admin')
    const agenda = page.getByRole('tab', { name: /^Agenda/ })
    await expect(agenda).toHaveAccessibleName(/^Agenda\s*2 call oggi$/)
    await expect(page.getByTestId('badge-agenda')).toHaveText('2')

    const instagram = page.getByRole('tab', { name: /^Instagram/ })
    await instagram.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForURL(/canale=messenger/)
    const messenger = page.getByRole('tab', { name: /^Messenger/ })
    await expect(messenger).toBeFocused()
    await expect(messenger).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Percorso Alpha · Inbox Messenger')).toBeVisible()
    await expect(page.getByRole('heading', { level: 4, name: /Alessandro Messenger/ })).toBeVisible()

    // the cookie of this browser: /insight without ?canale opens Messenger again
    await page.goto('/insight')
    await expect(page.getByRole('tab', { name: /^Messenger/ })).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await expect(page.getByRole('tab', { name: /^Messenger/ })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('tab', { name: /^Messenger/ }).focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForURL(/canale=agenda/)
    await expect(page.getByText('Percorso Alpha · Agenda call')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: /Agenda call/ })).toBeVisible()
    await expect(page.getByTestId('call-agenda')).toHaveCount(3)
    await expect(page.getByTestId('call-ieri')).toHaveCount(2)
    // the closer and the notes never: the agenda says time, who and status
    await expect(page.getByTestId('agenda')).not.toContainText('Lorenzo Closer')

    // back to Instagram, which the cookie remembers
    await page.getByRole('tab', { name: /^Instagram/ }).click()
    await page.waitForURL(/canale=instagram/)
    await page.goto('/insight')
    await expect(page.getByRole('tab', { name: /^Instagram/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('the day select opens yesterday’s recap; without ?giorno the newest', async ({ page }) => {
    await apriInsight(page, 'setter')
    const verdetto = page.getByRole('region', { name: 'Verdetto della giornata' })
    await expect(verdetto).toContainText(await headline(oggi(), 'instagram'))
    await page.getByLabel('Giorno').selectOption(ieri())
    await page.waitForURL(new RegExp(`giorno=${ieri()}`))
    await expect(verdetto).toContainText(await headline(ieri(), 'instagram'))
    await expect(scheda(page, 'tommaso.ieri')).toBeVisible()
    await page.goto('/insight?canale=instagram')
    await expect(page.getByLabel('Giorno')).toHaveValue(oggi())
  })
})

test.describe('the numbers that filter', () => {
  test('each tile filters; «Mostra tutto» and the tile again clear, the focus back on the tile', async ({ page }) => {
    await apriInsight(page, 'setter')
    const filtrata = page.getByTestId('sezione-filtrata')
    const attese = [
      ['Chat attive', 'Tutte le chat attive', 7],
      ['Lead in target', 'Lead in target', 2],
      ['Attendono risposta', 'Attendono risposta', 3],
      ['Call prenotate', 'Call prenotate', 1],
      ['Chiusi / persi', 'Chiusi / persi', 3],
    ] as const
    for (const [etichetta, titolo, schede] of attese) {
      const t = tessera(page, etichetta)
      await t.click()
      await expect(t).toHaveAttribute('aria-pressed', 'true')
      await expect(filtrata.getByRole('heading', { level: 2 })).toContainText(titolo)
      await expect(filtrata.getByRole('article')).toHaveCount(schede)
      await expect(t).toBeFocused()
    }
    // «Chiusi / persi» also counts «uscita» (D9)
    await expect(scheda(page, 'giorgio_fittizio')).toBeVisible()

    // «Chat attive»: the chats that are not leads in their box
    await tessera(page, 'Chat attive').click()
    await expect(filtrata.getByRole('heading', { name: 'Non lead (1)' })).toBeVisible()
    // «Da riattivare» and the excluded chats hide while filtering, as the artifact
    await expect(page.getByTestId('da-riattivare')).toHaveCount(0)
    await filtrata.getByRole('button', { name: 'Mostra tutto' }).click()
    await expect(filtrata).toHaveCount(0)
    await expect(tessera(page, 'Chat attive')).toBeFocused()
    await expect(tessera(page, 'Chat attive')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('heading', { level: 2, name: /Chat per priorità/ })).toBeVisible()
    await expect(page.getByTestId('da-riattivare')).toBeVisible()

    // the same tile again clears too
    await tessera(page, 'Call prenotate').click()
    await tessera(page, 'Call prenotate').click()
    await expect(filtrata).toHaveCount(0)
    await expect(tessera(page, 'Call prenotate')).toBeFocused()
  })

  test('the setter splits the chats: to answer, follow-up, waiting, closest to the call first', async ({ page }) => {
    await apriInsight(page, 'setter')
    const divisioni = page.getByRole('group', { name: 'Dividi le chat' })
    const bottone = (nome: string) => divisioni.getByRole('button', { name: new RegExp(`^${nome}`) })
    await expect(bottone('Tutte')).toHaveAttribute('aria-pressed', 'true')

    // «Da rispondere» = the same leads as «Attendono risposta» (D8)
    await bottone('Da rispondere').click()
    await expect(bottone('Da rispondere')).toHaveAttribute('aria-pressed', 'true')
    const rispondere = page.getByTestId('divisione-rispondere')
    await expect(rispondere.getByRole('heading', { level: 2 })).toContainText('Da rispondere')
    await expect(rispondere.getByRole('article')).toHaveCount(3)
    await expect(page.getByTestId('da-riattivare')).toHaveCount(0)

    // each division shows as many chats as its number says, grouped by closeness to the call
    for (const [nome, chiave] of [['Follow-up', 'follow_up'], ['In attesa', 'attesa']] as const) {
      await bottone(nome).click()
      const numero = Number((await bottone(nome).locator('.num').innerText()).trim())
      const sezione = page.getByTestId(`divisione-${chiave}`)
      if (numero) await expect(sezione.getByRole('article')).toHaveCount(numero)
      else await expect(sezione.getByText('Nessuna chat qui.')).toBeVisible()
    }

    await bottone('Tutte').click()
    await expect(page.getByRole('heading', { level: 2, name: /Chat per priorità/ })).toBeVisible()
    await expect(page.getByTestId('da-riattivare')).toBeVisible()
  })

  test('the alert is red, with its hourglass, only above 0', async ({ page }) => {
    await apriInsight(page, 'admin', '/insight?canale=messenger')
    const oggiAttesa = tessera(page, 'Attendono risposta')
    await expect(oggiAttesa).toContainText('1')
    await expect(oggiAttesa.locator('svg')).toHaveCount(1)
    await expect(oggiAttesa.locator('.text-rosso-testo')).toHaveCount(1)
    await page.goto(`/insight?canale=messenger&giorno=${ieri()}`)
    const ieriAttesa = tessera(page, 'Attendono risposta')
    await expect(ieriAttesa).toContainText('0')
    await expect(ieriAttesa.locator('svg')).toHaveCount(0)
    await expect(ieriAttesa.locator('.text-rosso-testo')).toHaveCount(0)
  })
})

test.describe('the cards', () => {
  test('«aspetta da», the copy, the chat and «Apri la chat su Instagram»', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await apriInsight(page, 'setter')
    const marco = scheda(page, 'marco.esempio')
    await expect(marco.getByTestId('attesa')).toHaveText(/^aspetta da (meno di 1 ora|\d+ ore?|\d+ giorni)$/)
    // our message last: no wait, even with «attende» in the status (D8)
    await expect(scheda(page, 'luca_prova').getByTestId('attesa')).toHaveCount(0)

    const copia = marco.getByRole('button', { name: /il messaggio suggerito per @marco\.esempio/ })
    await expect(copia).toHaveAccessibleName('Copia il messaggio suggerito per @marco.esempio')
    await copia.click()
    await expect(copia).toHaveText('Copiato')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Perfetto Marco!')
    await expect(copia).toHaveText('Copia', { timeout: 5000 })

    const copiaChat = marco.getByRole('button', { name: /chat con @marco\.esempio/ })
    expect(await copiaChat.evaluate((b) => b.closest('summary') === null)).toBe(true)
    await copiaChat.click()
    const trascrizione = await page.evaluate(() => navigator.clipboard.readText())
    expect(trascrizione.startsWith('Conversazione Instagram con @marco.esempio (Marco Esempio)\n\n[')).toBe(true)

    const leggi = marco.getByRole('button', { name: /Leggi la chat/ })
    await expect(leggi).toHaveAttribute('aria-expanded', 'false')
    await expect(marco.locator('[data-da]')).toHaveCount(0)
    await leggi.click()
    await expect(leggi).toHaveAttribute('aria-expanded', 'true')
    const chat = marco.getByRole('region', { name: 'Chat con @marco.esempio' })
    await expect(chat).toBeVisible()
    await expect(chat.locator('[data-da="lead"]').first()).toBeVisible()
    await expect(chat.locator('[data-da="alpha"]').first()).toBeVisible()
    await expect(marco.getByRole('link', { name: /Apri la chat su Instagram/ })).toHaveAttribute('href', 'https://ig.me/m/marco.esempio')
  })

  test('«Arriva da»: the post for both, the calendar only for the admin', async ({ browser }) => {
    const { data, error } = await dbLocale()
      .from('marketing_contenuti')
      .select('id, nome')
      .in('instagram_shortcode', ['SeedDemo01', 'SeedPost02', 'SeedPost03', 'SeedPost04'])
    if (error) throw error
    const demo = await dbLocale().from('instagram_contenuti').select('permalink').eq('shortcode', 'SeedDemo01').single()
    if (demo.error) throw demo.error

    const admin = await (await browser.newContext()).newPage()
    await apriInsight(admin, 'admin')
    const marco = scheda(admin, 'marco.esempio')
    await expect(marco.getByTestId('arriva-da')).toContainText(/Arriva da: reel del \d\d\/\d\d/)
    await expect(marco.getByTestId('arriva-da')).toContainText('condiviso in DM')
    await expect(marco.getByRole('link', { name: /Apri il post/ })).toHaveAttribute('href', demo.data.permalink)
    const calendario = marco.getByTestId('nel-calendario')
    await expect(calendario).toContainText('Nel calendario:')
    await expect(calendario).toHaveAttribute('href', /^\/marketing\/contenuti\?contenuto=/)
    await expect(scheda(admin, 'andrea.demo').getByTestId('arriva-da')).toContainText('parola chiave «ADDOMINALI»')
    await expect(scheda(admin, 'luca_prova').getByTestId('arriva-da')).toHaveText('Arriva da una risposta a una storia')
    await admin.context().close()

    const setter = await (await browser.newContext()).newPage()
    await apriInsight(setter, 'setter')
    await expect(scheda(setter, 'marco.esempio').getByTestId('arriva-da')).toBeVisible()
    await expect(setter.getByTestId('nel-calendario')).toHaveCount(0)
    const html = await setter.content()
    for (const c of data ?? []) expect(html).not.toContain(c.nome)
    await setter.context().close()
  })

  test('under 14: the pill, no chat, no copy of the chat', async ({ page }) => {
    await apriInsight(page, 'setter')
    const minore = scheda(page, 'ragazzo.esempio13')
    await expect(minore.getByText('minore sotto i 14 anni', { exact: true })).toBeVisible()
    await expect(minore.getByRole('button', { name: /Leggi la chat/ })).toHaveCount(0)
    await expect(minore.getByRole('button', { name: /Copia chat/ })).toHaveCount(0)
    await expect(minore.getByRole('link', { name: /Apri la chat su Instagram/ })).toBeVisible()
  })
})

test.describe('exclusions and partial recaps', () => {
  test('the excluded chats: only their number, never a name', async ({ page }) => {
    const { data, error } = await dbLocale().from('instagram_esclusi').select('username')
    if (error) throw error
    await apriInsight(page, 'admin')
    await expect(page.getByTestId('riga-escluse')).toContainText('2 chat escluse dalle impostazioni non sono state analizzate.')
    await expect(page.getByRole('link', { name: 'Gestisci le chat escluse' })).toHaveAttribute('href', '/settings/instagram#chat-escluse')
    await page.getByText('Escluse dal recap (1)').click()
    await expect(page.getByTestId('escluse')).toContainText('Amico di Dany')
    const html = await page.content()
    for (const { username } of data ?? []) expect(html).not.toContain(username)
  })

  test('the admin reads the run’s warnings, the setter one line', async ({ browser }) => {
    const admin = await (await browser.newContext()).newPage()
    await apriInsight(admin, 'admin')
    await expect(scheda(admin, 'stefano.segnaposto').getByText('analisi non disponibile', { exact: true })).toBeVisible()
    // the lead has the last word, so the code writes «attende risposta · analisi non disponibile»: said once, not twice
    await expect(scheda(admin, 'stefano.segnaposto').getByText(/analisi non disponibile/)).toHaveCount(1)
    await expect(scheda(admin, 'stefano.segnaposto')).toContainText('Apri la chat: questa conversazione non è stata analizzata.')
    await expect(admin.getByTestId('recap-parziale')).toContainText('Recap parziale')
    await expect(admin.getByTestId('recap-parziale')).toContainText('Claude non ha risposto in tempo')
    await expect(admin.getByRole('button', { name: 'Aggiorna dati' })).toBeVisible()
    await expect(admin.getByText('Automazione', { exact: true })).toBeVisible()
    await admin.context().close()

    const setter = await (await browser.newContext()).newPage()
    await apriInsight(setter, 'setter')
    await expect(setter.getByTestId('recap-parziale')).toHaveText(
      'Recap parziale: alcune chat non sono state analizzate, aprile da Instagram.',
    )
    // «Aggiorna dati» is his too from 1.50.0; the Automazione stays the admin's
    await expect(setter.getByRole('button', { name: 'Aggiorna dati' })).toBeVisible()
    await expect(setter.getByText('Automazione', { exact: true })).toHaveCount(0)
    await expect(setter.getByTestId('meta-insight')).toContainText(/recap automatico (alle \d\d:\d\d|spento)/)
    const html = await setter.content()
    expect(html).not.toContain('Claude non ha risposto in tempo')
    expect(html).not.toContain('costo_usd')
    expect(html).not.toContain('ANTHROPIC_API_KEY')
    await setter.context().close()
  })

  test('the warnings and how the recap was made are not in the document the setter reads', async () => {
    const { data, error } = await db().from('insight_recap').select('dati').eq('giorno', oggi()).eq('canale', 'instagram').single()
    if (error) throw error
    expect(Object.keys(data.dati as object)).not.toEqual(expect.arrayContaining(['avvisi']))
    expect(Object.keys(data.dati as object)).not.toEqual(expect.arrayContaining(['generato_con']))
    // they are on the run, which the admin reads
    const { data: run, error: e2 } = await db().from('insight_esecuzioni').select('dettagli_recap').eq('id', '40400000-0000-4000-8000-000000000001').single()
    if (e2) throw e2
    expect(JSON.stringify(run.dettagli_recap)).toContain('Claude non ha risposto in tempo')
  })

  test('a reminder the final check removed says why, in the agenda', async ({ page }) => {
    await apriInsight(page, 'setter', '/insight?canale=agenda')
    const call = page.getByTestId('call-agenda').filter({ hasText: 'riccardo.prova' })
    await expect(call).toContainText('Messaggio non mostrato: link diverso dal Calendly. Scrivilo a mano.')
    await expect(call.getByText('Promemoria', { exact: false })).toHaveCount(0)
  })
})

test.describe('Fatto, shared and live', () => {
  test('a tap of the admin shows on the setter’s page, survives a reload, and the setter coming back sees the ticks of now', async ({
    browser,
  }) => {
    const admin = await (await browser.newContext()).newPage()
    const setter = await (await browser.newContext()).newPage()
    await apriInsight(admin, 'admin')
    await apriInsight(setter, 'setter')

    const alta = (p: Page) => p.getByTestId('gruppo-alta').getByTestId('conteggio-fatte')
    await expect(alta(setter)).toHaveText('1/3 fatte')
    const suAdmin = admin.getByRole('switch', { name: 'Fatto: @marco.esempio' })
    const suSetter = setter.getByRole('switch', { name: 'Fatto: @marco.esempio' })
    await expect(suSetter).not.toBeChecked()
    // the Realtime channel listens: give it a moment after the page is there
    await setter.waitForTimeout(1500)

    await suAdmin.click()
    await expect(suAdmin).toBeChecked()
    await expect(scheda(admin, 'marco.esempio')).toHaveAttribute('data-fatto', 'true')
    await expect(suSetter).toBeChecked({ timeout: 15_000 })
    await expect(alta(setter)).toHaveText('2/3 fatte')
    await expect(scheda(setter, 'marco.esempio').getByText('Fatto', { exact: true })).toBeVisible()

    await setter.reload()
    await expect(setter.getByRole('switch', { name: 'Fatto: @marco.esempio' })).toBeChecked()

    // the setter leaves (a link of the app, the page stays in the browser's cache) and the admin untick
    await setter.locator('a[href="/today"]').first().click()
    await setter.waitForURL(/\/today/)
    await suAdmin.click()
    await expect(suAdmin).not.toBeChecked()
    await expect
      .poll(async () => {
        const { data } = await db()
          .from('insight_fatto')
          .select('fatto')
          .eq('giorno', oggi())
          .eq('canale', 'instagram')
          .eq('chiave', 'marco.esempio')
          .maybeSingle()
        return (data as { fatto: boolean } | null)?.fatto ?? false
      })
      .toBe(false)
    await setter.goBack()
    await setter.waitForURL(/\/insight/)
    await expect(setter.getByRole('switch', { name: 'Fatto: @marco.esempio' })).not.toBeChecked({ timeout: 15_000 })
    await expect(alta(setter)).toHaveText('1/3 fatte')

    await admin.context().close()
    await setter.context().close()
  })
})

test.describe('«Aggiorna dati» of the setter (1.50.0)', () => {
  const RIGA = {
    avviato: 'Aggiornamento avviato: il recap arriva tra pochi minuti, puoi chiudere la pagina.',
    nonAttivo: 'L’Insight non è attivo: avvisa Dany.',
    limite: 'Hai già aggiornato 8 volte oggi: riprova domani.',
  }

  /** The words the setter never reads on this page, whatever happens. */
  async function niente(page: Page) {
    const html = await page.content()
    for (const parola of ['ANTHROPIC_API_KEY', 'APP_URL', 'INSIGHT_URL_PASSO', 'costo_usd', 'Claude analizza le chat', 'pianificatore']) {
      expect(html, parola).not.toContain(parola)
    }
    await expect(page.getByText('Automazione', { exact: true })).toHaveCount(0)
  }

  test('the setter taps it, reads neutral words, and the 8 a day are shared', async ({ page }) => {
    // the dev server must not send the run anywhere: INSIGHT_URL_PASSO=manuale (as insight-esecuzione.spec.ts),
    // and the rows this test writes go at the end
    const dal = new Date(Date.now() - 1000).toISOString()
    await apriInsight(page, 'setter')
    const bottone = page.getByRole('button', { name: 'Aggiorna dati' })
    await expect(bottone).toBeVisible()
    expect((await bottone.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    const riga = page.getByTestId('riga-aggiornamento')

    if (await bottone.isDisabled()) {
      // a dev server without ANTHROPIC_API_KEY: the setter learns only that the Insight is off
      await expect(riga).toHaveText(RIGA.nonAttivo)
      await niente(page)
      return
    }

    try {
      await bottone.click()
      await expect(riga).toHaveText(RIGA.avviato)
      await expect(page.getByRole('button', { name: /Aggiornamento in corso/ })).toBeDisabled()
      await niente(page)

      // the run: today's, manual, without the name of who pressed (CLAUDE.md section 17)
      const { data: runs, error } = await db().from('insight_esecuzioni').select('id, motivo, richiesta_da').gte('creata_il', dal)
      if (error) throw error
      expect(runs).toHaveLength(1)
      expect(runs?.[0]).toMatchObject({ motivo: 'manuale', richiesta_da: null })

      // the run ends: «Dati aggiornati.» (the page reads the state every 15 seconds)
      const fine = await db()
        .from('insight_esecuzioni')
        .update({ stato: 'pronta', finita_il: new Date().toISOString() })
        .eq('id', runs?.[0]?.id as string)
      if (fine.error) throw fine.error
      await expect(riga).toHaveText('Dati aggiornati.', { timeout: 25_000 })

      // the eighth of the day, whoever pressed it: the ninth is refused with the database's sentence
      const { count, error: e2 } = await db()
        .from('insight_esecuzioni')
        .select('id', { count: 'exact', head: true })
        .eq('motivo', 'manuale')
        .eq('giorno', oggi())
      if (e2) throw e2
      const mancano = Math.max(0, 8 - (count ?? 0))
      if (mancano) {
        const pieni = await db()
          .from('insight_esecuzioni')
          .insert(Array.from({ length: mancano }, () => ({ giorno: oggi(), motivo: 'manuale', stato: 'pronta' as const })))
        if (pieni.error) throw pieni.error
      }
      await page.reload()
      await page.getByRole('button', { name: 'Aggiorna dati' }).click()
      await expect(riga).toHaveText(RIGA.limite)
      await niente(page)
    } finally {
      const via = await db().from('insight_esecuzioni').delete().gte('creata_il', dal)
      if (via.error) throw via.error
    }
  })

  test('without a recap the empty state has «Aggiorna dati» for the setter too', async ({ page }) => {
    // the Instagram recaps and their Fatto rows go for this test and come back as they were
    const recap = await db().from('insight_recap').select('*').eq('canale', 'instagram')
    const fatti = await db().from('insight_fatto').select('*').eq('canale', 'instagram')
    if (recap.error) throw recap.error
    if (fatti.error) throw fatti.error
    try {
      const via = await db().from('insight_recap').delete().eq('canale', 'instagram')
      if (via.error) throw via.error
      await apriInsight(page, 'setter', '/insight?canale=instagram')
      await expect(page.getByText('Nessun recap Instagram ancora')).toBeVisible()
      // one button: the empty state's (the header has none without a recap)
      await expect(page.getByRole('button', { name: 'Aggiorna dati' })).toHaveCount(1)
      await niente(page)
    } finally {
      if (recap.data?.length) {
        const su = await db().from('insight_recap').upsert(recap.data, { onConflict: 'giorno,canale' })
        if (su.error) throw su.error
      }
      if (fatti.data?.length) {
        const su = await db().from('insight_fatto').upsert(fatti.data, { onConflict: 'giorno,canale,chiave' })
        if (su.error) throw su.error
      }
    }
  })
})

test.describe('the phone', () => {
  for (const ruolo of ['admin', 'setter'] as const) {
    test(`no sideways scroll at 390 px (${ruolo})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await accedi(page, ruolo)
      for (const url of ['/insight?canale=instagram', '/insight?canale=messenger', '/insight?canale=agenda']) {
        await page.goto(url)
        await expect(page.getByRole('heading', { level: 1, name: 'Insight delle ultime 24h' })).toBeVisible()
        if (url.endsWith('instagram')) {
          await scheda(page, 'marco.esempio').getByRole('button', { name: /Leggi la chat/ }).click()
          await tessera(page, 'Lead in target').click()
        }
        const [larga, finestra] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
        expect(larga, url).toBeLessThanOrEqual(finestra)
        if (url.endsWith('agenda')) {
          // the time of a call stays in its own column, never touching the name
          const toccano = await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-testid="call-agenda"], [data-testid="call-ieri"]')].filter((riga) => {
                const ora = riga.querySelector('.num')
                const chi = riga.children[1]
                return !ora || !chi || ora.getBoundingClientRect().right > chi.getBoundingClientRect().left - 8
              }).length,
          )
          expect(toccano, 'l’ora di una call tocca il suo nome').toBe(0)
        }
      }
    })
  }
})
