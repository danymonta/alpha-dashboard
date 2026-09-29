import { asSchema, convertToModelMessages, type ToolSet, type UIMessage } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { SCRITTURE, STRUMENTI, isScrittura, strumentiConsentiti } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import {
  PROPONI_RISPOSTE,
  confermeComplete,
  domandaNonDetta,
  leggiProposte,
  propostaCheRisponde,
  proposteComeTesto,
  rispostaScelta,
  schemaProposte,
  type Proposte,
} from '@/lib/alfire/risposte'
import { strumentiAlfire } from '@/lib/alfire/strumenti'
import type { AppRole, LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'

// Only the shape of the tools is read here: the actions never run
vi.mock('server-only', () => ({}))
vi.mock('@/app/(app)/calls/actions', () => ({}))
vi.mock('@/app/(app)/calls/new/actions', () => ({}))
vi.mock('@/app/(app)/progetti/[id]/actions', () => ({}))
vi.mock('@/app/(app)/progetti/[id]/note/actions', () => ({}))
vi.mock('@/app/(app)/tempo/actions', () => ({}))
vi.mock('@/app/(app)/clients/actions', () => ({}))
vi.mock('@/app/(app)/expenses/actions', () => ({}))
vi.mock('@/app/(app)/progetti/actions', () => ({}))
vi.mock('@/app/(app)/sales/[id]/actions', () => ({}))
vi.mock('@/app/(app)/sales/new/actions', () => ({}))
vi.mock('@/app/(app)/today/actions', () => ({}))
vi.mock('@/app/(app)/leads/actions', () => ({}))
vi.mock('@/app/(app)/setting/actions', () => ({}))
vi.mock('@/app/(app)/commissions/actions', () => ({}))
vi.mock('@/app/(app)/settings/commissions/actions', () => ({}))
vi.mock('@/app/(app)/settings/products/actions', () => ({}))
vi.mock('@/app/actions/obiettivi', () => ({}))
vi.mock('@/app/actions/eliminazione', () => ({}))

function strumentiDi(ruolo: AppRole, livello: LivelloPm): ToolSet {
  const profilo = { id: 'x', nome: 'X', ruolo, attivo: true } as Profilo
  return strumentiAlfire({} as never, profilo, livello)
}

const SCELTA: Proposte = { tipo: 'scelta', domanda: 'Quale cliente intendi?', opzioni: ['Mario Rossi', 'Luca Rossi'] }

function utente(testo: string): UIMessage {
  return { id: `u-${testo}`, role: 'user', parts: [{ type: 'text', text: testo }] }
}

/** Alfire's message: some text, then the proponi_risposte call waiting for its tap. */
function alfireChiede(testo: string, input: unknown = SCELTA, id = 'a'): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      ...(testo ? [{ type: 'text' as const, text: testo, state: 'done' as const }] : []),
      { type: `tool-${PROPONI_RISPOSTE}`, toolCallId: 'c1', state: 'input-available', input },
    ],
  } as UIMessage
}

describe('proponi_risposte: lo schema', () => {
  it('accetta da 2 a 4 opzioni brevi, domanda facoltativa', () => {
    expect(leggiProposte(SCELTA)).toEqual(SCELTA)
    expect(leggiProposte({ tipo: 'seguito', opzioni: ['Chi è in ritardo?', 'E il mese scorso?'] })).not.toBeNull()
    expect(leggiProposte({ tipo: 'scelta', opzioni: ['Sì', 'No', 'Forse', 'Dopo'] })).not.toBeNull()
  })

  it('rifiuta una sola opzione, più di 4, opzioni lunghe o vuote, una domanda lunga, un tipo sconosciuto', () => {
    expect(leggiProposte({ tipo: 'scelta', opzioni: ['Sì'] })).toBeNull()
    expect(leggiProposte({ tipo: 'scelta', opzioni: ['a', 'b', 'c', 'd', 'e'] })).toBeNull()
    expect(leggiProposte({ tipo: 'scelta', opzioni: ['x'.repeat(61), 'b'] })).toBeNull()
    expect(leggiProposte({ tipo: 'scelta', opzioni: ['', 'b'] })).toBeNull()
    expect(leggiProposte({ tipo: 'scelta', domanda: 'x'.repeat(121), opzioni: ['a', 'b'] })).toBeNull()
    expect(leggiProposte({ tipo: 'altro', opzioni: ['a', 'b'] })).toBeNull()
    expect(leggiProposte(undefined)).toBeNull()
  })

  it('il modello vede i limiti nello schema JSON', async () => {
    const json = JSON.stringify(await asSchema(schemaProposte).jsonSchema)
    expect(json).toContain('"maxItems":4')
    expect(json).toContain('"minItems":2')
    expect(json).toContain('"maxLength":60')
    expect(json).toContain('"scelta"')
    expect(json).toContain('"seguito"')
  })
})

describe('proponi_risposte: chi lo riceve', () => {
  it('ogni ruolo e ogni livello, come la guida', () => {
    expect(STRUMENTI.proponi_risposte).toEqual({})
    for (const ruolo of ['admin', 'setter', 'closer', 'coach', 'editor', 'nutrizione', 'dev'] as const) {
      for (const livello of ['admin', 'manager', 'employee'] as const) {
        expect(strumentiConsentiti(ruolo, livello), `${ruolo}/${livello}`).toContain(PROPONI_RISPOSTE)
      }
    }
  })

  it('non è una scrittura: nessuna conferma, e non scrive niente', () => {
    expect(isScrittura(PROPONI_RISPOSTE)).toBe(false)
    expect(SCRITTURE as readonly string[]).not.toContain(PROPONI_RISPOSTE)
  })

  it('è uno strumento del client: senza execute, la chiamata ferma la risposta e aspetta il tocco', async () => {
    for (const [ruolo, livello] of [
      ['admin', 'admin'],
      ['setter', 'employee'],
      ['closer', 'employee'],
      ['coach', 'employee'],
    ] as const) {
      const t = strumentiDi(ruolo, livello)[PROPONI_RISPOSTE]
      expect(t, ruolo).toBeDefined()
      expect(t.execute, ruolo).toBeUndefined()
      expect(t.description).toMatch(/non scrive niente/i)
    }
  })

  it('il prompt dice quando usarlo, in breve; il resto lo dice lo strumento', () => {
    const prompt = promptAlfire({ nome: 'Dany', ruolo: 'admin', oggi: '2026-09-29' })
    expect(prompt).toMatch(/Domanda chiusa .*proponi_risposte, non scegliere tu/)
    const t = strumentiDi('setter', 'employee')[PROPONI_RISPOSTE]
    expect(t.description).toMatch(/fino a 3 domande successive davvero utili/)
    expect(t.description).toMatch(/scritta anche nel testo/)
  })

  it('mai un sì o no per confermare una scrittura, e mai insieme a una lettura', () => {
    const t = strumentiDi('admin', 'admin')[PROPONI_RISPOSTE]
    expect(t.description).toMatch(/Mai per confermare una scrittura: la conferma è la scheda/)
    expect(t.description).toMatch(/per ultimo e da solo, dopo aver scritto il testo/)
  })
})

describe('la domanda resta nella storia del modello', () => {
  it('la chiamata sparisce; la domanda già scritta nel testo non si ripete', () => {
    const [m] = proposteComeTesto([alfireChiede('Ho trovato due clienti Rossi: quale cliente intendi?')])
    expect(m.parts.map((p) => p.type)).toEqual(['step-start', 'text'])
    expect(m.parts.filter((p) => p.type === 'text')).toHaveLength(1)
  })

  it('la domanda scritta solo sopra i bottoni diventa testo, al suo posto', () => {
    const [m] = proposteComeTesto([alfireChiede('')])
    expect(m.parts).toEqual([{ type: 'step-start' }, { type: 'text', text: 'Quale cliente intendi?' }])
  })

  it('i seguiti senza domanda e le chiamate malformate spariscono e basta', () => {
    const [seguito] = proposteComeTesto([alfireChiede('Hai incassato 6.950 €.', { tipo: 'seguito', opzioni: ['a', 'b'] })])
    expect(seguito.parts.map((p) => p.type)).toEqual(['step-start', 'text'])
    const [rotta] = proposteComeTesto([alfireChiede('', { tipo: 'scelta', opzioni: ['solo una'] })])
    expect(rotta.parts.map((p) => p.type)).toEqual(['step-start'])
  })

  it('dopo il tocco il modello riceve domanda e risposta, senza chiamate in sospeso', async () => {
    const storia = [utente('Mostrami le rate di Rossi'), alfireChiede(''), utente('Luca Rossi')]
    const modello = await convertToModelMessages(proposteComeTesto(storia), {
      tools: strumentiDi('admin', 'admin'),
      ignoreIncompleteToolCalls: true,
    })
    expect(modello).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Mostrami le rate di Rossi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Quale cliente intendi?' }] },
      { role: 'user', content: [{ type: 'text', text: 'Luca Rossi' }] },
    ])
  })

  it('i messaggi dell’utente e quelli senza bottoni restano identici', () => {
    const storia = [utente('Ciao'), { id: 'b', role: 'assistant', parts: [{ type: 'text', text: 'Ciao!' }] } as UIMessage]
    const dopo = proposteComeTesto(storia)
    expect(dopo[0]).toBe(storia[0])
    expect(dopo[1]).toBe(storia[1])
  })

  it('la chat mostra la domanda sopra i bottoni solo se il testo non la dice già', () => {
    expect(domandaNonDetta(alfireChiede('Quale cliente intendi?'), SCELTA)).toBeNull()
    expect(domandaNonDetta(alfireChiede('Ho trovato due clienti.'), SCELTA)).toBe('Quale cliente intendi?')
    expect(domandaNonDetta(alfireChiede(''), { tipo: 'seguito', opzioni: ['a', 'b'] })).toBeNull()
  })
})

describe('quando i bottoni valgono come risposta', () => {
  it('una domanda chiusa sì: l’utente sceglie', () => {
    expect(propostaCheRisponde(SCELTA)).toBe(true)
    expect(propostaCheRisponde({ tipo: 'scelta', opzioni: ['Sì', 'No'] })).toBe(true)
  })

  it('le sole domande successive no: senza testo la chat offre ancora «Riprova»', () => {
    expect(propostaCheRisponde({ tipo: 'seguito', opzioni: ['Chi è in ritardo?', 'E il mese scorso?'] })).toBe(false)
    expect(propostaCheRisponde({ tipo: 'scelta', opzioni: ['solo una'] })).toBe(false)
    expect(propostaCheRisponde(undefined)).toBe(false)
  })
})

describe('i bottoni nella chat', () => {
  it('la risposta scelta: un tocco dice l’opzione parola per parola', () => {
    expect(rispostaScelta(utente('Luca Rossi'), SCELTA.opzioni)).toBe('Luca Rossi')
    expect(rispostaScelta(utente('  luca   rossi '), SCELTA.opzioni)).toBe('Luca Rossi')
  })

  it('una risposta scritta o dettata diversa è una risposta, non un’opzione', () => {
    expect(rispostaScelta(utente('Il secondo'), SCELTA.opzioni)).toBeNull()
    expect(rispostaScelta(undefined, SCELTA.opzioni)).toBeNull()
    expect(rispostaScelta(alfireChiede('Altro'), SCELTA.opzioni)).toBeNull()
  })
})

describe('dopo le conferme la chat riparte da sola', () => {
  const scrittura = (state: string, approval: Record<string, unknown>) => ({
    type: 'tool-costo',
    toolCallId: 'w1',
    state,
    input: { azione: 'registra' },
    approval,
  })

  it('una proposta in attesa non trattiene una scrittura confermata', () => {
    const messaggio = {
      id: 'a',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        scrittura('approval-responded', { id: 'ap1', approved: true }),
        { type: `tool-${PROPONI_RISPOSTE}`, toolCallId: 'c1', state: 'input-available', input: SCELTA },
      ],
    } as UIMessage
    expect(confermeComplete({ messages: [utente('Registra'), messaggio] })).toBe(true)
  })

  it('senza risposta alla scheda, o con solo i bottoni, non riparte', () => {
    const inAttesa = {
      id: 'a',
      role: 'assistant',
      parts: [{ type: 'step-start' }, scrittura('approval-requested', { id: 'ap1' })],
    } as UIMessage
    expect(confermeComplete({ messages: [utente('Registra'), inAttesa] })).toBe(false)
    expect(confermeComplete({ messages: [utente('Rate di Rossi'), alfireChiede('Quale cliente intendi?')] })).toBe(false)
    expect(confermeComplete({ messages: [utente('Luca Rossi')] })).toBe(false)
    expect(confermeComplete({ messages: [] })).toBe(false)
  })
})
