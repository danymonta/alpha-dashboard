// The rules of Anthropic's structured outputs (output_config.format, type json_schema), as the
// documentation of the API states them (platform.claude.com, «Structured outputs», checked on
// 16/10/2026), written as a plain checker. Used by tests/anthropic-richieste.test.ts (the formats of
// the app) and by the fake Claude (e2e/claude-finto.mjs), which answers 400 to a request the real
// API would refuse, so that a schema or a text the API does not accept is seen before the deploy
// and not in the logs of production (1.37.1).
//
// Plain JavaScript on purpose: the fake Claude runs with node, without a build.

/** Complexity limits of the documentation, for the whole request. */
export const LIMITI = Object.freeze({ opzionali: 24, unioni: 16 })

const FORMATI_AMMESSI = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'])
const PAROLE_NON_AMMESSE = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'maxItems',
  'uniqueItems',
  'minContains',
  'maxContains',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'propertyNames',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'dependentRequired',
  'dependentSchemas',
  'prefixItems',
  'contains',
  'unevaluatedProperties',
  'unevaluatedItems',
]
// a regular expression the grammar cannot express: back references, look around, word boundaries
const RE_PATTERN_NON_AMMESSO = /\\[1-9]|\(\?[=!<]|\\[bB]/

const PRIMITIVI = new Set(['string', 'number', 'boolean'])

/**
 * The problems of a JSON schema for structured outputs, as sentences; an empty list = the schema is
 * within the documented rules. Counts the optional properties and the unions of the whole schema.
 */
export function verificaSchemaStrutturato(schema) {
  const problemi = []
  let opzionali = 0
  let unioni = 0
  const defs = (schema && typeof schema === 'object' && (schema.$defs ?? schema.definitions)) || {}

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return ['lo schema non è un oggetto']
  if (schema.type !== 'object') problemi.push('la radice dello schema deve essere un oggetto')

  const visitati = new Set()
  function visita(n, percorso, pila) {
    if (Array.isArray(n)) {
      n.forEach((x, i) => visita(x, `${percorso}[${i}]`, pila))
      return
    }
    if (!n || typeof n !== 'object') return

    for (const parola of PAROLE_NON_AMMESSE) {
      if (parola in n) problemi.push(`${percorso}: «${parola}» non è ammesso`)
    }
    if ('minItems' in n && n.minItems !== 0 && n.minItems !== 1) problemi.push(`${percorso}: minItems vale solo 0 o 1`)
    if ('format' in n && !FORMATI_AMMESSI.has(n.format)) problemi.push(`${percorso}: il formato «${n.format}» non è ammesso`)
    if (typeof n.pattern === 'string' && RE_PATTERN_NON_AMMESSO.test(n.pattern)) problemi.push(`${percorso}: pattern con costrutti non ammessi`)
    if ('enum' in n) {
      if (!Array.isArray(n.enum) || n.enum.length === 0) problemi.push(`${percorso}: enum vuoto o non è una lista`)
      else if (n.enum.some((v) => v !== null && !PRIMITIVI.has(typeof v))) problemi.push(`${percorso}: enum con valori complessi`)
      else if (new Set(n.enum).size !== n.enum.length) problemi.push(`${percorso}: enum con valori ripetuti`)
    }
    if (Array.isArray(n.anyOf)) {
      unioni++
      if (n.anyOf.length === 0) problemi.push(`${percorso}: anyOf vuoto`)
    }
    if (Array.isArray(n.type)) unioni++
    if (Array.isArray(n.allOf) && n.allOf.some((x) => x && typeof x === 'object' && '$ref' in x)) {
      problemi.push(`${percorso}: allOf con $ref non è ammesso`)
    }
    if (typeof n.$ref === 'string') {
      if (!n.$ref.startsWith('#/')) problemi.push(`${percorso}: $ref esterno non è ammesso`)
      else if (pila.includes(n.$ref)) problemi.push(`${percorso}: schema ricorsivo (${n.$ref})`)
      else {
        const nome = n.$ref.split('/').pop()
        if (nome && defs[nome] && !visitati.has(n.$ref)) {
          visitati.add(n.$ref)
          visita(defs[nome], `${percorso}→${n.$ref}`, [...pila, n.$ref])
        }
      }
    }
    if (n.type === 'object' || n.properties) {
      if (n.additionalProperties !== false) problemi.push(`${percorso}: ogni oggetto vuole additionalProperties: false`)
      const chiavi = Object.keys(n.properties ?? {})
      const richieste = new Set(Array.isArray(n.required) ? n.required : [])
      for (const r of richieste) if (!chiavi.includes(r)) problemi.push(`${percorso}: «${r}» è richiesta ma non è tra le proprietà`)
      opzionali += chiavi.filter((k) => !richieste.has(k)).length
    } else if ('additionalProperties' in n && n.additionalProperties !== false) {
      problemi.push(`${percorso}: additionalProperties diverso da false`)
    }

    for (const [k, v] of Object.entries(n)) {
      if (k === '$defs' || k === 'definitions') continue
      if (k === 'properties' && v && typeof v === 'object') {
        // the names of the properties are not keywords: a property may be called «format» or «if»
        for (const [nome, sotto] of Object.entries(v)) visita(sotto, `${percorso}.${nome}`, pila)
      } else if (v && typeof v === 'object' && k !== 'enum' && k !== 'const' && k !== 'required' && k !== 'default') {
        visita(v, `${percorso}.${k}`, pila)
      }
    }
  }
  visita(schema, '$', [])

  if (opzionali > LIMITI.opzionali) problemi.push(`troppi parametri opzionali (${opzionali}, al massimo ${LIMITI.opzionali})`)
  if (unioni > LIMITI.unioni) problemi.push(`troppi parametri con unioni (${unioni}, al massimo ${LIMITI.unioni})`)
  return problemi
}

/** The numbers the checker counted, to show them in a test or a log line. */
export function misureSchema(schema) {
  let opzionali = 0
  let unioni = 0
  let oggetti = 0
  function visita(n) {
    if (Array.isArray(n)) return n.forEach(visita)
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n.anyOf) || Array.isArray(n.type)) unioni++
    if (n.properties) {
      oggetti++
      const richieste = new Set(Array.isArray(n.required) ? n.required : [])
      opzionali += Object.keys(n.properties).filter((k) => !richieste.has(k)).length
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'properties' && v && typeof v === 'object') Object.values(v).forEach(visita)
      else if (k !== 'enum' && k !== 'const' && k !== 'required' && k !== 'default') visita(v)
    }
  }
  visita(schema)
  return { opzionali, unioni, oggetti, byte: JSON.stringify(schema).length }
}

/** True when a string has no lone surrogate (the API refuses such a body as invalid JSON/unicode). */
export function benFormata(testo) {
  return typeof testo !== 'string' || testo.isWellFormed()
}

/** Every text of a value (keys included) that is not well formed: the paths, for a message. */
export function testiMalFormati(valore, percorso = '$', fuori = []) {
  if (typeof valore === 'string') {
    if (!valore.isWellFormed()) fuori.push(percorso)
  } else if (Array.isArray(valore)) {
    valore.forEach((x, i) => testiMalFormati(x, `${percorso}[${i}]`, fuori))
  } else if (valore && typeof valore === 'object') {
    for (const [k, v] of Object.entries(valore)) {
      if (!k.isWellFormed()) fuori.push(`${percorso}.<chiave>`)
      testiMalFormati(v, `${percorso}.${k}`, fuori)
    }
  }
  return fuori
}

/**
 * What the real API refuses in the body of a Messages request (400 invalid_request_error), as far
 * as it is documented: a schema out of the rules, a lone surrogate, an empty text block, more than
 * 4 cache breakpoints, an effort or a max_tokens that does not exist. A list of sentences.
 */
export function verificaCorpoRichiesta(corpo) {
  const problemi = []
  const formato = corpo?.output_config?.format
  if (formato) {
    if (formato.type !== 'json_schema') problemi.push('output_config.format.type vale json_schema')
    for (const p of verificaSchemaStrutturato(formato.schema)) problemi.push(`schema: ${p}`)
  }
  const effort = corpo?.output_config?.effort
  if (effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) problemi.push(`effort «${effort}» non esiste`)
  if (!Number.isInteger(corpo?.max_tokens) || corpo.max_tokens < 1 || corpo.max_tokens > 128_000) problemi.push('max_tokens fuori misura')
  for (const fuori of testiMalFormati(corpo)) problemi.push(`testo con un surrogato isolato in ${fuori}`)

  let breakpoint = 0
  const blocchi = []
  if (Array.isArray(corpo?.system)) blocchi.push(...corpo.system.map((b, i) => ({ b, p: `system[${i}]` })))
  else if (typeof corpo?.system === 'string' && corpo.system.trim() === '') problemi.push('system vuoto')
  for (const [m, messaggio] of (corpo?.messages ?? []).entries()) {
    if (Array.isArray(messaggio.content)) blocchi.push(...messaggio.content.map((b, i) => ({ b, p: `messages[${m}].content[${i}]` })))
    else if (typeof messaggio.content === 'string' && messaggio.content.trim() === '') problemi.push(`messages[${m}] vuoto`)
  }
  for (const { b, p } of blocchi) {
    if (b?.type === 'text' && (typeof b.text !== 'string' || b.text.trim() === '')) problemi.push(`${p}: blocco di testo vuoto`)
    if (b?.cache_control) breakpoint++
  }
  if (breakpoint > 4) problemi.push(`più di 4 punti di cache (${breakpoint})`)
  return problemi
}
