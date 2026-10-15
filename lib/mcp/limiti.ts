import { createHash } from 'node:crypto'

/**
 * The MCP server's limits (09/10/2026). Sizes keep every result within
 * claude.ai's ≈150,000 characters and Claude Code's default 25,000-token tool
 * output (≈ 60,000 characters of JSON with Italian text); a section is never
 * cut, because a truncated text written back would lose the rest.
 */
export const LIMITI_MCP = {
  /** request body, 413 above (Vercel's own limit is 4.5 MB) */
  corpo: 2 * 1024 * 1024,
  /** array elements plus object members in one tools/call */
  elementiInput: 1000,
  /** contents per crea_contenuti */
  contenutiPerCreazione: 20,
  /** section text per crea_contenuti, in code points */
  testoPerCreazione: 400_000,
  /** rows per elenco_contenuti, and the default */
  righeElenco: 100,
  righeElencoPredefinite: 50,
  /** section text per leggi_contenuto, in code points: one section (≤ 30,000) always fits */
  testoLettura: 45_000,
  /** any result, in code points of its JSON */
  risultato: 60_000,
  /** per OAuth session and minute */
  richiesteMinuto: 120,
  scrittureMinuto: 60,
} as const

export const TROPPE_RICHIESTE = 'Troppe richieste in poco tempo: aspetta un minuto.'

const FINESTRA_MS = 60_000

type Conteggio = { inizio: number; richieste: number; scritture: number }

/**
 * In memory, per instance, keyed by a hash of the OAuth session id: on Vercel
 * Fluid compute it is a guard against a loop, not a security boundary. Nothing
 * is persisted: a table of calls per person per minute would be activity
 * tracking (CLAUDE.md section 17).
 */
const conteggi = new Map<string, Conteggio>()
let ultimaPulizia = 0

function pulisci(adesso: number) {
  if (adesso - ultimaPulizia < FINESTRA_MS) return
  ultimaPulizia = adesso
  for (const [chiave, c] of conteggi) if (adesso - c.inizio >= FINESTRA_MS) conteggi.delete(chiave)
}

function conteggioDi(sessione: string, adesso: number): Conteggio {
  pulisci(adesso)
  const chiave = createHash('sha256').update(sessione).digest('hex')
  let c = conteggi.get(chiave)
  if (!c || adesso - c.inizio >= FINESTRA_MS) {
    c = { inizio: adesso, richieste: 0, scritture: 0 }
    conteggi.set(chiave, c)
  }
  return c
}

/** 429 with Retry-After past 120 requests a minute on one OAuth session, null otherwise. */
export function superaLimiteRichieste(sessione: string, adesso: number = Date.now()): Response | null {
  const c = conteggioDi(sessione, adesso)
  c.richieste += 1
  if (c.richieste <= LIMITI_MCP.richiesteMinuto) return null
  return Response.json(
    { error: 'troppe_richieste', messaggio: TROPPE_RICHIESTE },
    { status: 429, headers: { 'Retry-After': '60' } },
  )
}

/** True past 60 write tool calls a minute on one OAuth session (the tool answers with an error). */
export function superaLimiteScritture(sessione: string, adesso: number = Date.now()): boolean {
  const c = conteggioDi(sessione, adesso)
  c.scritture += 1
  return c.scritture > LIMITI_MCP.scrittureMinuto
}

/** Tests only: every counter back to zero. */
export function azzeraLimiti(): void {
  conteggi.clear()
  ultimaPulizia = 0
}
