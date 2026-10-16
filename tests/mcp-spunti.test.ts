import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { ContestoMcp } from '@/lib/mcp/contesto'
import { spuntiPerClaude } from '@/lib/mcp/spunti'
import { STRUMENTI, strumentiPer } from '@/lib/mcp/strumenti'

const BRIEF = {
  periodo_da: '2026-09-15',
  periodo_a: '2026-10-12',
  finita_il: '2026-10-13T06:10:00Z',
  contenuto: {
    versione: 'spunti',
    in_breve: 'Una settimana buona.',
    cosa_funziona: [{ testo: 'Il reel della sera', perche: 'Porta lead', rif: ['R1', 'F1'] }],
    temi: [{ tema: 'Poco tempo', cosa_dicono: 'Chiedono se bastano 40 minuti.', fonti: ['dm', 'call'], tendenza: 'in_aumento', rif: ['D1', 'C1'] }],
    obiezioni: [], domande: [], mantieni: [], cambia: [], potenzia: [],
    idee: [{ modello: 'carousel', nasce_da: 'tema', fase: 'consapevolezza', name: 'Idea 1', reel_type: 'education', format: null, gancio: 'g', messaggio: 'm', script: { hook: 'h', righe: ['a'], cta: 'c' }, perche: 'p', rif: ['D1'] }],
    fatti: { F1: 'Reel del 03/10: 3 lead dai DM, 2 in target', R1: 'Reel del 03/10' },
  },
  idee_nel_calendario: [{ idea: 0, name: 'Idea 1' }],
}

function ctx(risposta: { data: unknown; error: unknown }) {
  const chiamate: { nome: string; args: unknown }[] = []
  const db = { rpc: async (nome: string, args: unknown) => (chiamate.push({ nome, args }), risposta) }
  return { c: { db, ruolo: 'marketing', sessione: 's' } as unknown as ContestoMcp, chiamate }
}

describe('spunti_contenuti', () => {
  it('c’è per admin, video editor e marketing, in sola lettura', () => {
    for (const ruolo of ['admin', 'editor', 'marketing']) expect(strumentiPer(ruolo).map((s) => s.nome)).toContain('spunti_contenuti')
    const s = STRUMENTI.find((x) => x.nome === 'spunti_contenuti')!
    expect(s.annotazioni).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false })
    expect(s.scrive).toBe(false)
  })
  it('chiama solo spunti_per_claude, con il giorno se c’è', async () => {
    const { c, chiamate } = ctx({ data: BRIEF, error: null })
    await spuntiPerClaude({ settimana: '2026-10-08' }, c)
    expect(chiamate).toEqual([{ nome: 'spunti_per_claude', args: { p_giorno: '2026-10-08' } }])
  })
  it('i riferimenti diventano le frasi dei fatti; niente fonti, rif o numeri dietro', async () => {
    const { c } = ctx({ data: BRIEF, error: null })
    const r = await spuntiPerClaude({}, c)
    if (!r.ok) throw new Error('no')
    const testo = JSON.stringify(r.dati)
    expect(testo).toContain('Reel del 03/10: 3 lead dai DM, 2 in target')
    expect(testo).not.toMatch(/"rif"|"fonti"|"numeri"|D1|C1/)
    expect((r.dati.idee as { nel_calendario: string | null }[])[0].nel_calendario).toBe('Idea 1')
    expect((r.dati.idee as { modello: string; reel_type: string }[])[0]).toMatchObject({ modello: 'Carousel Topic', reel_type: 'Education' })
  })
  it('senza spunti lo dice; un errore del database è una frase', async () => {
    expect((await spuntiPerClaude({}, ctx({ data: { spunti: null }, error: null }).c)).ok).toBe(true)
    const e = await spuntiPerClaude({}, ctx({ data: null, error: { code: 'XX' } }).c)
    expect(e).toEqual({ ok: false, messaggio: 'Gli spunti non si sono caricati: riprova tra poco.' })
  })
  it('una risposta lunga perde le idee dall’ultima, intere, e lo dice', async () => {
    const lunga = { ...BRIEF, contenuto: { ...BRIEF.contenuto, idee: Array.from({ length: 8 }, (_, i) => ({ ...BRIEF.contenuto.idee[0], name: `Idea ${i}`, messaggio: 'x'.repeat(5000) })) } }
    const r = await spuntiPerClaude({}, ctx({ data: lunga, error: null }).c)
    if (!r.ok) throw new Error('no')
    expect(JSON.stringify(r.dati).length).toBeLessThanOrEqual(30_000)
    expect((r.dati.idee as unknown[]).length).toBeLessThan(8)
    expect(r.dati.avviso).toBeTruthy()
  })
})
