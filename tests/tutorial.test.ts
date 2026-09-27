import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { vociNav } from '@/lib/nav'
import { ATTESA_LETTURA_MS, FUNZIONE, PERCORSI } from '@/lib/tutorial/percorsi'

// elements of the shell every role has
const COMUNI = ['alfire', 'profilo', 'nav-altro']

describe('percorsi del tutorial', () => {
  it('ogni ruolo ha il suo tour, dal benvenuto al profilo', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const passi = PERCORSI[ruolo]
      expect(passi.length, ruolo).toBeGreaterThanOrEqual(4)
      expect(passi.length, ruolo).toBeLessThanOrEqual(10)
      expect(passi[0].id).toBe('benvenuto')
      expect(passi.at(-1)?.id).toBe('profilo')
      expect(new Set(passi.map((p) => p.id)).size, `${ruolo}: id doppi`).toBe(passi.length)
      expect(FUNZIONE[ruolo]).toBeTruthy()
    }
  })

  it('ogni passo evidenzia una voce che quel ruolo ha davvero', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const { principali, altre } = vociNav(ruolo)
      const suoi = new Set([...principali, ...altre].map((v) => `nav-${v.href}`))
      if (ruolo === 'admin') suoi.add('testa-tutorial')
      for (const passo of PERCORSI[ruolo]) {
        for (const target of passo.target ?? []) {
          expect(suoi.has(target) || COMUNI.includes(target), `${ruolo} → ${passo.id} → ${target}`).toBe(true)
        }
      }
    }
  })

  it('testi brevi da leggere in pochi secondi', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      for (const passo of PERCORSI[ruolo]) {
        expect(passo.titolo.length).toBeLessThanOrEqual(40)
        expect(passo.testo.split(/\s+/).length, `${ruolo} → ${passo.id}`).toBeLessThanOrEqual(40)
      }
    }
    expect(ATTESA_LETTURA_MS).toBe(2000)
  })
})
