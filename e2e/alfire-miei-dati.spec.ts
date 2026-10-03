import { expect, test, type Page } from '@playwright/test'

import { oggiRoma } from '../lib/date'
import { ID_ADMIN, ID_CLOSER, ID_COACH, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { UTENTI, accedi, type RuoloSeed } from './utenti'

// Each one's own data in Alfire (Dany, 03/10/2026): a coach asks his time on
// one task of a client; the setter where the clients he brought are with their
// instalments; the closer what is left to collect on his sales (the questions
// the empty chat suggests them). Only theirs, the fields the app shows them, and
// whose data first. Runs against the fake model (e2e/llm-finto.mjs): the dev
// server must start with ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1
// (or PORTA_LLM_FINTO) and E2E_ALFIRE_FINTO=1 here.
test.skip(!process.env.E2E_ALFIRE_FINTO, 'serve il modello finto: vedi e2e/llm-finto.mjs')

const LLM_FINTO = `http://127.0.0.1:${process.env.PORTA_LLM_FINTO ?? 4010}`
// one word: the client's first name keeps it, and pulisciVendite finds it (its project included)
const PREFISSO = 'E2EAlfireDati'

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

async function chiedi(page: Page, ruolo: RuoloSeed, testo: string) {
  await accedi(page, ruolo)
  await page.getByRole('button', { name: 'Chatta con Alfire' }).click()
  const pannello = page.getByTestId('alfire')
  await pannello.getByLabel('Scrivi ad Alfire').fill(testo)
  await pannello.getByLabel('Scrivi ad Alfire').press('Enter')
  return pannello
}

/** Never in what a collaborator reads: contacts, payment method, notes, the rule's rate. */
function senzaDatiRiservati(dati: unknown) {
  const testo = JSON.stringify(dati)
  for (const vietato of ['telefono', 'email', 'instagram', 'metodo', 'bonifico', 'percentuale', 'Nota riservata']) {
    expect(testo, vietato).not.toContain(vietato)
  }
}

/** The first instalment of a sale, cashed today. */
async function incassaPrimaRata(saleId: string, importo: number) {
  const { error } = await dbLocale()
    .from('payments')
    .update({ stato: 'incassata', incassato_il: oggiRoma(), importo_incassato: importo, metodo: 'bonifico' })
    .eq('sale_id', saleId)
    .eq('numero_rata', 1)
  if (error) throw error
}

test.describe('Alfire e i dati di chi chatta', () => {
  test.afterEach(async () => {
    await pulisciVendite(PREFISSO)
  })

  test('il coach chiede quanto ha dedicato alla revisione video di un cliente: solo il suo tempo, su quel task', async ({ page }) => {
    const db = dbLocale()
    const oggi = oggiRoma()
    // a paying client: the first instalment cashed opens the client's project with the 8 tasks of the path
    const vendita = await creaVenditaDiProva(`${PREFISSO}${Date.now()}`, ID_ADMIN, { valore: 1500, rate: 1, giorniFa: 3 })
    await incassaPrimaRata(vendita, 1500)
    const { data: v } = await db.from('sales').select('client_id').eq('id', vendita).single()
    const { data: progetto, error: e1 } = await db.from('pm_progetti').select('id, nome').eq('client_id', v!.client_id).single()
    if (e1) throw e1
    const { data: task, error: e2 } = await db.from('pm_task').select('id, titolo').eq('progetto_id', progetto.id)
    if (e2) throw e2
    const revisione = task.find((t) => t.titolo === 'Revisione video')!.id
    const check = task.find((t) => t.titolo === 'Call di check')!.id
    const { error: e3 } = await db.from('pm_membri').insert({ progetto_id: progetto.id, profile_id: ID_COACH, aggiunto_da: ID_ADMIN })
    if (e3) throw e3
    const { error: e4 } = await db.from('pm_tempo').insert([
      // the coach: 50 + 25 minutes on the video review, 30 on a check call
      { profile_id: ID_COACH, progetto_id: progetto.id, task_id: revisione, data: oggi, minuti: 50, nota: 'Tre video' },
      { profile_id: ID_COACH, progetto_id: progetto.id, task_id: revisione, data: oggi, minuti: 25 },
      { profile_id: ID_COACH, progetto_id: progetto.id, task_id: check, data: oggi, minuti: 30 },
      // the admin on the same task: never in the coach's answer
      { profile_id: ID_ADMIN, progetto_id: progetto.id, task_id: revisione, data: oggi, minuti: 120 },
    ])
    if (e4) throw e4

    const pannello = await chiedi(page, 'coach', `Quanto ho dedicato alla revisione video di ${progetto.nome} questo mese?`)
    await expect(pannello.getByText('Ho letto il tuo tempo')).toBeVisible()
    await expect(pannello.getByText(`Su Revisione video di ${progetto.nome} hai registrato 1 h 15 min.`)).toBeVisible()

    const richiesta = await ultimaRichiesta()
    expect(strumentiDi(richiesta)).toContain('mio_tempo')
    const tempo = letto(richiesta, 'mio_tempo') as {
      persona: string
      solo: unknown
      totale: { minuti: number; voci: number }
      per_task: { progetto: string; task: string; minuti: number }[]
      voci: { minuti: number }[]
    }
    // whose time, first; then only that task, counted in SQL
    expect(Object.keys(tempo).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(tempo.persona).toBe(UTENTI.coach.nome)
    expect(tempo.solo).toEqual({ progetto: progetto.nome, task: 'Revisione video' })
    expect(tempo.totale).toMatchObject({ minuti: 75, voci: 2 })
    expect(tempo.per_task).toEqual([expect.objectContaining({ progetto: progetto.nome, task: 'Revisione video', minuti: 75 })])
    expect(tempo.voci.map((x) => x.minuti).sort()).toEqual([25, 50])
    // the admin's 120 minutes on the same task: in no number of the answer (ids may contain any digits)
    const numeri: number[] = []
    JSON.parse(JSON.stringify(tempo), (_k, valore) => {
      if (typeof valore === 'number') numeri.push(valore)
      return valore
    })
    expect(numeri).not.toContain(120)
    expect(numeri).not.toContain(195)
  })

  test('il setter chiede a che punto sono i suoi clienti con le rate: solo i suoi, mai contatti, metodo o note', async ({ page }) => {
    const db = dbLocale()
    // a client he brought, sold today: the newest of his sales; the first of three instalments paid
    const nomeDato = `${PREFISSO}${Date.now()}`
    // creaVenditaDiProva gives every client the surname «Incassi»
    const nome = `${nomeDato} Incassi`
    const suo = await creaVenditaDiProva(nomeDato, ID_CLOSER, { valore: 900, rate: 3, giorniFa: 0 })
    await incassaPrimaRata(suo, 300)
    const { error: e1 } = await db.from('sales').update({ note: 'Nota riservata' }).eq('id', suo)
    if (e1) throw e1
    // a client the admin brought: never among the setter's
    const altro = await creaVenditaDiProva(`${PREFISSO}Altro${Date.now()}`, ID_CLOSER, { valore: 600, rate: 1, giorniFa: 0 })
    const { error: e2 } = await db.from('sales').update({ setter_id: ID_ADMIN }).eq('id', altro)
    if (e2) throw e2

    const pannello = await chiedi(page, 'setter', 'A che punto sono i miei clienti con le rate?')
    await expect(pannello.getByText('Ho letto i tuoi clienti')).toBeVisible()
    await expect(pannello.getByText(new RegExp(`${nome}: pagato 300`))).toBeVisible()

    const richiesta = await ultimaRichiesta()
    expect(strumentiDi(richiesta)).toEqual(expect.arrayContaining(['miei_clienti', 'mie_giornate', 'miei_numeri']))
    for (const vietato of ['mie_vendite', 'vendite_periodo', 'cerca_clienti', 'rate_cliente', 'provvigioni']) {
      expect(strumentiDi(richiesta), vietato).not.toContain(vietato)
    }
    const clienti = letto(richiesta, 'miei_clienti') as { persona: string; di_chi: string; vendite: Record<string, unknown>[] }
    expect(Object.keys(clienti).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(clienti.persona).toBe(UTENTI.setter.nome)
    expect(clienti.vendite).toContainEqual(
      expect.objectContaining({ cliente: nome, tipo: 'Nuovo', revenue: 900, pagato_in_tutto: 300, rate_pagate: '1 di 3', a_te: expect.anything() }),
    )
    expect(JSON.stringify(clienti)).not.toContain(`${PREFISSO}Altro`)
    senzaDatiRiservati(clienti)
  })

  test('il closer chiede cosa gli resta da incassare: solo le sue vendite, con le rate da incassare', async ({ page }) => {
    const db = dbLocale()
    const nomeDato = `${PREFISSO}${Date.now()}`
    const nome = `${nomeDato} Incassi`
    const sua = await creaVenditaDiProva(nomeDato, ID_CLOSER, { valore: 900, rate: 3, giorniFa: 0 })
    await incassaPrimaRata(sua, 300)
    const { error: e1 } = await db.from('sales').update({ note: 'Nota riservata' }).eq('id', sua)
    if (e1) throw e1
    // a sale closed by the admin, with everything still to collect: never the closer's
    await creaVenditaDiProva(`${PREFISSO}Altro${Date.now()}`, ID_ADMIN, { valore: 600, rate: 1, giorniFa: 0 })
    // a sale the admin handed to him, of a client he does not see (not born from his calls):
    // its instalments come through the sale, as on the sale page; the client's name never
    const passata = await creaVenditaDiProva(`${PREFISSO}Passata${Date.now()}`, ID_ADMIN, { valore: 450, rate: 1, giorniFa: 0 })
    const { error: e2 } = await db.from('sales').update({ closer_id: ID_CLOSER }).eq('id', passata)
    if (e2) throw e2

    const pannello = await chiedi(page, 'closer', 'Cosa mi resta da incassare?')
    await expect(pannello.getByText('Ho letto le tue vendite')).toBeVisible()
    await expect(pannello.getByText(new RegExp(`${nome}: da incassare 600`))).toBeVisible()

    const richiesta = await ultimaRichiesta()
    expect(strumentiDi(richiesta)).toEqual(expect.arrayContaining(['mie_vendite', 'mie_giornate']))
    for (const vietato of ['miei_clienti', 'miei_numeri', 'vendite_periodo', 'da_incassare', 'cerca_clienti', 'rate_cliente']) {
      expect(strumentiDi(richiesta), vietato).not.toContain(vietato)
    }
    const vendite = letto(richiesta, 'mie_vendite') as { persona: string; solo: string; vendite: Record<string, unknown>[] }
    expect(Object.keys(vendite).slice(0, 2)).toEqual(['persona', 'di_chi'])
    expect(vendite.persona).toBe(UTENTI.closer.nome)
    expect(vendite.solo).toBe('le vendite con rate da incassare')
    const mia = vendite.vendite.find((v) => v.cliente === nome)
    expect(mia).toMatchObject({ tipo: 'Nuovo', contratto: 900, incassato: 300, da_incassare: 600, setter: UTENTI.setter.nome })
    // the next instalment from today on, read through the sale as its page does
    const prossima = mia?.prossima_rata as { scadenza: string; importo: number }
    expect(prossima.importo).toBe(300)
    expect(prossima.scadenza >= oggiRoma()).toBe(true)
    expect((mia?.rate_da_incassare as { rata: number; importo: number }[]).map((r) => [r.rata, r.importo])).toEqual([
      [2, 300],
      [3, 300],
    ])
    // every sale listed has something to collect
    for (const v of vendite.vendite) expect(Number(v.da_incassare), String(v.cliente)).toBeGreaterThan(0)
    const affidata = vendite.vendite.find((v) => v.contratto === 450 && v.venduta_il === oggiRoma())
    expect(affidata).toMatchObject({ cliente: 'Cliente', da_incassare: 450 })
    expect((affidata?.rate_da_incassare as { rata: number; importo: number }[]).map((r) => [r.rata, r.importo])).toEqual([[1, 450]])
    expect(JSON.stringify(vendite)).not.toContain(`${PREFISSO}Altro`)
    expect(JSON.stringify(vendite)).not.toContain(`${PREFISSO}Passata`)
    senzaDatiRiservati(vendite)
  })
})
