import { getToolName, isToolUIPart, type UIMessage } from 'ai'

import { SCRITTURE } from '@/lib/alfire/permessi'

/**
 * Words that ask Alfire to write something (or tell it about money that came
 * in). Not "incass-": "quanto ho incassato?" is the question asked most, and a
 * cash-in to record comes with "segna", an amount or "ha pagato". A reading
 * question that still matches only costs a bigger request, never an answer.
 */
const VERBI_SCRITTURA =
  /\b(registr|segn|aggiung|crea|cre[ai]|modific|cambi|corregg|spost|fiss|pagat|ha pagato|hanno pagato|versat|bonific|contant|vendut|vend[ie]|rinnov|complet|mett|inserisc|salv|annull|chiud|imposta|assegn|elimin|cancell|togli|avvi|ferm|rimbors|interromp|riapr|copia)/i
const IMPORTO = /\d[\d.,]*\s?(€|euro)|€\s?\d/i

function testoUtente(m: UIMessage): string {
  return m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ')
}

/**
 * Only on Groq's free tier (budgetAlfire): does this conversation need the
 * write tools? They are more than half of the request, and a chat that only
 * reads goes without them. The whole conversation counts, not only the last
 * message: after "registra l'incasso di Raffaele" a "ci sei?" still writes
 * (Dany, 29/09/2026). A write waiting for its confirmation keeps them too.
 */
export function conversazioneScrive(messaggi: UIMessage[]): boolean {
  const scritture = new Set<string>(SCRITTURE)
  for (const m of messaggi) {
    if (m.role === 'assistant' && m.parts.some((p) => isToolUIPart(p) && scritture.has(getToolName(p)))) return true
    if (m.role === 'user') {
      const testo = testoUtente(m)
      if (VERBI_SCRITTURA.test(testo) || IMPORTO.test(testo)) return true
    }
  }
  return false
}
