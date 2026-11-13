import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { emailCodiceCliente } from '@/lib/email/cliente'
import { baseMailpit, corpoMailpit } from '@/lib/email/mailpit'
import { CONSENSI_IN_VIGORE, CONSENSO_SALUTE } from '@/lib/percorso/consensi'
import { ETICHETTE_NODI, nomeAccessibileNodo } from '@/lib/percorso/nodi'
import { DOMANDE, SCHERMATE } from '@/lib/percorso/questionario'
import { fraseCose, fraseCoseInAttesa, fraseGiorni, fraseStima, leggiStima } from '@/lib/percorso/stima'
import * as TESTI from '@/lib/percorso/testi'

/*
 * The words of the client (release B1a): Italian, accents, never the long or medium dash,
 * never an emoji; the emails of the code without a link; the consent's sha256 equal to the
 * seed of the migration.
 */

function tutteLeStringhe(valore: unknown, dove = ''): [string, string][] {
  if (typeof valore === 'string') return [[dove, valore]]
  if (typeof valore === 'function') {
    const r = (valore as (...a: unknown[]) => unknown)('Mario', 'mario@example.test')
    return typeof r === 'string' ? [[dove, r]] : []
  }
  if (valore && typeof valore === 'object') {
    return Object.entries(valore).flatMap(([k, v]) => tutteLeStringhe(v, `${dove}.${k}`))
  }
  return []
}

const EMOJI = /\p{Extended_Pictographic}/u
const TRATTINI = /[–—]/

describe('i testi del cliente', () => {
  const stringhe = [
    ...tutteLeStringhe(TESTI, 'testi'),
    ...tutteLeStringhe(ETICHETTE_NODI, 'nodi'),
    ...tutteLeStringhe(CONSENSI_IN_VIGORE, 'consensi'),
    // release B1b: the questions of the form and their options
    ...tutteLeStringhe(DOMANDE, 'questionario'),
    ...tutteLeStringhe(SCHERMATE, 'schermate'),
  ]

  it('ci sono', () => {
    expect(stringhe.length).toBeGreaterThan(80)
  })

  it.each(stringhe)('%s: niente trattino lungo, niente emoji', (_, testo) => {
    expect(testo).not.toMatch(TRATTINI)
    expect(testo).not.toMatch(EMOJI)
    // the accents of Italian, never an apostrophe after a vowel in their place
    expect(testo).not.toMatch(/\b(perche|piu|gia|cosi|puo)\b/i)
  })

  it.each(['20261109090100_percorso_base.sql', '20261109100000_questionario.sql', '20261110090100_percorso_team.sql'])('i blocchi del CMS seminati in %s non hanno trattini lunghi né emoji', (file) => {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
    const inizio = sql.indexOf('insert into public.contenuti_blocchi')
    expect(inizio).toBeGreaterThan(0)
    const seme = sql.slice(inizio, sql.indexOf(';', inizio))
    expect(seme).not.toMatch(TRATTINI)
    expect(seme).not.toMatch(EMOJI)
  })
})

describe('le email del codice', () => {
  for (const tipo of ['registrazione', 'accesso'] as const) {
    it(`${tipo}: il codice leggibile, nessun link, il nome`, () => {
      const e = emailCodiceCliente({ tipo, nome: 'Mario', codice: '12345678', urlLogo: 'https://x.it/brand/logo.png' })
      expect(e.testo).toContain('1234 5678')
      expect(e.html).toContain('1234 5678')
      expect(e.testo).toContain('Ciao Mario,')
      expect(e.html).not.toMatch(/<a\s/i)
      expect(e.testo).not.toMatch(/https?:\/\//)
      expect(e.oggetto + e.testo).not.toMatch(TRATTINI)
    })
  }

  it('il testo della registrazione è quello del contratto', () => {
    const e = emailCodiceCliente({ tipo: 'registrazione', nome: 'Mario', codice: '12345678', urlLogo: 'https://x.it/l.png' })
    expect(e.oggetto).toBe('Il tuo codice per Percorso Alpha')
    expect(e.testo.split('\n')[0]).toBe('Ciao Mario, il tuo codice è 1234 5678. Vale 15 minuti.')
    expect(e.testo).toContain('Se non hai chiesto tu di entrare nel Percorso Alpha, ignora questa email.')
  })

  it('il nome nell’HTML è scritto come testo', () => {
    const e = emailCodiceCliente({ tipo: 'accesso', nome: '<b>Mario</b>', codice: '12345678', urlLogo: 'https://x.it/l.png' })
    expect(e.html).not.toContain('<b>Mario</b>')
  })
})

describe('il consenso sulla salute', () => {
  it('lo sha256 del testo nel codice è quello del seme della migration', () => {
    // the version in force is seeded by the migration of release C (1.82.0)
    const sql = readFileSync('supabase/migrations/20261111090000_questionario_foglio.sql', 'utf8')
    const sha = createHash('sha256').update(CONSENSO_SALUTE.testo, 'utf8').digest('hex')
    expect(sql).toContain(`('salute', '${CONSENSO_SALUTE.versione}', '${sha}', true)`)
  })
})

describe('Mailpit nei test e2e', () => {
  afterEach(() => vi.restoreAllMocks())

  it('solo fuori da produzione, col login di sviluppo, su http di loopback', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const locale = { ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'development' }
    expect(baseMailpit({ ...locale, E2E_EMAIL_MAILPIT: 'http://127.0.0.1:54324' })).toBe('http://127.0.0.1:54324')
    expect(baseMailpit({ ...locale, E2E_EMAIL_MAILPIT: 'http://localhost:54324/x' })).toBe('http://localhost:54324')
    expect(baseMailpit({ ...locale, E2E_EMAIL_MAILPIT: 'http://[::1]:54324' })).toBe('http://[::1]:54324')
    expect(baseMailpit({ ...locale, NODE_ENV: 'production', E2E_EMAIL_MAILPIT: 'http://127.0.0.1:54324' })).toBeNull()
    expect(baseMailpit({ NODE_ENV: 'development', E2E_EMAIL_MAILPIT: 'http://127.0.0.1:54324' })).toBeNull()
    expect(baseMailpit({ ...locale, E2E_EMAIL_MAILPIT: 'https://127.0.0.1:54324' })).toBeNull()
    expect(baseMailpit({ ...locale, E2E_EMAIL_MAILPIT: 'http://mailpit.example.com' })).toBeNull()
    expect(baseMailpit({ ...locale })).toBeNull()
  })

  it('il corpo dell’API di Mailpit', () => {
    expect(corpoMailpit({ a: ['a@b.it'], oggetto: 'O', html: '<p>h</p>', testo: 't' })).toMatchObject({
      To: [{ Email: 'a@b.it' }],
      Subject: 'O',
      Text: 't',
      HTML: '<p>h</p>',
    })
  })
})

describe('nodi e stima in parole', () => {
  it('i sette nodi e il nome accessibile', () => {
    expect(Object.keys(ETICHETTE_NODI)).toHaveLength(7)
    expect(nomeAccessibileNodo('questionario', 'completato', 'benvenuto')).toBe('Questionario, completato')
    expect(nomeAccessibileNodo('questionario', 'attuale', 'benvenuto')).toBe('Questionario, attuale')
    expect(nomeAccessibileNodo('community', 'futuro', 'call_prenotata')).toBe('Community, si sblocca dopo Call prenotata')
    expect(nomeAccessibileNodo('ignoto', 'futuro', null)).toBe('ignoto, da sbloccare')
  })

  it('la stima', () => {
    expect(fraseGiorni({ giorni: 9, quasi: false, base: 'call_non_prenotata' })).toBe('Mancano circa 9 giorni all’inizio del tuo percorso')
    expect(fraseGiorni({ giorni: 1, quasi: false, base: 'call_non_prenotata' })).toBe('Manca circa 1 giorno all’inizio del tuo percorso')
    expect(fraseGiorni({ giorni: 0, quasi: true, base: 'call_prenotata' })).toBe('Ci siamo quasi')
    expect(fraseGiorni({ giorni: 0, quasi: false, base: 'iniziato' })).toBe('Il tuo percorso è iniziato')
    expect(fraseCose(6)).toBe('Ti restano 6 cose da fare')
    expect(fraseCose(1)).toBe('Ti resta 1 cosa da fare')
    expect(fraseCoseInAttesa(5)).toBe('Ancora 5 tappe: la prossima te la apre il team')
    expect(fraseCoseInAttesa(0)).toBeNull()
    expect(fraseCose(0)).toBeNull()
    const stima = leggiStima({ data: '2026-11-22', giorni: 9, quasi: false, base: 'call_non_prenotata', cose_da_fare: 6, video_mancanti: [] })
    expect(fraseStima(stima!)).toBe('Mancano circa 9 giorni all’inizio del tuo percorso · Ti restano 6 cose da fare')
    expect(leggiStima({ base: 'altro' })).toBeNull()
    expect(leggiStima({ base: 'call_prenotata', giorni: -3 })?.giorni).toBe(0)
  })
})
