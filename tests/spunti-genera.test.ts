import Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaClaudeFinto } from '../e2e/claude-finto.mjs'
import type { AdminClient } from '@/lib/instagram/sincronizza-contenuti'
import { generaSpunti } from '@/lib/marketing/spunti/genera'
import { SISTEMA_SPUNTI, sistemaSpunti, VERSIONE_PROMPT_SPUNTI } from '@/lib/marketing/spunti/prompt'
import { FORMATO_SPUNTI } from '@/lib/marketing/spunti/schema'

type Finto = { url: string; chiudi: () => Promise<void>; ultime: () => { corpo: Record<string, unknown>; beta: string | null }[]; azzera: () => void }
let finto: Finto
let client: Anthropic
beforeAll(async () => {
  finto = (await creaClaudeFinto({ lentoMs: 400 })) as Finto
  client = new Anthropic({ apiKey: 'finta', authToken: null, baseURL: finto.url, maxRetries: 0 })
})
afterAll(async () => {
  await finto.chiudi()
})
beforeEach(() => {
  finto.azzera()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

const GREZZO = (testoSetter = 'Molti uomini non hanno tempo la sera') => ({
  periodo: 'dal 15/09 al 12/10/2026', settimana: 'dal 06/10 al 12/10/2026', note_team: true,
  reel: [{ ref: 'R1', pubblicato: '03/10', name: 'Reel sera', gancio: 'Ho 40 minuti', verdetto: 'spingere', sintesi: 'Funziona', cosa_ha_funzionato: [] }],
  dm: { temi: [{ ref: 'D1', tema: 'Poco tempo la sera', quanti: 7, in_target: 4, con_call: 1, tendenza: 'in_aumento' }] },
  setter: { scale: null, note: [{ ref: 'S1', quando: 'prima', domanda: 'cosa frenava', testo: testoSetter, k: 'g1' }] },
  closer: { motivi: [] }, call: { analisi: [] }, in_calendario: [],
  fatti: [{ ref: 'F1', testo: 'Questa settimana 31 lead dai reel, 14 in target' }],
  da_oscurare: ['loris setter'],
})

function dbFinto(grezzo: unknown, stato = 'in_corso') {
  const chiamate: { nome: string; args: Record<string, unknown> }[] = []
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { periodo_da: '2026-09-15', periodo_a: '2026-10-12', stato }, error: null }) }) }) }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chiamate.push({ nome, args })
      return { data: nome === 'marketing_fonti_spunti' ? grezzo : null, error: null }
    },
  } as unknown as AdminClient
  return { db, chiamate }
}
const fine = (c: { nome: string; args: Record<string, unknown> }[]) => c.find((x) => x.nome === 'marketing_spunti_fine')!.args as Record<string, unknown>
const entro = () => Date.now() + 200_000

describe('generaSpunti', () => {
  it('la richiesta: modello, effort medium, 24.000 token, beta e fallback; il sistema con l’ICP in cache', async () => {
    const { db } = dbFinto(GREZZO())
    await generaSpunti({ db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })
    const u = finto.ultime()[0]
    const corpo = u.corpo as Record<string, unknown> & { system: { cache_control?: unknown }[]; output_config: { effort: string } }
    expect(corpo.model).toBe('claude-sonnet-5-5')
    expect(corpo.max_tokens).toBe(24_000)
    expect(corpo.output_config.effort).toBe('medium')
    expect(corpo.thinking).toBeUndefined()
    expect(u.beta).toContain('server-side-fallback-2026-07-01')
    expect(corpo.system[0].cache_control).toBeDefined()
  })
  it('salva un brief pronto con le fonti come numeri e booleani, mai le chiavi nascoste', async () => {
    const { db, chiamate } = dbFinto(GREZZO())
    const r = await generaSpunti({ db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })
    expect(r.esito).toBe('ok')
    const f = fine(chiamate)
    expect(f.p_stato).toBe('pronta')
    expect(f.p_versione).toBe(VERSIONE_PROMPT_SPUNTI)
    expect(f.p_fonti).toEqual({ reel_analizzati: 1, dm: true, setting: true, call: false, note_team: true })
    const contenuto = f.p_contenuto as { idee: { name: string; reel_type: string }[]; temi: unknown[] }
    // the fake model proposes 6 ideas, the 6th with a Format that is not Notion's
    expect(contenuto.idee).toHaveLength(5)
    expect(contenuto.idee[0].reel_type).toBe('education')
    expect(contenuto.temi).toHaveLength(1)
    const inviato = JSON.stringify(finto.ultime()[0].corpo)
    expect(inviato).not.toContain('"k"')
    expect(inviato).not.toContain('Loris')
  })
  it('nomi, importi e cifre inventate non restano nel brief', async () => {
    const { db, chiamate } = dbFinto(GREZZO('[[nome]] [[prezzo]] [[cifra]] [[citazione]] gente senza tempo'))
    await generaSpunti({ db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })
    const c = JSON.stringify(fine(chiamate).p_contenuto)
    expect(c).not.toMatch(/Loris|1\.500|777|non riesco mai a trovare/)
    // the entry with the made-up number and the quoted piece is out; the summary stays
    expect((fine(chiamate).p_contenuto as { temi: unknown[] }).temi).toHaveLength(0)
  })
  it('senza dati non chiama Claude e lo dice', async () => {
    const vuoto = { ...GREZZO(), reel: [], dm: { temi: [] }, setter: { scale: null, note: [] } }
    const { db, chiamate } = dbFinto(vuoto)
    await generaSpunti({ db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })
    expect(finto.ultime()).toHaveLength(0)
    expect(fine(chiamate)).toMatchObject({ p_stato: 'fallita' })
    expect(String(fine(chiamate).p_errore)).toContain('Mancano i dati')
  })
  it('un rifiuto chiude fallita; una risposta troncata torna in coda e conta', async () => {
    const r1 = dbFinto(GREZZO('[[rifiuto]] gente'))
    await generaSpunti({ db: r1.db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })
    expect(fine(r1.chiamate).p_stato).toBe('fallita')
    const r2 = dbFinto(GREZZO('[[tronca]] gente'))
    await generaSpunti({ db: r2.db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })
    expect(fine(r2.chiamate)).toMatchObject({ p_stato: 'in_coda', p_conta: true })
  })
  it('una chiave rifiutata: limite del fornitore', async () => {
    const sbagliato = new Anthropic({ apiKey: 'sbagliata', authToken: null, baseURL: finto.url, maxRetries: 0 })
    const { db } = dbFinto(GREZZO())
    expect((await generaSpunti({ db, id: 'b1', passo: 'p1', entro: entro(), cliente: sbagliato })).esito).toBe('limite_fornitore')
  })
  it('un brief che non è in corso non si tocca', async () => {
    const { db, chiamate } = dbFinto(GREZZO(), 'pronta')
    expect((await generaSpunti({ db, id: 'b1', passo: 'p1', entro: entro(), cliente: client })).esito).toBe('fallito')
    expect(chiamate).toHaveLength(0)
  })
  it('il prompt: stessi byte ogni volta, nessuna data né id, il formato senza limiti', () => {
    expect(JSON.stringify(sistemaSpunti())).toBe(JSON.stringify(sistemaSpunti()))
    expect(SISTEMA_SPUNTI).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}/)
    const json = JSON.stringify(FORMATO_SPUNTI)
    for (const chiave of ['maxLength', 'minLength', 'maxItems', 'minItems', 'minimum', 'maximum', 'oneOf']) expect(json).not.toContain(`"${chiave}"`)
  })
})
