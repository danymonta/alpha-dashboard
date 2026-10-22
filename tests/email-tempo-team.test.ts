import { describe, expect, it } from 'vitest'

import { emailTempoTeam, linkTempoTeam, periodoEmail, type RiepilogoTempoTeam } from '@/lib/email/tempo-team'
import { settimanaPrecedente } from '@/lib/tempo'

const URL_APP = 'https://dashboard.percorsoalpha.com'

const settimana: RiepilogoTempoTeam = {
  da: '2026-09-28',
  a: '2026-10-04',
  minuti: 1150,
  voci: 21,
  // alphabetical, as SQL gives them: Zeno has more hours and still comes second
  persone: [
    {
      nome: 'Anna <Editor>',
      minuti: 370,
      voci: 9,
      progetti: [
        {
          nome: 'Reel & Video',
          minuti: 325,
          voci: 8,
          task: [{ titolo: 'Montaggio', minuti: 220 }],
          senza_task_minuti: 45,
          altri_task: 3,
          altri_task_minuti: 60,
        },
        { nome: 'Progetto Due', minuti: 45, voci: 1, task: [], senza_task_minuti: 45, altri_task: 0, altri_task_minuti: 0 },
      ],
      altri_progetti: 0,
      altri_progetti_minuti: 0,
    },
    {
      nome: 'Zeno Coach',
      minuti: 780,
      voci: 12,
      progetti: [
        { nome: 'Percorso Rossi', minuti: 750, voci: 11, task: [{ titolo: 'Call di check', minuti: 750 }], senza_task_minuti: 0, altri_task: 0, altri_task_minuti: 0 },
      ],
      altri_progetti: 1,
      altri_progetti_minuti: 30,
    },
  ],
}

describe('la settimana della mail del lunedì', () => {
  it('lunedì: la settimana appena finita, da lunedì a domenica', () => {
    expect(settimanaPrecedente('2026-10-05')).toEqual({ da: '2026-09-28', a: '2026-10-04' })
  })

  it('a mano in un altro giorno: sempre l’ultima settimana intera', () => {
    expect(settimanaPrecedente('2026-10-01')).toEqual({ da: '2026-09-21', a: '2026-09-27' })
    expect(settimanaPrecedente('2026-10-04')).toEqual({ da: '2026-09-21', a: '2026-09-27' })
  })

  it('a cavallo dell’anno', () => {
    expect(settimanaPrecedente('2027-01-04')).toEqual({ da: '2026-12-28', a: '2027-01-03' })
    expect(periodoEmail('2026-12-28', '2027-01-03')).toBe('dal 28/12/2026 al 03/01/2027')
    expect(periodoEmail('2026-09-28', '2026-10-04')).toBe('dal 28/09 al 04/10/2026')
  })

  it('il link apre Tempo › Team sulla stessa settimana', () => {
    expect(linkTempoTeam(URL_APP, '2026-09-28', '2026-10-04')).toBe(
      'https://dashboard.percorsoalpha.com/tempo/team?da=2026-09-28&a=2026-10-04',
    )
    expect(linkTempoTeam(`${URL_APP}/`, '2026-09-28', '2026-10-04')).toBe(
      'https://dashboard.percorsoalpha.com/tempo/team?da=2026-09-28&a=2026-10-04',
    )
  })
})

describe('la mail del tempo del team', () => {
  const { oggetto, html, testo } = emailTempoTeam(settimana, URL_APP)

  it('l’oggetto dice la settimana e il totale del team', () => {
    expect(oggetto).toBe('Alpha Management · Tempo del team dal 28/09 al 04/10/2026: 19 h 10 min')
  })

  it('il totale si legge bene con ogni durata: «1 h in totale», mai «1 h registrati»', () => {
    for (const minuti of [1, 60, 120, 90]) {
      const { html: h } = emailTempoTeam({ ...settimana, minuti }, URL_APP)
      expect(h).toContain('in totale')
      expect(h).not.toContain('registrati')
    }
  })

  it('il totale, quante persone e quante voci', () => {
    expect(testo).toContain('Totale del team: 19 h 10 min (2 persone, 21 voci)')
    expect(html).toContain('19 h 10 min')
    expect(html).toContain('2 persone · 21 voci')
  })

  it('ogni persona col suo totale, i progetti e i task, nell’ordine del database', () => {
    expect(testo).toContain('Anna <Editor>: 6 h 10 min')
    expect(testo).toContain('  Reel & Video: 5 h 25 min')
    expect(testo).toContain('    Montaggio: 3 h 40 min')
    expect(testo).toContain('    Senza task: 45 min')
    expect(testo).toContain('    Altri 3 task: 1 h')
    // the time without a task on its own line, after the tasks and before the others
    expect(testo.indexOf('    Montaggio')).toBeLessThan(testo.indexOf('    Senza task: 45 min'))
    expect(testo.indexOf('    Senza task: 45 min')).toBeLessThan(testo.indexOf('    Altri 3 task'))
    expect(testo).toContain('  Progetto Due: 45 min\n    Senza task: 45 min\n')
    expect(testo).toContain('  Altro 1 progetto: 30 min')
    // alphabetical, never by hours
    expect(testo.indexOf('Anna')).toBeLessThan(testo.indexOf('Zeno'))
    expect(html.indexOf('Anna')).toBeLessThan(html.indexOf('Zeno'))
  })

  it('nomi di persone, progetti e task escapati nell’HTML', () => {
    expect(html).toContain('Anna &lt;Editor&gt;')
    expect(html).toContain('Reel &amp; Video')
    expect(html).not.toContain('<Editor>')
  })

  it('dice i limiti: solo tempo registrato, nessun timer acceso', () => {
    expect(testo).toContain('i timer ancora accesi non compaiono')
    expect(html).toContain('i timer ancora accesi non compaiono')
  })

  it('il link a Tempo › Team sulla settimana', () => {
    expect(html).toContain('href="https://dashboard.percorsoalpha.com/tempo/team?da=2026-09-28&amp;a=2026-10-04"')
    expect(testo).toContain('Apri Tempo › Team: https://dashboard.percorsoalpha.com/tempo/team?da=2026-09-28&a=2026-10-04')
  })

  it('una settimana senza tempo: lo dice, senza nomi', () => {
    const vuota = emailTempoTeam({ da: '2026-09-28', a: '2026-10-04', minuti: 0, voci: 0, persone: [] }, URL_APP)
    expect(vuota.oggetto).toBe('Alpha Management · Tempo del team dal 28/09 al 04/10/2026: nessun tempo registrato')
    expect(vuota.testo).toContain('Nessun tempo registrato nel periodo.')
    expect(vuota.html).toContain('Nessun tempo registrato nel periodo.')
    expect(vuota.html).not.toContain('in totale')
  })

  it('niente trattini lunghi', () => {
    expect(`${oggetto}${html}${testo}`).not.toContain('—')
  })
})
