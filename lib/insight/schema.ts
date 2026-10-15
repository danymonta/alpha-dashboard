import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod/v4'

/**
 * What Claude answers in each step of the Insight (1.35.0, CLAUDE.md section
 * 29): small typed pieces keyed by the refs the code issued (c07, r03, a01,
 * s01, t04, k02, a post's number), never a whole document. Identity, numbers
 * and times come from code (lib/insight/unione.ts).
 *
 * Only what structured outputs support: closed objects with every key
 * required, enums and consts, arrays, strings, booleans, a nullable number;
 * no numeric or length constraints (the strict layer, lib/insight/verifica.ts,
 * slices and checks them) and unions as anyOf, never oneOf. Every leaf schema
 * is a fresh instance: zod's JSON Schema would turn a reused one into a $ref.
 *
 * The formats are built once, at module load, as { type, schema } without the
 * SDK's `parse`: finalMessage() would otherwise throw on a broken JSON before
 * stop_reason (refusal, max_tokens) can be read. Their bytes are part of the
 * prompt cache key: a change here is a change of VERSIONE_PROMPT too.
 */

/** The flow's phases the card may name (outbound, inbound, then the common end). */
export const FASI = [
  'messaggio 1',
  'messaggio 2',
  'mini-audit',
  'valore',
  'check',
  'pitch',
  'età e provenienza',
  'obiettivi',
  'difficoltà',
  'routine',
  'lavoro',
  'urgenza',
  'proposta call',
  'calendly inviato',
  'call prenotata',
  'nurture',
  'uscita',
  'perso',
] as const

export const FASCE_ETA = ['sotto_14', '14_17', 'maggiorenne', 'ignota'] as const
export const STATI_AGENDA = ['confermata', 'promemoria da inviare', 'a rischio'] as const
export const VERDETTI_POST = ['spingere', 'mantenere', 'cambiare'] as const
export const CAMPI_CORREZIONE = ['suggested_message', 'suggested_message_alt', 'suggested_reply', 'agenda', 'show_up'] as const

const testo = () => z.string()

const SchedaLead = z.object({
  ref: testo(),
  tipo: z.literal('lead'),
  nome_dal_lead: testo(),
  age: testo(),
  fascia_eta: z.enum(FASCE_ETA),
  flow: z.enum(['inbound', 'outbound']),
  priority: z.enum(['alta', 'media', 'bassa']),
  target: z.enum(['si', 'no', 'da verificare']),
  stage: z.enum(FASI),
  status: testo(),
  situation: testo(),
  pain: testo(),
  next_action: testo(),
  suggested_message: testo(),
  suggested_message_alt: testo(),
  alt_condition: testo(),
  needs_dany: testo(),
  topics: z.array(testo()),
  /** the number of a post of contesto_giorno the lead cites (D26), only without an origin from code */
  post_ref: z.number().nullable(),
  /** asked not to be contacted: never reactivated */
  no_contatto: z.boolean(),
  /** text '' = no open objection */
  objection: z.object({ text: testo(), suggested_reply: testo() }),
})

const SchedaNonLead = z.object({
  ref: testo(),
  tipo: z.literal('non_lead'),
  reason: testo(),
})

/** schede and riattivazione: the same schema, so the format bytes (and the cache) are the same. */
export const SchemaSchede = z.object({ chat: z.array(z.union([SchedaLead, SchedaNonLead])) })

export const SchemaAgenda = z.object({
  call: z.array(
    z.object({
      ref: testo(),
      status: z.enum(STATI_AGENDA),
      note: testo(),
      suggested_message: testo(),
    }),
  ),
  show_up: z.array(
    z.object({
      ref: testo(),
      note: testo(),
      suggested_message: testo(),
    }),
  ),
})

export const SchemaSintesi = z.object({
  headline: testo(),
  themes: z.array(z.object({ theme: testo(), insight: testo(), topic_ids: z.array(testo()) })),
  posts: z.array(z.object({ post_ref: z.number(), verdict: z.enum(VERDETTI_POST), why: testo() })),
  keep: z.array(testo()),
  change: z.array(testo()),
  boost: z.array(testo()),
  setting_tips: z.array(testo()),
  ideas: z.array(z.object({ hook: testo(), format: testo(), why: testo() })),
  note: testo(),
})

export const SchemaCorrezioni = z.object({
  correzioni: z.array(z.object({ ref: testo(), campo: z.enum(CAMPI_CORREZIONE), testo: testo() })),
})

export type SchedaLeadModello = z.infer<typeof SchedaLead>
export type SchedaNonLeadModello = z.infer<typeof SchedaNonLead>
export type SchedaModello = SchedaLeadModello | SchedaNonLeadModello
export type RisultatoSchede = z.infer<typeof SchemaSchede>
export type RisultatoAgenda = z.infer<typeof SchemaAgenda>
export type CallModello = RisultatoAgenda['call'][number]
export type ShowUpModello = RisultatoAgenda['show_up'][number]
export type RisultatoSintesi = z.infer<typeof SchemaSintesi>
export type RisultatoCorrezioni = z.infer<typeof SchemaCorrezioni>
export type FasciaEtaModello = (typeof FASCE_ETA)[number]

type NodoSchema = Record<string, unknown>

const CHIAVI_TRATTATE = new Set([
  'type',
  'description',
  'title',
  'properties',
  'additionalProperties',
  'required',
  'items',
  'anyOf',
  'oneOf',
  'allOf',
  '$defs',
  '$ref',
])

/**
 * The SDK's transform (transformJSONSchema, 0.133.0) moves `enum` and `const`
 * into the description, as text; the API supports both (structured outputs:
 * enum, const, anyOf, allOf). They go back where they were, so the values of
 * priority, target, stage, fascia_eta and the others are constrained by the
 * API, not only described. Only when nothing else was moved (a node with any
 * other unsupported key keeps the SDK's description), and the root's
 * $schema note goes.
 */
export function conEnumRipristinati(originale: unknown, trasformato: unknown): unknown {
  if (!originale || typeof originale !== 'object' || !trasformato || typeof trasformato !== 'object') return trasformato
  if (Array.isArray(originale) || Array.isArray(trasformato)) return trasformato
  const o = originale as NodoSchema
  const t = { ...(trasformato as NodoSchema) }
  const spostate = Object.keys(o).filter((k) => !CHIAVI_TRATTATE.has(k))
  if (spostate.length > 0 && spostate.every((k) => k === 'enum' || k === 'const' || k === '$schema')) {
    if (o.enum !== undefined) t.enum = o.enum
    if (o.const !== undefined) t.const = o.const
    if (typeof o.description === 'string') t.description = o.description
    else delete t.description
  }
  if (o.properties && typeof o.properties === 'object' && t.properties && typeof t.properties === 'object') {
    const tp = t.properties as NodoSchema
    const op = o.properties as NodoSchema
    t.properties = Object.fromEntries(Object.entries(tp).map(([k, v]) => [k, conEnumRipristinati(op[k], v)]))
  }
  if (o.items && t.items) t.items = conEnumRipristinati(o.items, t.items)
  const varianti = (o.anyOf ?? o.oneOf) as unknown[] | undefined
  if (Array.isArray(varianti) && Array.isArray(t.anyOf)) {
    t.anyOf = (t.anyOf as unknown[]).map((v, i) => conEnumRipristinati(varianti[i], v))
  }
  return t
}

/** { type, schema } only: no `parse`, so stop_reason is read before the JSON. */
function formato(schema: z.ZodType) {
  const { type, schema: trasformato } = betaZodOutputFormat(schema)
  const jsonSchema = conEnumRipristinati(z.toJSONSchema(schema, { reused: 'ref' }), trasformato) as typeof trasformato
  return Object.freeze({ type, schema: jsonSchema })
}

export const FORMATO_SCHEDE = formato(SchemaSchede)
export const FORMATO_AGENDA = formato(SchemaAgenda)
export const FORMATO_SINTESI = formato(SchemaSintesi)
export const FORMATO_CORREZIONI = formato(SchemaCorrezioni)

export type FormatoInsight = typeof FORMATO_SCHEDE
