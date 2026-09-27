import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { vociNav } from '@/lib/nav'
import { ATTESA_LETTURA_MS, FUNZIONE, PERCORSI, TARGET_DI_PAGINA, suPagina } from '@/lib/tutorial/percorsi'

// elements of the shell every role has
const COMUNI = ['alfire', 'profilo', 'nav-altro']
const DI_PAGINA = new Set<string>(TARGET_DI_PAGINA)

describe('percorsi del tutorial', () => {
  it('ogni ruolo ha il suo tour, dal benvenuto al profilo', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const passi = PERCORSI[ruolo]
      expect(passi.length, ruolo).toBeGreaterThanOrEqual(4)
      expect(passi.length, ruolo).toBeLessThanOrEqual(12)
      expect(passi[0].id).toBe('benvenuto')
      expect(passi.at(-1)?.id).toBe('profilo')
      expect(new Set(passi.map((p) => p.id)).size, `${ruolo}: id doppi`).toBe(passi.length)
      expect(FUNZIONE[ruolo]).toBeTruthy()
    }
  })

  it('ogni passo evidenzia qualcosa che quel ruolo ha davvero', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const { principali, altre } = vociNav(ruolo)
      const suoi = new Set([...principali, ...altre].map((v) => `nav-${v.href}`))
      if (ruolo === 'admin') suoi.add('testa-tutorial')
      for (const passo of PERCORSI[ruolo]) {
        for (const target of passo.target ?? []) {
          const ammesso = suoi.has(target) || COMUNI.includes(target) || DI_PAGINA.has(target)
          expect(ammesso, `${ruolo} → ${passo.id} → ${target}`).toBe(true)
          // an element inside a page: the step says which page
          if (DI_PAGINA.has(target)) expect(passo.pagina, `${ruolo} → ${passo.id}: manca la pagina`).toBeTruthy()
        }
      }
    }
  })

  it('un "tocca qui" apre la pagina del passo dopo', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const passi = PERCORSI[ruolo]
      passi.forEach((passo, i) => {
        if (!passo.clic) return
        const href = passo.target?.[0]?.replace(/^nav-/, '')
        expect(href, `${ruolo} → ${passo.id}`).toMatch(/^\//)
        const dopo = passi[i + 1]
        expect(dopo?.pagina, `${ruolo} → ${passo.id} → ${dopo?.id}`).toBe(href)
      })
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

  it('la pagina del passo: "/" solo se stessa, le altre con le sotto-pagine', () => {
    expect(suPagina('/', '/')).toBe(true)
    expect(suPagina('/sales', '/')).toBe(false)
    expect(suPagina('/progetti/abc', '/progetti')).toBe(true)
    expect(suPagina('/progettini', '/progetti')).toBe(false)
  })
})
