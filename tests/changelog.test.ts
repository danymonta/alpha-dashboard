import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { TUTTI_I_RUOLI, type AppRole } from '@/lib/auth/roles'
import {
  ETICHETTA_PUBBLICO,
  VERSIONE_CORRENTE,
  VERSIONI,
  confrontaVersioni,
  type Pubblico,
  type Versione,
  type Voce,
} from '@/lib/changelog/versioni'
import { PUBBLICI_DEL_RUOLO, versioniPer } from '@/lib/changelog/visibili'
import { oggiRoma } from '@/lib/date'
import { vociNav } from '@/lib/nav'

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const PUBBLICI = Object.keys(ETICHETTA_PUBBLICO) as Pubblico[]
const COLLABORATORI = TUTTI_I_RUOLI.filter((r) => r !== 'admin')

/**
 * Who reads what, written here by hand (CLAUDE.md section 23) and not taken
 * from lib/changelog/visibili.ts: a test that recomputed the answer with the
 * code under test would pass whatever the code said.
 */
const LEGGE: Record<AppRole, readonly Pubblico[]> = {
  admin: ['admin', 'setter', 'closer', 'progetti', 'tutti'],
  setter: ['setter', 'progetti', 'tutti'],
  closer: ['closer', 'progetti', 'tutti'],
  coach: ['progetti', 'tutti'],
  editor: ['progetti', 'tutti'],
  nutrizione: ['progetti', 'tutti'],
  dev: ['progetti', 'tutti'],
}

function legge(ruolo: AppRole, per: readonly Pubblico[]): boolean {
  return per.some((p) => LEGGE[ruolo].includes(p))
}

/** Every text a role reads: headings and items. */
function testiDi(ruolo: AppRole): { voci: Set<string>; intestazioni: Set<string> } {
  const vista = versioniPer(ruolo)
  return {
    voci: new Set(vista.flatMap((v) => [...v.novita, ...v.correzioni].map((voce) => voce.testo))),
    intestazioni: new Set(vista.flatMap((v) => (v.intestazione ? [v.intestazione.titolo, v.intestazione.riassunto] : []))),
  }
}

/** A real calendar day in YYYY-MM-DD: 2026-02-30 is refused. */
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const d = new Date(`${data}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data
}

function voci(v: Versione): Voce[] {
  return [...v.novita, ...(v.correzioni ?? [])]
}

/** Something the team reads: an item or a heading tagged for someone besides the admin. */
function perIlTeam(per: readonly Pubblico[]): boolean {
  return per.some((p) => p !== 'admin')
}

/**
 * Words that exist only in the admin's economics (CLAUDE.md section 6): a text
 * the team reads that holds one of them is almost surely a leak. The list is a
 * safety net under the tagging, not the rule: «cash», «revenue», «provvigione»,
 * «rata» and «incasso» are not in it, because the setter reads his own clients
 * and commissions and the closer his own sales; those items are checked by
 * hand. «Panoramica» is the admin's page; a project's tab is «Panoramica del
 * progetto».
 */
const SOLO_ADMIN: RegExp[] = [
  /margine/i,
  /\bcost[oi]\b/i,
  /\bpanoramica\b(?! del progetto)/i,
  /\b(4|quattro) parti\b/i,
  /previsione di cassa/i,
  /obiettivi del mese/i,
  /riepilogo serale/i,
  /riepilogo (della settimana|del venerd[iì]|settimanale)/i,
  /commercialista/i,
  /revenue firmata/i,
  /valore nel tempo/i,
  /\bcompens[oi]\b/i,
  /regol[ae] (provvigional|delle provvigioni)/i,
  /provvigion[ei] (degli altri|di altri|del team|dei collaboratori)/i,
  // the rate of a commission rule
  /%/,
]

function vietate(testo: string): string[] {
  return SOLO_ADMIN.filter((re) => re.test(testo)).map(String)
}

describe('confrontaVersioni', () => {
  it('confronta i numeri come numeri, non come testo', () => {
    expect(confrontaVersioni('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(confrontaVersioni('1.1.2', '1.1.10')).toBeLessThan(0)
    expect(confrontaVersioni('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(confrontaVersioni('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('changelog', () => {
  it('ha almeno una versione, e la corrente è la prima', () => {
    expect(VERSIONI.length).toBeGreaterThan(0)
    expect(VERSIONE_CORRENTE).toBe(VERSIONI[0])
  })

  it('ogni versione è semver valido', () => {
    for (const v of VERSIONI) expect(v.versione, v.versione).toMatch(SEMVER)
  })

  it('le versioni scendono strettamente, dalla più recente', () => {
    for (let i = 1; i < VERSIONI.length; i++) {
      const [prima, dopo] = [VERSIONI[i - 1].versione, VERSIONI[i].versione]
      expect(confrontaVersioni(prima, dopo), `${prima} deve venire prima di ${dopo}`).toBeGreaterThan(0)
    }
  })

  it('le date sono giorni veri, mai nel futuro, e non crescono scendendo nella lista', () => {
    const oggi = oggiRoma()
    for (const v of VERSIONI) {
      expect(dataValida(v.data), `${v.versione}: ${v.data}`).toBe(true)
      expect(v.data <= oggi, `${v.versione} è datata nel futuro: ${v.data}`).toBe(true)
    }
    for (let i = 1; i < VERSIONI.length; i++) {
      expect(VERSIONI[i - 1].data >= VERSIONI[i].data, `${VERSIONI[i - 1].versione} è più vecchia di ${VERSIONI[i].versione}`).toBe(true)
    }
  })

  it('la versione di package.json è quella in cima al changelog', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(pkg.version).toBe(VERSIONI[0].versione)
  })

  it('ogni versione dice qualcosa: almeno una novità o una correzione, con titolo e riassunto', () => {
    for (const v of VERSIONI) {
      expect(voci(v).length, v.versione).toBeGreaterThan(0)
      expect(v.titolo.trim(), v.versione).not.toBe('')
      expect(v.riassunto.trim(), v.versione).not.toBe('')
      for (const voce of voci(v)) expect(voce.testo.trim(), v.versione).not.toBe('')
    }
  })

  it('una PATCH corregge soltanto; una MINOR o MAJOR porta almeno una novità', () => {
    for (const v of VERSIONI) {
      const patch = Number(v.versione.split('.')[2])
      if (patch > 0) expect(v.novita, `${v.versione} è una patch`).toEqual([])
      else expect(v.novita.length, `${v.versione} non ha novità`).toBeGreaterThan(0)
    }
  })

  it('1.0.0 è il primo giorno in produzione, il 27/09/2026', () => {
    const lancio = VERSIONI.find((v) => v.versione === '1.0.0')
    expect(lancio?.data).toBe('2026-09-27')
  })
})

describe('per chi è ogni voce', () => {
  /** Known audiences, no duplicates; «admin» (only him) and «tutti» stand alone. */
  function pubblicoValido(per: readonly Pubblico[], dove: string) {
    expect(per.length, `${dove}: per chi?`).toBeGreaterThan(0)
    expect(new Set(per).size, `${dove}: doppioni`).toBe(per.length)
    for (const p of per) expect(PUBBLICI, dove).toContain(p)
    if (per.includes('admin')) expect(per, `${dove}: «admin» sta da solo`).toEqual(['admin'])
    if (per.includes('tutti')) expect(per, `${dove}: «tutti» sta da solo`).toEqual(['tutti'])
  }

  it('ogni voce e ogni intestazione dicono per chi sono', () => {
    for (const v of VERSIONI) {
      pubblicoValido(v.intestazionePer, `${v.versione} intestazione`)
      voci(v).forEach((voce, i) => pubblicoValido(voce.per, `${v.versione} voce ${i + 1}`))
    }
  })

  it('le parole per il team esistono solo dove il team legge, e dicono qualcosa di diverso', () => {
    for (const v of VERSIONI) {
      if (v.intestazioneTeam) {
        expect(perIlTeam(v.intestazionePer), `${v.versione}: intestazione del team che nessuno legge`).toBe(true)
        expect(v.intestazioneTeam.titolo.trim(), v.versione).not.toBe('')
        expect(v.intestazioneTeam.riassunto.trim(), v.versione).not.toBe('')
      }
      for (const voce of voci(v)) {
        if (voce.testoTeam === undefined) continue
        expect(perIlTeam(voce.per), `${v.versione}: «${voce.testoTeam}» non lo legge nessuno`).toBe(true)
        expect(voce.testoTeam.trim(), v.versione).not.toBe('')
        expect(voce.testoTeam, v.versione).not.toBe(voce.testo)
      }
    }
  })

  it('il team non legge mai parole dell’economia dell’admin (margine, costi, Panoramica…)', () => {
    for (const v of VERSIONI) {
      if (perIlTeam(v.intestazionePer)) {
        const { titolo, riassunto } = v.intestazioneTeam ?? v
        expect(vietate(`${titolo} ${riassunto}`), `${v.versione}: intestazione`).toEqual([])
      }
      for (const voce of voci(v)) {
        if (!perIlTeam(voce.per)) continue
        const letto = voce.testoTeam ?? voce.testo
        expect(vietate(letto), `${v.versione}: «${letto}»`).toEqual([])
      }
    }
  })

  it('la rete di parole prende davvero le voci dell’admin: non è una lista morta', () => {
    const presi = VERSIONI.flatMap(voci).filter((voce) => !perIlTeam(voce.per) && vietate(voce.testo).length > 0)
    expect(presi.length).toBeGreaterThanOrEqual(5)
    // the admin's words of a shared item stay his: the team reads its own
    const storico = VERSIONI.find((v) => v.versione === '1.0.0')!.novita.find((voce) => voce.testo.startsWith('Storico importato'))!
    expect(vietate(storico.testo)).not.toEqual([])
    expect(vietate(storico.testoTeam!)).toEqual([])
  })
})

describe('cosa legge ogni ruolo', () => {
  it('chi legge cosa è quello deciso, per ognuno dei 7 ruoli', () => {
    expect(Object.keys(LEGGE).sort()).toEqual([...TUTTI_I_RUOLI].sort())
    expect(PUBBLICI_DEL_RUOLO).toEqual(LEGGE)
  })

  it('l’admin legge tutto: ogni versione, ogni voce con il suo testo e per chi è', () => {
    const vista = versioniPer('admin')
    expect(vista.map((v) => v.versione)).toEqual(VERSIONI.map((v) => v.versione))
    vista.forEach((v, i) => {
      const originale = VERSIONI[i]
      expect(v.intestazione).toEqual({ titolo: originale.titolo, riassunto: originale.riassunto })
      expect(v.novita).toEqual(originale.novita.map(({ testo, per }) => ({ testo, per })))
      expect(v.correzioni).toEqual((originale.correzioni ?? []).map(({ testo, per }) => ({ testo, per })))
    })
  })

  it.each(COLLABORATORI)('%s legge solo le voci per lui, con le parole del team', (ruolo: AppRole) => {
    const vista = versioniPer(ruolo)
    const attese = VERSIONI.map((v) => {
      const sue = (lista: Voce[] = []) =>
        lista.filter((voce) => legge(ruolo, voce.per)).map((voce) => ({ testo: voce.testoTeam ?? voce.testo }))
      return { versione: v.versione, novita: sue(v.novita), correzioni: sue(v.correzioni) }
    }).filter((v) => v.novita.length + v.correzioni.length > 0)

    expect(vista.map(({ versione, novita, correzioni }) => ({ versione, novita, correzioni }))).toEqual(attese)
    // nobody but the admin sees the tags
    for (const v of vista) for (const voce of [...v.novita, ...v.correzioni]) expect(voce.per).toBeUndefined()
  })

  it.each(COLLABORATORI)('%s non legge nessuna voce scritta solo per altri ruoli', (ruolo: AppRole) => {
    const letti = testiDi(ruolo).voci
    for (const v of VERSIONI) {
      for (const voce of voci(v)) {
        if (legge(ruolo, voce.per)) continue
        expect(letti.has(voce.testo), `${ruolo} legge «${voce.testo}»`).toBe(false)
        if (voce.testoTeam) expect(letti.has(voce.testoTeam), `${ruolo} legge «${voce.testoTeam}»`).toBe(false)
      }
    }
  })

  it.each(COLLABORATORI)('%s: un titolo che non lo riguarda diventa neutro, mai quello dell’admin', (ruolo: AppRole) => {
    for (const v of versioniPer(ruolo)) {
      const originale = VERSIONI.find((o) => o.versione === v.versione)!
      if (!legge(ruolo, originale.intestazionePer)) expect(v.intestazione, `${ruolo} ${v.versione}`).toBeNull()
      else expect(v.intestazione).toEqual(originale.intestazioneTeam ?? { titolo: originale.titolo, riassunto: originale.riassunto })
    }
  })

  it.each(COLLABORATORI)('%s non legge mai una voce o un titolo scritti solo per l’admin', (ruolo: AppRole) => {
    const letti = testiDi(ruolo)
    const vista = versioniPer(ruolo)
    let soloAdmin = 0
    for (const v of VERSIONI) {
      for (const voce of voci(v)) {
        if (voce.per.join() !== 'admin') continue
        soloAdmin++
        expect(letti.voci.has(voce.testo), `${ruolo} legge «${voce.testo}»`).toBe(false)
      }
      if (v.intestazionePer.join() !== 'admin') continue
      expect(letti.intestazioni.has(v.titolo), `${ruolo} legge il titolo di ${v.versione}`).toBe(false)
      expect(letti.intestazioni.has(v.riassunto), `${ruolo} legge il riassunto di ${v.versione}`).toBe(false)
      const sua = vista.find((x) => x.versione === v.versione)
      if (sua) expect(sua.intestazione, `${ruolo} ${v.versione}`).toBeNull()
    }
    expect(soloAdmin).toBeGreaterThan(0)
  })

  it('coach, editor, nutrizione e dev leggono la stessa pagina', () => {
    const coach = versioniPer('coach')
    for (const ruolo of ['editor', 'nutrizione', 'dev'] as const) expect(versioniPer(ruolo), ruolo).toEqual(coach)
  })

  it('i ruoli dei progetti leggono solo le voci dei progetti e di tutto il team', () => {
    const soloEconomics = VERSIONI.flatMap(voci).filter((voce) => voce.per.every((p) => p === 'setter' || p === 'closer'))
    const letti = new Set(versioniPer('coach').flatMap((v) => [...v.novita, ...v.correzioni].map((voce) => voce.testo)))
    expect(soloEconomics.length).toBeGreaterThan(0)
    for (const voce of soloEconomics) expect(letti.has(voce.testoTeam ?? voce.testo), voce.testo).toBe(false)
    // a version with nothing for the coach is not shown at all
    expect(versioniPer('coach').some((v) => v.versione === '1.9.0')).toBe(false)
  })

  it('il setter non legge le voci del closer e viceversa', () => {
    const delSetter = new Set(versioniPer('setter').flatMap((v) => v.novita.map((voce) => voce.testo)))
    const delCloser = new Set(versioniPer('closer').flatMap((v) => v.novita.map((voce) => voce.testo)))
    const soloCloser = VERSIONI.flatMap((v) => v.novita).filter((voce) => voce.per.join() === 'closer')
    const soloSetter = VERSIONI.flatMap((v) => v.novita).filter((voce) => voce.per.join() === 'setter')
    expect(soloCloser.length).toBeGreaterThan(0)
    expect(soloSetter.length).toBeGreaterThan(0)
    for (const voce of soloCloser) expect(delSetter.has(voce.testoTeam ?? voce.testo)).toBe(false)
    for (const voce of soloSetter) expect(delCloser.has(voce.testoTeam ?? voce.testo)).toBe(false)
  })

  it('ogni ruolo raggiunge le novità da «Altro», mai dalla barra in basso', () => {
    for (const ruolo of TUTTI_I_RUOLI) {
      const { principali, altre } = vociNav(ruolo)
      expect(altre.map((v) => v.href), ruolo).toContain('/changelog')
      expect(principali.map((v) => v.href), ruolo).not.toContain('/changelog')
    }
  })
})

describe('il filtro, su dati costruiti a mano', () => {
  const FIXTURE: Versione[] = [
    {
      versione: '9.2.0',
      data: '2030-01-03',
      titolo: 'Titolo per il titolare',
      riassunto: 'Riassunto per il titolare.',
      intestazionePer: ['admin'],
      novita: [
        { per: ['admin'], testo: 'Solo per il titolare' },
        { per: ['setter'], testo: 'Per il setter, detto al titolare', testoTeam: 'Per il setter, detto al team' },
      ],
      correzioni: [{ per: ['tutti'], testo: 'Correzione per tutti' }],
    },
    {
      versione: '9.1.0',
      data: '2030-01-02',
      titolo: 'Versione solo del titolare',
      riassunto: 'Niente per il team.',
      intestazionePer: ['admin'],
      novita: [{ per: ['admin'], testo: 'Un’altra solo per il titolare' }],
    },
    {
      versione: '9.0.0',
      data: '2030-01-01',
      titolo: 'Titolo dei progetti, detto al titolare',
      riassunto: 'Riassunto detto al titolare.',
      intestazionePer: ['progetti'],
      intestazioneTeam: { titolo: 'Titolo dei progetti, detto al team', riassunto: 'Riassunto detto al team.' },
      novita: [
        { per: ['progetti'], testo: 'Per i progetti' },
        { per: ['closer'], testo: 'Per il closer' },
      ],
    },
    {
      versione: '8.0.0',
      data: '2029-12-31',
      titolo: 'Titolo di setter e closer',
      riassunto: 'Riassunto di setter e closer.',
      intestazionePer: ['setter', 'closer'],
      novita: [{ per: ['setter', 'closer'], testo: 'Per setter e closer' }],
    },
  ]
  const NEUTRA = null
  const PROGETTI_TEAM = { titolo: 'Titolo dei progetti, detto al team', riassunto: 'Riassunto detto al team.' }
  const SETTER_CLOSER = { titolo: 'Titolo di setter e closer', riassunto: 'Riassunto di setter e closer.' }

  it('l’admin legge tutto, con le parole del titolare e per chi è ogni voce', () => {
    expect(versioniPer('admin', FIXTURE)).toStrictEqual([
      {
        versione: '9.2.0',
        data: '2030-01-03',
        intestazione: { titolo: 'Titolo per il titolare', riassunto: 'Riassunto per il titolare.' },
        novita: [
          { testo: 'Solo per il titolare', per: ['admin'] },
          { testo: 'Per il setter, detto al titolare', per: ['setter'] },
        ],
        correzioni: [{ testo: 'Correzione per tutti', per: ['tutti'] }],
      },
      {
        versione: '9.1.0',
        data: '2030-01-02',
        intestazione: { titolo: 'Versione solo del titolare', riassunto: 'Niente per il team.' },
        novita: [{ testo: 'Un’altra solo per il titolare', per: ['admin'] }],
        correzioni: [],
      },
      {
        versione: '9.0.0',
        data: '2030-01-01',
        intestazione: { titolo: 'Titolo dei progetti, detto al titolare', riassunto: 'Riassunto detto al titolare.' },
        novita: [
          { testo: 'Per i progetti', per: ['progetti'] },
          { testo: 'Per il closer', per: ['closer'] },
        ],
        correzioni: [],
      },
      {
        versione: '8.0.0',
        data: '2029-12-31',
        intestazione: SETTER_CLOSER,
        novita: [{ testo: 'Per setter e closer', per: ['setter', 'closer'] }],
        correzioni: [],
      },
    ])
  })

  it('il setter: la versione solo del titolare sparisce, le parole del team, il titolo neutro, nessuna etichetta', () => {
    expect(versioniPer('setter', FIXTURE)).toStrictEqual([
      {
        versione: '9.2.0',
        data: '2030-01-03',
        intestazione: NEUTRA,
        novita: [{ testo: 'Per il setter, detto al team' }],
        correzioni: [{ testo: 'Correzione per tutti' }],
      },
      { versione: '9.0.0', data: '2030-01-01', intestazione: PROGETTI_TEAM, novita: [{ testo: 'Per i progetti' }], correzioni: [] },
      { versione: '8.0.0', data: '2029-12-31', intestazione: SETTER_CLOSER, novita: [{ testo: 'Per setter e closer' }], correzioni: [] },
    ])
  })

  it('il closer: solo le sue voci, mai quelle del setter', () => {
    expect(versioniPer('closer', FIXTURE)).toStrictEqual([
      { versione: '9.2.0', data: '2030-01-03', intestazione: NEUTRA, novita: [], correzioni: [{ testo: 'Correzione per tutti' }] },
      {
        versione: '9.0.0',
        data: '2030-01-01',
        intestazione: PROGETTI_TEAM,
        novita: [{ testo: 'Per i progetti' }, { testo: 'Per il closer' }],
        correzioni: [],
      },
      { versione: '8.0.0', data: '2029-12-31', intestazione: SETTER_CLOSER, novita: [{ testo: 'Per setter e closer' }], correzioni: [] },
    ])
  })

  it.each(['coach', 'editor', 'nutrizione', 'dev'] as const)('%s: solo progetti e tutto il team', (ruolo) => {
    expect(versioniPer(ruolo, FIXTURE)).toStrictEqual([
      { versione: '9.2.0', data: '2030-01-03', intestazione: NEUTRA, novita: [], correzioni: [{ testo: 'Correzione per tutti' }] },
      { versione: '9.0.0', data: '2030-01-01', intestazione: PROGETTI_TEAM, novita: [{ testo: 'Per i progetti' }], correzioni: [] },
    ])
  })
})
