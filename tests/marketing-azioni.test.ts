import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// The session: who taps. negaSeNon (lib/auth/azioni.ts) reads it.
const sessione = vi.hoisted(() => ({ ruolo: 'marketing', attivo: true }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => ({ id: 'p1', ...sessione })) }))

type Errore = { code?: string; message: string }
type Risposta = { data: unknown; error: Errore | null }

/**
 * A fake PostgREST client: every call is recorded, every awaited query takes
 * the next answer in line. Only what the actions use.
 */
const db = vi.hoisted(() => {
  const stato = { risposte: [] as Risposta[], chiamate: [] as [string, ...unknown[]][] }
  const prossima = () => Promise.resolve(stato.risposte.shift() ?? { data: null, error: null })
  function query(): Record<string, unknown> {
    const q: Record<string, unknown> = {}
    for (const metodo of ['insert', 'update', 'delete', 'select', 'eq']) {
      q[metodo] = (...args: unknown[]) => {
        stato.chiamate.push([metodo, ...args])
        return q
      }
    }
    q.single = prossima
    q.maybeSingle = prossima
    q.then = (ok: (r: Risposta) => unknown, ko: (e: unknown) => unknown) => prossima().then(ok, ko)
    return q
  }
  const client = {
    from: (tabella: string) => {
      stato.chiamate.push(['from', tabella])
      return query()
    },
    rpc: (nome: string, args: unknown) => {
      stato.chiamate.push(['rpc', nome, args])
      return prossima()
    },
    auth: { getUser: async () => ({ data: { user: { id: 'p1' } } }) },
  }
  return { stato, client }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => db.client) }))

import {
  cambiaStatusContenuto,
  creaContenuto,
  eliminaContenuto,
  modificaContenuto,
  salvaSezioneContenuto,
} from '@/app/(app)/marketing/contenuti/actions'
import { BOZZA_REEL } from '@/lib/marketing/etichette'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'
const VERSIONE = '2026-10-09T08:15:42.123456+00:00'
const NUOVA = '2026-10-09T08:16:00.000001+00:00'
const IMPRONTA = 'd41d8cd98f00b204e9800998ecf8427e'

function risponde(...risposte: Risposta[]) {
  db.stato.risposte.push(...risposte)
}

function chiamate(metodo: string) {
  return db.stato.chiamate.filter(([m]) => m === metodo).map(([, ...args]) => args)
}

beforeEach(() => {
  db.stato.risposte.length = 0
  db.stato.chiamate.length = 0
  sessione.ruolo = 'marketing'
  sessione.attivo = true
})

describe('chi usa il calendario dei contenuti', () => {
  it('admin, video editor e marketing; gli altri ruoli no, con le parole dell’area', async () => {
    for (const ruolo of ['admin', 'editor', 'marketing']) {
      sessione.ruolo = ruolo
      risponde({ data: { updated_at: NUOVA }, error: null })
      expect(await cambiaStatusContenuto({ id: ID, stato: 'posted' })).toEqual({ ok: true, versione: NUOVA })
    }
    for (const ruolo of ['setter', 'closer', 'coach', 'nutrizione', 'dev']) {
      sessione.ruolo = ruolo
      expect(await cambiaStatusContenuto({ id: ID, stato: 'posted' })).toEqual({
        ok: false,
        errore: 'Il calendario dei contenuti è dell’area Marketing.',
      })
    }
    sessione.ruolo = 'marketing'
    sessione.attivo = false
    expect(await cambiaStatusContenuto({ id: ID, stato: 'posted' })).toEqual({
      ok: false,
      errore: 'Sessione scaduta. Rientra e riprova.',
    })
  })

  it('i dati non validi si fermano prima del database', async () => {
    expect(await creaContenuto({ tipo: 'reel', nome: '  ' })).toEqual({ ok: false, errore: 'Scrivi il nome.' })
    expect(await salvaSezioneContenuto({ id: ID, campo: 'finale', testo: 'x', impronta: 'abc' })).toMatchObject({ ok: false })
    expect(db.stato.chiamate.filter(([m]) => m === 'from' || m === 'rpc')).toEqual([])
  })
})

describe('creaContenuto', () => {
  it('un Reel Topic nasce con Hook, Line, Line, CTA; restituisce id e versione', async () => {
    risponde({ data: { id: ID, updated_at: NUOVA }, error: null })
    expect(await creaContenuto({ tipo: 'reel', nome: 'Trazioni', post_date: '2026-10-12' })).toEqual({
      ok: true,
      id: ID,
      versione: NUOVA,
    })
    expect(chiamate('insert')[0][0]).toMatchObject({ tipo: 'reel', nome: 'Trazioni', post_date: '2026-10-12', bozza: BOZZA_REEL })
  })

  it('un Carousel Topic nasce con le sezioni vuote', async () => {
    risponde({ data: { id: ID, updated_at: NUOVA }, error: null })
    await creaContenuto({ tipo: 'carousel', nome: 'Tre errori' })
    expect(chiamate('insert')[0][0]).toMatchObject({ tipo: 'carousel', bozza: null })
  })

  it('lo stesso post su un altro contenuto (23505) e il rifiuto di RLS hanno le loro parole', async () => {
    risponde({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "marketing_contenuti_shortcode_idx"' } })
    expect(await creaContenuto({ tipo: 'reel', nome: 'X', url: 'https://www.instagram.com/reel/ABCdef12345/' })).toEqual({
      ok: false,
      errore: 'Questo post è già collegato a un altro contenuto.',
    })
    risponde({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "marketing_contenuti"' } })
    expect(await creaContenuto({ tipo: 'reel', nome: 'X' })).toEqual({
      ok: false,
      errore: 'Il calendario dei contenuti è dell’area Marketing.',
    })
    risponde({ data: null, error: { code: '08006', message: 'connection failure' } })
    expect(await creaContenuto({ tipo: 'reel', nome: 'X' })).toEqual({ ok: false, errore: 'Contenuto non salvato. Riprova.' })
  })
})

describe('modificaContenuto', () => {
  const proprieta = { id: ID, versione: VERSIONE, tipo: 'reel', nome: 'Trazioni', audio: 'Brano', stato: 'to_be_edited' }

  it('salva sopra la versione letta e restituisce la nuova', async () => {
    risponde({ data: { updated_at: NUOVA }, error: null })
    expect(await modificaContenuto(proprieta)).toEqual({ ok: true, versione: NUOVA })
    expect(chiamate('eq')).toEqual([
      ['id', ID],
      ['updated_at', VERSIONE],
    ])
    expect(chiamate('update')[0][0]).not.toHaveProperty('id')
    expect(chiamate('update')[0][0]).not.toHaveProperty('versione')
  })

  it('una versione cambiata da un’altra parte non sovrascrive niente: cambiato', async () => {
    risponde({ data: null, error: null }, { data: { id: ID }, error: null })
    expect(await modificaContenuto(proprieta)).toEqual({
      ok: false,
      errore: 'Il contenuto è cambiato da un’altra parte: ricarico i dati salvati.',
      cambiato: true,
    })
  })

  it('un contenuto eliminato nel frattempo lo dice', async () => {
    risponde({ data: null, error: null }, { data: null, error: null })
    expect(await modificaContenuto(proprieta)).toEqual({ ok: false, errore: 'Questo contenuto non c’è più.' })
  })
})

describe('cambiaStatusContenuto', () => {
  it('un tocco, senza versione: restituisce la nuova; un contenuto che non c’è lo dice', async () => {
    risponde({ data: { updated_at: NUOVA }, error: null })
    expect(await cambiaStatusContenuto({ id: ID, stato: 'to_be_edited' })).toEqual({ ok: true, versione: NUOVA })
    expect(chiamate('update')[0][0]).toEqual({ stato: 'to_be_edited' })
    expect(chiamate('eq')).toEqual([['id', ID]])
    risponde({ data: null, error: null })
    expect(await cambiaStatusContenuto({ id: ID, stato: 'posted' })).toEqual({
      ok: false,
      errore: 'Questo contenuto non c’è più.',
    })
  })
})

describe('salvaSezioneContenuto', () => {
  const sezione = { id: ID, campo: 'finale', testo: 'Script finale', impronta: IMPRONTA }

  it('salvata: la nuova impronta e la versione', async () => {
    risponde({ data: { esito: 'salvata', impronta: 'a'.repeat(32), versione: NUOVA }, error: null })
    expect(await salvaSezioneContenuto(sezione)).toEqual({ ok: true, impronta: 'a'.repeat(32), versione: NUOVA })
    expect(chiamate('rpc')).toEqual([
      ['salva_sezione_contenuto', { p_id: ID, p_campo: 'finale', p_testo: 'Script finale', p_impronta: IMPRONTA }],
    ])
  })

  it('cambiata: il testo salvato adesso, per mostrarlo; il testo della persona resta a lei', async () => {
    risponde({ data: { esito: 'cambiata', attuale: 'Di un altro', impronta: 'b'.repeat(32), versione: NUOVA }, error: null })
    expect(await salvaSezioneContenuto(sezione)).toEqual({
      ok: false,
      errore:
        'Questa parte è cambiata da un’altra parte: ricarico il testo salvato. Il tuo testo resta qui sotto: copialo se ti serve.',
      cambiata: { attuale: 'Di un altro', impronta: 'b'.repeat(32), versione: NUOVA },
    })
    risponde({ data: { esito: 'cambiata', attuale: null, impronta: IMPRONTA, versione: NUOVA }, error: null })
    expect(await salvaSezioneContenuto(sezione)).toMatchObject({ cambiata: { attuale: null } })
  })

  it('sparito: il contenuto non c’è più', async () => {
    risponde({ data: { esito: 'sparito' }, error: null })
    expect(await salvaSezioneContenuto(sezione)).toEqual({
      ok: false,
      errore: 'Questo contenuto non c’è più.',
      sparito: true,
    })
  })

  it('il 22023 del database passa con le sue parole', async () => {
    risponde({ data: null, error: { code: '22023', message: 'Il testo supera i 30.000 caratteri: accorcialo.' } })
    expect(await salvaSezioneContenuto(sezione)).toEqual({
      ok: false,
      errore: 'Il testo supera i 30.000 caratteri: accorcialo.',
    })
  })
})

describe('eliminaContenuto', () => {
  it('admin e marketing eliminano; il video editor no, e gli si dice di segnarlo Canceled', async () => {
    sessione.ruolo = 'editor'
    expect(await eliminaContenuto({ id: ID })).toEqual({
      ok: false,
      errore: 'Solo l’admin e il marketing eliminano un contenuto: puoi segnarlo «Canceled».',
    })
    expect(chiamate('delete')).toEqual([])
    for (const ruolo of ['admin', 'marketing']) {
      sessione.ruolo = ruolo
      risponde({ data: [{ id: ID }], error: null })
      expect(await eliminaContenuto({ id: ID })).toEqual({ ok: true })
    }
  })

  it('niente eliminato: non c’è più', async () => {
    risponde({ data: [], error: null })
    expect(await eliminaContenuto({ id: ID })).toEqual({ ok: false, errore: 'Questo contenuto non c’è più.' })
  })
})
