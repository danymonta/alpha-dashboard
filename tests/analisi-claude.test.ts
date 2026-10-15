import Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaClaudeFinto } from '../e2e/claude-finto.mjs'
import { chiediAClaude } from '@/lib/marketing/analisi/claude'
import { contenutoAnalisi, contenutoVisione, sistemaAnalisi, sistemaVisione } from '@/lib/marketing/analisi/prompt'
import { FORMATO_ANALISI_REEL, FORMATO_SCHEDA_VISIVA, LettoAnalisiReel, LettoSchedaVisiva } from '@/lib/marketing/analisi/schema'
import { BETA_FALLBACK } from '@/lib/insight/esegui'

// One request of the reel analysis against the fake Anthropic server, in process. Invented reel.

type Finto = {
  url: string
  chiudi: () => Promise<void>
  ultime: () => { corpo: Record<string, unknown>; beta: string | null }[]
  azzera: () => void
}

let finto: Finto
let client: Anthropic

beforeAll(async () => {
  finto = (await creaClaudeFinto({ lentoMs: 600 })) as Finto
  client = new Anthropic({ apiKey: 'finta', authToken: null, baseURL: finto.url, maxRetries: 0 })
})
afterAll(async () => {
  await finto.chiudi()
})
beforeEach(() => {
  finto.azzera()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

const JPEG_MINIMO = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64')

const visione = (extra: Record<string, unknown> = {}) =>
  contenutoVisione([{ etichetta: 'Copertina (griglia del profilo):', jpeg: JPEG_MINIMO }, { etichetta: 'F1 · 0:00,0 (gancio)', jpeg: JPEG_MINIMO }], { durata_secondi: 30, calendario: null, ...extra })

const comuni = (contenuto: ReturnType<typeof visione>, entro: number) => ({ contenuto, effort: 'medium' as const, minimo: 1_000, entro, cliente: client })
const opzioniVisione = (contenuto: ReturnType<typeof visione>, entro = Date.now() + 120_000) => ({
  passo: 'visione' as const,
  sistema: sistemaVisione(),
  formato: FORMATO_SCHEDA_VISIVA,
  schema: LettoSchedaVisiva,
  ...comuni(contenuto, entro),
})
const opzioniAnalisi = (contenuto: ReturnType<typeof visione>, entro = Date.now() + 120_000) => ({
  passo: 'analisi' as const,
  sistema: sistemaAnalisi(),
  formato: FORMATO_ANALISI_REEL,
  schema: LettoAnalisiReel,
  ...comuni(contenuto, entro),
})

describe('chiediAClaude', () => {
  it('la visione: manda le immagini, il formato strutturato e il fallback; niente thinking né campionamento', async () => {
    const r = await chiediAClaude(opzioniVisione(visione()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dati.sintesi_visiva).toContain('2 immagini')
    expect(r.uso.output_tokens).toBeGreaterThan(0)
    const [richiesta] = finto.ultime()
    expect(richiesta.beta).toContain(BETA_FALLBACK)
    const corpo = richiesta.corpo as Record<string, unknown>
    expect(corpo.stream).toBe(true)
    expect(corpo.thinking).toBeUndefined()
    expect(corpo.temperature).toBeUndefined()
    expect(corpo.tools).toBeUndefined()
    expect(corpo.fallbacks).toBe('default')
    expect((corpo.output_config as { effort: string }).effort).toBe('medium')
    // the fake keeps the size and weight of an image, never its bytes
    expect(JSON.stringify(corpo)).not.toContain('/9j/')
  })

  it('l’analisi: il contesto in cache, le idee chieste dal verdetto', async () => {
    const r = await chiediAClaude(
      opzioniAnalisi(contenutoAnalisi({ note_del_team: 'spente' }, { verdetto: 'cambiare', idee_da_proporre: { quante: 3, tipo: 'rifacimento' }, numeri: { views_rapporto: 0.5 } })),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dati.idee).toHaveLength(3)
    expect(r.dati.perche_verdetto).toContain('cambiare')
  })

  it('un rifiuto, un troncamento e un JSON rotto sono codici, mai un testo', async () => {
    const rifiuto = await chiediAClaude(opzioniAnalisi(contenutoAnalisi({}, { x: '[[rifiuto]]' })))
    expect(rifiuto).toMatchObject({ ok: false, codice: 'rifiuto' })
    const tronca = await chiediAClaude(opzioniAnalisi(contenutoAnalisi({}, { x: '[[tronca]]' })))
    expect(tronca).toMatchObject({ ok: false, codice: 'max_tokens' })
    const rotto = await chiediAClaude(opzioniAnalisi(contenutoAnalisi({}, { x: '[[json-rotto]]' })))
    expect(rotto).toMatchObject({ ok: false, codice: 'json' })
  })

  it('una chiave sbagliata è autenticazione e non si riprova', async () => {
    const sbagliato = new Anthropic({ apiKey: 'sbagliata', authToken: null, baseURL: finto.url, maxRetries: 0 })
    const r = await chiediAClaude({ ...opzioniAnalisi(contenutoAnalisi({}, {})), cliente: sbagliato })
    expect(r).toMatchObject({ ok: false, codice: 'autenticazione' })
    expect(finto.ultime()).toHaveLength(1)
  })

  it('un 429 con retry-after 0 si riprova una volta', async () => {
    const r = await chiediAClaude(opzioniAnalisi(contenutoAnalisi({}, { x: '[[429]]' })))
    expect(r.ok).toBe(true)
    expect(finto.ultime()).toHaveLength(2)
  })

  it('senza tempo non parte nemmeno: codice tempo, nessuna richiesta', async () => {
    const r = await chiediAClaude(opzioniAnalisi(contenutoAnalisi({}, {}), Date.now() + 500))
    expect(r).toMatchObject({ ok: false, codice: 'tempo' })
    expect(finto.ultime()).toHaveLength(0)
  })

  it('una richiesta che supera il tempo che resta si interrompe: tempo, e non si riprova', async () => {
    const r = await chiediAClaude({ ...opzioniAnalisi(contenutoAnalisi({}, { x: '[[lento]]' }), Date.now() + 1_500), minimo: 100 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(['tempo', 'rete']).toContain(r.codice)
    expect(finto.ultime().length).toBeLessThanOrEqual(1)
  })

  it('una richiesta partita che scade per il suo timeout è un tentativo fallito (rete), non «tempo»: altrimenti tornerebbe in coda senza contare', async () => {
    let chiamate = 0
    const sempreScaduto = {
      beta: {
        messages: {
          stream: () => {
            chiamate++
            return { finalMessage: () => Promise.reject(new Anthropic.APIConnectionTimeoutError()), currentMessage: undefined, request_id: null }
          },
        },
      },
    } as unknown as Anthropic
    const r = await chiediAClaude({ ...opzioniAnalisi(contenutoAnalisi({}, {})), cliente: sempreScaduto })
    expect(r).toMatchObject({ ok: false, codice: 'rete' })
    // one more try in the same step, as for the network
    expect(chiamate).toBe(2)
  })

  it('un segnale interrotto da chi chiama resta «tempo»: nessun tentativo da contare', async () => {
    const abort = new AbortController()
    const interrotto = {
      beta: {
        messages: {
          stream: () => ({ finalMessage: () => Promise.reject(new Anthropic.APIUserAbortError()), currentMessage: undefined, request_id: null }),
        },
      },
    } as unknown as Anthropic
    const r = await chiediAClaude({ ...opzioniAnalisi(contenutoAnalisi({}, {})), cliente: interrotto, segnale: abort.signal })
    expect(r).toMatchObject({ ok: false, codice: 'tempo' })
  })

  it('i log dicono i conti, mai un testo né un dollaro', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await chiediAClaude(opzioniAnalisi(contenutoAnalisi({}, { didascalia: 'testo segreto della didascalia' })))
    const riga = JSON.stringify(info.mock.calls)
    expect(riga).toContain('[analisi] token')
    expect(riga).not.toContain('segreto')
    expect(riga).not.toMatch(/\$|usd/i)
  })
})
