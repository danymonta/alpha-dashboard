import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabaseFinto } from './helpers/supabase-finto'

vi.mock('server-only', () => ({}))
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
// the core never asks who is calling: the caller's guard did, and RLS decides
const sessione = vi.hoisted(() => ({
  getProfilo: vi.fn(async () => {
    throw new Error('il nucleo non legge la sessione')
  }),
}))
vi.mock('@/lib/auth/session', () => sessione)

import { BOZZA_REEL } from '@/lib/marketing/etichette'
import {
  cambiaStatusContenuto,
  creaContenuto,
  eliminaContenuto,
  modificaContenuto,
  salvaSezioneContenuto,
  type Db,
} from '@/lib/marketing/operazioni'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'
const VERSIONE = '2026-10-09T08:15:42.123456+00:00'
const NUOVA = '2026-10-09T08:16:00.000001+00:00'
const ULTIMA = '2026-10-09T08:16:01.000002+00:00'
const VUOTA = 'd41d8cd98f00b204e9800998ecf8427e'
const md5 = (t: string) => createHash('md5').update(t, 'utf8').digest('hex')

let finto: ReturnType<typeof supabaseFinto>
let db: Db

beforeEach(() => {
  finto = supabaseFinto()
  db = finto.client as unknown as Db
  cache.revalidatePath.mockClear()
  sessione.getProfilo.mockClear()
})

describe('il nucleo di scrittura del calendario', () => {
  it('scrive col client che riceve, mai con un altro e mai leggendo la sessione', async () => {
    const altro = supabaseFinto()
    finto.risponde({ data: { updated_at: NUOVA } })
    expect(await cambiaStatusContenuto(db, { id: ID, stato: 'posted' })).toEqual({ ok: true, versione: NUOVA })
    expect(finto.query).toHaveLength(1)
    expect(altro.intatto()).toBe(true)
    expect(sessione.getProfilo).not.toHaveBeenCalled()
  })

  it('rinfresca l’elenco e la pagina del contenuto, così una modifica di Claude si vede nell’app', async () => {
    finto.risponde({ data: { updated_at: NUOVA } })
    await cambiaStatusContenuto(db, { id: ID, stato: 'posted' })
    expect(cache.revalidatePath.mock.calls).toEqual([['/marketing/contenuti'], [`/marketing/contenuti/${ID}`]])
  })

  it('i dati non validi si fermano prima del database, con le parole dei moduli', async () => {
    expect(await creaContenuto(db, { tipo: 'reel', nome: '  ' })).toEqual({ ok: false, errore: 'Scrivi il nome.' })
    expect(await modificaContenuto(db, { id: ID, tipo: 'reel', nome: 'X', versione: 'ieri' })).toEqual({
      ok: false,
      errore: 'Contenuto non valido.',
    })
    expect(await cambiaStatusContenuto(db, { id: ID, stato: 'Posted' })).toEqual({ ok: false, errore: 'Scegli lo Status.' })
    expect(await salvaSezioneContenuto(db, { id: ID, campo: 'finale', testo: 'x', impronta: 'abc' })).toEqual({
      ok: false,
      errore: 'Ricarica la pagina e riprova.',
    })
    expect(await eliminaContenuto(db, { id: 'non-un-id' })).toEqual({ ok: false, errore: 'Contenuto non valido.' })
    expect(finto.intatto()).toBe(true)
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('creaContenuto', () => {
  it('un Reel Topic nasce con Hook, Line, Line, CTA; restituisce id e versione', async () => {
    finto.risponde({ data: { id: ID, updated_at: NUOVA } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'Trazioni', post_date: '2026-10-12' })).toEqual({
      ok: true,
      id: ID,
      versione: NUOVA,
      sezioni: {},
    })
    expect(finto.query[0].tabella).toBe('marketing_contenuti')
    expect(finto.passi('insert')[0][0]).toMatchObject({
      tipo: 'reel',
      nome: 'Trazioni',
      post_date: '2026-10-12',
      stato: 'not_started',
      bozza: BOZZA_REEL,
    })
    expect(finto.passi('select')).toEqual([['id, updated_at']])
    expect(finto.rpc).toEqual([])
  })

  it('un Carousel Topic nasce con le sezioni vuote', async () => {
    finto.risponde({ data: { id: ID, updated_at: NUOVA } })
    await creaContenuto(db, { tipo: 'carousel', nome: 'Tre errori' })
    expect(finto.passi('insert')[0][0]).toMatchObject({ tipo: 'carousel', bozza: null })
  })

  it('lo stesso post su un altro contenuto (23505), il rifiuto di RLS e gli altri errori hanno le loro parole', async () => {
    finto.risponde({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X', url: 'https://www.instagram.com/reel/ABCdef12345/' })).toEqual({
      ok: false,
      errore: 'Questo post è già collegato a un altro contenuto.',
    })
    finto.risponde({
      error: { code: '42501', message: 'new row violates row-level security policy for table "marketing_contenuti"' },
    })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' })).toEqual({
      ok: false,
      errore: 'Il calendario dei contenuti è dell’area Marketing.',
    })
    finto.risponde({ error: { code: '42501', message: 'Da Claude si usa solo il calendario dei contenuti.' } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' })).toEqual({
      ok: false,
      errore: 'Da Claude si usa solo il calendario dei contenuti.',
    })
    finto.risponde({ error: { code: '08006', message: 'connection failure' } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' })).toEqual({ ok: false, errore: 'Contenuto non salvato. Riprova.' })
  })
})

describe('creaContenuto con i testi delle sezioni', () => {
  it('ogni sezione si salva, nell’ordine del modello, sopra il testo che l’inserimento ha scritto', async () => {
    finto.risponde(
      { data: { id: ID, updated_at: NUOVA } },
      { data: { esito: 'salvata', impronta: 'a'.repeat(32), versione: VERSIONE } },
      { data: { esito: 'salvata', impronta: 'b'.repeat(32), versione: ULTIMA } },
    )
    // given out of order: the template's order wins
    const esito = await creaContenuto(db, { tipo: 'reel', nome: 'Trazioni' }, { finale: 'Script finale', bozza: 'Hook: tre errori' })
    expect(esito).toEqual({ ok: true, id: ID, versione: ULTIMA, sezioni: { bozza: true, finale: true } })
    expect(finto.rpc).toEqual([
      {
        nome: 'salva_sezione_contenuto',
        args: { p_id: ID, p_campo: 'bozza', p_testo: 'Hook: tre errori', p_impronta: md5(BOZZA_REEL) },
      },
      {
        nome: 'salva_sezione_contenuto',
        args: { p_id: ID, p_campo: 'finale', p_testo: 'Script finale', p_impronta: VUOTA },
      },
    ])
    expect(cache.revalidatePath.mock.calls).toEqual([['/marketing/contenuti'], [`/marketing/contenuti/${ID}`]])
  })

  it('un carosello prende anche i Comments; le sezioni uguali a quelle del modello non si riscrivono', async () => {
    finto.risponde(
      { data: { id: ID, updated_at: NUOVA } },
      { data: { esito: 'salvata', impronta: 'c'.repeat(32), versione: ULTIMA } },
    )
    const esito = await creaContenuto(db, { tipo: 'carousel', nome: 'Tre errori' }, { messaggio: '  \n', commenti: 'Ottimo' })
    expect(esito).toEqual({ ok: true, id: ID, versione: ULTIMA, sezioni: { messaggio: true, commenti: true } })
    expect(finto.rpc.map((r) => (r.args as { p_campo: string }).p_campo)).toEqual(['commenti'])

    finto.risponde({ data: { id: ID, updated_at: NUOVA } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' }, { bozza: `${BOZZA_REEL}\n\n` })).toEqual({
      ok: true,
      id: ID,
      versione: NUOVA,
      sezioni: { bozza: true },
    })
    expect(finto.rpc).toHaveLength(1)
  })

  it('un testo troppo lungo o non valido ferma tutto prima dell’inserimento, col nome della sezione', async () => {
    const lungo = '💪'.repeat(30_001)
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' }, { messaggio: 'ok', finale: lungo })).toEqual({
      ok: false,
      errore: 'Script (Final): Il testo supera i 30.000 caratteri: accorcialo.',
    })
    expect(await creaContenuto(db, { tipo: 'carousel', nome: 'X' }, { finale: lungo })).toEqual({
      ok: false,
      errore: 'Caption: Il testo supera i 30.000 caratteri: accorcialo.',
    })
    expect(
      await creaContenuto(db, { tipo: 'reel', nome: 'X' }, { bozza: 42 } as unknown as Record<string, string>),
    ).toEqual({ ok: false, errore: 'Script (Rough Draft): Testo non valido.' })
    expect(finto.intatto()).toBe(true)
  })

  it('30.000 caratteri (emoji, contati come Postgres) più righe vuote in fondo passano', async () => {
    finto.risponde(
      { data: { id: ID, updated_at: NUOVA } },
      { data: { esito: 'salvata', impronta: 'a'.repeat(32), versione: ULTIMA } },
    )
    const testo = `${'💪'.repeat(30_000)}\n\n   \n`
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' }, { finale: testo })).toMatchObject({
      ok: true,
      sezioni: { finale: true },
    })
    expect(finto.rpc[0].args).toMatchObject({ p_testo: testo })
  })

  it('una sezione che non si salva si dice per nome e non ferma le altre né disfa il contenuto', async () => {
    finto.risponde(
      { data: { id: ID, updated_at: NUOVA } },
      { error: { code: '22023', message: 'Sezione non valida.' } },
      { data: { esito: 'cambiata', attuale: 'Di un altro', impronta: 'b'.repeat(32), versione: VERSIONE } },
      { data: { esito: 'salvata', impronta: 'c'.repeat(32), versione: ULTIMA } },
    )
    const esito = await creaContenuto(
      db,
      { tipo: 'reel', nome: 'X' },
      { messaggio: 'Uno', bozza: 'Due', commenti: 'Tre' },
    )
    expect(esito).toEqual({
      ok: true,
      id: ID,
      versione: ULTIMA,
      sezioni: {
        messaggio: 'Sezione non valida.',
        bozza: 'Questa parte è cambiata da un’altra parte: rileggila prima di riscriverla.',
        commenti: true,
      },
    })
    expect(finto.passi('delete')).toEqual([])
  })

  it('senza nessuna sezione salvata la versione resta quella dell’inserimento', async () => {
    finto.risponde({ data: { id: ID, updated_at: NUOVA } }, { data: { esito: 'sparito' } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' }, { finale: 'Testo' })).toEqual({
      ok: true,
      id: ID,
      versione: NUOVA,
      sezioni: { finale: 'Questo contenuto non c’è più.' },
    })
  })

  it('un inserimento rifiutato non scrive nessuna sezione', async () => {
    finto.risponde({ error: { code: '42501', message: 'new row violates row-level security policy' } })
    expect(await creaContenuto(db, { tipo: 'reel', nome: 'X' }, { finale: 'Testo' })).toEqual({
      ok: false,
      errore: 'Il calendario dei contenuti è dell’area Marketing.',
    })
    expect(finto.rpc).toEqual([])
  })
})

describe('modificaContenuto', () => {
  const proprieta = { id: ID, versione: VERSIONE, tipo: 'reel', nome: 'Trazioni', audio: 'Brano', stato: 'to_be_edited' }

  it('salva sopra la versione letta e restituisce la nuova', async () => {
    finto.risponde({ data: { updated_at: NUOVA } })
    expect(await modificaContenuto(db, proprieta)).toEqual({ ok: true, versione: NUOVA })
    expect(finto.passi('eq')).toEqual([
      ['id', ID],
      ['updated_at', VERSIONE],
    ])
    const scritto = finto.passi('update')[0][0]
    expect(scritto).toMatchObject({ nome: 'Trazioni', audio: 'Brano', stato: 'to_be_edited', reel_type: null })
    expect(scritto).not.toHaveProperty('id')
    expect(scritto).not.toHaveProperty('versione')
  })

  it('una versione cambiata da un’altra parte non sovrascrive niente: cambiato', async () => {
    finto.risponde({ data: null }, { data: { id: ID } })
    expect(await modificaContenuto(db, proprieta)).toEqual({
      ok: false,
      errore: 'Il contenuto è cambiato da un’altra parte: ricarico i dati salvati.',
      cambiato: true,
    })
  })

  it('un contenuto eliminato nel frattempo lo dice; una rilettura che non riesce no', async () => {
    finto.risponde({ data: null }, { data: null })
    expect(await modificaContenuto(db, proprieta)).toEqual({ ok: false, errore: 'Questo contenuto non c’è più.' })
    finto.risponde({ data: null }, { error: { code: '08006', message: 'connection failure' } })
    expect(await modificaContenuto(db, proprieta)).toEqual({ ok: false, errore: 'Contenuto non salvato. Riprova.' })
  })
})

describe('cambiaStatusContenuto', () => {
  it('un tocco, senza versione: restituisce la nuova; un contenuto che non c’è lo dice', async () => {
    finto.risponde({ data: { updated_at: NUOVA } })
    expect(await cambiaStatusContenuto(db, { id: ID, stato: 'to_be_edited' })).toEqual({ ok: true, versione: NUOVA })
    expect(finto.passi('update')).toEqual([[{ stato: 'to_be_edited' }]])
    expect(finto.passi('eq')).toEqual([['id', ID]])
    finto.risponde({ data: null })
    expect(await cambiaStatusContenuto(db, { id: ID, stato: 'posted' })).toEqual({
      ok: false,
      errore: 'Questo contenuto non c’è più.',
    })
  })
})

describe('salvaSezioneContenuto', () => {
  const sezione = { id: ID, campo: 'finale', testo: 'Script finale', impronta: VUOTA }

  it('salvata: la nuova impronta e la versione', async () => {
    finto.risponde({ data: { esito: 'salvata', impronta: 'a'.repeat(32), versione: NUOVA } })
    expect(await salvaSezioneContenuto(db, sezione)).toEqual({ ok: true, impronta: 'a'.repeat(32), versione: NUOVA })
    expect(finto.rpc).toEqual([
      {
        nome: 'salva_sezione_contenuto',
        args: { p_id: ID, p_campo: 'finale', p_testo: 'Script finale', p_impronta: VUOTA },
      },
    ])
  })

  it('cambiata: il testo salvato adesso, per mostrarlo', async () => {
    finto.risponde({ data: { esito: 'cambiata', attuale: 'Di un altro', impronta: 'b'.repeat(32), versione: NUOVA } })
    expect(await salvaSezioneContenuto(db, sezione)).toEqual({
      ok: false,
      errore:
        'Questa parte è cambiata da un’altra parte: ricarico il testo salvato. Il tuo testo resta qui sotto: copialo se ti serve.',
      cambiata: { attuale: 'Di un altro', impronta: 'b'.repeat(32), versione: NUOVA },
    })
  })

  it('sparito: il contenuto non c’è più', async () => {
    finto.risponde({ data: { esito: 'sparito' } })
    expect(await salvaSezioneContenuto(db, sezione)).toEqual({
      ok: false,
      errore: 'Questo contenuto non c’è più.',
      sparito: true,
    })
  })

  it('il 22023 del database passa con le sue parole; una risposta senza senso non rinfresca niente', async () => {
    finto.risponde({ error: { code: '22023', message: 'Il testo supera i 30.000 caratteri: accorcialo.' } })
    expect(await salvaSezioneContenuto(db, sezione)).toEqual({
      ok: false,
      errore: 'Il testo supera i 30.000 caratteri: accorcialo.',
    })
    finto.risponde({ data: { esito: 'salvata' } })
    expect(await salvaSezioneContenuto(db, sezione)).toEqual({ ok: false, errore: 'Contenuto non salvato. Riprova.' })
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('eliminaContenuto', () => {
  it('elimina e lo dice; niente eliminato (RLS lo nasconde, o non c’è più): non c’è più', async () => {
    finto.risponde({ data: [{ id: ID }] })
    expect(await eliminaContenuto(db, { id: ID })).toEqual({ ok: true })
    expect(finto.passi('delete')).toEqual([[]])
    expect(finto.passi('eq')).toEqual([['id', ID]])
    finto.risponde({ data: [] })
    expect(await eliminaContenuto(db, { id: ID })).toEqual({ ok: false, errore: 'Questo contenuto non c’è più.' })
  })

  it('un errore del database: le nostre frasi passano, le altre no', async () => {
    finto.risponde({ error: { code: '42501', message: 'Da Claude si usa solo il calendario dei contenuti.' } })
    expect(await eliminaContenuto(db, { id: ID })).toEqual({
      ok: false,
      errore: 'Da Claude si usa solo il calendario dei contenuti.',
    })
    finto.risponde({ error: { code: 'PGRST301', message: 'JWT expired' } })
    expect(await eliminaContenuto(db, { id: ID })).toEqual({ ok: false, errore: 'Contenuto non eliminato. Riprova.' })
  })
})
