import { getToolName, isToolUIPart, type UIMessage } from 'ai'

import { SCRITTURE } from '@/lib/alfire/permessi'
import { NUMERO_IN_LETTERE } from '@/lib/numeri-in-lettere'

/**
 * Words that ask Alfire to write something (or tell it about money that came
 * in). Not "incass-": "quanto ho incassato?" is the question asked most, and a
 * cash-in to record comes with "segna", an amount or "ha pagato". A reading
 * question that still matches only costs a bigger request, never an answer.
 */
const VERBI_SCRITTURA =
  /\b(registr|segn|aggiung|crea|cre[ai]|modific|cambi|corregg|spost|fiss|pagat|ha pagato|hanno pagato|versat|bonific|contant|vendut|vend[ie]|rinnov|complet|mett|inserisc|salv|annull|chiud|imposta|assegn|elimin|cancell|togli|avvi|ferm|rimbors|interromp|riapr|copia|tracci|logg|stopp|stop\b|spegn|accend|fa(?:i|mmi) partire|start\b|timer\b|spunt|rinomin|annot|sistem|rimuov|(?:inizi|cominci)\w*\s+a\s+contar|cronometr|ho\s+(?:appena\s+)?finito)/i
const IMPORTO = /\d[\d.,]*\s?(€|euro)|€\s?\d/i
/**
 * Time said with its amount (03/10/2026): "ho lavorato 2 ore", "ci ho messo
 * 45 minuti", "dalle 9 alle 10", "mezz'ora", and the same in letters, as a
 * dictated answer to "quanto tempo?" comes: "due ore", "venti minuti", "un
 * quarto d'ora", "tre quarti d'ora", "dalle nove", "un paio d'ore", "una
 * ventina di minuti". Without one, "quanto ho lavorato ieri?" only reads.
 */
const DURATA = new RegExp(
  [
    String.raw`\d+([.,]\d+)?\s?(h\d*|ore|ora|min|minuti)\b`,
    String.raw`\bdalle\s+\d`,
    String.raw`\bmezz['’ ]?or(a|etta)\b`,
    String.raw`\bmezza\s+ora\b`,
    String.raw`\bda\s+mezzanotte\b`,
    String.raw`\bun['’ ]or(a|etta)\b`,
    String.raw`\b${NUMERO_IN_LETTERE}\s+(ore|ora|orette|minuti|minuto|min)\b`,
    String.raw`\bquart[oi]\s+d['’ ]?ora\b`,
    String.raw`\b(un|tre)\s+quart[oi]\b`,
    String.raw`\bun\s+paio\s+d(i\s+|['’ ]?)ore\b`,
    String.raw`\buna\s+(decina|quindicina|ventina|trentina|quarantina|cinquantina)\s+di\s+minuti\b`,
    String.raw`\b(dalle|dall['’ ]?)\s*(${NUMERO_IN_LETTERE}|mezzanotte|mezzogiorno)\b`,
  ].join('|'),
  'i',
)

/**
 * A correction said without a verb (03/10/2026): "la revisione video di
 * martedì era per Tiziano Mele", "erano su Moretti", "quella di martedì va
 * su Tiziano Mele".
 */
const CORREZIONE = /\b(era|erano|va|vanno|andava|andavano)\s+(per|su|sul|sulla|sullo|sui|sulle)\b/i

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
      if ([VERBI_SCRITTURA, IMPORTO, DURATA, CORREZIONE].some((r) => r.test(testo))) return true
    }
  }
  return false
}
