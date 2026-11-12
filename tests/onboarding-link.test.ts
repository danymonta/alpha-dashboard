import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import {
  SLUG_VALIDO,
  TOKEN_VALIDO,
  linkJoin,
  messaggioPronto,
  nomeDiBattesimo,
  separaJoin,
  slugOnboarding,
} from '@/lib/onboarding/link'

/**
 * The personal link of an onboarding (1.77.0): the slug as public.onboarding_slug writes
 * it, the address from APP_URL, the ready message of the specification. Invented people.
 */

const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const APP = 'https://dashboard.percorsoalpha.com'

describe('lo slug: nome e cognome senza accenti, minuscoli, con i trattini', () => {
  it('i casi di tutti i giorni', () => {
    expect(slugOnboarding('Mario', 'Rossi')).toBe('mario-rossi')
    expect(slugOnboarding('Tommaso', 'De Luca')).toBe('tommaso-de-luca')
    expect(slugOnboarding('  Mario  ', '  Rossi  ')).toBe('mario-rossi')
    expect(slugOnboarding('Niccolò', 'D’Angelo')).toBe('niccolo-d-angelo')
    expect(slugOnboarding('Éloïse', 'Müller-Señor')).toBe('eloise-muller-senor')
    expect(slugOnboarding('Mario', null)).toBe('mario')
    expect(slugOnboarding(null, 'Rossi')).toBe('rossi')
    expect(slugOnboarding('Anna Maria', 'Rossi 2')).toBe('anna-maria-rossi-2')
  })

  it('quando non resta niente è «cliente»', () => {
    expect(slugOnboarding(null, null)).toBe('cliente')
    expect(slugOnboarding('', '')).toBe('cliente')
    expect(slugOnboarding('***', '!!!')).toBe('cliente')
    expect(slugOnboarding('李', '雷')).toBe('cliente')
  })

  it('al massimo 60 caratteri, mai un trattino in fondo', () => {
    const lungo = slugOnboarding('a'.repeat(59), 'bianchi')
    expect(lungo).toBe('a'.repeat(59))
    expect(lungo.length).toBeLessThanOrEqual(60)
    expect(slugOnboarding('a'.repeat(80), 'rossi')).toBe('a'.repeat(60))
    expect(slugOnboarding('a'.repeat(58), 'b c')).toBe(`${'a'.repeat(58)}-b`)
  })

  it('è sempre uno slug che la tabella accetta', () => {
    for (const [nome, cognome] of [
      ['Mario', 'Rossi'],
      ['', ''],
      ['Jean-Luc', "O'Neill"],
      ['ÀÈÌÒÙ', 'çñ'],
      ['a'.repeat(200), 'b'.repeat(200)],
    ]) {
      expect(slugOnboarding(nome, cognome), `${nome} ${cognome}`).toMatch(SLUG_VALIDO)
    }
  })

  it('gli stessi accenti e lo stesso limite della funzione in SQL (public.onboarding_slug)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261108090200_onboarding_avvio_gate.sql'), 'utf8')
    const funzione = sql.slice(sql.indexOf('create function public.onboarding_slug'), sql.indexOf('comment on function public.onboarding_slug'))
    const [, da, a] = /'([^']+)',\s*'([a-z]+)'\s*\),\s*'\[\^a-z0-9\]\+', '-', 'g'/.exec(funzione) ?? []
    expect(da).toBe('àáâãäåāèéêëēìíîïīòóôõöōùúûüūçñýÿ')
    expect(a).toHaveLength(da.length)
    // every accented letter of the SQL becomes the same plain letter here
    Array.from(da).forEach((lettera, i) => expect(slugOnboarding(lettera, null), lettera).toBe(a[i]))
    expect(funzione).toContain(', 60)')
    expect(funzione).toContain("'cliente'")
  })
})

describe('il link: /join/<slug>-<token>, da APP_URL', () => {
  it('l’indirizzo', () => {
    expect(linkJoin('mario-rossi', TOKEN, APP)).toBe(`${APP}/join/mario-rossi-${TOKEN}`)
    // a trailing slash in APP_URL never doubles
    expect(linkJoin('mario-rossi', TOKEN, `${APP}/`)).toBe(`${APP}/join/mario-rossi-${TOKEN}`)
  })

  it('senza APP_URL passato usa quello dell’ambiente, mai l’host della richiesta', () => {
    const prima = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://esempio.test'
    try {
      expect(linkJoin('mario-rossi', TOKEN)).toBe(`https://esempio.test/join/mario-rossi-${TOKEN}`)
    } finally {
      if (prima === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = prima
    }
  })

  it('uno slug o un token che il database non scriverebbe non danno nessun link', () => {
    expect(linkJoin('Mario Rossi', TOKEN, APP)).toBeNull()
    expect(linkJoin('', TOKEN, APP)).toBeNull()
    expect(linkJoin('mario-rossi', 'abc', APP)).toBeNull()
    expect(linkJoin('mario-rossi', TOKEN.toUpperCase(), APP)).toBeNull()
    expect(linkJoin('mario-rossi', `${TOKEN}0`, APP)).toBeNull()
    expect(linkJoin('mario/../x', TOKEN, APP)).toBeNull()
  })

  it('il token è di 64 caratteri esadecimali: due uuid senza trattini', () => {
    expect(TOKEN).toMatch(TOKEN_VALIDO)
    expect('0b0a0000-0000-4000-8000-000000000021'.replace(/-/g, '').repeat(2)).toMatch(TOKEN_VALIDO)
  })

  it('l’ultimo pezzo dell’indirizzo torna slug e token, anche con i trattini nello slug', () => {
    expect(separaJoin(`mario-rossi-${TOKEN}`)).toEqual({ slug: 'mario-rossi', token: TOKEN })
    expect(separaJoin(`tommaso-de-luca-${TOKEN}`)).toEqual({ slug: 'tommaso-de-luca', token: TOKEN })
    const link = linkJoin('anna-maria-rossi-2', TOKEN, APP)!
    expect(separaJoin(link.split('/').at(-1)!)).toEqual({ slug: 'anna-maria-rossi-2', token: TOKEN })
    expect(separaJoin('mario-rossi')).toBeNull()
    expect(separaJoin(TOKEN)).toBeNull()
    expect(separaJoin(`mario-rossi-${TOKEN}x`)).toBeNull()
    expect(separaJoin(`Mario-${TOKEN}`)).toBeNull()
  })
})

describe('il messaggio pronto (specifica, sezione 2.1.1)', () => {
  const link = `${APP}/join/mario-rossi-${TOKEN}`

  it('le parole della specifica, con il nome di battesimo e il link in fondo', () => {
    expect(messaggioPronto('Mario', link)).toBe(
      `Benvenuto nel Percorso Alpha, Mario. Da qui parte tutto: registrati con la tua email e segui gli step uno alla volta. ${link}`,
    )
  })

  it('saluta con il solo nome di battesimo', () => {
    expect(nomeDiBattesimo('  Anna Maria ')).toBe('Anna')
    expect(messaggioPronto('Anna Maria', link)).toContain('Percorso Alpha, Anna. ')
  })

  it('senza nome resta una frase intera', () => {
    for (const nome of [null, undefined, '', '   ']) {
      const testo = messaggioPronto(nome, link)
      expect(testo).toBe(
        `Benvenuto nel Percorso Alpha. Da qui parte tutto: registrati con la tua email e segui gli step uno alla volta. ${link}`,
      )
      expect(testo).not.toContain(', .')
    }
  })

  it('va al cliente: è in italiano anche con l’interfaccia in inglese', () => {
    expect(ONBOARDING.en.messaggio.testo('Mario', link)).toBe(ONBOARDING.it.messaggio.testo('Mario', link))
    expect(ONBOARDING.en.messaggio.testoSenzaNome(link)).toBe(ONBOARDING.it.messaggio.testoSenzaNome(link))
  })

  it('nessun importo, nessun trattino lungo, nessuna emoji', () => {
    const testo = messaggioPronto('Mario', link)
    expect(testo).not.toMatch(/[€$—–]/)
    expect(testo).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
