import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI, percorsoIniziale } from '@/lib/auth/roles'
import { Megaphone, Sparkles } from 'lucide-react'

import {
  esitiDellaVoce,
  isAttiva,
  nomeConEsiti,
  nomeConPromemoria,
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

function gruppo(ruolo: Parameters<typeof vociNav>[0], titolo: string): VoceNav[] {
  const trovato = vociNav(ruolo).gruppi.find((g) => g.titolo === titolo)
  if (!trovato) throw new Error(`${ruolo}: manca il gruppo «${titolo}»`)
  return trovato.voci
}

function voce(ruolo: Parameters<typeof vociNav>[0], etichetta: string): VoceNav {
  const trovata = tutte(ruolo).find((v) => v.etichetta === etichetta)
  if (!trovata) throw new Error(`${ruolo}: manca «${etichetta}»`)
  return trovata
}

describe('Setter e Closer al posto di Setting (07/10/2026)', () => {
  it('l’admin ha due voci, Setter e Closer, e non più Setting', () => {
    const { principali } = vociNav('admin')
    expect(principali).toHaveLength(4)
    expect(tutte('admin').map((v) => v.etichetta)).not.toContain('Setting')
    expect(tutte('admin').map((v) => [v.etichetta, v.href])).toEqual(
      expect.arrayContaining([
        ['Setter', '/setting'],
        ['Closer', '/setting/closer'],
      ]),
    )
    // together in «Team», Closer right after Setter (the Insight is no longer an item between them)
    const team = gruppo('admin', 'Team').map((v) => v.etichetta)
    expect(team).toEqual(['Setter', 'Closer', 'Provvigioni'])
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
      // the business coach reads and never has to act: no number (22/10/2026)
      business_coach: [],
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
      // the business coach reads and never has to act: no number (22/10/2026)
      business_coach: [],
    })
    // both sit in the phone's bar (1.38.0: the admin's bar is Panoramica, Le mie call, Setter, Piano editoriale)
    expect(vociNav('admin').principali.some((v) => v.daApprovare)).toBe(true)
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
      commenti: 0
    })
  })

  it('«Altro» dell’admin porta gli esiti (Closer); le giornate da approvare stanno su «Setter», nella barra', () => {
    const inAltro = promemoriaDiAltro(vociNav('admin').altre, { esiti: 3, daApprovare: 2, commenti: 0 })
    expect(inAltro).toEqual({ esiti: 3, daApprovare: 0, commenti: 0 })
    expect(nomeConPromemoria('Altro', inAltro)).toBe('Altro, 3 esiti da registrare')
    // the setter's «Altro» has none of them
    expect(promemoriaDiAltro(vociNav('setter').altre, { esiti: 3, daApprovare: 2, commenti: 4 })).toEqual({
      esiti: 0,
      daApprovare: 0,
      commenti: 0
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
      // the business coach reads and never has to act: no number (22/10/2026)
      business_coach: [],
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


describe('l’area Marketing: le tre pagine, ognuna una voce (1.38.0; «Pubblicati» al posto di «Post di Instagram» e «Analisi», 25/10/2026)', () => {
  const PAGINE = [
    ['Piano editoriale', '/marketing/contenuti'],
    ['Pubblicati', '/marketing/pubblicati'],
    ['Spunti', '/marketing/spunti'],
  ]

  it('solo admin, video editor e marketing hanno il gruppo «Marketing», con le tre voci nello stesso ordine', () => {
    const conMarketing = TUTTI_I_RUOLI.filter((ruolo) => tutte(ruolo).some((v) => v.href.startsWith('/marketing')))
    // the business coach reads the area too, in read only (22/10/2026)
    expect(conMarketing).toEqual(['admin', 'editor', 'marketing', 'business_coach'])
    for (const ruolo of conMarketing) {
      expect(gruppo(ruolo, 'Marketing').map((v) => [v.etichetta, v.href]), ruolo).toEqual(PAGINE)
      for (const v of gruppo(ruolo, 'Marketing')) {
        // no badge at all: nobody has to link a post (CLAUDE.md section 17)
        expect(v.esiti || v.daApprovare || v.commenti, `${ruolo} → ${v.href}`).toBeFalsy()
      }
    }
  })

  it('ogni voce si accende sulla sua pagina e basta (le schede in cima alle pagine restano)', () => {
    const contenuti = voce('admin', 'Piano editoriale')
    expect(isAttiva('/marketing/contenuti', contenuti)).toBe(true)
    expect(isAttiva('/marketing/contenuti/c0ffee00-0000-4000-8000-000000000001', contenuti)).toBe(true)
    expect(isAttiva('/marketing/pubblicati', contenuti)).toBe(false)
    expect(isAttiva('/marketingx/contenuti', contenuti)).toBe(false)
    const pubblicati = voce('admin', 'Pubblicati')
    expect(isAttiva('/marketing/pubblicati', pubblicati)).toBe(true)
    expect(isAttiva('/marketing/spunti', pubblicati)).toBe(false)
    expect(isAttiva('/marketing/pubblicati', voce('marketing', 'Pubblicati'))).toBe(true)
    // the old pages redirect (proxy.ts): no item is lit on them
    expect(isAttiva('/marketing/instagram', pubblicati)).toBe(false)
    expect(isAttiva('/marketing/analisi', pubblicati)).toBe(false)
    expect(isAttiva('/marketing/spunti', voce('editor', 'Spunti'))).toBe(true)
  })

  it('nessuna voce del Marketing porta un numero: nessuno è tenuto a collegare un post (25/10/2026)', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      for (const v of tutte(ruolo).filter((x) => x.href.startsWith('/marketing'))) {
        expect(promemoriaDellaVoce(v, { esiti: 3, daApprovare: 2, commenti: 1 }), `${ruolo} → ${v.href}`).toEqual({ esiti: 0, daApprovare: 0, commenti: 0 })
      }
    }
  })

  it('il video editor ha il Piano editoriale come quarta voce della barra e parte ancora dai suoi task', () => {
    const { principali, altre } = vociNav('editor')
    expect(principali.map((v) => v.href)).toEqual(['/task', '/progetti', '/tempo', '/marketing/contenuti'])
    expect(altre.map((v) => v.href)).toEqual(['/marketing/pubblicati', '/marketing/spunti', '/changelog'])
    expect(percorsoIniziale('editor')).toBe('/task')
  })

  it('il marketing parte dal calendario e ha anche i Progetti, come il video editor', () => {
    const { principali, altre } = vociNav('marketing')
    expect(principali.map((v) => v.href)).toEqual(['/marketing/contenuti', '/task', '/progetti', '/tempo'])
    expect(altre.map((v) => v.href)).toEqual(['/marketing/pubblicati', '/marketing/spunti', '/changelog'])
    expect(percorsoIniziale('marketing')).toBe('/marketing/contenuti')
  })

  it('il marketing non ha niente di Economics', () => {
    const href = tutte('marketing').map((v) => v.href)
    const economics = ['/', '/setting', '/setting/closer', '/calls', '/calls/new', '/leads', '/today', '/sales', '/payments', '/clients', '/insight']
    for (const pagina of [...economics, '/settings']) expect(href, pagina).not.toContain(pagina)
  })

  it('coach, nutrizione e dev restano sui soli Progetti', () => {
    for (const ruolo of ['coach', 'nutrizione', 'dev'] as const) {
      expect(tutte(ruolo).map((v) => v.href), ruolo).toEqual(['/task', '/progetti', '/tempo', '/changelog'])
    }
  })
})

describe('il menu a gruppi (1.38.0)', () => {
  const TITOLI = {
    admin: [null, 'Vendite', 'Team', 'Marketing', 'Progetti', 'Amministrazione'],
    setter: ['Il mio lavoro', 'Team', 'Progetti', 'Generale'],
    closer: ['Il mio lavoro', 'Progetti', 'Generale'],
    coach: ['Progetti', 'Generale'],
    editor: ['Progetti', 'Marketing', 'Generale'],
    marketing: ['Marketing', 'Progetti', 'Generale'],
    nutrizione: ['Progetti', 'Generale'],
    dev: ['Progetti', 'Generale'],
    business_coach: [null, 'Vendite', 'Team', 'Marketing', 'Progetti', 'Amministrazione'],
  } as const

  it('i gruppi di ogni ruolo, nell’ordine della barra laterale', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      expect(vociNav(ruolo).gruppi.map((g) => g.titolo), ruolo).toEqual(TITOLI[ruolo])
    }
  })

  it('la struttura dell’admin approvata da Dany il 16/10/2026', () => {
    const per = (titolo: string | null) =>
      vociNav('admin').gruppi.find((g) => g.titolo === titolo)?.voci.map((v) => v.etichetta)
    expect(per(null)).toEqual(['Panoramica'])
    expect(per('Vendite')).toEqual(['Le mie call', 'Pipeline', 'Clienti', 'Vendite', 'Incassi', 'Rinnovi'])
    expect(per('Team')).toEqual(['Setter', 'Closer', 'Provvigioni'])
    expect(per('Marketing')).toEqual(['Piano editoriale', 'Pubblicati', 'Spunti'])
    expect(per('Progetti')).toEqual(['Progetti', 'I miei task', 'Tempo'])
    expect(per('Amministrazione')).toEqual(['Costi', 'Impostazioni', 'Novità'])
    expect(vociNav('admin').principali.map((v) => v.etichetta)).toEqual([
      'Panoramica',
      'Le mie call',
      'Setter',
      'Piano editoriale',
    ])
  })

  it('«Altro» ha gli stessi titoli e tutto quello che la barra non ha, una volta sola', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const { gruppi, gruppiAltro, principali, altre } = vociNav(ruolo)
      const titoli = new Set(gruppi.map((g) => g.titolo))
      for (const g of gruppiAltro) {
        expect(titoli.has(g.titolo), `${ruolo}: «${g.titolo}»`).toBe(true)
        expect(g.voci.length, `${ruolo}: «${g.titolo}» vuoto`).toBeGreaterThan(0)
      }
      // bar + sheet = the whole menu, no item in both
      const tuttoIlMenu = gruppi.flatMap((g) => g.voci).map((v) => v.href)
      const unione = [...principali, ...gruppiAltro.flatMap((g) => g.voci)].map((v) => v.href)
      expect([...unione].sort(), ruolo).toEqual([...tuttoIlMenu].sort())
      expect(altre.map((v) => v.href), ruolo).toEqual(gruppiAltro.flatMap((g) => g.voci).map((v) => v.href))
    }
  })

  it('i titoli non si ripetono: le voci di un’area stanno sempre insieme', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const titoli = vociNav(ruolo).gruppi.map((g) => g.titolo)
      expect(new Set(titoli).size, ruolo).toBe(titoli.length)
      // only the first group of the admin (and of the business coach, who reads his pages) has no title
      expect(titoli.filter((t) => t === null).length, ruolo).toBe(ruolo === 'admin' || ruolo === 'business_coach' ? 1 : 0)
    }
  })

  it('ogni ruolo ha al massimo 4 voci nella barra in basso, e tutte nel suo menu', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const { principali, gruppi } = vociNav(ruolo)
      expect(principali.length, ruolo).toBeLessThanOrEqual(4)
      const href = new Set(gruppi.flatMap((g) => g.voci).map((v) => v.href))
      for (const v of principali) expect(href.has(v.href), `${ruolo} → ${v.href}`).toBe(true)
    }
  })

  it('nessuna voce ripetuta nello stesso ruolo, nessuna icona ripetuta', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const href = tutte(ruolo).map((v) => v.href)
      expect(new Set(href).size, ruolo).toBe(href.length)
      const icone = tutte(ruolo).map((v) => v.Icona)
      expect(new Set(icone).size, ruolo).toBe(icone.length)
    }
  })

  it('«Novità» ha il megafono per ogni ruolo', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      expect(voce(ruolo, 'Novità').Icona, ruolo).toBe(Megaphone)
    }
  })
})

describe('Insight 24h: una scheda, non una voce (1.38.0)', () => {
  it('nessun ruolo ha /insight nel menu, nella barra o in «Altro»', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      expect(tutte(ruolo).map((v) => v.href), ruolo).not.toContain('/insight')
      expect(tutte(ruolo).map((v) => v.etichetta), ruolo).not.toContain('Insight ultime 24h')
      // the sparkles were the Insight's: they are no longer an icon of the menu
      expect(tutte(ruolo).filter((v) => v.Icona === Sparkles), ruolo).toEqual([])
    }
  })

  it('«Setter» dell’admin e «Oggi» del setter restano accese su /insight', () => {
    const setter = voce('admin', 'Setter')
    expect(isAttiva('/insight', setter)).toBe(true)
    expect(isAttiva('/setting', setter)).toBe(true)
    expect(isAttiva('/setting/closer', setter)).toBe(false)
    expect(isAttiva('/insightx', setter)).toBe(false)
    const oggi = voce('setter', 'Oggi')
    expect(isAttiva('/insight', oggi)).toBe(true)
    expect(isAttiva('/today', oggi)).toBe(true)
    expect(isAttiva('/insightx', oggi)).toBe(false)
    // nobody else lights on it
    for (const ruolo of TUTTI_I_RUOLI) {
      for (const v of tutte(ruolo)) {
        if (v.href === '/setting' || v.href === '/today') continue
        expect(isAttiva('/insight', v), `${ruolo} → ${v.href}`).toBe(false)
      }
    }
  })

  it('la barra del setter non cambia: Oggi, Nuova call, Pipeline, I miei numeri', () => {
    const { principali, altre } = vociNav('setter')
    expect(principali.map((v) => v.href)).toEqual(['/today', '/calls/new', '/leads', '/my-numbers'])
    expect(altre.map((v) => v.href)).toEqual(['/calls', '/setting/closer', '/progetti', '/task', '/tempo', '/changelog'])
  })
})

describe('il business coach (22/10/2026): le pagine dell’admin, in sola lettura', () => {
  const href = () => tutte('business_coach').map((v) => v.href)

  it('arriva sulla Panoramica', () => {
    expect(percorsoIniziale('business_coach')).toBe('/')
  })

  it('i suoi gruppi e le sue voci', () => {
    const per = (titolo: string | null) =>
      vociNav('business_coach').gruppi.find((g) => g.titolo === titolo)?.voci.map((v) => v.etichetta)
    expect(per(null)).toEqual(['Panoramica'])
    expect(per('Vendite')).toEqual(['Call', 'Pipeline', 'Clienti', 'Vendite', 'Incassi', 'Rinnovi'])
    expect(per('Team')).toEqual(['Setter', 'Closer', 'Provvigioni'])
    expect(per('Marketing')).toEqual(['Piano editoriale', 'Pubblicati', 'Spunti'])
    expect(per('Progetti')).toEqual(['Progetti', 'Tempo del team'])
    expect(per('Amministrazione')).toEqual(['Costi', 'Impostazioni', 'Novità'])
    expect(vociNav('business_coach').principali.map((v) => v.href)).toEqual(['/', '/calls', '/setting', '/marketing/contenuti'])
  })

  it('nessuna voce che scrive: niente Nuova call, Oggi, I miei task, Il mio tempo, Le mie vendite', () => {
    for (const pagina of ['/calls/new', '/sales/new', '/today', '/task', '/tempo', '/my-sales', '/my-numbers']) {
      expect(href(), pagina).not.toContain(pagina)
    }
  })

  it('nessun numero sulle voci: i promemoria sono di chi deve agire', () => {
    for (const v of tutte('business_coach')) {
      expect(v.esiti, v.etichetta).toBeUndefined()
      expect(v.daApprovare, v.etichetta).toBeUndefined()
      expect(v.commenti, v.etichetta).toBeUndefined()
    }
  })

  it('«Setter» resta accesa sull’Insight, «Tempo del team» sulla sua pagina', () => {
    expect(isAttiva('/insight', voce('business_coach', 'Setter'))).toBe(true)
    expect(isAttiva('/tempo/team', voce('business_coach', 'Tempo del team'))).toBe(true)
    expect(isAttiva('/tempo', voce('business_coach', 'Tempo del team'))).toBe(false)
  })
})
