import 'server-only'

import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server'
import { zodSchema } from 'ai'
import type { z } from 'zod'

/**
 * A zod 3 schema of the app as the Standard Schema with JSON Schema that the
 * MCP SDK v2 wants for a tool's input (09/10/2026). The SDK brings its own
 * zod 4 for its protocol schemas; the app stays on zod 3, and app code never
 * imports zod/v4.
 *
 * - Validation is the zod 3 safeParse itself, so the tools accept exactly
 *   what the forms and the server actions accept, and the SDK turns the
 *   Italian messages of the issues into the tool error Claude reads.
 * - The JSON Schema comes from the converter Alfire's tools already use
 *   (ai's zodSchema: zod 3 to JSON Schema 7, no $ref). The SDK asks for draft
 *   2020-12; the converter writes draft-07 and says so in $schema. The
 *   keywords it emits for these schemas (type, properties, required, enum,
 *   anyOf, maxLength, pattern, additionalProperties) mean the same in
 *   2020-12, so $schema is dropped.
 * - One adapter per zod schema, kept for the life of the server: the SDK
 *   builds a fresh McpServer on every request and asks for the JSON Schema
 *   again, and the conversion runs once.
 */

type Adattatore = StandardSchemaWithJSON<unknown, unknown>

const adattatori = new WeakMap<z.ZodTypeAny, Adattatore>()

/** The JSON Schema of a zod 3 schema, without the draft-07 dialect line. */
function jsonSchemaDi(schema: z.ZodTypeAny): Record<string, unknown> {
  const convertito: unknown = zodSchema(schema).jsonSchema
  if (convertito === null || typeof convertito !== 'object' || 'then' in convertito) {
    // a zod 3 schema converts synchronously: anything else is a schema this adapter was not built for
    throw new Error('schemaMcp: conversione in JSON Schema non sincrona')
  }
  const json: Record<string, unknown> = { ...(convertito as Record<string, unknown>) }
  delete json.$schema
  return json
}

export function schemaMcp<S extends z.ZodTypeAny>(schema: S): StandardSchemaWithJSON<z.input<S>, z.output<S>> {
  const esistente = adattatori.get(schema)
  if (esistente) return esistente as StandardSchemaWithJSON<z.input<S>, z.output<S>>

  let memo: Record<string, unknown> | undefined
  const json = () => (memo ??= jsonSchemaDi(schema))

  const adattatore: StandardSchemaWithJSON<z.input<S>, z.output<S>> = {
    '~standard': {
      version: 1,
      vendor: 'alpha-zod3',
      validate(valore) {
        // the SDK already passes args ?? {}
        const esito = schema.safeParse(valore)
        return esito.success
          ? { value: esito.data as z.output<S> }
          : { issues: esito.error.issues.map((i) => ({ message: i.message, path: i.path })) }
      },
      jsonSchema: { input: json, output: json },
    },
  }
  adattatori.set(schema, adattatore as Adattatore)
  return adattatore
}
