import { getToolName, isToolUIPart, type UIMessage } from 'ai'

import { SCRITTURE } from '@/lib/alfire/permessi'

/**
 * Words that ask Alfire to write something (or tell it about money that came
 * in). Not "incass-": "quanto ho incassato?" is the question asked most, and a
 * cash-in to record comes with "segna", an amount or "ha pagato". A reading
 * question that still matches only costs a bigger request, never an answer.
 */
const VERBI_SCRITTURA =
  /\b(registr|segn|aggiung|crea|cre[ai]|modific|cambi|corregg|spost|fiss|pagat|ha pagato|hanno pagato|versat|bonific|contant|vendut|vend[ie]|rinnov|complet|mett|inserisc|salv|annull|chiud|imposta|assegn)/i
const IMPORTO = /\d[\d.,]*\s?(€|euro)|€\s?\d/i

function testoUtente(m: UIMessage): string {
  return m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ')
}

/**
 * Does this turn need the write tools? The free tier counts every token of
 * every step, and the write tools are more than half of the request: a
 * question that only reads goes without them. A write waiting for its
 * confirmation keeps them, or the approval could not complete.
 */
export function serveScrivere(messaggi: UIMessage[]): boolean {
  const ultimo = messaggi.at(-1)
  if (!ultimo) return false
  const scritture = new Set<string>(SCRITTURE)
  // an approval on its way back: the tool must be there to run
  for (const m of messaggi.slice(-2)) {
    if (m.role !== 'assistant') continue
    if (m.parts.some((p) => isToolUIPart(p) && scritture.has(getToolName(p)))) return true
  }
  const ultimaDomanda = [...messaggi].reverse().find((m) => m.role === 'user')
  if (!ultimaDomanda) return false
  const testo = testoUtente(ultimaDomanda)
  return VERBI_SCRITTURA.test(testo) || IMPORTO.test(testo)
}
