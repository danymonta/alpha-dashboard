import { expect, test, type Locator, type Page } from '@playwright/test'

import { aggiungiGiorni, formatOra, oggiRoma } from '../lib/date'
import { formatDurata } from '../lib/tempo'
import { ID_CLOSER, ID_SETTER, dbLocale } from './db'
import {
  attendiPagina,
  avviaTimerAltrove,
  creaProgettoDiProva,
  fermaTimerAltrove,
  pulisciProgetti,
  type ProgettoDiProva,
} from './pm-db'
import { UTENTI, accedi } from './utenti'

// not "E2E Tempo ": tempo.spec.ts cleans that prefix and may run next to this one
const PREFISSO = 'E2E Team tempo '

/** The last seven days: the fixtures below all fall inside, whatever the day of the month. */
const OGGI = oggiRoma()
const DA = aggiungiGiorni(OGGI, -6)
const PERIODO = `da=${DA}&a=${OGGI}`

/** Minutes of a person in the period, straight from the table: what the page must show. */
async function minutiNelPeriodo(profileId: string): Promise<number> {
  const { data, error } = await dbLocale()
    .from('pm_tempo')
    .select('minuti, inizio, fine')
    .eq('profile_id', profileId)
    .not('minuti', 'is', null)
    .gte('data', DA)
    .lte('data', OGGI)
  if (error) throw error
  return data.filter((r) => !(r.inizio && !r.fine)).reduce((somma, r) => somma + (r.minuti ?? 0), 0)
}

function card(page: Page, nome: string): Locator {
  return page.getByTestId('persona-tempo').filter({ has: page.locator('h3', { hasText: nome }) })
}

async function nomiInOrdine(page: Page): Promise<string[]> {
  return page.getByTestId('persona-tempo').locator('h3').allInnerTexts()
}

test.describe('Tempo del team', () => {
  let progetto: ProgettoDiProva
  let timer: { inizio: string; fine: string }

  test.beforeEach(async () => {
    await pulisciProgetti(PREFISSO)
    progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)

    // the setter: 90 min typed today on "Montaggio", and a stopped timer of 45 min a day ago
    const inizio = new Date(Date.now() - 26 * 3_600_000)
    const fine = new Date(inizio.getTime() + 45 * 60_000)
    timer = { inizio: inizio.toISOString(), fine: fine.toISOString() }
    const { error } = await dbLocale()
      .from('pm_tempo')
      .insert([
        {
          profile_id: ID_SETTER,
          progetto_id: progetto.id,
          task_id: progetto.task.montaggio,
          data: OGGI,
          minuti: 90,
          nota: 'Montaggio della puntata',
        },
        { profile_id: ID_SETTER, progetto_id: progetto.id, data: OGGI, inizio: timer.inizio, fine: timer.fine, minuti: 45 },
        // the closer: 30 min typed today, without a task
        { profile_id: ID_CLOSER, progetto_id: progetto.id, data: OGGI, minuti: 30 },
      ])
    if (error) throw error
    // and a timer of the closer still running: it must never show
    await avviaTimerAltrove(ID_CLOSER, progetto.id, 20)
  })

  test.afterEach(async () => {
    await fermaTimerAltrove(ID_CLOSER)
    await pulisciProgetti(PREFISSO)
  })

  test('l’admin passa a Team, vede chi ha registrato cosa, filtra per progetto e apre le voci', async ({ page }) => {
    await accedi(page, 'admin')
    await page.goto('/tempo')
    await attendiPagina(page)

    // the two tabs, "Il mio tempo" first
    const schede = page.getByRole('navigation', { name: 'Il mio tempo e il team' })
    await expect(schede.getByRole('link', { name: 'Il mio tempo' })).toHaveAttribute('aria-current', 'page')
    await schede.getByRole('link', { name: 'Team' }).click()
    await page.waitForURL('**/tempo/team')
    await expect(page.getByRole('heading', { name: 'Tempo del team' })).toBeVisible()
    await expect(schede.getByRole('link', { name: 'Team' })).toHaveAttribute('aria-current', 'page')

    // everyone, the last seven days: the two seed people, with the totals of the table
    await page.goto(`/tempo/team?${PERIODO}`)
    await attendiPagina(page)
    for (const [ruolo, id] of [
      ['setter', ID_SETTER],
      ['closer', ID_CLOSER],
    ] as const) {
      await expect(card(page, UTENTI[ruolo].nome).getByTestId('totale-persona')).toHaveText(
        `Totale: ${formatDurata(await minutiNelPeriodo(id))}`,
      )
    }
    // alphabetical, never by hours
    const nomi = await nomiInOrdine(page)
    expect(nomi).toEqual([...nomi].sort((x, y) => x.localeCompare(y, 'it')))

    // one project: only who worked on it, with its minutes
    await page.locator('#filtro-progetto').selectOption({ label: progetto.nome })
    await page.waitForURL(new RegExp(`progetto=${progetto.id}`))
    await attendiPagina(page)
    await expect(page.getByTestId('persona-tempo').locator('h3')).toHaveText([UTENTI.closer.nome, UTENTI.setter.nome])
    await expect(card(page, UTENTI.closer.nome).getByTestId('totale-persona')).toHaveText('Totale: 30 min')
    await expect(card(page, UTENTI.setter.nome).getByTestId('totale-persona')).toHaveText('Totale: 2 h 15 min')
    const totale = page.getByTestId('totale-team')
    await expect(totale).toContainText(`su ${progetto.nome}`)
    await expect(totale).toContainText('2 h 45 min')
    await expect(totale).toContainText('3 voci')

    // the setter: per project and task, then the entries
    const setter = card(page, UTENTI.setter.nome)
    await setter.locator('summary').first().click()
    const perProgetto = setter.getByTestId('per-progetto')
    await expect(perProgetto.getByTestId('riga-progetto').filter({ visible: true })).toContainText(['2 h 15 min'])
    await expect(perProgetto.getByTestId('riga-task').filter({ visible: true })).toHaveText([
      /Montaggio.*1 h 30 min/,
      /Senza attività.*45 min/,
    ])

    const voci = setter.getByTestId('voci-persona')
    await voci.locator('summary').click()
    const righe = voci.getByTestId('voce-team').filter({ visible: true })
    await expect(righe).toHaveCount(2)
    // newest first: today's typed minutes (no range), then yesterday's timer with its range
    await expect(righe.nth(0)).not.toContainText(/\d\d:\d\d–\d\d:\d\d/)
    await expect(righe.nth(0)).toContainText(`${progetto.nome} › Montaggio`)
    await expect(righe.nth(0)).toContainText('Montaggio della puntata')
    await expect(righe.nth(0)).toContainText('1 h 30 min')
    await expect(righe.nth(1)).toContainText(`${formatOra(timer.inizio)}–${formatOra(timer.fine)}`)
    await expect(righe.nth(1)).toContainText('45 min')

    // the closer's running timer is nowhere: one entry, the 30 minutes typed
    const closer = card(page, UTENTI.closer.nome)
    await expect(closer).toContainText('1 voce')
    await closer.locator('summary').first().click()
    await closer.getByTestId('voci-persona').locator('summary').click()
    await expect(closer.getByTestId('voce-team').filter({ visible: true })).toHaveCount(1)

    // one person: just that card, already open
    await page.locator('#filtro-persona').selectOption({ label: UTENTI.setter.nome })
    await page.waitForURL(/persona=/)
    await attendiPagina(page)
    await expect(page.getByTestId('persona-tempo')).toHaveCount(1)
    await expect(page.getByTestId('persona-tempo')).toHaveAttribute('open', '')
    await expect(page.getByTestId('totale-team')).toHaveCount(0)
  })

  test('sul telefono: card, voci leggibili e nessuno scroll orizzontale', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await accedi(page, 'admin')
    await page.goto(`/tempo/team?${PERIODO}&progetto=${progetto.id}`)
    await attendiPagina(page)

    const setter = card(page, UTENTI.setter.nome)
    await setter.locator('summary').first().click()
    await setter.getByTestId('voci-persona').locator('summary').click()
    const righe = setter.getByTestId('voce-team').filter({ visible: true })
    await expect(righe).toHaveCount(2)
    await expect(righe.first()).toContainText('Montaggio della puntata')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('coach e setter non aprono il tempo del team, e non vedono la scheda', async ({ page }) => {
    await accedi(page, 'coach')
    await page.goto('/tempo/team')
    await page.waitForURL('**/task')
    await page.goto('/tempo')
    await attendiPagina(page)
    await expect(page.getByRole('heading', { name: 'Il mio tempo' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Il mio tempo e il team' })).toHaveCount(0)

    await page.context().clearCookies()
    await accedi(page, 'setter')
    await page.goto('/tempo/team')
    await page.waitForURL('**/today')
  })
})
