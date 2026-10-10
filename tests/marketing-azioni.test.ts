import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const rivalida = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath: rivalida }))

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
    for (const metodo of ['insert', 'update', 'delete', 'select', 'eq', 'is']) {
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
  modificaCampoContenuto,
  salvaSezioneContenuto,
} from '@/app/(app)/marketing/contenuti/actions'
import { BOZZA_REEL } from '@/lib/marketing/etichette'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'
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
  rivalida.mockClear()
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

describe('modificaCampoContenuto (un campo alla volta, 1.33.0)', () => {
  const riga = (campi: Record<string, unknown>) => ({ id: ID, updated_at: NUOVA, ...campi })

  it('scrive solo il suo campo, solo sopra il valore mostrato, e restituisce il valore salvato con la versione', async () => {
    risponde({ data: riga({ post_date: '2026-10-12' }), error: null })
    expect(await modificaCampoContenuto({ id: ID, campo: 'post_date', valore: '2026-10-12', prima: '2026-10-10' })).toEqual({
      ok: true,
      valore: '2026-10-12',
      versione: NUOVA,
    })
    expect(chiamate('update')).toEqual([[{ post_date: '2026-10-12' }]])
    expect(chiamate('eq')).toEqual([
      ['id', ID],
      ['post_date', '2026-10-10'],
    ])
    expect(rivalida).toHaveBeenCalledWith('/marketing', 'layout')
  })

  it('un campo vuoto si confronta con is null; il valore va normalizzato dallo schema', async () => {
    risponde({ data: riga({ view_count: 12480 }), error: null })
    expect(await modificaCampoContenuto({ id: ID, campo: 'view_count', valore: '12.480', prima: null })).toMatchObject({
      ok: true,
      valore: 12480,
    })
    expect(chiamate('update')).toEqual([[{ view_count: 12480 }]])
    expect(chiamate('is')).toEqual([['view_count', null]])
  })

  it('cambiato da un altro nel frattempo: niente scritto, il valore salvato adesso e la frase del campo', async () => {
    risponde({ data: null, error: null }, { data: riga({ post_date: '2026-10-20' }), error: null })
    expect(await modificaCampoContenuto({ id: ID, campo: 'post_date', valore: '2026-10-12', prima: '2026-10-10' })).toEqual({
      ok: false,
      errore: 'Il campo «Post Date» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.',
      cambiato: { valore: '2026-10-20', versione: NUOVA },
    })
    // the page is redrawn with the saved value, also on a conflict
    expect(rivalida).toHaveBeenCalled()
  })

  it('il Modello ha il suo nome nella frase', async () => {
    risponde({ data: null, error: null }, { data: riga({ tipo: 'carousel' }), error: null })
    expect(await modificaCampoContenuto({ id: ID, campo: 'tipo', valore: 'reel', prima: 'reel' })).toMatchObject({
      errore: 'Il campo «Modello» è cambiato da un’altra parte: ora vedi quello salvato. Rifai la modifica, se serve.',
    })
  })

  it('un collega ha già scritto lo stesso valore: va bene così', async () => {
    risponde({ data: null, error: null }, { data: riga({ audio: 'Brano' }), error: null })
    expect(await modificaCampoContenuto({ id: ID, campo: 'audio', valore: ' Brano ', prima: null })).toEqual({
      ok: true,
      valore: 'Brano',
      versione: NUOVA,
    })
  })

  it('un contenuto eliminato nel frattempo lo dice', async () => {
    risponde({ data: null, error: null }, { data: null, error: null })
    expect(await modificaCampoContenuto({ id: ID, campo: 'nome', valore: 'Nuovo', prima: 'Vecchio' })).toEqual({
      ok: false,
      errore: 'Questo contenuto non c’è più.',
      sparito: true,
    })
  })

  it('lo stesso post su un altro contenuto (23505) e il rifiuto di RLS hanno le loro parole', async () => {
    risponde({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    expect(
      await modificaCampoContenuto({ id: ID, campo: 'url', valore: 'https://www.instagram.com/reel/ABCdef12345/', prima: null }),
    ).toEqual({ ok: false, errore: 'Questo post è già collegato a un altro contenuto.' })
    risponde({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } })
    expect(await modificaCampoContenuto({ id: ID, campo: 'audio', valore: 'X', prima: null })).toEqual({
      ok: false,
      errore: 'Il calendario dei contenuti è dell’area Marketing.',
    })
  })

  it('i dati non validi e i ruoli fuori dall’area si fermano prima del database', async () => {
    expect(await modificaCampoContenuto({ id: ID, campo: 'url', valore: 'https://www.instagram.com/share/p/X/', prima: null })).toEqual({
      ok: false,
      errore: 'Questo è un link di condivisione: apri il post e copia l’indirizzo dal browser.',
    })
    // the Status is not a field here: one tap, cambiaStatusContenuto
    expect(
      await modificaCampoContenuto({ id: ID, campo: 'stato', valore: 'posted', prima: 'not_started' } as never),
    ).toEqual({ ok: false, errore: 'Campo non valido.' })
    for (const ruolo of ['setter', 'closer', 'coach']) {
      sessione.ruolo = ruolo
      expect(await modificaCampoContenuto({ id: ID, campo: 'audio', valore: 'X', prima: null })).toEqual({
        ok: false,
        errore: 'Il calendario dei contenuti è dell’area Marketing.',
      })
    }
    expect(db.stato.chiamate.filter(([m]) => m === 'from')).toEqual([])
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
