import { expect, test, type Page } from '@playwright/test'

import { dbLocale } from './db'
import { accedi } from './utenti'

/*
 * «Prova del percorso» (1.82.0): the admin opens the test from /onboarding and walks the whole
 * onboarding as a client sees it, with the client's own components and the team's actions
 * simulated from the bar, up to the rocket. Nothing is written: the tables of the onboarding,
 * the clients, the calls and the notifications have the same rows at the end. The setter does
 * not open it.
 */

const TABELLE = [
  'clients',
  'onboarding_inviti',
  'onboarding_passi',
  'onboarding_questionari',
  'onboarding_foglio',
  'notifiche',
  'clienti_call',
  'onboarding_allegati',
  'onboarding_eventi',
] as const

async function conteggi(): Promise<Record<string, number>> {
  const db = dbLocale()
  const valori = await Promise.all(
    TABELLE.map(async (t) => {
      const { count, error } = await db.from(t).select('*', { count: 'exact', head: true })
      if (error) throw error
      return [t, count ?? 0] as const
    }),
  )
  return Object.fromEntries(valori)
}

const RISPOSTE = {
  email: 'mario.prova@example.test',
  telefono: '+39 333 000 0000',
  nome_cognome: 'Mario Prova',
  altezza_peso: { altezza: 178, peso: 75 },
  data_nascita: '1992-04-15',
  obiettivo_principale: 'La prima trazione.',
  occupazione: 'Impiegato',
  storia_allenamento: 'Un anno di palestra.',
  giorni_settimana: 3,
  infortuni: 'Nessuno.',
  perche_noi: 'I video.',
  obiettivi_3_6_mesi: 'Cinque trazioni.',
  attrezzatura: 'Una sbarra.',
  massimali: { piegamenti: 15, trazioni: 'non_lo_so', dip: 5 },
  esercizi_difficolta: 'Le trazioni.',
  pronto: 'si',
  ore_sonno: 'Sette.',
  importanza_tecnica: 'Molto.',
  seguito_alimentazione: 'no',
  organizzazione_giornata: 'Lavoro 9-18.',
  livello_attivita: 'attivo',
  conoscenza_alimentazione: 'Poca.',
  cattive_abitudini: { scelte: ['sonno'] },
  successo: 'Costanza.',
  minuti_giorno: '30_40',
}

function pannello(page: Page) {
  return page.getByTestId('pannello-passo')
}

async function vista(page: Page, attesa: string) {
  await expect(pannello(page)).toHaveAttribute('data-vista', attesa, { timeout: 20_000 })
}

async function segnaVideoSeServe(page: Page) {
  const segna = page.getByTestId('segna-video')
  if (await segna.isVisible()) await segna.click()
}

test('l’admin prova tutto il percorso, fino al razzo, senza scrivere niente', async ({ page }) => {
  test.setTimeout(240_000)
  const prima = await conteggi()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await accedi(page, 'admin')
  await page.goto('/onboarding')
  await page.getByTestId('prova-percorso').click()
  await expect(page).toHaveURL(/\/prova-onboarding$/, { timeout: 60_000 })
  await expect(page.getByTestId('barra-prova')).toContainText('niente si salva')
  // a test from scratch, whatever an earlier run of this tab left
  await page.evaluate(() => window.sessionStorage.removeItem('alpha_prova_percorso'))
  await page.reload()

  // 1. Benvenuto: the video marked as seen from the bar
  await vista(page, 'passo:benvenuto')
  await expect(pannello(page).getByRole('heading', { level: 2 })).toHaveText('Benvenuto')
  await segnaVideoSeServe(page)
  await pannello(page).getByTestId('azione-passo').click()
  await vista(page, 'passo:regole')

  // 2. Le regole: every tick and the consent
  for (const casella of await pannello(page).getByRole('checkbox').all()) await casella.check()
  await pannello(page).getByTestId('azione-passo').click()
  await vista(page, 'passo:questionario')

  // 3. Il questionario, the Typeform of the client: one answer typed, then the rest from the memory, then the real sending
  await pannello(page).getByTestId('azione-passo').click()
  await expect(page).toHaveURL(/\/prova-onboarding\/questionario/)
  await page.getByTestId('inizia').click()
  await expect(page.getByTestId('indicatore')).toBeVisible()
  await page.evaluate((risposte) => {
    const v = JSON.parse(window.sessionStorage.getItem('alpha_prova_percorso') ?? '{}')
    v.stato.questionario.risposte = risposte
    v.stato.questionario.versione += 1
    window.sessionStorage.setItem('alpha_prova_percorso', JSON.stringify(v))
  }, RISPOSTE)
  await page.goto('/prova-onboarding/questionario?domanda=fine')
  await expect(page.getByTestId('recap-questionario')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('invia-questionario').click()
  await expect(page).toHaveURL(/\/prova-onboarding$/, { timeout: 20_000 })
  await vista(page, 'passo:prenotazione')

  // 4. La prenotazione, then the coach confirms (the email «Tocca a te» is only said)
  const domani = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  await pannello(page).getByLabel('Giorno della call').fill(domani)
  await pannello(page).getByLabel('Ora').fill('18:00')
  await pannello(page).getByTestId('azione-passo').click()

  // 5. La community in tre passi, while the coach confirms the call (1.84.0: the client does not wait)
  await vista(page, 'passo:community')
  await expect(pannello(page).getByTestId('community-intanto')).toBeVisible()
  await expect(page.getByTestId('azione-team')).toHaveText('Simula: il coach conferma la call di onboarding')
  await pannello(page).getByLabel('Il tuo username di Telegram').fill('mario_prova')
  await pannello(page).getByRole('button', { name: 'Salva lo username' }).click()
  await pannello(page).getByRole('button', { name: 'Ho inviato la richiesta' }).click()
  await pannello(page).getByRole('button', { name: 'Mi sono presentato' }).click()
  await vista(page, 'attesa:prenotazione')
  await page.getByTestId('azione-team').click()
  await expect(page.getByText(/Il cliente riceverebbe l’email «Tocca a te»/).first()).toBeVisible()
  await vista(page, 'attesa:call')

  // 6. The team: call done, goal set
  await page.getByTestId('azione-team').click()
  await vista(page, 'attesa:obiettivo')
  await page.getByTestId('azione-team').click()
  await vista(page, 'passo:obiettivo')
  await segnaVideoSeServe(page)
  await pannello(page).getByTestId('azione-passo').click()

  // 7. La settimana test: every item, then the coach confirms
  await vista(page, 'passo:test')
  const voci = pannello(page).getByTestId('voci-test').getByRole('checkbox')
  const quante = await voci.count()
  for (let i = 0; i < quante; i++) {
    await voci.nth(i).click()
    if (i === quante - 1) await pannello(page).getByTestId('test-conferma').getByRole('button', { name: 'Sì, invia' }).click()
  }
  await vista(page, 'attesa:test')
  await page.getByTestId('azione-team').click()
  await vista(page, 'attesa:programma')

  // 8. The programme delivered, watched, and the rocket
  await page.getByTestId('azione-team').click()
  await vista(page, 'passo:programma')
  await expect(pannello(page).getByTestId('consegne')).toBeVisible()
  await segnaVideoSeServe(page)
  await pannello(page).getByTestId('azione-passo').click()
  await vista(page, 'lancio')
  await expect(pannello(page).getByRole('heading', { level: 2 })).toContainText('Il tuo percorso è iniziato')
  await expect(pannello(page).getByTestId('dopo-lancio')).toBeVisible()

  // nothing was written
  expect(await conteggi()).toEqual(prima)
})

test('«Vai allo step», «Ricomincia» e il link del cliente con il codice di prova', async ({ page }) => {
  test.setTimeout(180_000)
  const prima = await conteggi()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await accedi(page, 'admin')
  await page.goto('/prova-onboarding')
  await expect(page.getByTestId('barra-prova')).toBeVisible({ timeout: 60_000 })

  await page.getByTestId('vai-allo-step').selectOption('lancio')
  await page.getByRole('button', { name: 'Vai', exact: true }).click()
  await vista(page, 'lancio')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await page.getByRole('button', { name: 'Ricomincia' }).click()
  await page.getByRole('button', { name: 'Tocca di nuovo per ricominciare' }).click()
  await vista(page, 'passo:benvenuto')

  // the page of the link and the registration: the code is on the bar, no email leaves
  await page.getByTestId('vedi-link').click()
  await expect(page).toHaveURL(/\/prova-onboarding\/link$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mario')
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByLabel('La tua email')).toHaveValue('mario.prova@example.test')
  await page.getByRole('button', { name: 'Inviami il codice' }).click()
  await expect(page.getByTestId('codice-prova')).toContainText('1234 5678')
  await page.getByRole('textbox', { name: 'Il codice' }).fill('00000000')
  await page.getByRole('button', { name: 'Entra nel percorso' }).click()
  await expect(page.getByText('Il codice non è corretto o è scaduto.', { exact: false }).first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Il codice' }).fill('12345678')
  await page.getByRole('button', { name: 'Entra nel percorso' }).click()
  await expect(page).toHaveURL(/\/prova-onboarding$/, { timeout: 20_000 })
  await vista(page, 'passo:benvenuto')

  expect(await conteggi()).toEqual(prima)
})

test('il setter non apre la prova', async ({ page }) => {
  await accedi(page, 'setter')
  await page.goto('/prova-onboarding')
  await expect(page).not.toHaveURL(/\/prova-onboarding/)
})
