import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI, percorsoIniziale } from '@/lib/auth/roles'
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

  it('video editor e marketing passano da «Contenuti» subito dopo il benvenuto (1.32.0)', () => {
    for (const ruolo of ['editor', 'marketing'] as const) {
      const passi = PERCORSI[ruolo]
      expect(passi.map((p) => p.id).slice(0, 4), ruolo).toEqual(['benvenuto', 'vai-contenuti', 'contenuti', 'vai-task'])
      expect(passi[1].target?.[0]).toBe('nav-/marketing/contenuti')
      expect(passi[2].target).toEqual(['elenco-contenuti'])
      expect(passi, ruolo).toHaveLength(10)
    }
    expect(FUNZIONE.marketing).toBe('Marketing')
    // the other roles never see the calendar in their tour
    for (const ruolo of ['admin', 'setter', 'closer', 'coach', 'nutrizione', 'dev'] as const) {
      expect(PERCORSI[ruolo].some((p) => p.id.includes('contenuti')), ruolo).toBe(false)
    }
    // coach, nutrizione and dev keep the Projects tour as it was
    expect(PERCORSI.coach).toHaveLength(8)
  })

  it('«I miei task» è «la tua pagina di tutti i giorni» solo per chi ci atterra', () => {
    let passi = 0
    for (const ruolo of TUTTI_I_RUOLI) {
      const passo = PERCORSI[ruolo].find((p) => p.id === 'vai-task')
      if (!passo) continue
      passi++
      const ogniGiorno = passo.testo.includes('pagina di tutti i giorni')
      expect(ogniGiorno, ruolo).toBe(percorsoIniziale(ruolo) === '/task')
    }
    expect(passi).toBeGreaterThanOrEqual(5)
    // marketing lands on Contenuti: the step says what I miei task holds instead
    expect(PERCORSI.marketing.find((p) => p.id === 'vai-task')?.testo).toBe(
      'Tocca «I miei task»: i task dei progetti assegnati a te.',
    )
  })

  it('il setter passa da «Insight ultime 24h» dopo Closer e prima di Alfire; l’admin no (1.35.0)', () => {
    const setter = PERCORSI.setter
    const ids = setter.map((p) => p.id)
    expect(setter).toHaveLength(12)
    expect(ids.indexOf('insight')).toBe(ids.indexOf('closer') + 1)
    expect(ids.indexOf('alfire')).toBe(ids.indexOf('insight') + 1)
    // never right after "Oggi": that step continues on /today
    expect(ids[ids.indexOf('vai-oggi') + 1]).not.toBe('insight')
    const passo = setter[ids.indexOf('insight')]
    expect(passo.clic).toBeFalsy()
    expect(passo.pagina).toBeUndefined()
    expect(passo.target).toEqual(['nav-/insight', 'nav-altro'])
    expect(passo.titolo).toBe('Insight ultime 24h')

    // the admin's tour stays at 12, the most: his Closer step names the item instead
    expect(PERCORSI.admin).toHaveLength(12)
    expect(PERCORSI.admin.some((p) => p.id === 'insight')).toBe(false)
    expect(PERCORSI.admin.find((p) => p.id === 'closer')?.testo).toContain('«Insight ultime 24h» con il recap dei DM')
    // nobody else has it
    for (const ruolo of ['closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
      expect(PERCORSI[ruolo].some((p) => p.id === 'insight' || (p.target ?? []).includes('nav-/insight')), ruolo).toBe(false)
    }
  })

  it('la pagina del passo: "/" solo se stessa, le altre con le sotto-pagine', () => {
    expect(suPagina('/', '/')).toBe(true)
    expect(suPagina('/sales', '/')).toBe(false)
    expect(suPagina('/progetti/abc', '/progetti')).toBe(true)
    expect(suPagina('/progettini', '/progetti')).toBe(false)
  })
})
