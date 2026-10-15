import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { DatiBlocco, VoceBlocco } from '@/lib/insight/prompt/dati'
import {
  FASCE_ETA,
  FORMATO_AGENDA,
  FORMATO_CORREZIONI,
  FORMATO_SCHEDE,
  FORMATO_SINTESI,
  SchemaSchede,
  type RisultatoSchede,
  type SchedaLeadModello,
} from '@/lib/insight/schema'
import { pulisciTemi, verificaAgenda, verificaCorrezioni, verificaSchede, verificaSintesi } from '@/lib/insight/verifica'

// The schemas Claude answers with (1.35.0) and the strict layer. Every chat is invented.

const VIETATE = ['oneOf', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'maxItems', '$ref', '$schema']

/** Every node of a JSON schema, with its path. */
function nodi(schema: unknown, percorso = '$'): { percorso: string; nodo: Record<string, unknown> }[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return []
  const nodo = schema as Record<string, unknown>
  const figli: { percorso: string; nodo: Record<string, unknown> }[] = [{ percorso, nodo }]
  if (nodo.properties && typeof nodo.properties === 'object') {
    for (const [k, v] of Object.entries(nodo.properties)) figli.push(...nodi(v, `${percorso}.${k}`))
  }
  if (nodo.items) figli.push(...nodi(nodo.items, `${percorso}[]`))
  for (const chiave of ['anyOf', 'allOf'] as const) {
    if (Array.isArray(nodo[chiave])) (nodo[chiave] as unknown[]).forEach((v, i) => figli.push(...nodi(v, `${percorso}|${i}`)))
  }
  return figli
}

const FORMATI = { FORMATO_SCHEDE, FORMATO_AGENDA, FORMATO_SINTESI, FORMATO_CORREZIONI }

describe('the output formats', () => {
  for (const [nome, formato] of Object.entries(FORMATI)) {
    it(`${nome}: closed objects, every key required, no oneOf, no numeric or length constraint`, () => {
      expect(formato.type).toBe('json_schema')
      expect('parse' in formato).toBe(false)
      for (const { percorso, nodo } of nodi(formato.schema)) {
        for (const v of VIETATE) expect(nodo[v], `${percorso} ha ${v}`).toBeUndefined()
        if (nodo.type === 'object') {
          expect(nodo.additionalProperties, percorso).toBe(false)
          expect([...((nodo.required as string[]) ?? [])].sort(), percorso).toEqual(Object.keys(nodo.properties as object).sort())
        }
        // the enums are constraints, not words in a description (the SDK's transform moved them there)
        if (typeof nodo.description === 'string') expect(nodo.description).not.toMatch(/\{(enum|const):/u)
      }
    })
  }

  it('the card has fascia_eta and post_ref, with the enums the API enforces', () => {
    const lead = (FORMATO_SCHEDE.schema as { properties: { chat: { items: { anyOf: Record<string, unknown>[] } } } }).properties.chat.items
      .anyOf[0] as { properties: Record<string, Record<string, unknown>> }
    expect(lead.properties.fascia_eta.enum).toEqual([...FASCE_ETA])
    expect(lead.properties.post_ref).toEqual({ anyOf: [{ type: 'number' }, { type: 'null' }] })
    expect(lead.properties.tipo.const).toBe('lead')
    expect(lead.properties.priority.enum).toEqual(['alta', 'media', 'bassa'])
  })

  it('the bytes of FORMATO_SCHEDE are stable (a change here is a change of VERSIONE_PROMPT)', () => {
    const impronta = createHash('sha256').update(JSON.stringify(FORMATO_SCHEDE)).digest('hex')
    expect(impronta).toBe('b36e9b659497512fe20111389ab2b30b5954c793fcbf8c9d551ee68750218d6b')
  })
})

// ---------------------------------------------------------------------------

function voce(ref: string, chiave: string, lista: VoceBlocco['lista'] = 'chat', meta: VoceBlocco['meta'] = {}): VoceBlocco {
  return { lista, ref, chiave, corpo: {}, meta }
}

function scheda(ref: string, extra: Partial<SchedaLeadModello> = {}): SchedaLeadModello {
  return {
    ref,
    tipo: 'lead',
    nome_dal_lead: '',
    age: '',
    fascia_eta: 'ignota',
    flow: 'inbound',
    priority: 'media',
    target: 'da verificare',
    stage: 'obiettivi',
    status: ' attende risposta ',
    situation: '',
    pain: '',
    next_action: '',
    suggested_message: 'Ciao!',
    suggested_message_alt: '',
    alt_condition: '',
    needs_dany: '',
    topics: [],
    post_ref: null,
    no_contatto: false,
    objection: { text: '', suggested_reply: '' },
    ...extra,
  }
}

const datiBlocco = (voci: VoceBlocco[], post: Record<string, string> = {}): Pick<DatiBlocco, 'voci' | 'post'> => ({ voci, post })

describe('the strict layer: schede', () => {
  it('drops unknown and repeated refs, reports the missing ones', () => {
    const r: RisultatoSchede = { chat: [scheda('c01'), scheda('c01'), scheda('c99'), { ref: 'c02', tipo: 'non_lead', reason: ' spam ' }] }
    const v = verificaSchede(r, datiBlocco([voce('c01', 'conv-1'), voce('c02', 'conv-2'), voce('c03', 'conv-3')]))
    expect(v.voci.map((x) => [x.ref, x.chiave])).toEqual([
      ['c01', 'conv-1'],
      ['c02', 'conv-2'],
    ])
    expect(v.scartati).toBe(2)
    expect(v.mancanti).toEqual(['c03'])
    expect(v.voci[1].dati).toEqual({ tipo: 'non_lead', reason: 'spam' })
    expect(v.voci[0].dati).toMatchObject({ status: 'attende risposta' })
  })

  it('an alternative without its condition goes, and a condition without an alternative', () => {
    const r = { chat: [scheda('c01', { suggested_message_alt: 'Altro testo' }), scheda('c02', { alt_condition: 'se non ha visto' }), scheda('c03', { suggested_message_alt: 'B', alt_condition: 'se non ha visto' })] }
    const v = verificaSchede(r, datiBlocco([voce('c01', 'a'), voce('c02', 'b'), voce('c03', 'c')]))
    expect(v.voci.map((x) => ('suggested_message_alt' in x.dati ? [x.dati.suggested_message_alt, x.dati.alt_condition] : null))).toEqual([
      ['', ''],
      ['', ''],
      ['B', 'se non ha visto'],
    ])
  })

  it('topics: trimmed, lower case, distinct, at most 3', () => {
    expect(pulisciTemi([' Poco Tempo ', 'poco tempo', 'Pancia', '', 'Schiena', 'Costanza'])).toEqual(['poco tempo', 'pancia', 'schiena'])
  })

  it('post_ref becomes the shortcode of a post of the context, null otherwise or when the origin is known', () => {
    const r = { chat: [scheda('c01', { post_ref: 2 }), scheda('c02', { post_ref: 9 }), scheda('c03', { post_ref: 2 }), scheda('c04', { post_ref: 1.5 })] }
    const v = verificaSchede(
      r,
      datiBlocco([voce('c01', 'a'), voce('c02', 'b'), voce('c03', 'c', 'chat', { origine_nota: true }), voce('c04', 'd')], { 1: 'PostUno01', 2: 'PostDue02' }),
    )
    expect(v.voci.map((x) => ('post_shortcode' in x.dati ? x.dati.post_shortcode : 'x'))).toEqual(['PostDue02', null, null, null])
  })

  it('an objection without text has no reply', () => {
    const v = verificaSchede({ chat: [scheda('c01', { objection: { text: ' ', suggested_reply: 'Capisco' } })] }, datiBlocco([voce('c01', 'a')]))
    expect('objection' in v.voci[0].dati && v.voci[0].dati.objection).toEqual({ text: '', suggested_reply: '' })
  })

  it('the Zod schema rejects a value outside an enum', () => {
    expect(SchemaSchede.safeParse({ chat: [scheda('c01', { priority: 'urgente' as never })] }).success).toBe(false)
    expect(SchemaSchede.safeParse({ chat: [scheda('c01')] }).success).toBe(true)
  })
})

describe('the strict layer: agenda, sintesi, correzioni', () => {
  it('agenda: calls and show-ups by their refs, the Messenger PSID from code', () => {
    const v = verificaAgenda(
      {
        call: [
          { ref: 'a01', status: 'confermata', note: ' ok ', suggested_message: 'Ciao' },
          { ref: 'a07', status: 'a rischio', note: '', suggested_message: '' },
        ],
        show_up: [],
      },
      { voci: [voce('a01', 'call-1', 'call', { messenger_user_id: '123456' }), voce('s01', 'call-2', 'show_up')] },
    )
    expect(v.call.voci).toEqual([{ ref: 'a01', chiave: 'call-1', dati: { status: 'confermata', note: 'ok', suggested_message: 'Ciao', user_id: '123456' } }])
    expect(v.call.scartati).toBe(1)
    expect(v.show_up.mancanti).toEqual(['s01'])
  })

  it('sintesi: topic ids to topics, post refs to shortcodes, at most 4 tips, fewer than 5 ideas flagged', () => {
    const { sintesi, pocheIdee } = verificaSintesi(
      {
        headline: ' Buona giornata ',
        themes: [
          { theme: 'Tempo', insight: 'poco', topic_ids: ['t01', 't09', 't01'] },
          { theme: 'Vuoto', insight: '', topic_ids: ['t99'] },
        ],
        posts: [
          { post_ref: 1, verdict: 'spingere', why: 'porta lead' },
          { post_ref: 1, verdict: 'cambiare', why: 'doppio' },
          { post_ref: 7, verdict: 'mantenere', why: '' },
        ],
        keep: ['a', ' '],
        change: [],
        boost: [],
        setting_tips: ['1', '2', '3', '4', '5'],
        ideas: [{ hook: 'Idea', format: 'Reel', why: '' }],
        note: '',
      },
      { temi: { t01: 'poco tempo' }, post: { 1: 'PostUno01' } },
    )
    expect(sintesi.headline).toBe('Buona giornata')
    expect(sintesi.themes).toEqual([{ theme: 'Tempo', insight: 'poco', temi: ['poco tempo'] }])
    expect(sintesi.posts).toEqual([{ shortcode: 'PostUno01', verdict: 'spingere', why: 'porta lead' }])
    expect(sintesi.keep).toEqual(['a'])
    expect(sintesi.setting_tips).toHaveLength(4)
    expect(pocheIdee).toBe(true)
  })

  it('correzioni: back to their card and field', () => {
    const v = verificaCorrezioni(
      { correzioni: [{ ref: 'k01', campo: 'suggested_message', testo: ' Ciao ' }, { ref: 'k02', campo: 'agenda', testo: 'x' }] },
      {
        voci: [
          voce('k01', 'lead|conv-1|suggested_message', 'testi', { correzione: { tipo: 'lead', chiave: 'conv-1', campo: 'suggested_message' } }),
          voce('k02', 'lead|conv-2|suggested_reply', 'testi', { correzione: { tipo: 'lead', chiave: 'conv-2', campo: 'suggested_reply' } }),
        ],
      },
    )
    expect(v.voci.map((x) => x.dati)).toEqual([{ tipo: 'lead', chiave: 'conv-1', campo: 'suggested_message', testo: 'Ciao' }])
    expect(v.scartati).toBe(1)
    expect(v.mancanti).toEqual(['k02'])
  })
})
