import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, giornoEsteso, oggiRoma } from '../lib/date'
import { ID_ADMIN, ID_COACH, PRODOTTO_3_MESI, dbLocale, pulisciVendite } from './db'
import { accedi } from './utenti'

// A coach tracks his time through Alfire on a client's project (Dany, 03/10/2026:
// "i collaboratori che vogliono chiedere ad Alfire di tracciare il tempo"): the
// project is the client's name, the task said in his own words, every write
// behind the confirmation card. Runs against the fake model (e2e/llm-finto.mjs):
// the dev server must start with ALFIRE_API_KEY=finta
// ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and E2E_ALFIRE_FINTO=1 here.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

const LLM_FINTO = `http://127.0.0.1:${process.env.PORTA_LLM_FINTO ?? 4010}`
// one word: the client's first name keeps it, and pulisciVendite finds it (its project included)
const PREFISSO = 'E2EAlfireCoach'

type Richiesta = { tools?: { function?: { name?: string; parameters?: { properties?: Record<string, unknown> } } }[] }

async function ultimaRichiesta(): Promise<Richiesta> {
  const { chat } = (await (await fetch(`${LLM_FINTO}/__ultime`)).json()) as { chat: Richiesta | null }
  if (!chat) throw new Error('Il modello finto non ha ricevuto richieste')
  return chat
}

/**
 * A paying client: a "nuovo" sale under way and its first instalment cashed,
 * which opens the client's project with the 8 tasks of the path (02/10/2026).
 * Then the coach, as «Scegli il coach» leaves it: member, assignee, coach_id.
 */
async function clienteDelCoach(
  { cognome = 'Bellini', conCoach = true }: { cognome?: string; conCoach?: boolean } = {},
): Promise<{ progetto: { id: string; nome: string }; task: Map<string, string> }> {
  const db = dbLocale()
  const oggi = oggiRoma()
  const { data: cliente, error: e1 } = await db
    .from('clients')
    .insert({ nome: `${PREFISSO}${Date.now()}`, cognome, fonte: 'referral', closer_id: ID_ADMIN })
    .select('id')
    .single()
  if (e1) throw e1
  const { data: vendita, error: e2 } = await db
    .from('sales')
    .insert({
      client_id: cliente.id,
      product_id: PRODOTTO_3_MESI,
      tipo: 'nuovo',
      closer_id: ID_ADMIN,
      data_vendita: aggiungiGiorni(oggi, -7),
      data_inizio: aggiungiGiorni(oggi, -7),
      data_fine: aggiungiGiorni(oggi, 80),
      valore_contratto: 1500,
      numero_rate: 1,
    })
    .select('id')
    .single()
  if (e2) throw e2
  const { error: e3 } = await db
    .from('payments')
    .update({ stato: 'incassata', incassato_il: oggi, importo_incassato: 1500, metodo: 'bonifico' })
    .eq('sale_id', vendita.id)
    .eq('numero_rata', 1)
  if (e3) throw e3

  const { data: progetto, error: e4 } = await db.from('pm_progetti').select('id, nome').eq('client_id', cliente.id).single()
  if (e4) throw e4
  const { data: task, error: e5 } = await db.from('pm_task').select('id, titolo').eq('progetto_id', progetto.id)
  if (e5) throw e5
  expect(task).toHaveLength(8)
  if (!conCoach) return { progetto, task: new Map(task.map((t) => [t.titolo, t.id])) }

  const { error: e6 } = await db.from('pm_membri').insert({ progetto_id: progetto.id, profile_id: ID_COACH, aggiunto_da: ID_ADMIN })
  if (e6) throw e6
  const { error: e7 } = await db
    .from('pm_task_assegnatari')
    .insert(task.map((t) => ({ task_id: t.id, profile_id: ID_COACH, created_by: ID_ADMIN })))
  if (e7) throw e7
  const { error: e8 } = await db.from('pm_progetti').update({ coach_id: ID_COACH }).eq('id', progetto.id)
  if (e8) throw e8

  return { progetto, task: new Map(task.map((t) => [t.titolo, t.id])) }
}

async function scrivi(page: Page, testo: string) {
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill(testo)
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  return pannello
}

async function vociDelCoach(progettoId: string) {
  const { data, error } = await dbLocale()
    .from('pm_tempo')
    .select('profile_id, task_id, data, minuti, nota, inizio, fine')
    .eq('progetto_id', progettoId)
    .order('created_at')
  if (error) throw error
  return data
}

test.describe('il coach registra il suo tempo con Alfire', () => {
  test.afterEach(async () => {
    await pulisciVendite(PREFISSO)
  })

  test('avvia e ferma il timer sul progetto del cliente, sempre dopo la conferma', async ({ page }) => {
    const { progetto, task } = await clienteDelCoach()
    await accedi(page, 'coach')
    await page.getByRole('button', { name: 'Chatta con Alfire' }).click()

    // the chat greets a coach with his own time, never with "numbers"
    const pannello = page.getByTestId('alfire')
    await expect(pannello.getByRole('group', { name: 'Domande suggerite' })).toContainText('Quanto tempo ho registrato questa settimana?')

    await scrivi(page, `Avvia il timer su ${progetto.nome}, la revisione dei video`)
    const avvio = pannello.getByTestId('alfire-conferma')
    // the task said in his words is the task of the path; the project is the client's
    await expect(avvio).toContainText(`Avvio il timer su «${progetto.nome}» · Revisione video`)
    expect(await vociDelCoach(progetto.id)).toEqual([])

    // what the coach's Alfire was given: his time, never money or someone else's time
    const strumenti = ((await ultimaRichiesta()).tools ?? []).map((t) => t.function?.name)
    expect(strumenti).toEqual(expect.arrayContaining(['tempo', 'mio_tempo', 'miei_task', 'task']))
    for (const vietato of ['tempo_team', 'rata', 'cliente', 'registra_vendita', 'numeri_periodo', 'costo']) {
      expect(strumenti, vietato).not.toContain(vietato)
    }

    await avvio.getByRole('button', { name: 'Conferma' }).click()
    await expect(pannello.getByText('Fatto: tempo.')).toBeVisible()
    const acceso = await vociDelCoach(progetto.id)
    expect(acceso).toEqual([
      expect.objectContaining({ profile_id: ID_COACH, task_id: task.get('Revisione video'), minuti: null, fine: null }),
    ])

    await scrivi(page, 'Ferma il timer: rivisti tre video')
    const fermo = pannello.getByTestId('alfire-conferma').last()
    await expect(fermo).toContainText(`Fermo il timer su «${progetto.nome}» · Revisione video`)
    await expect(fermo).toContainText(/Acceso dalle \d{2}:\d{2}, finora/)
    await expect(fermo).toContainText('Nota: rivisti tre video')
    await fermo.getByRole('button', { name: 'Conferma' }).click()
    await expect(pannello.getByText('Fatto: tempo.')).toHaveCount(2)

    const [voce] = await vociDelCoach(progetto.id)
    expect(voce).toMatchObject({ profile_id: ID_COACH, task_id: task.get('Revisione video'), nota: 'rivisti tre video' })
    expect(voce.fine).not.toBeNull()
    expect(voce.minuti).toBeGreaterThanOrEqual(1)
  })

  test('registra una fascia di ieri: la scheda dice del tuo tempo, il giorno col suo nome, la fascia e il task', async ({ page }) => {
    const { progetto, task } = await clienteDelCoach()
    const ieri = aggiungiGiorni(oggiRoma(), -1)
    await accedi(page, 'coach')
    await page.getByRole('button', { name: 'Chatta con Alfire' }).click()

    const pannello = await scrivi(page, `Registra ieri dalle 9 alle 10:30 su ${progetto.nome}, le call di check`)
    const scheda = pannello.getByTestId('alfire-conferma')
    await expect(scheda).toContainText(`Registro 1 h 30 min del tuo tempo su «${progetto.nome}», ${giornoEsteso(ieri)}`)
    await expect(scheda).toContainText('Fascia: 09:00–10:30')
    await expect(scheda).toContainText('Task: Call di check')

    // the time tool the model saw: a task_id for titles every client has, no field for another person
    const tempo = ((await ultimaRichiesta()).tools ?? []).find((t) => t.function?.name === 'tempo')
    const campi = Object.keys(tempo?.function?.parameters?.properties ?? {})
    expect(campi).toEqual(expect.arrayContaining(['progetto', 'task', 'task_id', 'nuovo_task', 'dalle', 'alle']))
    expect(campi).not.toContain('persona')

    expect(await vociDelCoach(progetto.id)).toEqual([])
    await scheda.getByRole('button', { name: 'Conferma' }).click()
    await expect(pannello.getByText('Fatto: tempo.')).toBeVisible()
    expect(await vociDelCoach(progetto.id)).toEqual([
      expect.objectContaining({ profile_id: ID_COACH, task_id: task.get('Call di check'), data: ieri, minuti: 90 }),
    ])
  })

  test('il progetto di un cliente che non segue: niente da confermare, gli dice chi può aggiungerlo', async ({ page }) => {
    const { progetto } = await clienteDelCoach({ cognome: 'Zanardelli', conCoach: false })
    await accedi(page, 'coach')
    await page.getByRole('button', { name: 'Chatta con Alfire' }).click()

    const pannello = await scrivi(page, `Avvia il timer su ${progetto.nome}, la revisione dei video`)
    const scheda = pannello.getByTestId('alfire-conferma')
    // plain words for him, never his list of projects nor whether that client exists
    // (the fake model passes the name as it reads the question: lower case)
    await expect(scheda).toContainText(`Non l’ho fatto: Non sei in un progetto "${progetto.nome.toLowerCase()}": vedi solo quelli di cui fai parte.`)
    await expect(scheda).toContainText('Se è il progetto di un cliente, chi lo gestisce può aggiungerti.')
    await expect(scheda).not.toContainText('Chiedi')
    await expect(scheda.getByRole('button', { name: 'Conferma' })).toHaveCount(0)
    expect(await vociDelCoach(progetto.id)).toEqual([])
  })
})
