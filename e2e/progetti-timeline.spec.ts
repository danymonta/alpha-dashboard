import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatData } from '../lib/format'
import { ID_ADMIN, ID_COACH, dbLocale } from './db'
import { attendiPagina } from './pm-db'
import { accedi } from './utenti'

/**
 * Timeline of the projects (05/10/2026): "Elenco | Timeline" on /progetti,
 * one bar per project ordered by end, "Oggi", "in scadenza" with icon and
 * words, a project opened on its dated lists and tasks, the table, the
 * filters, a coach who sees only his projects, no page scroll at 390px;
 * quarters fit a computer's width, months open on today and a project opened
 * out of sight scrolls to its lists; a client's path without a coach.
 * Fixtures in "Amministrazione", filtered by department: the other tests'
 * projects never get in the way.
 */
const PREFISSO = 'E2E Timeline '
const REPARTO = 'Amministrazione'

let repartoId: string
const id: Record<'alfa' | 'beta' | 'gamma' | 'delta' | 'epsilon', string> = {
  alfa: '',
  beta: '',
  gamma: '',
  delta: '',
  epsilon: '',
}

async function pulisci() {
  const { error } = await dbLocale().from('pm_progetti').delete().like('nome', `${PREFISSO}%`)
  if (error) throw error
}

test.beforeAll(async () => {
  await pulisci()
  const db = dbLocale()
  const oggi = oggiRoma()
  const giorno = (n: number) => aggiungiGiorni(oggi, n)

  const { data: reparto, error: e1 } = await db.from('pm_reparti').select('id').eq('nome', REPARTO).single()
  if (e1) throw e1
  repartoId = reparto.id

  const { data: progetti, error: e2 } = await db
    .from('pm_progetti')
    .insert(
      [
        // in scadenza: ends in 10 days
        { nome: `${PREFISSO}Alfa`, data_inizio: giorno(-60), data_fine: giorno(10), stato: 'attivo' as const },
        { nome: `${PREFISSO}Beta`, data_inizio: giorno(-10), data_fine: giorno(90), stato: 'attivo' as const },
        // past its end and still active: it should have finished
        { nome: `${PREFISSO}Gamma`, data_inizio: giorno(-100), data_fine: giorno(-3), stato: 'attivo' as const },
        // no end: listed apart
        { nome: `${PREFISSO}Delta`, data_inizio: giorno(-5), data_fine: null, stato: 'attivo' as const },
        { nome: `${PREFISSO}Epsilon`, data_inizio: giorno(-40), data_fine: giorno(20), stato: 'completato' as const },
      ].map((p) => ({ ...p, reparto_id: repartoId, created_by: ID_ADMIN })),
    )
    .select('id, nome')
  if (e2) throw e2
  for (const chiave of Object.keys(id) as (keyof typeof id)[]) {
    id[chiave] = progetti.find((p) => p.nome.toLowerCase() === `${PREFISSO}${chiave}`.toLowerCase())!.id
  }

  // the coach is in Beta only
  const { error: e3 } = await db.from('pm_membri').insert({ progetto_id: id.beta, profile_id: ID_COACH, aggiunto_da: ID_ADMIN })
  if (e3) throw e3

  const { data: lista, error: e4 } = await db
    .from('pm_tasklist')
    .insert({ progetto_id: id.alfa, nome: 'Fase uno', ordine: 1, data_inizio: giorno(-20), data_fine: giorno(5), created_by: ID_ADMIN })
    .select('id')
    .single()
  if (e4) throw e4
  const { error: e5 } = await db.from('pm_task').insert(
    [
      {
        progetto_id: id.alfa,
        tasklist_id: lista.id,
        titolo: 'Bozza del piano',
        ordine: 1,
        stato: 'completato' as const,
        data_inizio: giorno(-12),
        scadenza: giorno(-2),
        created_by: ID_ADMIN,
      },
      { progetto_id: id.alfa, tasklist_id: lista.id, titolo: 'Revisione finale', ordine: 2, scadenza: giorno(8), created_by: ID_ADMIN },
      // no dates: nothing to draw, it stays in its project
      { progetto_id: id.alfa, tasklist_id: lista.id, titolo: 'Idee sparse', ordine: 3, created_by: ID_ADMIN },
    ],
    { defaultToNull: false },
  )
  if (e5) throw e5
})

test.afterAll(async () => {
  await pulisci()
})

function righeDiProva(page: Page) {
  return page.getByTestId('timeline-grafico').getByTestId('timeline-progetto').filter({ hasText: PREFISSO })
}

async function senzaScrollOrizzontale(page: Page) {
  const [larghezza, visibile] = await page.evaluate(() => [
    document.scrollingElement!.scrollWidth,
    document.scrollingElement!.clientWidth,
  ])
  expect(larghezza).toBeLessThanOrEqual(visibile)
}

test('l’admin passa alla timeline: per fine, oggi, in scadenza, liste e attività, tabella e filtri', async ({ page }) => {
  const oggi = oggiRoma()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await accedi(page, 'admin')
  await page.goto(`/progetti?reparto=${repartoId}`)
  await attendiPagina(page)

  const vista = page.getByRole('group', { name: 'Vista dei progetti' })
  await expect(vista.getByRole('link', { name: 'Elenco' })).toHaveAttribute('aria-current', 'page')
  await vista.getByRole('link', { name: 'Timeline' }).click()
  await expect(page).toHaveURL(/vista=timeline/)
  // the filter came along
  expect(new URL(page.url()).searchParams.get('reparto')).toBe(repartoId)
  await expect(vista.getByRole('link', { name: 'Timeline' })).toHaveAttribute('aria-current', 'page')

  const grafico = page.getByTestId('timeline-grafico')
  await expect(grafico).toBeVisible()
  const reparto = grafico.getByTestId('timeline-reparto').first()
  await expect(reparto).toContainText(REPARTO)
  // the department counts all its projects, as the list does: those without an end are said apart
  const sulGrafico = await grafico.getByTestId('timeline-progetto').count()
  const senzaFine = await page.getByTestId('timeline-senza-fine').getByRole('listitem').count()
  await expect(reparto.getByTestId('timeline-reparto-quanti')).toHaveText(String(sulGrafico + senzaFine))
  await expect(reparto).toContainText(`${senzaFine} senza data di fine`)

  // one bar per project, the soonest end first; the completed one only with "Tutti"
  const righe = righeDiProva(page)
  await expect(righe).toHaveCount(3)
  await expect(righe.nth(0)).toContainText(`${PREFISSO}Gamma`)
  await expect(righe.nth(1)).toContainText(`${PREFISSO}Alfa`)
  await expect(righe.nth(2)).toContainText(`${PREFISSO}Beta`)
  await expect(grafico.getByRole('button', { name: new RegExp(`^${PREFISSO}(Alfa|Beta|Gamma):`) })).toHaveCount(3)

  // the name opens the project: a 44px target
  const link = righe.first().getByRole('link')
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  // the end in words; within 30 days with its icon and words, never colour alone
  const alfa = righe.filter({ hasText: `${PREFISSO}Alfa` })
  await expect(alfa.getByTestId('in-scadenza')).toHaveText('tra 10 giorni')
  await expect(alfa.getByTestId('in-scadenza').locator('svg')).toHaveCount(1)
  await expect(righe.filter({ hasText: `${PREFISSO}Beta` })).toContainText('tra 90 giorni')
  await expect(righe.filter({ hasText: `${PREFISSO}Beta` }).getByTestId('in-scadenza')).toHaveCount(0)
  await expect(righe.filter({ hasText: `${PREFISSO}Gamma` })).toContainText(`doveva finire il ${formatData(aggiungiGiorni(oggi, -3))}`)

  // "Oggi": the line and its label
  await expect(grafico.getByTestId('timeline-oggi')).toHaveCount(1)
  await expect(grafico.getByText('Oggi', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Finisce entro 30 giorni/)).toBeVisible()

  // without an end: apart
  await expect(page.getByTestId('timeline-senza-fine')).toContainText(`${PREFISSO}Delta`)
  await expect(righe.filter({ hasText: `${PREFISSO}Delta` })).toHaveCount(0)

  // a project opens on its dated lists and tasks; the undated task stays in its project.
  // Lists and tasks enter the legend with them
  await expect(grafico.getByTestId('timeline-lista')).toHaveCount(0)
  const legenda = page.getByRole('list', { name: 'Legenda' })
  await expect(legenda).not.toContainText('Lista (milestone)')
  const apri = grafico.getByRole('button', { name: `Liste e attività di ${PREFISSO}Alfa` })
  await apri.click()
  await expect(apri).toHaveAttribute('aria-expanded', 'true')
  await expect(grafico.getByTestId('timeline-lista')).toHaveCount(1)
  await expect(grafico.getByTestId('timeline-task')).toHaveCount(2)
  await expect(legenda).toContainText('Lista (milestone)')
  await expect(legenda).toContainText('Attività')
  const figli = grafico.getByTestId('timeline-figlio')
  await expect(figli).toHaveText(['Fase uno', 'Bozza del piano', 'Revisione finale'])
  await expect(grafico.getByRole('img', { name: 'Completata' })).toBeVisible()
  await expect(grafico.getByText('Idee sparse')).toHaveCount(0)
  // Beta has nothing dated inside: nothing to open
  await expect(grafico.getByRole('button', { name: `Liste e attività di ${PREFISSO}Beta` })).toHaveCount(0)
  await apri.click()
  await expect(grafico.getByTestId('timeline-figlio')).toHaveCount(0)

  // quarters by default: on a computer the whole window fits, nothing to scroll
  const scala = page.getByRole('group', { name: 'Scala' })
  await expect(scala.getByRole('button', { name: 'Trimestri' })).toHaveAttribute('aria-pressed', 'true')
  const asse = page.getByTestId('timeline-asse')
  const [contenuto, visibile] = await asse.evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(contenuto).toBeLessThanOrEqual(visibile + 1)
  // months to zoom in: the axis scrolls and opens on today, in the first half of the view
  await scala.getByRole('button', { name: 'Mesi' }).click()
  await expect(scala.getByRole('button', { name: 'Mesi' })).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() =>
      asse.evaluate((el) => {
        const oggi = el.querySelector<HTMLElement>('[data-testid="timeline-oggi"]')!
        const x = oggi.offsetLeft - el.scrollLeft
        return el.scrollWidth > el.clientWidth && x > 0 && x < el.clientWidth / 2
      }),
    )
    .toBe(true)

  // tooltip on the bar: dates, days left, tasks, and the way into the project
  await grafico.getByRole('button', { name: new RegExp(`^${PREFISSO}Alfa:`) }).hover()
  const tooltip = page.locator('[data-slot="popover-content"]')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText(formatData(aggiungiGiorni(oggi, 10)))
  await expect(tooltip).toContainText('tra 10 giorni')
  await expect(tooltip).toContainText('1 di 3 completate')
  await expect(tooltip.getByRole('link', { name: 'Apri il progetto' })).toHaveAttribute('href', `/progetti/${id.alfa}`)
  await page.mouse.move(0, 0)

  // the table: the chart's twin
  await page.getByRole('group', { name: 'Vista della timeline' }).getByRole('button', { name: 'Tabella' }).click()
  const tabella = page.getByTestId('timeline-tabella').locator('table')
  await expect(tabella).toBeVisible()
  await expect(tabella.getByRole('columnheader')).toHaveText(['Progetto', 'Reparto', 'Inizio', 'Fine', 'Giorni alla fine', 'Coach', 'Avanzamento'])
  const righeTabella = tabella.getByRole('row').filter({ hasText: PREFISSO })
  await expect(righeTabella).toHaveCount(4)
  await expect(righeTabella.nth(0)).toContainText(`${PREFISSO}Gamma`)
  await expect(righeTabella.nth(1)).toContainText(`${PREFISSO}Alfa`)
  await expect(righeTabella.nth(1)).toContainText(formatData(aggiungiGiorni(oggi, -60)))
  await expect(righeTabella.nth(2)).toContainText(`${PREFISSO}Beta`)
  await expect(righeTabella.nth(3)).toContainText(`${PREFISSO}Delta`)

  // the filters keep the view: "Tutti" brings in the completed project, faded and with its state in words
  await page.getByRole('group', { name: 'Vista della timeline' }).getByRole('button', { name: 'Grafico' }).click()
  await page.getByLabel('Stato').selectOption('tutti')
  await expect(page).toHaveURL(/stato=tutti/)
  expect(new URL(page.url()).searchParams.get('vista')).toBe('timeline')
  await attendiPagina(page)
  await expect(righeDiProva(page)).toHaveCount(4)
  await expect(righeDiProva(page).filter({ hasText: `${PREFISSO}Epsilon` })).toContainText('Completato')
  await expect(page.getByText('In pausa, completato o archiviato')).toBeVisible()

  // and back to the cards, filters included
  await page.getByRole('group', { name: 'Vista dei progetti' }).getByRole('link', { name: 'Elenco' }).click()
  await expect(page).not.toHaveURL(/vista=/)
  expect(new URL(page.url()).searchParams.get('stato')).toBe('tutti')
  await expect(page.getByTestId('timeline-grafico')).toHaveCount(0)
})

test('il coach vede solo i suoi progetti; a 390px la pagina non scorre di lato, il grafico sì', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'coach')
  await page.goto(`/progetti?vista=timeline&reparto=${repartoId}`)
  await attendiPagina(page)

  const righe = righeDiProva(page)
  await expect(righe).toHaveCount(1)
  await expect(righe).toContainText(`${PREFISSO}Beta`)
  await expect(page.getByText(`${PREFISSO}Delta`)).toHaveCount(0)
  // a coach is a manager: no "Solo i miei", the switch on its own row
  await expect(page.getByRole('button', { name: 'Solo i miei' })).toHaveCount(0)

  await senzaScrollOrizzontale(page)
  const asse = page.getByTestId('timeline-asse')
  const [contenuto, visibile] = await asse.evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(contenuto).toBeGreaterThan(visibile)
  // the name column link opens the project
  await righe.getByRole('link', { name: new RegExp(`${PREFISSO}Beta`) }).click()
  await expect(page).toHaveURL(new RegExp(`/progetti/${id.beta}`))
})

test('a 390px l’admin apre un progetto e legge la tabella a schede, senza scroll di lato', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await accedi(page, 'admin')
  await page.goto(`/progetti?vista=timeline&reparto=${repartoId}`)
  await attendiPagina(page)

  const vista = page.getByRole('group', { name: 'Vista dei progetti' })
  await expect(vista).toBeVisible()
  const box = await vista.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)

  // by month the view opens on today: the list "Fase uno" (from 20 days ago) is out of
  // sight on the left, and opening the project brings it in
  await page.getByRole('group', { name: 'Scala' }).getByRole('button', { name: 'Mesi' }).click()
  await page.getByRole('button', { name: `Liste e attività di ${PREFISSO}Alfa` }).click()
  await expect(page.getByTestId('timeline-figlio')).toHaveCount(3)
  const asse = page.getByTestId('timeline-asse')
  const lista = page.getByTestId('timeline-lista')
  await expect
    .poll(async () => {
      const [a, l] = [await asse.boundingBox(), await lista.boundingBox()]
      return !!a && !!l && l.x >= a.x - 1 && l.x < a.x + a.width
    })
    .toBe(true)
  await senzaScrollOrizzontale(page)

  await page.getByRole('group', { name: 'Vista della timeline' }).getByRole('button', { name: 'Tabella' }).click()
  const schede = page.getByTestId('timeline-tabella').getByRole('listitem').filter({ hasText: PREFISSO })
  await expect(schede).toHaveCount(4)
  await expect(schede.filter({ hasText: `${PREFISSO}Alfa` })).toContainText('tra 10 giorni')
  await expect(schede.filter({ hasText: `${PREFISSO}Delta` })).toContainText('senza data di fine')
  await senzaScrollOrizzontale(page)
})

test('il percorso di un cliente senza coach ha il suo segno accanto alla fine', async ({ page }) => {
  // one of the client projects already in the database (one per paying client): running, no coach
  const { data: progetti, error } = await dbLocale()
    .from('pm_progetti')
    .select('id, nome, reparto_id')
    .not('client_id', 'is', null)
    .is('coach_id', null)
    .eq('stato', 'attivo')
    .gt('data_fine', oggiRoma())
    .limit(1)
  if (error) throw error
  test.skip(progetti.length === 0, 'nessun percorso di un cliente senza coach nel database locale')
  const progetto = progetti[0]

  await page.setViewportSize({ width: 1440, height: 1000 })
  await accedi(page, 'admin')
  await page.goto(`/progetti?vista=timeline&reparto=${progetto.reparto_id}`)
  await attendiPagina(page)

  const riga = page.locator(`[data-testid="timeline-riga-asse"][data-progetto="${progetto.id}"]`)
  await expect(riga.getByTestId('timeline-senza-coach')).toHaveCount(1)
  // icon beside the date, words in the bar's label and in the legend
  await expect(riga.getByTestId('timeline-barra')).toHaveAttribute('aria-label', /, senza coach$/)
  await expect(page.getByRole('list', { name: 'Legenda' })).toContainText('Percorso senza coach')
})
