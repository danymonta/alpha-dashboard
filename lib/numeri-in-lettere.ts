/**
 * Numbers said in letters, as the team dictates them (03/10/2026): "un",
 * "due" … "diciannove", the tens up to "novanta" and their compounds
 * ("venticinque", "ventotto", "trentuno", "quarantacinque", "novanta"). One list for
 * Alfire's free plan (lib/alfire/intento.ts: a time said in words keeps the
 * write tools) and for the durations the time form and Alfire read
 * (lib/validation/tempo.ts, parseDurata).
 */
const FINO_A_DICIANNOVE = [
  'uno',
  'due',
  'tre',
  'quattro',
  'cinque',
  'sei',
  'sette',
  'otto',
  'nove',
  'dieci',
  'undici',
  'dodici',
  'tredici',
  'quattordici',
  'quindici',
  'sedici',
  'diciassette',
  'diciotto',
  'diciannove',
] as const

const DECINE = ['venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'] as const

/**
 * A number in letters, as a regular expression without groups that capture:
 * "venti" + "due", "trenta" + "tré"; before "uno" and "otto" the tens drop
 * their last vowel ("ventuno", "trentotto").
 */
export const NUMERO_IN_LETTERE = `(?:un|una|${FINO_A_DICIANNOVE.join('|')}|(?:${DECINE.join('|')})(?:due|tr[eé]|quattro|cinque|sei|sette|nove)?|(?:${DECINE.map((d) => d.slice(0, -1)).join('|')})(?:uno|otto))`

const INTERO = new RegExp(`^${NUMERO_IN_LETTERE}$`)

/** "due" → 2, "ventitré" → 23, "trentotto" → 38, "un"/"una" → 1; null for anything else. */
export function numeroInLettere(parola: string): number | null {
  const p = parola.trim().toLowerCase()
  if (!INTERO.test(p)) return null
  if (p === 'un' || p === 'una') return 1
  const fino = (FINO_A_DICIANNOVE as readonly string[]).indexOf(p)
  if (fino >= 0) return fino + 1
  const decina = DECINE.findIndex((d) => p.startsWith(d.slice(0, -1)))
  // what follows the tens: "venti|due", "trent|otto", "sessanta"
  const resto = p.slice(DECINE[decina].length - 1).replace(/^[ia]/, '').replace('tré', 'tre')
  return (decina + 2) * 10 + (resto ? (FINO_A_DICIANNOVE as readonly string[]).indexOf(resto) + 1 : 0)
}
