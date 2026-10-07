import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { esitiDellaVoce, isAttiva, nomeConEsiti, testoEsiti, vociNav, type VoceNav } from '@/lib/nav'

function tutte(ruolo: Parameters<typeof vociNav>[0]): VoceNav[] {
  const { principali, altre } = vociNav(ruolo)
  return [...principali, ...altre]
}

function voce(ruolo: Parameters<typeof vociNav>[0], etichetta: string): VoceNav {
  const trovata = tutte(ruolo).find((v) => v.etichetta === etichetta)
  if (!trovata) throw new Error(`${ruolo}: manca «${etichetta}»`)
  return trovata
}

describe('Setter e Closer al posto di Setting (07/10/2026)', () => {
  it('l’admin ha due voci, Setter e Closer, e non più Setting', () => {
    const { principali, altre } = vociNav('admin')
    expect(principali).toHaveLength(4)
    expect(tutte('admin').map((v) => v.etichetta)).not.toContain('Setting')
    expect(altre.map((v) => [v.etichetta, v.href])).toEqual(
      expect.arrayContaining([
        ['Setter', '/setting'],
        ['Closer', '/setting/closer'],
      ]),
    )
    // Closer right after Setter, where Setting was
    const etichette = altre.map((v) => v.etichetta)
    expect(etichette.indexOf('Closer')).toBe(etichette.indexOf('Setter') + 1)
    expect(voce('admin', 'Setter').Icona).not.toBe(voce('admin', 'Closer').Icona)
  })

  it('Setter si accende solo su /setting, Closer anche sulla sua giornata', () => {
    const setter = voce('admin', 'Setter')
    const closer = voce('admin', 'Closer')
    expect(isAttiva('/setting', setter)).toBe(true)
    expect(isAttiva('/setting/closer', setter)).toBe(false)
    expect(isAttiva('/setting/closer/giorno', setter)).toBe(false)
    expect(isAttiva('/setting', closer)).toBe(false)
    expect(isAttiva('/setting/closer', closer)).toBe(true)
    expect(isAttiva('/setting/closer/giorno', closer)).toBe(true)
    expect(isAttiva('/setting/closerx', closer)).toBe(false)
  })

  it('il setter apre Closer da «Altro» e tiene le sue quattro voci', () => {
    const { principali, altre } = vociNav('setter')
    expect(principali.map((v) => v.href)).toEqual(['/today', '/calls/new', '/leads', '/my-numbers'])
    expect(altre.find((v) => v.href === '/setting/closer')?.etichetta).toBe('Closer')
    // the setter's report pages stay the admin's
    expect(tutte('setter').map((v) => v.href)).not.toContain('/setting')
  })

  it('il closer resta su «I miei numeri», senza Setter', () => {
    expect(voce('closer', 'I miei numeri').href).toBe('/setting/closer')
    expect(tutte('closer').map((v) => v.href)).not.toContain('/setting')
  })

  it('coach, editor, nutrizione e dev non hanno né Setter né Closer', () => {
    for (const ruolo of ['coach', 'editor', 'nutrizione', 'dev'] as const) {
      expect(tutte(ruolo).some((v) => v.href.startsWith('/setting')), ruolo).toBe(false)
    }
  })
})

describe('il numero degli esiti da registrare', () => {
  it('solo su Le mie call e sulla pagina del closer, solo per admin e closer', () => {
    const conNumero = Object.fromEntries(
      TUTTI_I_RUOLI.map((ruolo) => [ruolo, tutte(ruolo).filter((v) => v.esiti).map((v) => v.href)]),
    )
    expect(conNumero).toEqual({
      admin: ['/calls', '/setting/closer'],
      setter: [],
      closer: ['/calls', '/setting/closer'],
      coach: [],
      editor: [],
      nutrizione: [],
      dev: [],
    })
  })

  it('niente numero a zero, né sulle voci che non lo portano', () => {
    const calls = voce('admin', 'Le mie call')
    expect(esitiDellaVoce(calls, 3)).toBe(3)
    expect(esitiDellaVoce(calls, 0)).toBe(0)
    expect(esitiDellaVoce(voce('admin', 'Vendite'), 3)).toBe(0)
    expect(esitiDellaVoce(voce('setter', 'Le mie call'), 3)).toBe(0)
  })

  it('le parole per chi usa un lettore di schermo', () => {
    expect(testoEsiti(1)).toBe('1 esito da registrare')
    expect(testoEsiti(2)).toBe('2 esiti da registrare')
    expect(nomeConEsiti('Le mie call', 2)).toBe('Le mie call, 2 esiti da registrare')
    // nothing to record: the visible label is the name
    expect(nomeConEsiti('Le mie call', 0)).toBeUndefined()
  })
})
