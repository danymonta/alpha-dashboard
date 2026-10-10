import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))

import { BOZZA_REEL, GRUPPI_STATUS } from '@/lib/marketing/etichette'
import { improntaTesto } from '@/lib/marketing/impronta'
import {
  cambiaStatus,
  creaContenuti,
  elencoContenuti,
  eliminaContenutoPerClaude,
  leggiContenutoPerClaude,
  modificaContenutoPerClaude,
  scriviSezione,
  type EsitoStrumento,
} from '@/lib/mcp/contenuti'
import type { ContestoMcp, RuoloMcp } from '@/lib/mcp/contesto'
import { versioneOpaca } from '@/lib/mcp/etichette'
import { azzeraLimiti } from '@/lib/mcp/limiti'
import {
  cambiaStatusSchema,
  creaContenutiSchema,
  elencoContenutiSchema,
  eliminaContenutoSchema,
  leggiContenutoSchema,
  modificaContenutoSchema,
  scriviSezioneSchema,
} from '@/lib/mcp/schemi'
import { eseguiStrumento } from '@/lib/mcp/server'
import { STRUMENTI, type Strumento } from '@/lib/mcp/strumenti'

import { argomenti, ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

/**
 * The tools end to end on the shared core (lib/marketing/letture.ts and
 * operazioni.ts, the real ones), with a fake Supabase client that records
 * every query: labels in, values to the database, labels out.
 */

const ID = '6c1f0c64-4f9b-4c49-9a3e-2f8c4c0a7e11'
const NUOVO = '9b2e1c3d-1111-4a2b-8c3d-4e5f6a7b8c9d'
const AGGIORNATO = '2026-10-09T08:15:42.123456+00:00'
const VUOTA = 'd41d8cd98f00b204e9800998ecf8427e'

function riga(altro: Record<string, unknown> = {}) {
  return {
    id: ID,
    tipo: 'reel',
    nome: 'Trazioni da zero',
    reel_type: 'education',
    formato: null,
    inspiration: null,
    stato: 'to_be_edited',
    post_date: '2026-10-15',
    audio: 'Song',
    url: null,
    view_count: null,
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: AGGIORNATO,
    messaggio: null,
    bozza: BOZZA_REEL,
    commenti: null,
    finale: null,
    notion_page_id: null,
    created_by: '61616161-6161-4161-8161-616161616161',
    ...altro,
  }
}

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

function contesto(ruolo: RuoloMcp = 'marketing'): ContestoMcp {
  return { db: fake.client as never, ruolo, sessione: 'sessione-di-prova' }
}

function dati(esito: EsitoStrumento): Record<string, unknown> {
  if (!esito.ok) throw new Error(`atteso ok, arrivato: ${esito.messaggio}`)
  return esito.dati
}

const sulCalendario = () => fake.chiamate.filter((c) => c.nome === 'marketing_contenuti')
const scritture = () =>
  fake.chiamate.filter((c) => ha(c, 'insert') || ha(c, 'update') || ha(c, 'delete') || c.tipo === 'rpc')

let log: MockInstance<(...argomenti: unknown[]) => void>[] = []

beforeEach(() => {
  rispondi = () => ({ data: null })
  fake = supabaseFinto((c) => rispondi(c))
  azzeraLimiti()
  log = (['info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
})

afterEach(() => {
  for (const spia of log) spia.mockRestore()
})

describe('elenco_contenuti', () => {
  it('le etichette diventano i valori del database, la ricerca è letterale', async () => {
    rispondi = (c) => (ha(c, 'limit') ? { data: [riga()], count: 1 } : { count: 1 })
    const input = elencoContenutiSchema.parse({
      status: 'To be edited',
      reel_type: 'Education',
      format: 'Show&Tell',
      modello: 'Reel Topic',
      cerca: '  50%_*  ',
    })
    await elencoContenuti(input, contesto())
    const elenco = sulCalendario().find((c) => ha(c, 'limit'))
    if (!elenco) throw new Error('nessun elenco')
    expect(ha(elenco, 'in', 'stato', ['to_be_edited'])).toBe(true)
    expect(ha(elenco, 'eq', 'reel_type', 'education')).toBe(true)
    expect(ha(elenco, 'eq', 'formato', 'show_and_tell')).toBe(true)
    expect(ha(elenco, 'eq', 'tipo', 'reel')).toBe(true)
    // the page's search: imatch with ***=, every character literal (% and _ included)
    expect(ha(elenco, 'regexIMatch', 'nome', '***=50%_*')).toBe(true)
    expect(ha(elenco, 'limit', 50)).toBe(true)
  })

  it('un gruppo di Status diventa i suoi Status; il limite arriva fino a 100', async () => {
    rispondi = (c) => (ha(c, 'limit') ? { data: [], count: 0 } : { count: 0 })
    await elencoContenuti(elencoContenutiSchema.parse({ gruppo: 'In progress', limite: 100 }), contesto())
    const elenco = sulCalendario().find((c) => ha(c, 'limit'))
    if (!elenco) throw new Error('nessun elenco')
    expect(ha(elenco, 'in', 'stato', [...GRUPPI_STATUS.in_progress])).toBe(true)
    expect(ha(elenco, 'limit', 100)).toBe(true)
  })

  it('un mese diventa dal primo all’ultimo giorno della Post Date', async () => {
    rispondi = (c) => (ha(c, 'limit') ? { data: [], count: 0 } : { count: 0 })
    await elencoContenuti(elencoContenutiSchema.parse({ mese: '2026-02' }), contesto())
    const elenco = sulCalendario().find((c) => ha(c, 'limit'))
    if (!elenco) throw new Error('nessun elenco')
    expect(ha(elenco, 'gte', 'post_date', '2026-02-01')).toBe(true)
    expect(ha(elenco, 'lte', 'post_date', '2026-02-28')).toBe(true)
  })

  it('i numeri per gruppo con le etichette di Notion, e l’avviso quando ne mostra meno', async () => {
    const perGruppo = (c: Chiamata) => {
      const stati = JSON.stringify(argomenti(c, 'in')?.[1] ?? null)
      if (stati === JSON.stringify(GRUPPI_STATUS.to_do)) return 2
      if (stati === JSON.stringify(GRUPPI_STATUS.in_progress)) return 125
      if (stati === JSON.stringify(GRUPPI_STATUS.complete)) return 5
      return 132
    }
    rispondi = (c) =>
      ha(c, 'limit')
        ? { data: Array.from({ length: 50 }, (_, i) => riga({ id: `${ID.slice(0, -2)}${String(i).padStart(2, '0')}` })), count: 132 }
        : { count: perGruppo(c) }
    const risultato = dati(await elencoContenuti(elencoContenutiSchema.parse({}), contesto()))
    expect(risultato.per_gruppo).toEqual({ 'To-do': 2, 'In progress': 125, Complete: 5 })
    expect(risultato).toMatchObject({ totale: 132, mostrati: 50 })
    expect(risultato.avviso).toBe('Ne mostro 50 di 132: restringi i filtri o aumenta il limite (massimo 100).')
  })

  it('ogni riga ha le proprietà di Notion, la versione opaca e il link; mai chi l’ha creata né quando', async () => {
    rispondi = (c) => (ha(c, 'limit') ? { data: [riga()], count: 1 } : { count: 1 })
    const risultato = dati(await elencoContenuti(elencoContenutiSchema.parse({}), contesto()))
    const [contenuto] = risultato.contenuti as Record<string, unknown>[]
    expect(contenuto).toEqual({
      id: ID,
      Name: 'Trazioni da zero',
      Modello: 'Reel Topic',
      'Reel Type': 'Education',
      Format: null,
      Status: 'To be edited',
      'Post Date': '2026-10-15',
      Inspiration: null,
      Audio: 'Song',
      URL: null,
      'View Count': null,
      versione: versioneOpaca(AGGIORNATO),
      link: `http://localhost:3000/marketing/contenuti/${ID}`,
    })
    expect(JSON.stringify(risultato)).not.toMatch(/created_by|created_at|updated_at|61616161/)
    expect(risultato.avviso).toBeUndefined()
  })

  it('righe lunghe: toglie le ultime intere e lo dice, sotto i 60.000 caratteri', async () => {
    const lunga = (i: number) =>
      riga({
        id: `${ID.slice(0, -2)}${String(i).padStart(2, '0')}`,
        nome: 'N'.repeat(300),
        url: `https://www.instagram.com/reel/${'u'.repeat(460)}/`,
        inspiration: `https://example.com/${'i'.repeat(470)}`,
        audio: 'A'.repeat(200),
      })
    rispondi = (c) => (ha(c, 'limit') ? { data: Array.from({ length: 100 }, (_, i) => lunga(i)), count: 100 } : { count: 100 })
    const risultato = dati(await elencoContenuti(elencoContenutiSchema.parse({ limite: 100 }), contesto()))
    const mostrati = risultato.mostrati as number
    expect(mostrati).toBeLessThan(100)
    expect((risultato.contenuti as unknown[]).length).toBe(mostrati)
    expect(risultato.avviso).toBe(`Ne mostro ${mostrati} di 100: i contenuti hanno proprietà lunghe, restringi i filtri.`)
    expect(JSON.stringify(risultato).length).toBeLessThanOrEqual(60_000)
  })
})

describe('leggi_contenuto', () => {
  it('un contenuto che non c’è (o che RLS nasconde) è un errore', async () => {
    rispondi = () => ({ data: null })
    const esito = await leggiContenutoPerClaude(leggiContenutoSchema.parse({ id: ID }), contesto())
    expect(esito).toEqual({ ok: false, messaggio: 'Questo contenuto non c’è (o non lo vedi).' })
  })

  it('dà testo e impronta di ogni sezione; una vuota è "" con l’md5 della stringa vuota', async () => {
    rispondi = () => ({ data: riga({ messaggio: 'Perché le trazioni 💪', finale: null }) })
    const risultato = dati(await leggiContenutoPerClaude(leggiContenutoSchema.parse({ id: ID }), contesto()))
    const sezioni = risultato.sezioni as { chiave: string; titolo: string; testo: string; impronta: string }[]
    expect(sezioni.map((s) => s.chiave)).toEqual(['messaggio', 'bozza', 'commenti', 'finale'])
    expect(sezioni[0]).toMatchObject({ titolo: 'Topic / Main Message', testo: 'Perché le trazioni 💪' })
    expect(sezioni[0].impronta).toBe(improntaTesto('Perché le trazioni 💪'))
    expect(sezioni[1]).toMatchObject({ titolo: 'Script (Rough Draft)', testo: BOZZA_REEL, impronta: improntaTesto(BOZZA_REEL) })
    expect(sezioni[3]).toMatchObject({ titolo: 'Script (Final)', testo: '', impronta: VUOTA, caratteri: 0 })
    expect(JSON.stringify(risultato)).not.toMatch(/created_by|61616161/)
  })

  it('non taglia mai una sezione: oltre 45.000 caratteri le altre vanno lette a parte', async () => {
    const testo = (c: string) => c.repeat(20_000)
    rispondi = () => ({ data: riga({ messaggio: testo('m'), bozza: testo('b'), commenti: testo('c'), finale: testo('f') }) })
    const risultato = dati(await leggiContenutoPerClaude(leggiContenutoSchema.parse({ id: ID }), contesto()))
    const sezioni = risultato.sezioni as { chiave: string; testo: string }[]
    expect(sezioni.map((s) => [s.chiave, s.testo.length])).toEqual([
      ['messaggio', 20_000],
      ['bozza', 20_000],
    ])
    expect(risultato.da_leggere_a_parte).toEqual([
      { chiave: 'commenti', titolo: 'Comments', caratteri: 20_000 },
      { chiave: 'finale', titolo: 'Script (Final)', caratteri: 20_000 },
    ])
    expect(JSON.stringify(risultato).length).toBeLessThanOrEqual(60_000)

    const aParte = dati(
      await leggiContenutoPerClaude(leggiContenutoSchema.parse({ id: ID, sezioni: ['finale', 'commenti'] }), contesto()),
    )
    expect((aParte.sezioni as { chiave: string }[]).map((s) => s.chiave)).toEqual(['commenti', 'finale'])
    expect(aParte.da_leggere_a_parte).toBeUndefined()
  })

  it('un carosello: i titoli del suo modello, Comments solo se ha testo, e il link a Notion', async () => {
    rispondi = () =>
      ({ data: riga({ tipo: 'carousel', bozza: null, notion_page_id: '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f' }) })
    const risultato = dati(await leggiContenutoPerClaude(leggiContenutoSchema.parse({ id: ID }), contesto()))
    expect((risultato.sezioni as { titolo: string }[]).map((s) => s.titolo)).toEqual(['Idea/Message', 'Carousel', 'Caption'])
    expect((risultato.contenuto as Record<string, unknown>).Notion).toBe('https://www.notion.so/1a2b3c4d1a2b1a2b1a2b1a2b3c4d5e6f')
    expect((risultato.contenuto as Record<string, unknown>).Modello).toBe('Carousel Topic')
  })
})

describe('crea_contenuti', () => {
  function salvaSempre(c: Chiamata): RispostaFinta {
    if (ha(c, 'insert')) return { data: { id: NUOVO, updated_at: '2026-10-09T09:00:00.000001+00:00' } }
    if (c.tipo === 'rpc') {
      const args = (argomenti(c, 'args')?.[0] ?? {}) as { p_testo: string }
      return { data: { esito: 'salvata', impronta: improntaTesto(args.p_testo), versione: '2026-10-09T09:00:01.000002+00:00' } }
    }
    return { data: null }
  }

  it('un Reel Topic senza bozza nasce con lo scheletro; le sezioni si scrivono sopra quello che c’è', async () => {
    rispondi = salvaSempre
    const input = creaContenutiSchema.parse({
      contenuti: [{ name: '  Trazioni: errori  ', post_date: '2026-10-20', sezioni: { finale: 'Didascalia 🎯' } }],
    })
    const risultato = dati(await creaContenuti(input, contesto()))
    const [inserimento] = fake.chiamate.filter((c) => ha(c, 'insert'))
    expect(argomenti(inserimento, 'insert')?.[0]).toMatchObject({
      tipo: 'reel',
      nome: 'Trazioni: errori',
      stato: 'not_started',
      post_date: '2026-10-20',
      bozza: BOZZA_REEL,
    })
    const [sezione] = fake.chiamate.filter((c) => c.tipo === 'rpc')
    expect(argomenti(sezione, 'args')?.[0]).toEqual({
      p_id: NUOVO,
      p_campo: 'finale',
      p_testo: 'Didascalia 🎯',
      p_impronta: VUOTA,
    })
    expect(risultato).toMatchObject({ creati: 1, errori: 0 })
    expect((risultato.contenuti as Record<string, unknown>[])[0]).toMatchObject({
      esito: 'creato',
      id: NUOVO,
      Name: 'Trazioni: errori',
      Modello: 'Reel Topic',
      Status: 'Not started',
      'Post Date': '2026-10-20',
      versione: versioneOpaca('2026-10-09T09:00:01.000002+00:00'),
      sezioni_scritte: ['finale'],
    })
  })

  it('una bozza data si scrive sopra lo scheletro (la sua impronta); una vuota lascia lo scheletro', async () => {
    rispondi = salvaSempre
    await creaContenuti(
      creaContenutiSchema.parse({ contenuti: [{ name: 'A', sezioni: { bozza: 'Hook: tre errori', messaggio: '   ' } }] }),
      contesto(),
    )
    const sezioni = fake.chiamate.filter((c) => c.tipo === 'rpc').map((c) => argomenti(c, 'args')?.[0])
    expect(sezioni).toEqual([{ p_id: NUOVO, p_campo: 'bozza', p_testo: 'Hook: tre errori', p_impronta: improntaTesto(BOZZA_REEL) }])
  })

  it('etichette di un carosello: valori del database, nessuna bozza', async () => {
    rispondi = salvaSempre
    await creaContenuti(
      creaContenutiSchema.parse({
        contenuti: [{ name: 'C', modello: 'Carousel Topic', reel_type: 'RADIO', format: 'B roll', status: 'To be posted', view_count: 1200 }],
      }),
      contesto(),
    )
    const [inserimento] = fake.chiamate.filter((c) => ha(c, 'insert'))
    expect(argomenti(inserimento, 'insert')?.[0]).toMatchObject({
      tipo: 'carousel',
      reel_type: 'radio',
      formato: 'b_roll',
      stato: 'to_be_posted',
      view_count: 1200,
      bozza: null,
    })
  })

  it('un contenuto che non va non ferma gli altri', async () => {
    let n = 0
    rispondi = (c) => {
      if (ha(c, 'insert')) {
        n += 1
        if (n === 2) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        return { data: { id: `${NUOVO.slice(0, -1)}${n}`, updated_at: AGGIORNATO } }
      }
      return { data: null }
    }
    const risultato = dati(
      await creaContenuti(
        creaContenutiSchema.parse({ contenuti: [{ name: 'Uno' }, { name: 'Due', url: 'https://www.instagram.com/reel/abc/' }, { name: 'Tre' }] }),
        contesto(),
      ),
    )
    expect(risultato).toMatchObject({ creati: 2, errori: 1 })
    expect((risultato.contenuti as Record<string, unknown>[]).map((c) => c.esito)).toEqual(['creato', 'errore', 'creato'])
    expect((risultato.contenuti as Record<string, unknown>[])[1]).toEqual({
      esito: 'errore',
      Name: 'Due',
      errore: 'Questo post è già collegato a un altro contenuto.',
    })
  })

  it('un link non valido lo dice il nucleo con le parole dell’app, per quel contenuto', async () => {
    rispondi = salvaSempre
    const risultato = dati(
      await creaContenuti(
        creaContenutiSchema.parse({ contenuti: [{ name: 'X', url: 'https://www.instagram.com/share/abc' }] }),
        contesto(),
      ),
    )
    expect((risultato.contenuti as Record<string, unknown>[])[0]).toEqual({
      esito: 'errore',
      Name: 'X',
      errore: 'Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.',
    })
    expect(scritture()).toEqual([])
  })
})

describe('modifica_contenuto', () => {
  const VERSIONE = versioneOpaca(AGGIORNATO)

  it('cambia solo quello che dice; null svuota; sopra l’updated_at vero appena letto', async () => {
    rispondi = (c) => (ha(c, 'update') ? { data: { updated_at: '2026-10-09T10:00:00.5+00:00' } } : { data: riga() })
    const input = modificaContenutoSchema.parse({ id: ID, versione: VERSIONE, campi: { status: 'Posted', audio: null } })
    const risultato = dati(await modificaContenutoPerClaude(input, contesto()))
    const [modifica] = fake.chiamate.filter((c) => ha(c, 'update'))
    expect(argomenti(modifica, 'update')?.[0]).toEqual({
      tipo: 'reel',
      nome: 'Trazioni da zero',
      reel_type: 'education',
      formato: null,
      stato: 'posted',
      post_date: '2026-10-15',
      inspiration: null,
      url: null,
      audio: null,
      view_count: null,
    })
    expect(ha(modifica, 'eq', 'id', ID)).toBe(true)
    // the core's own version check runs on the real timestamp, never on the opaque token
    expect(ha(modifica, 'eq', 'updated_at', AGGIORNATO)).toBe(true)
    expect(JSON.stringify(modifica.passi)).not.toContain(VERSIONE)
    expect(risultato).toMatchObject({ esito: 'salvato', contenuto: { Status: 'Posted', Audio: null, 'Reel Type': 'Education' } })
    expect((risultato.contenuto as Record<string, unknown>).versione).toBe(versioneOpaca('2026-10-09T10:00:00.5+00:00'))
  })

  it('una versione vecchia: «cambiato» coi valori attuali, e nessuna scrittura', async () => {
    rispondi = () => ({ data: riga() })
    const input = modificaContenutoSchema.parse({ id: ID, versione: 'ffffffffffffffff', campi: { name: 'Nuovo' } })
    const risultato = dati(await modificaContenutoPerClaude(input, contesto()))
    expect(risultato).toMatchObject({ esito: 'cambiato', contenuto: { Name: 'Trazioni da zero', versione: VERSIONE } })
    expect(risultato.messaggio).toBe('Il contenuto è cambiato da un’altra parte: ricontrolla i valori attuali.')
    expect(scritture()).toEqual([])
  })

  it('cambiato tra la lettura e la scrittura: il nucleo lo vede e lo dice, coi valori nuovi', async () => {
    let letture = 0
    rispondi = (c) => {
      if (ha(c, 'update')) return { data: null }
      if (argomenti(c, 'select')?.[0] === 'id') return { data: { id: ID } }
      letture += 1
      return { data: letture === 1 ? riga() : riga({ nome: 'Cambiato da Giulia', updated_at: '2026-10-09T11:00:00+00:00' }) }
    }
    const input = modificaContenutoSchema.parse({ id: ID, versione: VERSIONE, campi: { audio: 'Altro' } })
    const risultato = dati(await modificaContenutoPerClaude(input, contesto()))
    expect(risultato).toMatchObject({ esito: 'cambiato', contenuto: { Name: 'Cambiato da Giulia' } })
  })

  it('un contenuto sparito', async () => {
    rispondi = () => ({ data: null })
    const esito = await modificaContenutoPerClaude(
      modificaContenutoSchema.parse({ id: ID, versione: VERSIONE, campi: { audio: 'x' } }),
      contesto(),
    )
    expect(esito).toEqual({ ok: false, messaggio: 'Questo contenuto non c’è più.' })
  })
})

describe('scrivi_sezione', () => {
  const input = scriviSezioneSchema.parse({ id: ID, sezione: 'bozza', testo: 'Hook: nuovo', impronta: improntaTesto(BOZZA_REEL) })
  const DOPO = '2026-10-09T09:30:00.000003+00:00'

  it('salvata: la nuova impronta e le proprietà rilette, con la loro versione', async () => {
    rispondi = (c) =>
      c.tipo === 'rpc'
        ? { data: { esito: 'salvata', impronta: improntaTesto('Hook: nuovo'), versione: DOPO } }
        : { data: riga({ updated_at: DOPO }) }
    const risultato = dati(await scriviSezione(input, contesto()))
    expect(risultato).toMatchObject({
      esito: 'salvata',
      impronta: improntaTesto('Hook: nuovo'),
      contenuto: { id: ID, Name: 'Trazioni da zero', 'Post Date': '2026-10-15', versione: versioneOpaca(DOPO) },
    })
    expect(risultato.versione).toBeUndefined()
    // the properties only: the sections are not read again
    const [rilettura] = fake.chiamate.filter((c) => c.tipo === 'from')
    expect(String(argomenti(rilettura, 'select')?.[0])).not.toMatch(/messaggio|bozza|commenti|finale/)
  })

  it('una proprietà cambiata da altri prima della scrittura: la versione nuova arriva solo con quel valore', async () => {
    // Claude read v1 (Post Date 15/10); the video editor moved it to 12/10; Claude then wrote the rough draft
    const V1 = versioneOpaca(AGGIORNATO)
    rispondi = (c) =>
      c.tipo === 'rpc'
        ? { data: { esito: 'salvata', impronta: improntaTesto('Hook: nuovo'), versione: DOPO } }
        : { data: riga({ post_date: '2026-10-12', updated_at: DOPO }) }
    const scritta = dati(await scriviSezione(input, contesto()))
    expect(scritta.contenuto).toMatchObject({ 'Post Date': '2026-10-12', versione: versioneOpaca(DOPO) })

    // with the version of the first read, the editor's change is never overwritten
    fake.chiamate.length = 0
    const corsa = dati(
      await modificaContenutoPerClaude(
        modificaContenutoSchema.parse({ id: ID, versione: V1, campi: { post_date: '2026-10-11' } }),
        contesto(),
      ),
    )
    expect(corsa).toMatchObject({ esito: 'cambiato', contenuto: { 'Post Date': '2026-10-12', versione: versioneOpaca(DOPO) } })
    expect(scritture()).toEqual([])
  })

  it('salvata ma la rilettura non riesce: nessuna versione, e il risultato dice di rileggere', async () => {
    rispondi = (c) =>
      c.tipo === 'rpc'
        ? { data: { esito: 'salvata', impronta: improntaTesto('Hook: nuovo'), versione: DOPO } }
        : { error: { code: '57014', message: 'canceling statement due to statement timeout' } }
    const risultato = dati(await scriviSezione(input, contesto()))
    expect(risultato).toEqual({
      esito: 'salvata',
      impronta: improntaTesto('Hook: nuovo'),
      avviso:
        'Per cambiare poi le proprietà rileggi il contenuto con leggi_contenuto o elenco_contenuti: questa scrittura ha cambiato la sua versione.',
    })
    expect(JSON.stringify(risultato)).not.toContain(versioneOpaca(DOPO))
  })

  it('cambiata da un altro: non è un errore, dà il testo attuale con la sua impronta e nessuna versione', async () => {
    rispondi = () => ({ data: { esito: 'cambiata', impronta: improntaTesto('Di Giulia'), versione: AGGIORNATO, attuale: 'Di Giulia' } })
    const esito = await scriviSezione(input, contesto())
    expect(esito.ok).toBe(true)
    expect(dati(esito)).toEqual({
      esito: 'cambiata',
      messaggio: 'Questa parte è cambiata da un’altra parte: ecco il testo attuale.',
      attuale: 'Di Giulia',
      impronta: improntaTesto('Di Giulia'),
    })
    // nothing was written: nothing read back either
    expect(fake.chiamate.map((c) => c.tipo)).toEqual(['rpc'])
  })

  it('sparito: errore', async () => {
    rispondi = () => ({ data: { esito: 'sparito' } })
    expect(await scriviSezione(input, contesto())).toEqual({ ok: false, messaggio: 'Questo contenuto non c’è più.' })
  })
})

describe('cambia_status', () => {
  const input = cambiaStatusSchema.parse({ id: ID, status: 'Posted' })
  const DOPO = '2026-10-09T09:45:00.000004+00:00'

  it('salvato: le proprietà rilette con la versione nuova, anche quello che altri hanno cambiato', async () => {
    rispondi = (c) =>
      ha(c, 'update')
        ? { data: { updated_at: DOPO } }
        : { data: riga({ stato: 'posted', post_date: '2026-10-12', updated_at: DOPO }) }
    const risultato = dati(await cambiaStatus(input, contesto()))
    expect(risultato).toMatchObject({
      esito: 'salvato',
      contenuto: { Status: 'Posted', 'Post Date': '2026-10-12', versione: versioneOpaca(DOPO) },
    })
    const [modifica] = fake.chiamate.filter((c) => ha(c, 'update'))
    expect(argomenti(modifica, 'update')?.[0]).toEqual({ stato: 'posted' })
  })

  it('la rilettura non riesce: lo Status è salvato, ma senza versione e con l’invito a rileggere', async () => {
    rispondi = (c) =>
      ha(c, 'update') ? { data: { updated_at: DOPO } } : { error: { code: '57014', message: 'statement timeout' } }
    const risultato = dati(await cambiaStatus(input, contesto()))
    expect(risultato).toEqual({
      esito: 'salvato',
      contenuto: { id: ID, Status: 'Posted' },
      avviso:
        'Per cambiare poi le proprietà rileggi il contenuto con leggi_contenuto o elenco_contenuti: questa scrittura ha cambiato la sua versione.',
    })
  })
})

describe('elimina_contenuto', () => {
  it('solo l’admin: per gli altri nessuna chiamata al database', async () => {
    const esito = await eliminaContenutoPerClaude(eliminaContenutoSchema.parse({ id: ID, name: 'Trazioni da zero' }), contesto('marketing'))
    expect(esito.ok).toBe(false)
    expect(fake.chiamate).toEqual([])
  })

  it('un Name che non coincide non elimina niente', async () => {
    rispondi = () => ({ data: riga() })
    const esito = await eliminaContenutoPerClaude(eliminaContenutoSchema.parse({ id: ID, name: 'Trazioni' }), contesto('admin'))
    expect(esito).toEqual({ ok: false, messaggio: 'Il Name non coincide con quello del contenuto: non elimino niente.' })
    expect(fake.chiamate.some((c) => ha(c, 'delete'))).toBe(false)
  })

  it('lo stesso Name scritto in un’altra forma Unicode e con uno spazio in fondo: elimina', async () => {
    rispondi = (c) => (ha(c, 'delete') ? { data: [{ id: ID }] } : { data: riga({ nome: 'Perché così' }) })
    const esito = await eliminaContenutoPerClaude(
      eliminaContenutoSchema.parse({ id: ID, name: `${'Perché così'.normalize('NFD')} ` }),
      contesto('admin'),
    )
    expect(dati(esito)).toEqual({ esito: 'eliminato', Name: 'Perché così' })
    const [eliminazione] = fake.chiamate.filter((c) => ha(c, 'delete'))
    expect(ha(eliminazione, 'eq', 'id', ID)).toBe(true)
  })
})

describe('eseguiStrumento: il risultato per Claude', () => {
  const strumento = (nome: string) => STRUMENTI.find((s) => s.nome === nome) as Strumento

  it('i messaggi 42501 e 22023 del database passano com’è', async () => {
    rispondi = (c) =>
      ha(c, 'update') ? { error: { code: '42501', message: 'Da Claude si usa solo il calendario dei contenuti.' } } : { data: null }
    const risultato = await eseguiStrumento(strumento('cambia_status'), { id: ID, status: 'Posted' }, contesto())
    expect(risultato).toEqual({
      content: [{ type: 'text', text: 'Da Claude si usa solo il calendario dei contenuti.' }],
      isError: true,
    })
  })

  it('un errore del database che non è per le persone diventa una frase dell’app, mai il testo grezzo', async () => {
    rispondi = (c) =>
      ha(c, 'update') ? { error: { code: '23502', message: 'null value in column "stato" violates not-null constraint' } } : { data: null }
    const risultato = await eseguiStrumento(strumento('cambia_status'), { id: ID, status: 'Posted' }, contesto())
    expect(risultato.isError).toBe(true)
    expect(JSON.stringify(risultato)).not.toContain('not-null')
  })

  it('una lettura che non riesce: la frase generica, e il log ha solo la classe e il codice', async () => {
    rispondi = () => ({ error: { code: 'PGRST002', message: 'Could not query the database for the schema cache "Trazioni"' } })
    const risultato = await eseguiStrumento(strumento('elenco_contenuti'), {}, contesto())
    expect(risultato).toEqual({ content: [{ type: 'text', text: 'Non riesco a farlo adesso: riprova tra poco.' }], isError: true })
    const righe = log.flatMap((s) => s.mock.calls.map((c) => c.join(' ')))
    expect(righe.some((r) => r.includes('[mcp] errore classe=LetturaNonRiuscita codice=PGRST002'))).toBe(true)
    expect(righe.join('\n')).not.toContain('Trazioni')
  })

  it('un’eccezione non esce mai verso l’SDK', async () => {
    const rotto: Strumento = { ...strumento('etichette_contenuti'), esegui: async () => { throw new Error('dentro un testo: segreto') } }
    const risultato = await eseguiStrumento(rotto, {}, contesto())
    expect(risultato).toEqual({ content: [{ type: 'text', text: 'Non riesco a farlo adesso: riprova tra poco.' }], isError: true })
    expect(log.flatMap((s) => s.mock.calls).join('\n')).not.toContain('segreto')
  })

  it('oltre 60.000 caratteri non risponde con un risultato tagliato', async () => {
    const grande: Strumento = { ...strumento('etichette_contenuti'), esegui: async () => ({ ok: true, dati: { testo: 'x'.repeat(60_001) } }) }
    const risultato = await eseguiStrumento(grande, {}, contesto())
    expect(risultato.isError).toBe(true)
    expect(risultato.content).toEqual([{ type: 'text', text: 'Il risultato è troppo grande per Claude: restringi la richiesta.' }])
  })

  it('il log di una chiamata: strumento, esito, millisecondi e caratteri, mai il contenuto', async () => {
    rispondi = () => ({ data: riga({ nome: 'Nome segreto' }) })
    await eseguiStrumento(strumento('leggi_contenuto'), { id: ID }, contesto())
    const righe = log.flatMap((s) => s.mock.calls.map((c) => c.join(' ')))
    expect(righe).toEqual([expect.stringMatching(/^\[mcp\] strumento=leggi_contenuto esito=ok ms=\d+ caratteri=\d+$/)])
    expect(righe.join('\n')).not.toMatch(/Nome segreto|sessione-di-prova|marketing/)
  })

  it('al massimo 60 scritture al minuto per collegamento; le letture non contano', async () => {
    rispondi = (c) => (ha(c, 'update') ? { data: { updated_at: AGGIORNATO } } : { data: riga() })
    for (let i = 0; i < 70; i++) await eseguiStrumento(strumento('etichette_contenuti'), {}, contesto())
    for (let i = 0; i < 60; i++) {
      const r = await eseguiStrumento(strumento('cambia_status'), { id: ID, status: 'Posted' }, contesto())
      expect(r.isError, `chiamata ${i + 1}`).toBeUndefined()
    }
    const oltre = await eseguiStrumento(strumento('cambia_status'), { id: ID, status: 'Posted' }, contesto())
    expect(oltre).toEqual({
      content: [{ type: 'text', text: 'Troppe richieste in poco tempo: aspetta un minuto.' }],
      isError: true,
    })
  })
})
