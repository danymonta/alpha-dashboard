import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI, percorsoIniziale } from '@/lib/auth/roles'
import {
  esitiDellaVoce,
  isAttiva,
  nomeConEsiti,
  nomeConPromemoria,
  perSezione,
  promemoriaDellaVoce,
  promemoriaDiAltro,
  testoCommenti,
  testoDaApprovare,
  testoEsiti,
  totalePromemoria,
  vociNav,
  type VoceNav,
} from '@/lib/nav'

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

  it('coach, editor, marketing, nutrizione e dev non hanno né Setter né Closer', () => {
    for (const ruolo of ['coach', 'editor', 'marketing', 'nutrizione', 'dev'] as const) {
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
      marketing: [],
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

describe('il numero delle giornate da approvare (08/10/2026)', () => {
  it('su «Setter» dell’admin e su «Oggi» del setter, e nessun altro', () => {
    const conNumero = Object.fromEntries(
      TUTTI_I_RUOLI.map((ruolo) => [ruolo, tutte(ruolo).filter((v) => v.daApprovare).map((v) => v.href)]),
    )
    expect(conNumero).toEqual({
      admin: ['/setting'],
      setter: ['/today'],
      closer: [],
      coach: [],
      editor: [],
      marketing: [],
      nutrizione: [],
      dev: [],
    })
    // the admin's "Setter" sits in "Altro" on the phone, the setter's "Oggi" in the bar
    expect(vociNav('admin').altre.some((v) => v.daApprovare)).toBe(true)
    expect(vociNav('setter').principali.some((v) => v.daApprovare)).toBe(true)
  })

  it('ogni voce porta solo il suo numero, mai a zero', () => {
    const promemoria = { esiti: 3, daApprovare: 2, commenti: 0 }
    expect(promemoriaDellaVoce(voce('admin', 'Setter'), promemoria)).toEqual({ esiti: 0, daApprovare: 2, commenti: 0 })
    expect(promemoriaDellaVoce(voce('admin', 'Closer'), promemoria)).toEqual({ esiti: 3, daApprovare: 0, commenti: 0 })
    expect(promemoriaDellaVoce(voce('admin', 'Vendite'), promemoria)).toEqual({ esiti: 0, daApprovare: 0, commenti: 0 })
    expect(promemoriaDellaVoce(voce('setter', 'Oggi'), promemoria)).toEqual({ esiti: 0, daApprovare: 2, commenti: 0 })
    expect(promemoriaDellaVoce(voce('setter', 'Oggi'), { esiti: 0, daApprovare: 0, commenti: 0 })).toEqual({
      esiti: 0,
      daApprovare: 0,
      commenti: 0,
    })
  })

  it('«Altro» dell’admin porta i due numeri, contati una volta sola', () => {
    const inAltro = promemoriaDiAltro(vociNav('admin').altre, { esiti: 3, daApprovare: 2, commenti: 0 })
    expect(inAltro).toEqual({ esiti: 3, daApprovare: 2, commenti: 0 })
    expect(totalePromemoria(inAltro)).toBe(5)
    expect(nomeConPromemoria('Altro', inAltro)).toBe('Altro, 3 esiti da registrare, 2 giornate da approvare')
    // the setter's "Altro" has none of them
    expect(promemoriaDiAltro(vociNav('setter').altre, { esiti: 3, daApprovare: 2, commenti: 4 })).toEqual({
      esiti: 0,
      daApprovare: 0,
      commenti: 0,
    })
  })

  it('le parole per chi usa un lettore di schermo', () => {
    expect(testoDaApprovare(1)).toBe('1 giornata da approvare')
    expect(testoDaApprovare(2)).toBe('2 giornate da approvare')
    expect(nomeConPromemoria('Setter', { esiti: 0, daApprovare: 2, commenti: 0 })).toBe('Setter, 2 giornate da approvare')
    expect(nomeConPromemoria('Oggi', { esiti: 0, daApprovare: 1, commenti: 0 })).toBe('Oggi, 1 giornata da approvare')
    expect(nomeConPromemoria('Oggi', { esiti: 0, daApprovare: 0, commenti: 0 })).toBeUndefined()
  })
})

describe('il numero dei commenti da scrivere (08/10/2026)', () => {
  it('solo su «Oggi» del setter: mai all’admin, mai a un altro ruolo', () => {
    const conNumero = Object.fromEntries(
      TUTTI_I_RUOLI.map((ruolo) => [ruolo, tutte(ruolo).filter((v) => v.commenti).map((v) => v.href)]),
    )
    expect(conNumero).toEqual({
      admin: [],
      setter: ['/today'],
      closer: [],
      coach: [],
      editor: [],
      marketing: [],
      nutrizione: [],
      dev: [],
    })
    // in the bar, never behind "Altro"
    expect(vociNav('setter').principali.some((v) => v.commenti)).toBe(true)
    // the admin's items never carry it, whatever the number
    for (const v of tutte('admin')) {
      expect(promemoriaDellaVoce(v, { esiti: 0, daApprovare: 0, commenti: 5 }).commenti, v.href).toBe(0)
    }
  })

  it('«Oggi» porta i due numeri, e il nome li dice separati', () => {
    const oggi = promemoriaDellaVoce(voce('setter', 'Oggi'), { esiti: 0, daApprovare: 1, commenti: 2 })
    expect(oggi).toEqual({ esiti: 0, daApprovare: 1, commenti: 2 })
    expect(totalePromemoria(oggi)).toBe(3)
    expect(nomeConPromemoria('Oggi', oggi)).toBe('Oggi, 1 giornata da approvare, 2 commenti da scrivere')
    expect(nomeConPromemoria('Oggi', { esiti: 0, daApprovare: 0, commenti: 1 })).toBe('Oggi, 1 commento da scrivere')
  })

  it('le parole per chi usa un lettore di schermo', () => {
    expect(testoCommenti(1)).toBe('1 commento da scrivere')
    expect(testoCommenti(3)).toBe('3 commenti da scrivere')
  })
})

describe('l’area Marketing: Contenuti (1.32.0)', () => {
  it('«Contenuti» solo per admin, video editor e marketing', () => {
    const conContenuti = TUTTI_I_RUOLI.filter((ruolo) => tutte(ruolo).some((v) => v.href === '/marketing/contenuti'))
    expect(conContenuti).toEqual(['admin', 'editor', 'marketing'])
    for (const ruolo of ['admin', 'editor', 'marketing'] as const) {
      const contenuti = voce(ruolo, 'Contenuti')
      expect(contenuti.href).toBe('/marketing/contenuti')
      expect(contenuti.sezione).toBe('Marketing')
      // no badge on the calendar (CLAUDE.md section 17)
      expect(contenuti.esiti || contenuti.daApprovare || contenuti.commenti).toBeFalsy()
    }
  })

  it('si accende sulla lista e sulla pagina di un contenuto', () => {
    const contenuti = voce('marketing', 'Contenuti')
    expect(isAttiva('/marketing/contenuti', contenuti)).toBe(true)
    expect(isAttiva('/marketing/contenuti/c0ffee00-0000-4000-8000-000000000001', contenuti)).toBe(true)
    expect(isAttiva('/marketing', contenuti)).toBe(false)
  })

  it('per l’admin in «Altro», subito dopo Costi e prima di Progetti', () => {
    const { principali, altre } = vociNav('admin')
    expect(principali.map((v) => v.href)).not.toContain('/marketing/contenuti')
    const etichette = altre.map((v) => v.etichetta)
    expect(etichette.indexOf('Contenuti')).toBe(etichette.indexOf('Costi') + 1)
    expect(etichette.indexOf('Progetti')).toBe(etichette.indexOf('Contenuti') + 1)
  })

  it('il video editor ha Contenuti come quarta voce della barra e parte ancora dai suoi task', () => {
    const { principali, altre } = vociNav('editor')
    expect(principali.map((v) => v.href)).toEqual(['/task', '/progetti', '/tempo', '/marketing/contenuti'])
    expect(altre.map((v) => v.href)).toEqual(['/changelog'])
    expect(percorsoIniziale('editor')).toBe('/task')
  })

  it('il marketing parte dal calendario e ha anche i Progetti, come il video editor', () => {
    const { principali, altre } = vociNav('marketing')
    expect(principali.map((v) => v.href)).toEqual(['/marketing/contenuti', '/task', '/progetti', '/tempo'])
    expect(altre.map((v) => v.href)).toEqual(['/changelog'])
    expect(percorsoIniziale('marketing')).toBe('/marketing/contenuti')
  })

  it('il marketing non ha niente di Economics', () => {
    const voci = tutte('marketing')
    expect(voci.some((v) => (v.sezione ?? 'Economics') === 'Economics')).toBe(false)
    const href = voci.map((v) => v.href)
    const economics = ['/', '/setting', '/setting/closer', '/calls', '/calls/new', '/leads', '/today', '/sales', '/payments', '/clients']
    for (const pagina of [...economics, '/settings']) expect(href, pagina).not.toContain(pagina)
  })

  it('coach, nutrizione e dev restano sui soli Progetti', () => {
    for (const ruolo of ['coach', 'nutrizione', 'dev'] as const) {
      expect(tutte(ruolo).map((v) => v.href), ruolo).toEqual(['/task', '/progetti', '/tempo', '/changelog'])
    }
  })

  it('ogni ruolo ha al massimo 4 voci nella barra in basso', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      expect(vociNav(ruolo).principali.length, ruolo).toBeLessThanOrEqual(4)
    }
  })

  it('la barra laterale non ripete mai un’area: le voci di un’area stanno insieme', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const sezioni = perSezione(tutte(ruolo)).map((g) => g.sezione)
      expect(new Set(sezioni).size, `${ruolo}: ${sezioni.join(', ')}`).toBe(sezioni.length)
    }
    expect(perSezione(tutte('admin')).map((g) => g.sezione)).toEqual(['Economics', 'Marketing', 'Progetti', 'Generale'])
    expect(perSezione(tutte('editor')).map((g) => g.sezione)).toEqual(['Progetti', 'Marketing', 'Generale'])
    expect(perSezione(tutte('marketing')).map((g) => g.sezione)).toEqual(['Marketing', 'Progetti', 'Generale'])
  })

  it('nessuna voce ripetuta nello stesso ruolo', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const href = tutte(ruolo).map((v) => v.href)
      expect(new Set(href).size, ruolo).toBe(href.length)
    }
  })
})
