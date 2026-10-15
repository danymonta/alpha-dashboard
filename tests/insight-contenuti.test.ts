import { describe, expect, it } from 'vitest'

import {
  chatEffettive,
  contaPerPost,
  contaStorie,
  etaVerificata,
  hookDaDidascalia,
  leadDelPeriodo,
  numeriDelTema,
  postDelRecap,
  postPerAnalisi,
  temiDelPeriodo,
  tendenza,
} from '@/lib/insight/contenuti'
import type { ChatEscluse, ChatSalvata } from '@/lib/insight/contratti'
import { cartaLead, cartaNonLead, chatFinta, msg, postFinto, statoFinto } from './fixture-insight'

// The content side of the Insight (1.35.0, D26, D27). Invented chats and posts only.

const oggi = '2026-10-14'
const nessunaEsclusa: ChatEscluse = { instagram: new Set(), messenger: new Set() }

function daPost(shortcode: string, giorno: string, extra: Partial<ChatSalvata> = {}): ChatSalvata {
  return chatFinta({
    origine_tipo: 'condivisione',
    origine_shortcode: shortcode,
    origine_il: `${giorno}T10:00:00.000Z`,
    origine_giorno: giorno,
    ...extra,
  })
}

describe('hookDaDidascalia and postPerAnalisi', () => {
  it('the first sentence of the caption, up to 90 characters', () => {
    expect(hookDaDidascalia('Due ore a settimana. Il resto è costanza.')).toBe('Due ore a settimana.')
    expect(hookDaDidascalia('\n\nPrima riga senza punto\nseconda')).toBe('Prima riga senza punto')
    const lunga = hookDaDidascalia(`${'parola '.repeat(30)}fine.`)
    expect([...lunga].length).toBeLessThanOrEqual(90)
    expect(lunga.endsWith('…')).toBe(true)
    expect(hookDaDidascalia(null)).toBe('')
  })

  it('the posts of the last 30 days, the most recent first, numbered from 1', () => {
    const lista = postPerAnalisi(
      [postFinto('Vecchio1234', '2026-09-10T09:00:00.000Z'), postFinto('Recente123', '2026-10-13T09:00:00.000Z'), postFinto('Medio12345', '2026-10-01T09:00:00.000Z')],
      oggi,
    )
    expect(lista.map((p) => [p.indice, p.shortcode, p.data])).toEqual([
      [1, 'Recente123', '13/10'],
      [2, 'Medio12345', '01/10'],
    ])
  })
})

describe('contaPerPost (D27)', () => {
  const chats = [
    daPost('PostA12345', '2026-10-13', { username: 'lead_a', ultimo_target: 'si' }),
    daPost('PostA12345', '2026-10-13', { username: 'lead_b', ultimo_target: 'no', origine_tipo: 'testo' }),
    daPost('PostA12345', '2026-10-12', { username: 'lead_c', ultimo_target: 'si', origine_tipo: 'parola_chiave' }),
    daPost('PostB12345', '2026-10-13', { canale: 'messenger', username: null, utente_id: '555', nome: 'Nome Unico', ultimo_target: 'da verificare', origine_tipo: 'storia' }),
    daPost('PostA12345', '2026-10-13', { username: 'non_lead_x', non_lead: true, messaggi: [] }),
    daPost('PostA12345', '2026-10-13', { username: 'minore_x', minore_14: true, messaggi: [] }),
    daPost('PostA12345', '2026-10-13', { username: 'escluso_x' }),
    daPost('PostA12345', '2026-09-01', { username: 'vecchio_x' }),
    chatFinta({ username: 'senza_origine' }),
  ]
  const statoLead = [statoFinto('lead_a'), statoFinto('lead_c', { ha_call: false }), statoFinto('nome unico', { per: 'nome' })]
  const esclusi: ChatEscluse = { instagram: new Set(['escluso_x']), messenger: new Set() }

  it('one row per post and arrival day, numbers only, dm > 0', () => {
    expect(contaPerPost({ chats, statoLead, esclusi, dal: '2026-09-15', oggi })).toEqual([
      { shortcode: 'PostA12345', giorno: '2026-10-12', dm: 1, lead_in_target: 1, call_prenotate: 0, dm_certi: 1 },
      { shortcode: 'PostA12345', giorno: '2026-10-13', dm: 2, lead_in_target: 1, call_prenotate: 1, dm_certi: 1 },
      { shortcode: 'PostB12345', giorno: '2026-10-13', dm: 1, lead_in_target: 0, call_prenotate: 1, dm_certi: 1 },
    ])
  })

  it('never non-leads, under-14 or excluded chats; nothing before `dal`', () => {
    const righe = contaPerPost({ chats, statoLead, esclusi, dal: '2026-10-13', oggi })
    expect(righe.reduce((n, r) => n + r.dm, 0)).toBe(3)
    expect(righe.every((r) => r.dm > 0)).toBe(true)
  })

  it('a Messenger name shared by two leads is no call (insight_stato_lead gives no row for it)', () => {
    const righe = contaPerPost({ chats: [chats[3]], statoLead: [], esclusi: nessunaEsclusa, dal: '2026-10-01', oggi })
    expect(righe[0].call_prenotate).toBe(0)
  })

  it('stories without a post are counted apart', () => {
    const storie = [
      chatFinta({ origine_tipo: 'storia', origine_shortcode: null, origine_il: '2026-10-13T10:00:00.000Z', origine_giorno: '2026-10-13', ultimo_target: 'si' }),
      chatFinta({ origine_tipo: 'storia', origine_shortcode: null, origine_il: '2026-10-13T10:00:00.000Z', origine_giorno: '2026-10-13' }),
    ]
    expect(contaStorie({ chats: storie, esclusi: nessunaEsclusa, dal: '2026-10-01', oggi })).toEqual({ dm: 2, target: 1 })
    expect(contaPerPost({ chats: storie, statoLead: [], esclusi: nessunaEsclusa, dal: '2026-10-01', oggi })).toEqual([])
  })
})

describe('postDelRecap', () => {
  const media = [
    postFinto('Recente123', '2026-10-13T09:00:00.000Z', { views: 500, didascalia: 'Il metodo. Poi il resto.' }),
    postFinto('Popolare12', '2026-10-05T09:00:00.000Z', { views: 9000 }),
    postFinto('Vecchio123', '2026-09-01T09:00:00.000Z', { views: null, saved: null, shares: null, media_type: 'CAROUSEL_ALBUM', reel: false }),
    postFinto('Antico1234', '2026-08-01T09:00:00.000Z'),
  ]
  const chats = [
    daPost('Recente123', '2026-10-13', { ultimo_target: 'si' }),
    daPost('Vecchio123', '2026-10-10', { ultimo_target: 'si', username: 'con_call' }),
    daPost('Vecchio123', '2026-10-11', { ultimo_target: 'no' }),
    daPost('Antico1234', '2026-09-20', {}),
  ]

  it('the posts of 14 days plus older ones with a lead in those days; the counts of contaPerPost over 14 days', () => {
    const righe = postDelRecap({
      media,
      chats,
      statoLead: [statoFinto('con_call')],
      esclusi: nessunaEsclusa,
      sintesi: [{ shortcode: 'Vecchio123', verdict: 'spingere', why: 'Porta lead.' }],
      oggi,
    })
    expect(righe.map((r) => r.shortcode)).toEqual(['Vecchio123', 'Recente123', 'Popolare12'])
    expect(righe[0]).toMatchObject({ dm: 2, target: 1, call: 1, verdict: 'spingere', why: 'Porta lead.', type: 'Carosello', views: null, date: '01/09' })
    expect(righe[1]).toMatchObject({ dm: 1, target: 1, call: 0, verdict: null, hook: 'Il metodo.', type: 'Reel' })
    expect(righe[2]).toMatchObject({ dm: 0, target: 0 })
    const somma = contaPerPost({ chats, statoLead: [statoFinto('con_call')], esclusi: nessunaEsclusa, dal: '2026-10-01', oggi })
    expect(righe.reduce((n, r) => n + r.dm, 0)).toBe(somma.reduce((n, r) => n + r.dm, 0))
  })
})

describe('the chats as the run leaves them', () => {
  it('target, non-lead, under 14 and the model\'s origin from the latest card', () => {
    const lead = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'ho visto il tuo reel')] })
    const nonLead = chatFinta()
    const minore = chatFinta({ messaggi: [msg('lead', '2026-10-13T20:00:00.000Z', 'ho 13 anni')] })
    const conOrigine = chatFinta({ origine_tipo: 'condivisione', origine_shortcode: 'Codice1234', origine_il: '2026-10-13T20:00:00.000Z', origine_giorno: '2026-10-13' })
    const [a, b, c, d] = chatEffettive(
      [lead, nonLead, minore, conOrigine],
      [
        cartaLead(lead.conversazione_id, { target: 'si', post_shortcode: 'DalTesto12' }),
        cartaNonLead(nonLead.conversazione_id),
        cartaLead(minore.conversazione_id, { fascia_eta: 'ignota', age: '13' }),
        cartaLead(conOrigine.conversazione_id, { post_shortcode: 'Altro12345' }),
      ],
    )
    expect(a).toMatchObject({ ultimo_target: 'si', origine_tipo: 'testo', origine_shortcode: 'DalTesto12', origine_giorno: '2026-10-13' })
    expect(b).toMatchObject({ non_lead: true, messaggi: [] })
    expect(c).toMatchObject({ minore_14: true, messaggi: [], codici_condivisi: [] })
    expect(d).toMatchObject({ origine_tipo: 'condivisione', origine_shortcode: 'Codice1234' })
  })

  it('a placeholder never hides an earlier card; «do not reactivate» is not a non-lead', () => {
    const c = chatFinta()
    const r = chatFinta()
    const [a, b] = chatEffettive(
      [c, r],
      [
        cartaLead(c.conversazione_id, { target: 'si' }),
        { tipo: 'lead', chiave: c.conversazione_id, impronta: 'f'.repeat(64), dati: { tipo: 'lead', analisi_mancante: true, motivo: 'json' } },
        cartaLead(r.conversazione_id, { target: 'no' }),
        { tipo: 'riattivazione', chiave: r.conversazione_id, impronta: 'f'.repeat(64), dati: { tipo: 'non_lead', reason: 'Cliente.' } },
      ],
    )
    expect(a.ultimo_target).toBe('si')
    expect(b).toMatchObject({ non_lead: false, ultimo_target: 'no' })
    expect(b.messaggi).toHaveLength(1)
  })

  it('the age the model wrote stays only when the lead wrote it (or his birth year)', () => {
    expect(etaVerificata('31', ['ho 31 anni'], 2026)).toBe('31')
    expect(etaVerificata('31 anni', ['sono del 1995'], 2026)).toBe('31 anni')
    expect(etaVerificata('31', ['ciao'], 2026)).toBe('')
    expect(etaVerificata('', ['ho 31 anni'], 2026)).toBe('')
  })
})

describe('themes of the 14 days', () => {
  const chats = [
    chatFinta({ ultimo_il: '2026-10-13T10:00:00.000Z', messaggi: [msg('lead', '2026-10-13T10:00:00.000Z', 'poco tempo')] }),
    chatFinta({ ultimo_il: '2026-10-12T10:00:00.000Z', messaggi: [msg('lead', '2026-10-12T10:00:00.000Z', 'pancia')] }),
    chatFinta({ ultimo_il: '2026-10-03T10:00:00.000Z', messaggi: [msg('lead', '2026-10-03T10:00:00.000Z', 'tempo')] }),
    chatFinta({ ultimo_il: '2026-09-20T10:00:00.000Z' }),
  ]
  const schede = [
    cartaLead(chats[0].conversazione_id, { topics: ['Poco Tempo', 'pancia'], target: 'si', stage: 'call prenotata' }),
    cartaLead(chats[1].conversazione_id, { topics: ['pancia'] }),
    cartaLead(chats[2].conversazione_id, { topics: ['poco tempo'] }),
    cartaLead(chats[3].conversazione_id, { topics: ['vecchio'] }),
  ]

  it('the leads of the period with their latest card, never their words', () => {
    const lead = leadDelPeriodo({ chat: chats, schede, statoLead: [], oggi })
    expect(lead).toHaveLength(3)
    expect(lead[0]).toMatchObject({ giorno: '2026-10-13', target: 'si', topics: ['poco tempo', 'pancia'], call: true, risposte: 1 })
    expect(JSON.stringify(lead)).not.toContain('pancia"},')
  })

  it('topics with their ids, numbers by theme, trend', () => {
    const lead = leadDelPeriodo({ chat: chats, schede, statoLead: [], oggi })
    expect(temiDelPeriodo(lead)).toEqual([
      { id: 't01', tema: 'pancia', chat: 2 },
      { id: 't02', tema: 'poco tempo', chat: 2 },
    ])
    expect(numeriDelTema(['poco tempo'], lead, oggi)).toEqual({ count: 2, target_count: 1, calls: 1, trend: 'stabile' })
    expect(tendenza(5, 2)).toBe('in crescita')
    expect(tendenza(1, 5)).toBe('in calo')
    expect(tendenza(0, 0)).toBe('stabile')
    expect(tendenza(2, 0)).toBe('in crescita')
  })
})
