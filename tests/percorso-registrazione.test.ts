import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { separaJoin } from '@/lib/onboarding/link'
import { haSegnaposto, idRegole, leggiBlocchi, leggiBlocco, videoDaVedere } from '@/lib/percorso/blocchi'
import { leggiPercorso, passoDaFare } from '@/lib/percorso/letture'
import { avanzaPassoSchema, bloccoSchema, idYoutube } from '@/lib/validation/percorso'
import {
  apriInvitoSchema,
  codiceClienteSchema,
  codiceLeggibile,
  emailClienteSchema,
} from '@/lib/validation/registrazione-cliente'

/* The client's way in and the shapes of its page (release B1a). */

const TOKEN = 'a1'.repeat(32)
const ID = '0b0b0000-0000-4000-8000-000000000001'

describe('il segmento del link', () => {
  it('slug e token', () => {
    expect(separaJoin(`mario-rossi-${TOKEN}`)).toEqual({ slug: 'mario-rossi', token: TOKEN })
    expect(apriInvitoSchema.safeParse({ segmento: `mario-rossi-${TOKEN}` }).success).toBe(true)
    for (const s of ['registrati', `mario-${TOKEN.slice(1)}`, `Mario-${TOKEN}`, `mario-rossi-${TOKEN}x`, '']) {
      expect(apriInvitoSchema.safeParse({ segmento: s }).success, s).toBe(false)
    }
  })
})

describe('email e codice del cliente', () => {
  it('l’email si pulisce, una non valida no', () => {
    expect(emailClienteSchema.parse('  Mario.Rossi@Example.IT ')).toBe('mario.rossi@example.it')
    expect(emailClienteSchema.safeParse('mario').success).toBe(false)
    expect(emailClienteSchema.safeParse('').success).toBe(false)
  })

  it('il codice: 8 cifre, spazi e trattini tolti', () => {
    expect(codiceClienteSchema.parse('1234 5678')).toBe('12345678')
    expect(codiceClienteSchema.parse(' 1234-5678 ')).toBe('12345678')
    expect(codiceClienteSchema.safeParse('123456').success).toBe(false)
    expect(codiceClienteSchema.safeParse('1234567a').success).toBe(false)
    expect(codiceLeggibile('00412907')).toBe('0041 2907')
  })
})

describe('le azioni del cliente: l’elenco chiuso di B1a', () => {
  it('benvenuto/completa e regole/accetta, nient’altro', () => {
    expect(avanzaPassoSchema.safeParse({ passo: 'benvenuto', azione: 'completa' }).success).toBe(true)
    expect(
      avanzaPassoSchema.safeParse({ passo: 'regole', azione: 'accetta', dati: { regole: [ID], consenso_salute: '2026-11-12' } }).success,
    ).toBe(true)
    expect(avanzaPassoSchema.safeParse({ passo: 'questionario', azione: 'invia' }).success).toBe(false)
    expect(avanzaPassoSchema.safeParse({ passo: 'regole', azione: 'accetta', dati: { regole: ['x'] } }).success).toBe(false)
  })
})

describe('i blocchi del CMS', () => {
  it('l’id di YouTube da un indirizzo o da solo', () => {
    expect(idYoutube('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(idYoutube('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ')
    expect(idYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(idYoutube('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(idYoutube('https://vimeo.com/123')).toBeNull()
  })

  it('le regole delle colonne: il video vuole l’id, il pulsante link e titolo, la regola il titolo', () => {
    const base = { pagina: 'passo', passo: 'benvenuto', ordine: 1 }
    expect(bloccoSchema.safeParse({ ...base, tipo: 'video', youtube: 'https://youtu.be/dQw4w9WgXcQ', obbligatorio: true }).success).toBe(true)
    expect(bloccoSchema.safeParse({ ...base, tipo: 'video', youtube: 'non un video' }).success).toBe(false)
    expect(bloccoSchema.safeParse({ ...base, tipo: 'pulsante', titolo: 'Apri', url: 'http://x.it' }).success).toBe(false)
    expect(bloccoSchema.safeParse({ ...base, tipo: 'regola' }).success).toBe(false)
    expect(bloccoSchema.safeParse({ pagina: 'passo', tipo: 'testo', ordine: 1 }).success).toBe(false)
    // only a video is compulsory
    expect(bloccoSchema.parse({ ...base, tipo: 'testo', corpo: 'Ciao', obbligatorio: true }).obbligatorio).toBe(false)
    expect(bloccoSchema.parse({ pagina: 'dopo_lancio', passo: 'benvenuto', tipo: 'testo', ordine: 1 }).passo).toBeNull()
  })

  it('il segnaposto da sostituire', () => {
    expect(haSegnaposto({ corpo: '[Da scrivere: il benvenuto]' })).toBe(true)
    expect(haSegnaposto({ youtube_id: 'XXXXXXXXXXX' })).toBe(true)
    expect(haSegnaposto({ corpo: 'Benvenuto' })).toBe(false)
  })

  it('un blocco di un tipo che non si conosce, o senza id, si scarta', () => {
    expect(leggiBlocco({ id: ID, tipo: 'sconosciuto' })).toBeNull()
    expect(leggiBlocco({ id: 'x', tipo: 'testo' })).toBeNull()
    expect(leggiBlocco({ id: ID, tipo: 'pulsante', titolo: 'Apri', url: 'javascript:alert(1)' })).toBeNull()
    const blocchi = leggiBlocchi([
      { id: ID, tipo: 'video', youtube_id: 'dQw4w9WgXcQ', obbligatorio: true, video: { percentuale: 40, visto: false } },
      { id: '0b0b0000-0000-4000-8000-000000000002', tipo: 'regola', titolo: 'Telegram' },
      { id: '0b0b0000-0000-4000-8000-000000000003', tipo: 'altro' },
    ])
    expect(blocchi).toHaveLength(2)
    expect(videoDaVedere(blocchi).map((b) => b.id)).toEqual([ID])
    expect(idRegole(blocchi)).toEqual(['0b0b0000-0000-4000-8000-000000000002'])
  })
})

describe('il documento della pagina', () => {
  it('si legge per id e per tipo, e il passo da fare è il primo del cliente aperto', () => {
    const p = leggiPercorso({
      cliente: { nome: 'Mario' },
      percorso: { stato: 'in_corso', giorno_zero: '2026-11-12T10:00:00Z', completato_il: null },
      nodi: [
        { chiave: 'questionario', ordine: 3, stato: 'futuro', completato_il: null },
        { chiave: 'benvenuto', ordine: 1, stato: 'attuale', completato_il: null },
      ],
      passi: [
        { chiave: 'benvenuto', titolo: 'Benvenuto', nodo: 'benvenuto', attore: 'cliente', stato: 'fatto', completato_il: 'x', blocchi: [] },
        { chiave: 'regole', titolo: 'Le regole', nodo: 'benvenuto', attore: 'cliente', stato: 'disponibile', blocchi: [] },
        { chiave: 'questionario', titolo: 'Questionario', nodo: 'questionario', attore: 'cliente', stato: 'bloccato' },
      ],
      team: [{ incarico: 'coach', ruolo: 'Coach', nome: 'Ivan', foto_url: null }, { incarico: 'altro', nome: 'X' }],
      consensi: [{ tipo: 'salute', versione_in_vigore: '2026-11-12', versione: null, dato_il: null }],
      stima: { data: null, giorni: 0, quasi: true, base: 'call_non_prenotata', cose_da_fare: 3, video_mancanti: [] },
      in_attesa: false,
    })!
    expect(p.nome).toBe('Mario')
    expect(p.nodi.map((n) => n.chiave)).toEqual(['benvenuto', 'questionario'])
    expect(p.passi.find((x) => x.chiave === 'questionario')?.blocchi).toBeNull()
    expect(p.team).toHaveLength(1)
    expect(passoDaFare(p)?.chiave).toBe('regole')
    expect(leggiPercorso(null)).toBeNull()
  })
})

describe('le scritture del cliente: le funzioni del database con la sua sessione', () => {
  function db(risposta: { data: unknown; error: { code: string; message: string } | null }) {
    const chiamate: [string, unknown][] = []
    return {
      chiamate,
      client: { rpc: async (nome: string, args: unknown) => (chiamate.push([nome, args]), risposta) },
    }
  }

  it('i secondi visti come intervalli int4range', async () => {
    const { progressoVideo } = await import('@/lib/percorso/operazioni')
    const f = db({ data: { percentuale: 64.5, visto: false }, error: null })
    const esito = await progressoVideo(f.client as never, { blocco: ID, durata: 200, intervalli: [[0, 10], [20, 30]] })
    expect(esito).toEqual({ ok: true, percentuale: 64.5, visto: false })
    expect(f.chiamate).toEqual([
      ['video_progresso', { p_blocco: ID, p_consegna: null, p_durata: 200, p_intervalli: ['[0,10)', '[20,30)'] }],
    ])
  })

  it('le frasi del database arrivano al cliente; 42501 è «entra di nuovo»; le parole di Postgres mai', async () => {
    const { avanzaPasso } = await import('@/lib/percorso/operazioni')
    const passo = { passo: 'benvenuto', azione: 'completa' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await avanzaPasso(db({ data: null, error: { code: '22023', message: 'Guarda il video fino in fondo prima di andare avanti.' } }).client as never, passo)).toEqual({
      ok: false,
      errore: 'Guarda il video fino in fondo prima di andare avanti.',
    })
    expect(await avanzaPasso(db({ data: null, error: { code: '42501', message: 'x' } }).client as never, passo)).toEqual({
      ok: false,
      errore: 'Accesso non valido: entra di nuovo.',
      accesso: true,
    })
    expect(
      await avanzaPasso(db({ data: null, error: { code: '22023', message: 'new row violates check constraint' } }).client as never, passo),
    ).toEqual({ ok: false, errore: 'Qualcosa non ha funzionato. Riprova tra poco.' })
    // a pair outside the closed list never reaches the database
    const f = db({ data: null, error: null })
    expect((await avanzaPasso(f.client as never, { passo: 'programma', azione: 'spunta' })).ok).toBe(false)
    expect(f.chiamate).toEqual([])
  })
})
