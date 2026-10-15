/**
 * The MCP server's logs (Claude connected to the content calendar, 09/10/2026):
 * one line per tool call and one per refused access. Never who (no sub,
 * session_id, client_id, name or role), never the token or the Authorization
 * header, never a tool's arguments or results, never a content's name or text
 * (CLAUDE.md section 17 and the GDPR): tool, outcome, milliseconds and size.
 * Vercel's own request log has the path and the status, never headers.
 */

/** Why an access was refused, in the log only (never shown to anyone). */
export type MotivoAccesso =
  | 'intestazione'
  | 'firma'
  | 'emittente'
  | 'client'
  | 'scadenza'
  | 'sessione'
  | 'jwt_postgrest'
  | 'ruolo'
  | 'filtro_assente'
  | 'temporaneo'

/** Only plain identifiers reach the log: a code, a class name, a host. */
function pulito(valore: string): string {
  return valore.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 64) || '-'
}

export function registraStrumento(voce: { strumento: string; esito: string; ms: number; caratteri: number }): void {
  console.info(
    `[mcp] strumento=${pulito(voce.strumento)} esito=${pulito(voce.esito)} ms=${Math.round(voce.ms)} caratteri=${voce.caratteri}`,
  )
}

export function registraAccesso(voce: { stato: number; motivo: MotivoAccesso; codice?: string }): void {
  const codice = voce.codice ? ` codice=${pulito(voce.codice)}` : ''
  console.warn(`[mcp] accesso stato=${voce.stato} motivo=${voce.motivo}${codice}`)
}

export function registraOrigineRifiutata(host: string): void {
  console.warn(`[mcp] origine rifiutata host=${pulito(host)}`)
}

/**
 * An error out of band (the SDK's onerror) or caught around a tool: the class
 * name, or the SQL code when it has one. Never the message: it can echo the
 * arguments or a content's text.
 */
export function registraErroreMcp(errore: unknown): void {
  // PostgREST errors carry `code`; the core's LetturaNonRiuscita carries `codice`
  const voce = errore && typeof errore === 'object' ? (errore as { code?: unknown; codice?: unknown }) : {}
  const codice =
    typeof voce.code === 'string' && voce.code ? voce.code : typeof voce.codice === 'string' && voce.codice ? voce.codice : null
  const classe = errore instanceof Error ? errore.constructor.name || errore.name : typeof errore
  console.error(`[mcp] errore classe=${pulito(classe)}${codice ? ` codice=${pulito(codice)}` : ''}`)
}
