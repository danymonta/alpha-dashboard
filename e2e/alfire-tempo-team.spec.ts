import { expect, test, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { formatDurata } from '../lib/tempo'
import { ID_ADMIN, ID_SETTER, dbLocale } from './db'
import { creaProgettoDiProva, pulisciProgetti, type ProgettoDiProva } from './pm-db'
import { UTENTI, accedi, type RuoloSeed } from './utenti'

// Someone else's time in Alfire (Dany's chat of 30/09/2026: asked about Loris,
// Alfire read Dany's own time and answered "Loris ha registrato 2 ore"). Runs
// against the fake model (e2e/llm-finto.mjs): the dev server must start with
// ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1 and
// E2E_ALFIRE_FINTO=1 here. GET /__ultime gives back the last request, with
// the tools it carried and what they read.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

const LLM_FINTO = `http://127.0.0.1:${process.env.PORTA_LLM_FINTO ?? 4010}`
// not "E2E Tempo " nor "E2E Team tempo ": the other time specs clean those prefixes
const PREFISSO = 'E2E Alfire tempo '

/** "Negli ultimi 7 giorni": today and the six days before, as the fake model asks. */
const OGGI = oggiRoma()
const DA = aggiungiGiorni(OGGI, -6)

type Messaggio = {
  role: string
  content?: string | { text?: string }[] | null
  tool_call_id?: string
  tool_calls?: { function: { name: string; arguments: string } }[]
}
type Richiesta = { messages: Messaggio[]; tools?: { function?: { name?: string } }[] }

async function ultimaRichiesta(): Promise<Richiesta> {
  const { chat } = (await (await fetch(`${LLM_FINTO}/__ultime`)).json()) as { chat: Richiesta | null }
  if (!chat) throw new Error('Il modello finto non ha ricevuto richieste')
  return chat
}

function strumentiDi(r: Richiesta): string[] {
  return (r.tools ?? []).map((t) => t.function?.name ?? '')
}

/** What a tool read, as the model received it. */
function letto(r: Richiesta, strumento: string): Record<string, unknown> {
  const m = r.messages.find((x) => x.role === 'tool' && x.tool_call_id === `call_${strumento}`)
  if (!m) throw new Error(`Nessun risultato di ${strumento}`)
  const testo = typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join('')
  return JSON.parse(testo) as Record<string, unknown>
}

/** The arguments the model called a tool with. */
function argomenti(r: Richiesta, strumento: string): unknown {
  const chiamata = r.messages.flatMap((m) => m.tool_calls ?? []).find((c) => c.function.name === strumento)
  return chiamata ? JSON.parse(chiamata.function.arguments) : undefined
}

/** Minutes of a person in the period, straight from the table: what pm_tempo_per_persona must give. */
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

async function chiedi(page: Page, ruolo: RuoloSeed, testo: string) {
  await accedi(page, ruolo)
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill(testo)
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  return pannello
}

test.describe('Alfire e il tempo delle persone', () => {
  let progetto: ProgettoDiProva

  test.beforeEach(async () => {
    await pulisciProgetti(PREFISSO)
    progetto = await creaProgettoDiProva(`${PREFISSO}${Date.now()}`)
    const ieri = aggiungiGiorni(OGGI, -1)
    const { error } = await dbLocale()
      .from('pm_tempo')
      .insert([
        // the setter: two tasks and an entry without a task
        { profile_id: ID_SETTER, progetto_id: progetto.id, task_id: progetto.task.montaggio, data: OGGI, minuti: 150, nota: 'Montaggio E2E' },
        { profile_id: ID_SETTER, progetto_id: progetto.id, task_id: progetto.task.revisione, data: ieri, minuti: 30 },
        { profile_id: ID_SETTER, progetto_id: progetto.id, data: ieri, minuti: 20 },
        // the admin's own two hours: never the answer about the setter
        { profile_id: ID_ADMIN, progetto_id: progetto.id, task_id: progetto.task.brief, data: OGGI, minuti: 120, nota: 'Call di allineamento' },
      ])
    if (error) throw error
  })

  test.afterEach(async () => {
    await pulisciProgetti(PREFISSO)
  })

  test('l’admin chiede il tempo di Loris: Alfire legge il tempo del team, mai il suo', async ({ page }) => {
    const attesi = await minutiNelPeriodo(ID_SETTER)
    const suoi = await minutiNelPeriodo(ID_ADMIN)
    // the bug of 30/09/2026 would show the admin's minutes: the two must differ to tell
    expect(attesi).not.toBe(suoi)

    const pannello = await chiedi(page, 'admin', 'Quanto tempo ha tracciato Loris negli ultimi 7 giorni? E su che attività?')
    await expect(pannello.getByText('Ho letto il tempo del team')).toBeVisible()
    await expect(pannello.getByText(`${UTENTI.setter.nome} ha registrato ${formatDurata(attesi)} dal ${DA} al ${OGGI}`)).toBeVisible()
    await expect(pannello.getByText('Ho letto il tuo tempo')).toHaveCount(0)

    const richiesta = await ultimaRichiesta()
    expect(strumentiDi(richiesta)).toContain('tempo_team')
    expect(argomenti(richiesta, 'tempo_team')).toEqual({ persona: 'loris', ultimi_giorni: 7 })

    // what the model read: Loris's total from pm_tempo_per_persona, with its projects and tasks
    const tempo = letto(richiesta, 'tempo_team') as {
      periodo: unknown
      persona: string
      totale: { minuti: number }
      persone: { persona: string; minuti: number; durata: string; progetti: { progetto: string; task: { task: string; minuti: number }[] }[] }[]
    }
    expect(tempo).toMatchObject({ periodo: { da: DA, a: OGGI }, persona: UTENTI.setter.nome, totale: { minuti: attesi } })
    expect(tempo.persone).toHaveLength(1)
    expect(tempo.persone[0]).toMatchObject({ persona: UTENTI.setter.nome, minuti: attesi, durata: formatDurata(attesi) })
    const suProgetto = tempo.persone[0].progetti.find((g) => g.progetto === progetto.nome)
    expect(suProgetto?.task).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ task: 'Montaggio', minuti: 150 }),
        expect.objectContaining({ task: 'Revisione cliente', minuti: 30 }),
        expect.objectContaining({ task: 'senza task', minuti: 20 }),
      ]),
    )
    // nothing of the admin's own time
    expect(JSON.stringify(tempo)).not.toContain(UTENTI.admin.nome)
    expect(JSON.stringify(tempo)).not.toContain('Call di allineamento')
  })

  test('il setter chiede il tempo di Lorenzo: niente tempo del team, e Alfire dice che non può leggerlo', async ({ page }) => {
    const pannello = await chiedi(page, 'setter', 'Quanto tempo ha tracciato Lorenzo negli ultimi 7 giorni?')
    await expect(pannello.getByText('Ho letto il tuo tempo')).toBeVisible()
    await expect(
      pannello.getByText(`Non posso leggere il tempo di Lorenzo: questi sono i dati di ${UTENTI.setter.nome}, cioè di chi sta chattando.`),
    ).toBeVisible()

    const richiesta = await ultimaRichiesta()
    expect(strumentiDi(richiesta)).not.toContain('tempo_team')
    expect(strumentiDi(richiesta)).toContain('mio_tempo')
    // his own time says whose it is, first
    const mio = letto(richiesta, 'mio_tempo')
    expect(Object.keys(mio).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(mio).toMatchObject({
      persona: UTENTI.setter.nome,
      di_chi: `Questi sono i dati di ${UTENTI.setter.nome}, cioè di chi sta chattando: mai di un’altra persona.`,
      periodo: { da: DA, a: OGGI },
    })
  })
})
