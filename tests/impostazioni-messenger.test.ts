import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Who taps: negaSeNon (lib/auth/azioni.ts) reads the profile
const sessione = vi.hoisted(() => ({ ruolo: 'admin', attivo: true }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => ({ id: 'p1', ...sessione })) }))

type Errore = { code?: string; message: string }
type Risposta = { data: unknown; error: Errore | null }

/** A fake PostgREST client: every call recorded, every awaited query takes the next answer in line. */
const db = vi.hoisted(() => {
  const stato = { risposte: [] as Risposta[], chiamate: [] as [string, ...unknown[]][] }
  const prossima = () => Promise.resolve(stato.risposte.shift() ?? { data: null, error: null })
  function query(): Record<string, unknown> {
    const q: Record<string, unknown> = {}
    for (const metodo of ['insert', 'update', 'delete', 'select', 'eq', 'order']) {
      q[metodo] = (...args: unknown[]) => {
        stato.chiamate.push([metodo, ...args])
        return q
      }
    }
    q.maybeSingle = prossima
    q.then = (ok: (r: Risposta) => unknown, ko: (e: unknown) => unknown) => prossima().then(ok, ko)
    return q
  }
  const client = {
    from: (tabella: string) => {
      stato.chiamate.push(['from', tabella])
      return query()
    },
    rpc: (nome: string, args?: unknown) => {
      stato.chiamate.push(['rpc', nome, args])
      return prossima()
    },
  }
  return { stato, client }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => db.client) }))

// Meta: never the real one. The Page and one conversation, or the error the test wants.
const meta = vi.hoisted(() => ({
  opzioni: [] as unknown[],
  pagina: vi.fn(async () => ({ id: '1234567890', nome: 'Percorso Alpha' }) as { id: string; nome: string | null }),
  conversazioni: vi.fn(async () => [{ id: 't_1' }]),
}))
vi.mock('@/lib/messenger/graph', async (originale) => ({
  ...(await originale<typeof import('@/lib/messenger/graph')>()),
  creaGraphMessenger: vi.fn((op: unknown) => {
    meta.opzioni.push(op)
    return { pagina: meta.pagina, conversazioniRecenti: meta.conversazioni }
  }),
}))

import {
  aggiungiEsclusioneInstagram,
  escludiChatMessenger,
  salvaTokenMessenger,
  togliEsclusioneMessenger,
  togliTokenMessenger,
} from '@/app/(app)/settings/instagram/actions'
import { ErroreInstagram } from '@/lib/instagram/richieste'
import { TOKEN_PAGINA_NON_VALIDO } from '@/lib/validation/insight'

// invented, shaped like a Page token: never a real one
const TOKEN = 'EAAe2eFintoPaginaQwErTyUiOpAsDfGhJkL1234567890'
const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})

function conToken(valore: string): FormData {
  const dati = new FormData()
  dati.set('token', valore)
  return dati
}

function rpcChiamate() {
  return db.stato.chiamate.filter((c) => c[0] === 'rpc').map((c) => [c[1], c[2]])
}

beforeEach(() => {
  sessione.ruolo = 'admin'
  sessione.attivo = true
  db.stato.risposte = []
  db.stato.chiamate = []
  meta.opzioni = []
  meta.pagina.mockReset().mockResolvedValue({ id: '1234567890', nome: 'Percorso Alpha' })
  meta.conversazioni.mockReset().mockResolvedValue([{ id: 't_1' }])
  avvisi.mockClear()
})

describe('il token della Pagina (Messenger)', () => {
  it('pulito, provato su Meta, salvato nel Vault: la risposta dice solo la Pagina', async () => {
    const esito = await salvaTokenMessenger(conToken(`  "FB_PAGE_TOKEN=${TOKEN}"\n`))
    expect(esito).toEqual({ ok: true, pagina: 'Percorso Alpha' })
    expect(JSON.stringify(esito)).not.toContain(TOKEN)
    // proved with the cleaned token: the Page, then one conversation
    expect(meta.opzioni).toHaveLength(1)
    expect((meta.opzioni[0] as { token: string }).token).toBe(TOKEN)
    expect(meta.pagina).toHaveBeenCalledOnce()
    expect(meta.conversazioni).toHaveBeenCalledWith(1)
    expect(rpcChiamate()).toEqual([
      ['messenger_imposta_token', { p_token: TOKEN, p_pagina_id: '1234567890', p_pagina_nome: 'Percorso Alpha' }],
    ])
  })

  it('solo dentro un FormData: un argomento semplice non passa', async () => {
    expect(await salvaTokenMessenger(TOKEN)).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    expect(await salvaTokenMessenger({ token: TOKEN })).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    expect(meta.opzioni).toEqual([])
    expect(rpcChiamate()).toEqual([])
  })

  it('vuoto o malformato: nessuna richiesta a Meta', async () => {
    expect(await salvaTokenMessenger(conToken('   '))).toEqual({
      ok: false,
      errore: 'Incolla il token della Pagina copiato da Meta.',
    })
    expect(await salvaTokenMessenger(conToken('corto'))).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    expect(meta.opzioni).toEqual([])
  })

  it('rifiutato da Meta, o senza accesso ai messaggi: non si salva, e il log non ha il token', async () => {
    meta.pagina.mockRejectedValueOnce(new ErroreInstagram('token', 'Token non valido', { code: 190 }))
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    meta.conversazioni.mockRejectedValueOnce(new ErroreInstagram('meta', 'Permesso mancante', { code: 10 }))
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    // the phase 0 stub, or any other failure
    meta.pagina.mockRejectedValueOnce(new Error(`qualcosa con ${TOKEN}`))
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    expect(rpcChiamate()).toEqual([])
    expect(JSON.stringify(avvisi.mock.calls)).not.toContain(TOKEN)
  })

  it('Meta che non risponde non è un token sbagliato', async () => {
    meta.pagina.mockRejectedValueOnce(new ErroreInstagram('rete', 'Messenger non raggiungibile (rete)'))
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({
      ok: false,
      errore: 'Meta non ha risposto: riprova tra qualche minuto.',
    })
    meta.pagina.mockRejectedValueOnce(new ErroreInstagram('limite', 'Troppe richieste', { code: 4 }))
    expect((await salvaTokenMessenger(conToken(TOKEN))).ok).toBe(false)
    expect(rpcChiamate()).toEqual([])
  })

  it('una Pagina senza nome si salva senza nome; un id che non è della Pagina no', async () => {
    meta.pagina.mockResolvedValueOnce({ id: '42', nome: null })
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({ ok: true, pagina: null })
    expect(rpcChiamate()[0]?.[1]).toEqual({ p_token: TOKEN, p_pagina_id: '42', p_pagina_nome: null })
    meta.pagina.mockResolvedValueOnce({ id: 'non-numerico', nome: 'X' })
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({ ok: false, errore: TOKEN_PAGINA_NON_VALIDO })
    expect(rpcChiamate()).toHaveLength(1)
  })

  it('le frasi del database passano come sono', async () => {
    db.stato.risposte.push({ data: null, error: { code: '22023', message: 'Token della Pagina non valido.' } })
    expect(await salvaTokenMessenger(conToken(TOKEN))).toEqual({ ok: false, errore: 'Token della Pagina non valido.' })
  })

  it('solo l’admin, prima di toccare Meta', async () => {
    sessione.ruolo = 'setter'
    expect((await salvaTokenMessenger(conToken(TOKEN))).ok).toBe(false)
    expect((await togliTokenMessenger()).ok).toBe(false)
    expect(meta.opzioni).toEqual([])
    expect(rpcChiamate()).toEqual([])
  })

  it('«Togli il token»', async () => {
    expect(await togliTokenMessenger()).toEqual({ ok: true })
    expect(rpcChiamate()).toEqual([['messenger_togli_token', undefined]])
  })
})

describe('escludere una chat, e cancellarne i messaggi dell’Insight', () => {
  it('Instagram: la casella è selezionata di base e cancella i messaggi salvati', async () => {
    expect(await aggiungiEsclusioneInstagram({ username: '@Mario.Prova', motivo: 'cliente' })).toEqual({
      ok: true,
      cancellati: true,
      avviso: null,
    })
    expect(db.stato.chiamate).toContainEqual(['insert', { username: 'mario.prova', motivo: 'cliente' }])
    expect(rpcChiamate()).toEqual([['insight_dimentica', { p_canale: 'instagram', p_chiave: 'mario.prova' }]])
  })

  it('Instagram senza la casella: i messaggi restano fino ai 30 giorni', async () => {
    expect(await aggiungiEsclusioneInstagram({ username: 'mario.prova', cancella_messaggi: false })).toEqual({
      ok: true,
      cancellati: false,
      avviso: null,
    })
    expect(rpcChiamate()).toEqual([])
  })

  it('l’esclusione resta anche se la cancellazione non riesce, e lo dice', async () => {
    db.stato.risposte.push({ data: null, error: null })
    db.stato.risposte.push({ data: null, error: { code: '42501', message: 'no' } })
    const esito = await aggiungiEsclusioneInstagram({ username: 'mario.prova' })
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.cancellati).toBe(false)
      expect(esito.avviso).toContain('non si sono cancellati')
    }
  })

  it('Messenger: il PSID e il nome scelti dall’elenco, e i messaggi cancellati', async () => {
    const esito = await escludiChatMessenger({ utente_id: '9876543210', nome: 'Luca Inventato', motivo: '' })
    expect(esito).toEqual({ ok: true, cancellati: true, avviso: null })
    expect(db.stato.chiamate).toContainEqual(['from', 'messenger_esclusi'])
    expect(db.stato.chiamate).toContainEqual(['insert', { utente_id: '9876543210', nome: 'Luca Inventato', motivo: null }])
    expect(rpcChiamate()).toEqual([['insight_dimentica', { p_canale: 'messenger', p_chiave: '9876543210' }]])
  })

  it('Messenger: una chat già esclusa, un PSID che non è un PSID', async () => {
    db.stato.risposte.push({ data: null, error: { code: '23505', message: 'duplicate' } })
    expect(await escludiChatMessenger({ utente_id: '9876543210', nome: 'Luca Inventato' })).toEqual({
      ok: false,
      errore: 'Luca Inventato è già tra le chat Messenger escluse.',
    })
    expect(await escludiChatMessenger({ utente_id: 'luca', nome: 'Luca Inventato' })).toEqual({
      ok: false,
      errore: 'Scegli una chat dell’elenco.',
    })
    expect(rpcChiamate()).toEqual([])
  })

  it('Messenger: togliere un’esclusione', async () => {
    db.stato.risposte.push({ data: [{ utente_id: '9876543210' }], error: null })
    expect(await togliEsclusioneMessenger({ utente_id: '9876543210' })).toEqual({ ok: true })
    expect(db.stato.chiamate).toContainEqual(['eq', 'utente_id', '9876543210'])
    db.stato.risposte.push({ data: [], error: null })
    expect((await togliEsclusioneMessenger({ utente_id: '9876543210' })).ok).toBe(false)
  })

  it('solo l’admin', async () => {
    sessione.ruolo = 'setter'
    expect((await escludiChatMessenger({ utente_id: '9876543210', nome: 'Luca Inventato' })).ok).toBe(false)
    expect((await aggiungiEsclusioneInstagram({ username: 'mario.prova' })).ok).toBe(false)
    expect(db.stato.chiamate).toEqual([])
  })
})
