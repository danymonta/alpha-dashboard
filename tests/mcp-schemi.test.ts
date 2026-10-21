import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))

import {
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_STATUS,
  ORDINE_GRUPPI,
} from '@/lib/marketing/etichette'
import { schemaMcp } from '@/lib/mcp/schema'
import { creaContenutiSchema, elencoContenutiSchema, modificaContenutoSchema, scriviSezioneSchema } from '@/lib/mcp/schemi'
import { STRUMENTI } from '@/lib/mcp/strumenti'
import { contenutoSchema, sezioneContenutoSchema } from '@/lib/validation/contenuto'

/**
 * The inputs of the eight tools (lib/mcp/schemi.ts) as Claude reads them, and
 * their parity with the app's rules. The adapter itself is tested in
 * tests/mcp-schema.test.ts.
 */

type Json = Record<string, unknown>

function jsonDi(schema: z.ZodTypeAny): Json {
  return schemaMcp(schema)['~standard'].jsonSchema.input({ target: 'draft-2020-12' }) as Json
}

/** Every value of a key anywhere in a JSON Schema. */
function tutti(nodo: unknown, chiave: string): unknown[] {
  if (!nodo || typeof nodo !== 'object') return []
  const qui = !Array.isArray(nodo) && chiave in (nodo as Json) ? [(nodo as Json)[chiave]] : []
  return [...qui, ...Object.values(nodo as Json).flatMap((v) => tutti(v, chiave))]
}

/** The enum of a property (anyOf with null included), without the null. */
function enumDi(proprieta: unknown): unknown[] | undefined {
  const voci = tutti(proprieta, 'enum') as unknown[][]
  return voci[0]?.filter((v) => v !== null)
}

/** The root object of a zod schema, under its refinements. */
function radice(schema: z.ZodTypeAny): z.AnyZodObject {
  let s: z.ZodTypeAny = schema
  while (s instanceof z.ZodEffects) s = s.innerType()
  return s as z.AnyZodObject
}

const EMOJI = '💡'
const ID = '6c1f0c64-4f9b-4c49-9a3e-2f8c4c0a7e11'
const IMPRONTA = 'd41d8cd98f00b204e9800998ecf8427e'

describe('il JSON Schema di ogni strumento', () => {
  it.each(STRUMENTI.map((s) => [s.nome, s.input] as const))('%s: oggetto chiuso, senza $ref né $schema', (_, input) => {
    const json = jsonDi(input)
    expect(json.type).toBe('object')
    expect(json.additionalProperties).toBe(false)
    expect(JSON.stringify(json)).not.toContain('$ref')
    expect(json).not.toHaveProperty('$schema')
    // every nested object is closed too
    for (const v of tutti(json, 'additionalProperties')) expect(v).toBe(false)
  })

  it.each(STRUMENTI.map((s) => [s.nome, s.input] as const))('%s: le chiavi obbligatorie sono quelle di zod', (_, input) => {
    const forma = radice(input).shape as Record<string, z.ZodTypeAny>
    const obbligatorie = Object.entries(forma)
      .filter(([, s]) => !s.isOptional())
      .map(([k]) => k)
      .sort()
    expect(((jsonDi(input).required as string[] | undefined) ?? []).slice().sort()).toEqual(obbligatorie)
  })

  it('le scelte sono le etichette esatte di Notion, nel loro ordine', () => {
    const elenco = jsonDi(elencoContenutiSchema).properties as Json
    expect(enumDi(elenco.status)).toEqual(Object.values(ETICHETTA_STATUS))
    expect(enumDi(elenco.modello)).toEqual(Object.values(ETICHETTA_MODELLO))
    expect(enumDi(elenco.gruppo)).toEqual(ORDINE_GRUPPI.map((g) => ETICHETTA_GRUPPO[g]))
    expect(enumDi(elenco.status)).toEqual([
      'Not started',
      'To be recorded',
      'To be edited',
      'To be posted',
      'Posted',
      'Canceled',
    ])
    // Reel Type and Format are the labels people create in the app (21/10/2026): free text, resolved on the
    // database, never a list frozen in the JSON Schema (a new label would be refused before it got there)
    for (const chiave of ['reel_type', 'format']) {
      const campo = elenco[chiave] as Json
      expect(enumDi(campo), chiave).toBeUndefined()
      expect(JSON.stringify(campo), chiave).toContain('"type":"string"')
      expect(String(campo.description), chiave).toMatch(/etichette_contenuti/)
      expect(String(campo.description), chiave).toMatch(/Non ne crei/)
    }

    const campi = ((jsonDi(modificaContenutoSchema).properties as Json).campi as Json).properties as Json
    expect(enumDi(campi.status)).toEqual(Object.values(ETICHETTA_STATUS))
    expect(enumDi(campi.modello)).toEqual(['Reel Topic', 'Carousel Topic'])

    const voce = (((jsonDi(creaContenutiSchema).properties as Json).contenuti as Json).items as Json).properties as Json
    expect(enumDi(voce.reel_type)).toBeUndefined()
    expect(JSON.stringify(voce.reel_type)).toContain('"type":"string"')
  })

  it('le descrizioni dei campi arrivano a Claude', () => {
    const elenco = jsonDi(elencoContenutiSchema).properties as Json
    expect((elenco.mese as Json).description).toBe('Un mese della Post Date, AAAA-MM.')
    const sezione = jsonDi(scriviSezioneSchema).properties as Json
    expect((sezione.impronta as Json).description).toMatch(/ricopiata così com’è/)
  })
})

describe('le regole di 1.32.0: un testo passa da Claude esattamente quando passa nell’app', () => {
  function sezioneMcp(testo: string) {
    return scriviSezioneSchema.safeParse({ id: ID, sezione: 'bozza', testo, impronta: IMPRONTA }).success
  }
  function sezioneApp(testo: string) {
    return sezioneContenutoSchema.safeParse({ id: ID, campo: 'bozza', testo, impronta: IMPRONTA }).success
  }
  function creazioneMcp(testo: string) {
    return creaContenutiSchema.safeParse({ contenuti: [{ name: 'X', sezioni: { finale: testo } }] }).success
  }
  function nomeMcp(nome: string) {
    return creaContenutiSchema.safeParse({ contenuti: [{ name: nome }] }).success
  }
  function nomeApp(nome: string) {
    return contenutoSchema.safeParse({ tipo: 'reel', nome }).success
  }

  it.each([
    ['30.000 emoji', EMOJI.repeat(30_000)],
    ['30.001 emoji', EMOJI.repeat(30_001)],
    ['30.000 caratteri e righe vuote in fondo', `${'a'.repeat(30_000)}\n\n   \n`],
    ['30.001 caratteri', 'a'.repeat(30_001)],
    ['solo spazi', '   \n  '],
  ])('una sezione di %s', (_, testo) => {
    expect(sezioneMcp(testo)).toBe(sezioneApp(testo))
    expect(creazioneMcp(testo)).toBe(sezioneApp(testo))
  })

  it('una sezione di 30.000 emoji passa: Postgres conta i code point, non le unità UTF-16', () => {
    expect(sezioneMcp(EMOJI.repeat(30_000))).toBe(true)
  })

  it.each([
    ['300 emoji', EMOJI.repeat(300)],
    ['300 lettere', 'a'.repeat(300)],
    ['301 lettere', 'a'.repeat(301)],
    ['solo spazi', '   '],
  ])('un Name di %s', (_, nome) => {
    expect(nomeMcp(nome)).toBe(nomeApp(nome))
  })
})

describe('i limiti degli ingressi', () => {
  it('da 1 a 20 contenuti per creazione', () => {
    const uno = { name: 'Uno' }
    expect(creaContenutiSchema.safeParse({ contenuti: [] }).success).toBe(false)
    expect(creaContenutiSchema.safeParse({ contenuti: Array(20).fill(uno) }).success).toBe(true)
    const troppi = creaContenutiSchema.safeParse({ contenuti: Array(21).fill(uno) })
    expect(troppi.success).toBe(false)
    expect(troppi.error?.issues[0].message).toBe('Da 1 a 20 contenuti per volta: dividi in più chiamate.')
  })

  it('al massimo 400.000 caratteri di testo in una creazione', () => {
    const pieno = (n: number) => ({ name: 'X', sezioni: { bozza: 'a'.repeat(n) } })
    const giusto = Array.from({ length: 20 }, () => pieno(20_000))
    expect(creaContenutiSchema.safeParse({ contenuti: giusto }).success).toBe(true)
    const troppo = creaContenutiSchema.safeParse({ contenuti: [...giusto.slice(0, 19), pieno(20_001)] })
    expect(troppo.success).toBe(false)
    expect(troppo.error?.issues[0].message).toBe('Troppo testo in una volta: dividi in più chiamate.')
  })

  it('elenco: mese o da/a, mai insieme; da prima di a; senza data esclude le date', () => {
    expect(elencoContenutiSchema.safeParse({ mese: '2026-10' }).success).toBe(true)
    expect(elencoContenutiSchema.safeParse({ mese: '2026-13' }).success).toBe(false)
    const insieme = elencoContenutiSchema.safeParse({ mese: '2026-10', da: '2026-10-01' })
    expect(insieme.error?.issues[0].message).toBe('Usa mese oppure da e a, non insieme.')
    const rovescio = elencoContenutiSchema.safeParse({ da: '2026-10-10', a: '2026-10-01' })
    expect(rovescio.error?.issues[0].message).toBe('La data da viene prima di a.')
    const senzaData = elencoContenutiSchema.safeParse({ senza_data: true, a: '2026-10-01' })
    expect(senzaData.error?.issues[0].message).toBe('Senza data esclude le date.')
    expect(elencoContenutiSchema.safeParse({ da: '28/09/2026' }).success).toBe(false)
    expect(elencoContenutiSchema.safeParse({ limite: 100 }).success).toBe(true)
    expect(elencoContenutiSchema.safeParse({ limite: 101 }).success).toBe(false)
    expect(elencoContenutiSchema.safeParse({ cerca: 'x'.repeat(100) }).success).toBe(true)
    expect(elencoContenutiSchema.safeParse({ cerca: 'x'.repeat(101) }).success).toBe(false)
    expect(elencoContenutiSchema.safeParse({ cerca: 3 }).error?.issues[0].message).toBe('Cerca: scrivi un pezzo del Name.')
    // what Claude reads: a piece of the Name as it is, not words anywhere in it (the app's search)
    expect(elencoContenutiSchema.innerType().shape.cerca.description).toContain('più parole devono essere di seguito nel Name')
    // the database value is not a label
    expect(elencoContenutiSchema.safeParse({ status: 'to_be_edited' }).success).toBe(false)
    expect(elencoContenutiSchema.safeParse({ mostra_tutto: true }).success).toBe(false)
  })

  it('modifica: almeno una proprietà; Name, Modello e Status non si svuotano', () => {
    const base = { id: ID, versione: '0123456789abcdef' }
    const vuota = modificaContenutoSchema.safeParse({ ...base, campi: {} })
    expect(vuota.error?.issues[0].message).toBe('Dimmi almeno una proprietà da cambiare.')
    expect(modificaContenutoSchema.safeParse({ ...base, campi: { audio: null } }).success).toBe(true)
    expect(modificaContenutoSchema.safeParse({ ...base, campi: { name: null } }).success).toBe(false)
    expect(modificaContenutoSchema.safeParse({ ...base, campi: { modello: null } }).success).toBe(false)
    expect(modificaContenutoSchema.safeParse({ ...base, campi: { status: null } }).success).toBe(false)
    // a timestamp is not the opaque version
    const timestamp = { ...base, versione: '2026-10-09T10:00:00.123456+00:00', campi: { audio: 'x' } }
    expect(modificaContenutoSchema.safeParse(timestamp).success).toBe(false)
  })

  it('modifica: una proprietà non nominata resta assente, mai null (null la svuoterebbe)', () => {
    const esito = modificaContenutoSchema.parse({ id: ID, versione: '0123456789abcdef', campi: { audio: 'Song' } })
    expect(esito.campi).toEqual({ audio: 'Song' })
  })
})
