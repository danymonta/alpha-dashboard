import { describe, expect, it } from 'vitest'

import {
  ETICHETTE_FORMAT,
  ETICHETTE_REEL_TYPE,
  FORMATO_ANALISI_REEL,
  FORMATO_SCHEDA_VISIVA,
  LettoAnalisiReel,
  LettoSchedaVisiva,
  SchemaAnalisiReel,
  SchemaSchedaVisiva,
} from '@/lib/marketing/analisi/schema'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE } from '@/lib/marketing/etichette'

// What Claude is asked to write (1.36.0): only what structured outputs support, closed and whole.

type Nodo = Record<string, unknown>

/** Every schema node of a JSON Schema: the names of the properties are not keywords. */
function nodi(schema: unknown, fuori: Nodo[] = []): Nodo[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return fuori
  const nodo = schema as Nodo
  fuori.push(nodo)
  for (const [chiave, valore] of Object.entries(nodo)) {
    if (chiave === 'properties' && valore && typeof valore === 'object') {
      for (const p of Object.values(valore as Nodo)) nodi(p, fuori)
    } else if (chiave === 'items') {
      nodi(valore, fuori)
    } else if (chiave === 'anyOf' || chiave === 'allOf' || chiave === 'oneOf') {
      for (const x of valore as unknown[]) nodi(x, fuori)
    } else if (chiave === '$defs' && valore && typeof valore === 'object') {
      for (const x of Object.values(valore as Nodo)) nodi(x, fuori)
    }
  }
  return fuori
}

describe.each([
  ['la scheda visiva', FORMATO_SCHEDA_VISIVA],
  ['l’analisi', FORMATO_ANALISI_REEL],
])('il formato di %s', (_nome, formato) => {
  it('{ type, schema } senza parse: lo stop_reason si legge prima del JSON', () => {
    expect(Object.keys(formato).sort()).toEqual(['schema', 'type'])
    expect(formato.type).toBe('json_schema')
  })

  it('oggetti chiusi, ogni chiave richiesta', () => {
    const oggetti = nodi(formato.schema).filter((n) => n.type === 'object')
    expect(oggetti.length).toBeGreaterThan(3)
    for (const o of oggetti) {
      expect(o.additionalProperties).toBe(false)
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as Nodo).sort())
    }
  })

  it('niente oneOf, niente vincoli numerici o di lunghezza', () => {
    for (const n of nodi(formato.schema)) {
      for (const vietata of ['oneOf', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']) {
        expect(n, vietata).not.toHaveProperty(vietata)
      }
    }
  })

  it('i byte sono stabili: lo stesso formato costruito due volte è identico', () => {
    expect(JSON.stringify(formato)).toBe(JSON.stringify(formato))
    expect(JSON.stringify(formato).length).toBeGreaterThan(500)
  })
})

describe('Reel Type e Format', () => {
  it('nel formato sono le etichette di Notion (enum), nella lettura sono stringhe', () => {
    expect(ETICHETTE_REEL_TYPE).toEqual(Object.values(ETICHETTA_REEL_TYPE))
    expect(ETICHETTE_FORMAT).toEqual(Object.values(ETICHETTA_FORMAT))
    const enumDelFormato = nodi(FORMATO_ANALISI_REEL.schema).filter((n) => Array.isArray(n.enum) && (n.enum as string[]).includes('Education'))
    expect(enumDelFormato.length).toBeGreaterThan(0)
    // the lenient schema reads a label that is not Notion's (the strict layer drops the idea), the strict one does not
    const idea = {
      tipo: 'nuovo', name: 'x', reel_type: 'Education', format: 'Formato Inventato', gancio: 'g', messaggio: 'm',
      script: { hook: 'h', righe: [], cta: 'c' }, perche: 'p',
    }
    const analisi = { perche_verdetto: '', sintesi: 's', cosa_ha_funzionato: [], da_migliorare: [], dai_lead: null, collegamento: null, idee: [idea] }
    expect(LettoAnalisiReel.safeParse(analisi).success).toBe(true)
    expect(SchemaAnalisiReel.safeParse(analisi).success).toBe(false)
    expect(SchemaAnalisiReel.safeParse({ ...analisi, idee: [{ ...idea, format: 'Split' }] }).success).toBe(true)
  })

  it('la scheda: la classificazione ammette null', () => {
    const scheda = {
      sintesi_visiva: 's',
      gancio: { livello: 'forte', cosa_si_vede: 'c', parole: null, testo_a_schermo: null, perche: 'p', alternativa: 'a' },
      sequenza: [],
      ritmo: { livello: 'medio', osservazione: 'o', calo: null },
      testo_a_schermo: { leggibile: 'si', sopra_il_volto: null, osservazione: 'o' },
      cta: { presente: false, testo: null, secondo: null, osservazione: 'o', proposta: 'p' },
      produzione: { luce: 'buona', audio: 'chiaro', inquadratura: 'i', osservazione: 'o' },
      ambiente: [],
      icp: { aderenza: 'alta', leve_usate: [], leve_mancanti: [], frase_del_cliente: null, rischio: null },
      script: null,
      classificazione: { reel_type: null, format: null },
    }
    expect(SchemaSchedaVisiva.safeParse(scheda).success).toBe(true)
    expect(LettoSchedaVisiva.safeParse({ ...scheda, gancio: { ...scheda.gancio, livello: 'altissimo' } }).success).toBe(false)
  })
})
