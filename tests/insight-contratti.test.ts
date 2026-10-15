import { readFileSync } from 'node:fs'

import { describe, expect, expectTypeOf, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ICP_PERCORSO_ALPHA } from '@/lib/insight/icp'
import {
  chiaveLead,
  formattaOraRecap,
  leggiRecap,
  passoDiRiattivazione,
  type RecapCanale,
  type RecapLetto,
} from '@/lib/insight/recap'
import {
  AVVISO_STATISTICHE,
  esecuzioneInCorso,
  haAvvisoStatistiche,
  leggiStatoInsight,
  leggiStatoInsightAdmin,
  pianificatoreFermo,
} from '@/lib/insight/stato'
import {
  argomentiAutomazioneSchema,
  automazioneSchema,
  cancellaMessaggiSchema,
  dimenticaChatSchema,
  esclusioneMessengerSchema,
  segnaFattoSchema,
  tokenPaginaSchema,
} from '@/lib/validation/insight'

// The phase 0 contracts of the Insight (1.35.0). Every chat, name and number is invented.

describe('recap: the tolerant reading of the page', () => {
  it('a parsed recap is a RecapCanale', () => {
    expectTypeOf<RecapLetto>().toMatchTypeOf<RecapCanale>()
  })

  it('never fails on an object, and gives the neutral values', () => {
    const r = leggiRecap({})
    expect(r).not.toBeNull()
    expect(r).toMatchObject({
      date: '',
      window_hours: 24,
      headline: '',
      summary: { conversations: 0, leads_in_target: 0, awaiting_reply: 0, calls_booked: 0, lost: 0 },
      leads: [],
      reactivate: [],
      objections: [],
      non_leads: [],
      agenda: [],
      show_up: [],
      escluse: 0,
      stato: 'completo',
      avvisi: [],
      content: { period: '', based_on: 0, themes: [], posts: [], keep: [], ideas: [] },
    })
  })

  it('is null for what is not an object', () => {
    expect(leggiRecap(null)).toBeNull()
    expect(leggiRecap('recap')).toBeNull()
    expect(leggiRecap([])).toBeNull()
  })

  it('gives each lead the artifact fallbacks', () => {
    const r = leggiRecap({
      leads: [
        {
          username: 'marco.prova',
          conversation_id: 't_1',
          priority: 'ALTA',
          target: 'forse',
          messages: [
            { from: 'alpha', time: '14/10 18:00', text: 'Ciao!', at: '2026-10-14T16:00:00Z' },
            { from: 'lead', time: '14/10 18:05', text: 'Ciao, info?', at: '2026-10-14T16:05:00Z' },
          ],
        },
        { conversation_id: 't_2', flow: 'laterale' },
        'non è un lead',
      ],
    })
    expect(r?.leads).toHaveLength(2)
    const [primo, secondo] = r!.leads
    expect(primo.priority).toBe('alta')
    expect(primo.target).toBe('da verificare')
    expect(primo.last_from).toBe('lead')
    expect(primo.messages).toHaveLength(2)
    expect(primo.topics).toEqual([])
    expect(secondo.priority).toBe('bassa')
    expect(secondo.flow).toBe('')
    expect(secondo.last_from).toBe('alpha')
    expect(secondo.origine).toBeUndefined()
  })

  it('keeps last_from as written, the additive fields and a valid origin', () => {
    const r = leggiRecap({
      leads: [
        {
          conversation_id: 't_3',
          last_from: 'alpha',
          messages: [{ from: 'lead', time: '', text: 'ok' }],
          analisi_mancante: true,
          minore_14: true,
          origine: { tipo: 'parola_chiave', shortcode: 'SeedDemo01', parola: 'ALPHA', tipo_post: 'video' },
        },
        { conversation_id: 't_4', origine: { tipo: 'sconosciuta' }, minore_14: 'sì' },
      ],
    })
    const [terzo, quarto] = r!.leads
    expect(terzo.last_from).toBe('alpha')
    expect(terzo.analisi_mancante).toBe(true)
    expect(terzo.minore_14).toBe(true)
    expect(terzo.origine).toEqual({ tipo: 'parola_chiave', shortcode: 'SeedDemo01', parola: 'ALPHA', tipo_post: undefined, permalink: undefined, data: undefined, hook: undefined })
    expect(terzo.messages[0].at).toBe('')
    expect(quarto.origine).toBeUndefined()
    expect(quarto.minore_14).toBeUndefined()
  })

  it('gives each reactivation its step, from days_silent when missing', () => {
    const r = leggiRecap({
      reactivate: [
        { conversation_id: 'a', days_silent: 2 },
        { conversation_id: 'b', days_silent: 6 },
        { conversation_id: 'c', days_silent: 12 },
        { conversation_id: 'd', days_silent: 12, step: '1' },
      ],
    })
    expect(r!.reactivate.map((l) => l.step)).toEqual([1, 2, 3, 1])
    expect(passoDiRiattivazione(undefined, 5)).toBe(2)
    expect(passoDiRiattivazione(4, 0)).toBe(1)
  })

  it('drops an agenda call without its day, and keeps the show-up day', () => {
    const r = leggiRecap({
      agenda: [
        { call_id: 'x', day: 'oggi', time: '18:00', name: 'Luca Prova', username: 'luca.prova' },
        { call_id: 'y', time: '19:00' },
      ],
      show_up: [{ call_id: 'z', time: '17:00', outcome: 'no-show' }],
    })
    expect(r!.agenda.map((c) => c.call_id)).toEqual(['x'])
    expect(r!.agenda[0].meet_link).toBe('')
    expect(r!.show_up[0].day).toBe('ieri')
  })

  it('keeps null statistics as null («n/d») and the additive post fields', () => {
    const r = leggiRecap({
      content: {
        period: 'Ultimi 14 giorni',
        posts: [{ permalink: 'https://www.instagram.com/reel/SeedPost02/', views: null, saved: 'tanti', dm: 3, target: 2, shortcode: 'SeedPost02', call: 1 }],
        storie: { dm: 2, target: 1 },
        keep: ['Il gancio sul pectus', 42],
      },
    })
    const [post] = r!.content.posts
    expect(post.views).toBeNull()
    expect(post.saved).toBeNull()
    expect(post.verdict).toBeNull()
    expect(post.shortcode).toBe('SeedPost02')
    expect(post.call).toBe(1)
    expect(r!.content.storie).toEqual({ dm: 2, target: 1 })
    expect(r!.content.keep).toEqual(['Il gancio sul pectus'])
  })

  it('chiaveLead: username, then PSID, then conversation', () => {
    expect(chiaveLead({ username: 'marco.prova', user_id: '123', conversation_id: 't_1' })).toBe('marco.prova')
    expect(chiaveLead({ user_id: '123', conversation_id: 't_1' })).toBe('123')
    expect(chiaveLead({ conversation_id: 't_1' })).toBe('t_1')
    expect(chiaveLead({})).toBe('')
  })

  it('formattaOraRecap: GG/MM HH:MM in Rome, across the change of time', () => {
    expect(formattaOraRecap('2026-10-14T16:05:00Z')).toBe('14/10 18:05')
    expect(formattaOraRecap('2026-10-14T22:30:00Z')).toBe('15/10 00:30')
    // 25/10/2026: back to UTC+1
    expect(formattaOraRecap('2026-10-25T12:00:00Z')).toBe('25/10 13:00')
    expect(formattaOraRecap('')).toBe('')
    expect(formattaOraRecap('ieri')).toBe('')
  })
})

describe('stato: rpc(insight_stato)', () => {
  const admin = {
    attivo: true,
    ora: '19:05:00',
    ultimo_tick_il: '2026-10-14T16:40:00Z',
    manuali_oggi: 2,
    esecuzione: {
      stato: 'in_corso',
      passo: 'analisi',
      creata_il: '2026-10-14T16:30:00Z',
      finita_il: null,
      blocchi_fatti: 4,
      blocchi_totali: 12,
      motivo: 'manuale',
      errore: null,
      avvisi: [AVVISO_STATISTICHE],
      costo_usd: 0.4123,
      token_input: 1000,
      token_cache_scritti: 20000,
      token_cache_letti: 200000,
      token_output: 5000,
      chat_attribuite: 3,
    },
  }

  it('the setter reading strips every admin key', () => {
    const s = leggiStatoInsight(admin)!
    expect(s).toEqual({
      attivo: true,
      ora: '19:05',
      esecuzione: { stato: 'in_corso', passo: 'analisi', creata_il: '2026-10-14T16:30:00Z', finita_il: null, blocchi_fatti: 4, blocchi_totali: 12 },
    })
    expect(esecuzioneInCorso(s)).toBe(true)
  })

  it('the admin reading keeps them, and knows the statistics warning', () => {
    const s = leggiStatoInsightAdmin(admin)!
    expect(s.manuali_oggi).toBe(2)
    expect(s.esecuzione?.costo_usd).toBe(0.4123)
    expect(s.esecuzione?.chat_instagram).toBeNull()
    expect(haAvvisoStatistiche(s)).toBe(true)
  })

  it('without runs, and with values it does not know', () => {
    const s = leggiStatoInsight({ attivo: 'sì', ora: '25:00', esecuzione: { stato: 'boh' } })!
    expect(s).toEqual({ attivo: false, ora: '19:00', esecuzione: null })
    expect(esecuzioneInCorso(s)).toBe(false)
    expect(leggiStatoInsight(null)).toBeNull()
  })

  it('pianificatoreFermo: on and silent for more than 15 minutes', () => {
    const adesso = new Date('2026-10-14T17:00:00Z')
    expect(pianificatoreFermo({ attivo: true, ultimo_tick_il: '2026-10-14T16:50:00Z' }, adesso)).toBe(false)
    expect(pianificatoreFermo({ attivo: true, ultimo_tick_il: '2026-10-14T16:40:00Z' }, adesso)).toBe(true)
    expect(pianificatoreFermo({ attivo: true, ultimo_tick_il: null }, adesso)).toBe(true)
    expect(pianificatoreFermo({ attivo: false, ultimo_tick_il: null }, adesso)).toBe(false)
  })
})

describe('validation of the actions', () => {
  it('segnaFatto', () => {
    expect(segnaFattoSchema.safeParse({ fonte: 'instagram', giorno: '2026-10-14', chiave: 'marco.prova', fatto: true }).success).toBe(true)
    expect(segnaFattoSchema.safeParse({ fonte: 'agenda', giorno: '2026-10-14', chiave: 'x', fatto: true }).success).toBe(false)
    expect(segnaFattoSchema.safeParse({ fonte: 'messenger', giorno: '2026-02-30', chiave: 'x', fatto: true }).success).toBe(false)
    expect(segnaFattoSchema.safeParse({ fonte: 'messenger', giorno: '2026-10-14', chiave: '', fatto: false }).success).toBe(false)
    expect(segnaFattoSchema.safeParse({ fonte: 'messenger', giorno: '2026-10-14', chiave: 'x'.repeat(201), fatto: false }).success).toBe(false)
  })

  it('automazione: 5-minute steps', () => {
    expect(automazioneSchema.parse({ attiva: true, ora: '19:05' })).toEqual({ attiva: true, ora: '19:05' })
    expect(automazioneSchema.parse({ attiva: false, ora: '07:00:00' }).ora).toBe('07:00')
    const passo = automazioneSchema.safeParse({ attiva: true, ora: '19:07' })
    expect(passo.success).toBe(false)
    expect(passo.error?.issues[0].message).toBe('Scegli un orario a passi di 5 minuti, per esempio 19:00 o 19:05.')
    expect(automazioneSchema.safeParse({ attiva: true, ora: '24:00' }).success).toBe(false)
    expect(automazioneSchema.safeParse({ attiva: true, ora: '' }).success).toBe(false)
  })

  it('the arguments of insight_imposta_automazione: a URL to turn it on', () => {
    expect(argomentiAutomazioneSchema.safeParse({ p_attivo: false, p_ora: '19:00', p_url: null }).success).toBe(true)
    expect(argomentiAutomazioneSchema.safeParse({ p_attivo: true, p_ora: '19:00', p_url: 'https://dashboard.percorsoalpha.com/api/cron/insight' }).success).toBe(true)
    const senza = argomentiAutomazioneSchema.safeParse({ p_attivo: true, p_ora: '19:00', p_url: null })
    expect(senza.success).toBe(false)
    expect(senza.error?.issues[0].path).toEqual(['p_url'])
  })

  it('the Page token comes only inside a FormData', () => {
    const dati = new FormData()
    dati.set('token', '  "EAAprova123"  ')
    expect(tokenPaginaSchema.parse(dati)).toBe('  "EAAprova123"  ')
    expect(tokenPaginaSchema.safeParse('EAAprova123').success).toBe(false)
    expect(tokenPaginaSchema.safeParse(new FormData()).success).toBe(false)
    const lungo = new FormData()
    lungo.set('token', 'x'.repeat(9000))
    expect(tokenPaginaSchema.safeParse(lungo).success).toBe(false)
  })

  it('Messenger exclusion, with «Cancella anche i suoi messaggi» checked by default', () => {
    const e = esclusioneMessengerSchema.parse({ utente_id: '24680135792468', nome: ' Anna Prova ', motivo: '' })
    expect(e).toEqual({ utente_id: '24680135792468', nome: 'Anna Prova', motivo: null, cancella_messaggi: true })
    expect(esclusioneMessengerSchema.safeParse({ utente_id: 'abc', nome: 'Anna' }).success).toBe(false)
    expect(cancellaMessaggiSchema.parse({})).toEqual({ cancella_messaggi: true })
    expect(cancellaMessaggiSchema.parse({ cancella_messaggi: false })).toEqual({ cancella_messaggi: false })
  })

  it('insight_dimentica: a username on Instagram, a PSID on Messenger', () => {
    expect(dimenticaChatSchema.safeParse({ canale: 'instagram', chiave: 'marco.prova' }).success).toBe(true)
    expect(dimenticaChatSchema.safeParse({ canale: 'instagram', chiave: '@Marco' }).success).toBe(false)
    expect(dimenticaChatSchema.safeParse({ canale: 'messenger', chiave: '24680135792468' }).success).toBe(true)
    expect(dimenticaChatSchema.safeParse({ canale: 'messenger', chiave: 'marco.prova' }).success).toBe(false)
  })
})

describe('ICP', () => {
  const sorgente = readFileSync(new URL('../lib/insight/icp.ts', import.meta.url), 'utf8')

  it('is server only, the anonymous version, with its sections', () => {
    expect(sorgente.startsWith("import 'server-only'")).toBe(true)
    expect(ICP_PERCORSO_ALPHA).toContain('versione anonima')
    for (const titolo of ['## Identikit', '## Pain profondi', '## Segnali in DM e in call', '## Indicazioni per i contenuti']) {
      expect(ICP_PERCORSO_ALPHA).toContain(titolo)
    }
    // no handle of anybody
    expect(ICP_PERCORSO_ALPHA).not.toMatch(/@[a-z0-9._]{2,}/i)
  })
})
