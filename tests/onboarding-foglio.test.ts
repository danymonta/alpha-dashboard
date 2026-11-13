import { generateKeyPairSync, createVerify } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { rigaDi } from '@/lib/google/fogli'
import { asserzione, leggiChiave } from '@/lib/google/service-account'
import { giornoFoglio, momentoFoglio, rigaFoglio, testoSicuro } from '@/lib/onboarding/foglio'
import { lavoraFoglio } from '@/lib/percorso/foglio-lavoro'
import { FRASI_FOGLIO } from '@/lib/percorso/frasi-foglio'
import type { Risposte } from '@/lib/validation/questionario'

/**
 * The onboarding sheet (1.82.0, release C): the row as the columns of Dany's Google form, the
 * signed assertion of the service account, and the queue at work against a fake Google (token
 * and Sheets API) and a fake database: a new row, the same row rewritten, a clear, the errors.
 */

const RISPOSTE: Risposte = {
  email: 'mario@example.test',
  telefono: '+39 333 123 4567',
  nome_cognome: 'Mario Prova',
  altezza_peso: { altezza: 178, peso: 72.5 },
  data_nascita: '1996-03-21',
  obiettivo_principale: '=SOMMA(A1)',
  occupazione: 'Impiegato',
  storia_allenamento: 'Due anni di palestra',
  livello_attivita: 'attivo',
  importanza_tecnica: 'Molto',
  seguito_alimentazione: 'no',
  conoscenza_alimentazione: 'Un po',
  giorni_settimana: 4,
  minuti_giorno: '40_60',
  ore_sonno: '7',
  organizzazione_giornata: 'Lavoro 9-18',
  infortuni: 'Nessuno',
  cattive_abitudini: { scelte: ['alcol', 'altre_sostanze'], altro: 'Troppi dolci' },
  successo: 'Sentirmi sicuro',
  perche_noi: 'I risultati',
  obiettivi_3_6_mesi: '10 trazioni',
  attrezzatura: 'Sbarra',
  massimali: { piegamenti: 20, trazioni: 'non_lo_so', dip: 5 },
  esercizi_difficolta: 'Le trazioni',
  pronto: 'si',
  note: null,
}

describe('la riga del foglio', () => {
  it('ha le 29 colonne A-AC del Google Form, nel loro ordine e col loro formato', () => {
    const riga = rigaFoglio(RISPOSTE, '2026-11-13T14:04:12Z', '2026-11-20')
    expect(riga).toHaveLength(29)
    expect(riga[0]).toBe('13/11/2026 15.04.12') // A, ora di Roma
    expect(riga[1]).toBe('mario@example.test')
    expect(riga[2]).toBe("'+39 333 123 4567") // il «+» non diventa una formula
    expect(riga[3]).toBe('Mario Prova')
    expect(riga[4]).toBe('178 cm / 72,5 kg')
    expect(riga[5]).toBe('21/03/1996')
    expect(riga[6]).toBe("'=SOMMA(A1)") // mai una formula
    expect(riga[9]).toBe(4) // J
    expect(riga[14]).toBe('Piegamenti: 20, Trazioni: non lo so, Dip: 5') // O
    expect(riga[16]).toBe('Sì') // Q
    expect(riga[19]).toBe('No, mi affido a voi!') // T
    expect(riga[21]).toMatch(/^Attivo \(meno di 5h/) // V, con le parole tra parentesi del modulo
    expect(riga[23]).toBe('Bere alcol, Altre sostanze, Altro: Troppi dolci') // X
    expect(riga[25]).toBe('40-60 minuti') // Z
    expect(riga[26]).toBe('') // AA, facoltativa
    expect(riga[27]).toBe('20/11/2026') // AB
    expect(riga[28]).toBe('Attivo') // AC
  })

  it('testi, giorni e momenti', () => {
    expect(testoSicuro('-5 kg')).toBe("'-5 kg")
    expect(testoSicuro('@mario')).toBe("'@mario")
    expect(testoSicuro('ciao\r\nmondo ')).toBe('ciao\nmondo')
    expect(giornoFoglio(null)).toBe('')
    expect(giornoFoglio('2026-01-05')).toBe('05/01/2026')
    expect(momentoFoglio('2026-07-01T06:00:00Z')).toBe('01/07/2026 08.00.00')
    expect(rigaDi("'Risposte del modulo'!A92:AH92")).toBe(92)
    expect(rigaDi('nulla')).toBeNull()
  })
})

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const CHIAVE = JSON.stringify({ client_email: 'alpha-foglio@progetto.iam.gserviceaccount.com', private_key: PEM })

describe('il service account', () => {
  it('legge solo una chiave ben fatta', () => {
    expect(leggiChiave(CHIAVE)?.client_email).toBe('alpha-foglio@progetto.iam.gserviceaccount.com')
    expect(leggiChiave('{}')).toBeNull()
    expect(leggiChiave('non json')).toBeNull()
    expect(leggiChiave(null)).toBeNull()
  })

  it('firma un JWT RS256 con scope spreadsheets, valido un’ora', () => {
    const jwt = asserzione(leggiChiave(CHIAVE)!, Date.UTC(2026, 10, 13, 12))
    const [testa, corpo, firma] = jwt.split('.')
    expect(JSON.parse(Buffer.from(testa, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(corpo, 'base64url').toString())
    expect(claims.scope).toBe('https://www.googleapis.com/auth/spreadsheets')
    expect(claims.exp - claims.iat).toBe(3600)
    expect(createVerify('RSA-SHA256').update(`${testa}.${corpo}`).verify(publicKey, Buffer.from(firma, 'base64url'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The queue at work: a fake Google and a fake database
// ---------------------------------------------------------------------------
type Chiamata = { metodo: string; percorso: string; corpo: unknown }
let server: Server
let base = ''
const chiamate: Chiamata[] = []
let colonnaAH: string[] = []
let rifiutaToken = false
let permessoNegato = false

async function leggiCorpo(req: IncomingMessage): Promise<string> {
  let s = ''
  for await (const c of req) s += c
  return s
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const corpoTesto = await leggiCorpo(req)
    const url = req.url ?? ''
    let corpo: unknown = corpoTesto
    try {
      corpo = JSON.parse(corpoTesto)
    } catch {
      // the token request is form-encoded
    }
    chiamate.push({ metodo: req.method ?? '', percorso: decodeURIComponent(url), corpo })
    res.setHeader('content-type', 'application/json')
    if (url === '/token') {
      if (rifiutaToken) {
        res.statusCode = 400
        res.end('{"error":"invalid_grant"}')
        return
      }
      res.end(JSON.stringify({ access_token: 'token-finto', expires_in: 3600 }))
      return
    }
    if (permessoNegato) {
      res.statusCode = 403
      res.end('{}')
      return
    }
    if (url.includes(':append')) {
      res.end(JSON.stringify({ updates: { updatedRange: `'Risposte del modulo'!A${colonnaAH.length + 1}:AH${colonnaAH.length + 1}` } }))
      return
    }
    if (req.method === 'GET') {
      res.end(JSON.stringify({ values: [colonnaAH] }))
      return
    }
    res.end('{}')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

type Lavoro = { client_id: string; rif: string; azione: 'scrivi' | 'svuota'; risposte: unknown; inviato_il: string | null; data_inizio: string | null }

function dbFinto(opz: { chiave?: string | null; lavori: Lavoro[] }) {
  const esiti: Record<string, unknown>[] = []
  const errori: string[] = []
  const db = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'google_chiave') return { data: opz.chiave ?? null, error: null }
      if (nome === 'onboarding_foglio_prendi') {
        return { data: { foglio_id: 'foglio-di-prova-1234567890', scheda: 'Risposte del modulo', lavori: opz.lavori }, error: null }
      }
      if (nome === 'onboarding_foglio_esito') {
        esiti.push(args)
        return { data: null, error: null }
      }
      if (nome === 'google_segna_errore') {
        errori.push(String(args.p_errore))
        return { data: null, error: null }
      }
      throw new Error(`rpc inattesa ${nome}`)
    },
    from: () => ({
      select: () => ({ in: async () => ({ count: opz.lavori.length, error: null }) }),
    }),
  }
  return { db: db as never, esiti, errori }
}

const basi = () => ({ token: `${base}/token`, fogli: `${base}/v4` })

describe('la coda del foglio', () => {
  it('una riga nuova: append A-AH con le colonne del team vuote e il codice in AH, e l’intestazione di AH', async () => {
    chiamate.length = 0
    colonnaAH = ['', '', '']
    rifiutaToken = false
    permessoNegato = false
    const { db, esiti } = dbFinto({
      chiave: CHIAVE,
      lavori: [{ client_id: 'c1', rif: 'rif-uno', azione: 'scrivi', risposte: RISPOSTE, inviato_il: '2026-11-13T14:04:12Z', data_inizio: null }],
    })
    const esito = await lavoraFoglio(db, { basi: basi() })
    expect(esito).toMatchObject({ scritte: 1, svuotate: 0, errori: 0 })
    const append = chiamate.find((c) => c.percorso.includes(':append'))!
    expect(append.percorso).toContain("'Risposte del modulo'!A:AH")
    const valori = (append.corpo as { values: unknown[][] }).values[0]
    expect(valori).toHaveLength(34)
    expect(valori.slice(29, 33)).toEqual(['', '', '', ''])
    expect(valori[33]).toBe('rif-uno')
    const intestazione = chiamate.find((c) => c.percorso.endsWith('values:batchUpdate'))!
    expect(JSON.stringify(intestazione.corpo)).toContain('ID Alpha (non modificare)')
    expect(esiti[0]).toMatchObject({ p_client: 'c1', p_azione: 'scrivi', p_riga: 4, p_errore: null })
  })

  it('la stessa riga si riscrive, mai le colonne AD-AG del team', async () => {
    chiamate.length = 0
    colonnaAH = ['ID Alpha (non modificare)', '', 'rif-uno']
    const { db, esiti } = dbFinto({
      chiave: CHIAVE,
      lavori: [{ client_id: 'c1', rif: 'rif-uno', azione: 'scrivi', risposte: RISPOSTE, inviato_il: '2026-11-13T14:04:12Z', data_inizio: null }],
    })
    await lavoraFoglio(db, { basi: basi() })
    expect(chiamate.some((c) => c.percorso.includes(':append'))).toBe(false)
    const scrittura = chiamate.find((c) => c.percorso.endsWith('values:batchUpdate'))!
    const intervalli = (scrittura.corpo as { data: { range: string }[] }).data.map((d) => d.range)
    expect(intervalli).toEqual(["'Risposte del modulo'!A3:AC3", "'Risposte del modulo'!AH3"])
    expect(esiti[0]).toMatchObject({ p_riga: 3, p_errore: null })
  })

  it('una revoca svuota A-AC e AH della sua riga', async () => {
    chiamate.length = 0
    colonnaAH = ['ID Alpha (non modificare)', 'rif-due']
    const { db, esiti } = dbFinto({
      chiave: CHIAVE,
      lavori: [{ client_id: 'c2', rif: 'rif-due', azione: 'svuota', risposte: null, inviato_il: null, data_inizio: null }],
    })
    const esito = await lavoraFoglio(db, { basi: basi() })
    expect(esito.svuotate).toBe(1)
    const svuota = chiamate.find((c) => c.percorso.endsWith('values:batchClear'))!
    expect((svuota.corpo as { ranges: string[] }).ranges).toEqual(["'Risposte del modulo'!A2:AC2", "'Risposte del modulo'!AH2"])
    expect(esiti[0]).toMatchObject({ p_azione: 'svuota', p_errore: null })
  })

  it('senza chiave non chiama Google e lo dice all’admin', async () => {
    chiamate.length = 0
    const { db, errori } = dbFinto({ chiave: null, lavori: [{ client_id: 'c3', rif: 'r', azione: 'scrivi', risposte: RISPOSTE, inviato_il: '2026-11-13T10:00:00Z', data_inizio: null }] })
    const esito = await lavoraFoglio(db, { basi: basi() })
    expect(esito.motivo).toBe('senza_chiave')
    expect(chiamate).toHaveLength(0)
    expect(errori).toEqual([FRASI_FOGLIO.senzaChiave])
  })

  it('la chiave rifiutata e il foglio non condiviso diventano frasi, e la riga riprova più tardi', async () => {
    rifiutaToken = true
    const primo = dbFinto({ chiave: CHIAVE, lavori: [] })
    expect((await lavoraFoglio(primo.db, { basi: basi() })).motivo).toBe('chiave')
    expect(primo.errori).toEqual([FRASI_FOGLIO.chiave])

    rifiutaToken = false
    permessoNegato = true
    const secondo = dbFinto({
      chiave: CHIAVE,
      lavori: [{ client_id: 'c4', rif: 'r4', azione: 'scrivi', risposte: RISPOSTE, inviato_il: '2026-11-13T10:00:00Z', data_inizio: null }],
    })
    const esito = await lavoraFoglio(secondo.db, { basi: basi() })
    expect(esito.errori).toBe(1)
    expect(secondo.esiti[0]).toMatchObject({ p_client: 'c4', p_errore: FRASI_FOGLIO.permesso })
    permessoNegato = false
  })
})
