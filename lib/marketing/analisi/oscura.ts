/**
 * Names out of what reaches Claude and out of what comes back (1.36.0, CLAUDE.md
 * section 30, R19). Pure. `marketing_fonti_analisi` gives the names to blank
 * (`da_oscurare`: leads, clients, the team who is not an active admin, the
 * handles); only whole words of at least 3 letters are compared, without
 * accents and case, so «Ale» is blanked and «al» is not, «Mattèo» is «matteo»
 * and a name inside another word stays. Never the brand and the account
 * (dany, daniele, montagnolo, alpha, percorso) and never the common Italian
 * words that are also names (rosa, marino, sole, bello, costa…).
 */

/** The words of the brand and the account: not a person to hide. */
export const PAROLE_DEL_MARCHIO: ReadonlySet<string> = new Set(['dany', 'daniele', 'montagnolo', 'alpha', 'percorso', 'danymonta'])

/** Italian words that are also names or surnames: blanking them would wreck the text. */
export const PAROLE_COMUNI: ReadonlySet<string> = new Set([
  'rosa', 'marino', 'sole', 'bello', 'bella', 'costa', 'forte', 'serena', 'speranza', 'gioia', 'bianco', 'bianca',
  'neri', 'nero', 'moro', 'fiore', 'leone', 'santo', 'santa', 'grande', 'riccio', 'piccolo', 'villa', 'monte', 'ferro',
  'lupo', 'gallo', 'pace', 'fabbri', 'conti', 'mancini', 'longo', 'greco', 'amico', 'rossi', 'russo', 'giusto', 'dolce',
  'guerra', 'vita', 'mare', 'cielo', 'luna', 'fortuna', 'perla', 'gemma', 'viola', 'iris', 'mia', 'una', 'uno', 'non',
  'con', 'per', 'tra', 'fra', 'che', 'chi', 'dal', 'del', 'dei', 'gli', 'nel', 'sul', 'tutti',
])

/** Lower case, no accents, no marks. */
export function senzaAccenti(testo: string): string {
  return testo.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

const RE_PAROLA = /[\p{L}\p{N}]+/gu

/** The words to blank, from the names and handles: whole words of 3+ characters, normalized. */
export function paroleDaOscurare(nomi: readonly string[]): Set<string> {
  const parole = new Set<string>()
  for (const nome of nomi) {
    for (const p of senzaAccenti(nome).match(RE_PAROLA) ?? []) {
      if ([...p].length < 3) continue
      if (PAROLE_DEL_MARCHIO.has(p) || PAROLE_COMUNI.has(p)) continue
      if (/^\p{N}+$/u.test(p)) continue
      parole.add(p)
    }
  }
  return parole
}

const RE_HANDLE = /(^|[^\p{L}\p{N}._])@[\p{L}\p{N}._]+/gu
const RE_IMPORTO =
  /(?:€\s*\d[\d.,]*|\d[\d.,]*\s*(?:€|euro\b|eur\b))/giu
const RE_URL = /\b(?:https?:\/\/|www\.)\S+/giu
// an email address, and a phone number (nine digits or more, with spaces, dots or dashes between them)
const RE_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu
const RE_TELEFONO = /(?<![\p{L}\p{N}])\+?\d(?:[ .-]?\d){8,}(?![\p{N}])/gu
const RE_TRATTINO = /\s*[–—]\s*/gu

/**
 * The words of a text that are names: each whole word found in `parole` becomes
 * `sostituto`. Returns the text and how many were replaced (a count for the log).
 */
export function sostituisciNomi(testo: string, parole: ReadonlySet<string>, sostituto: string): { testo: string; sostituzioni: number } {
  if (parole.size === 0) return { testo, sostituzioni: 0 }
  let n = 0
  const nuovo = testo.replace(RE_PAROLA, (trovata) => {
    if ([...trovata].length >= 3 && parole.has(senzaAccenti(trovata))) {
      n++
      return sostituto
    }
    return trovata
  })
  return { testo: nuovo, sostituzioni: n }
}

/**
 * A text that goes to Claude: the names blanked («[lead]»), `@handles`
 * («@[account]»), emails and phone numbers («[contatto]»), amounts («[importo]») and links (out). A text that is not
 * there stays empty.
 */
export function oscura(testo: string | null | undefined, parole: ReadonlySet<string>): string {
  if (!testo) return ''
  let t = testo.replace(RE_URL, ' ')
  t = t.replace(RE_EMAIL, '[contatto]')
  t = t.replace(RE_HANDLE, (_m, prima: string) => `${prima}@[account]`)
  t = t.replace(RE_IMPORTO, '[importo]')
  t = t.replace(RE_TELEFONO, '[contatto]')
  t = sostituisciNomi(t, parole, '[lead]').testo
  return t.replace(/[ \t]{2,}/g, ' ').trim()
}

export type ConteggiControllo = { nomi: number; handle: number; importi: number; link: number; trattini: number }

/**
 * A text that comes back from Claude: the names become «un lead», `@handle` «un
 * account», an amount «il prezzo», a link goes, the long and the medium dash a
 * comma. The counts go to the log, never the text.
 */
export function ripulisciUscita(testo: string, parole: ReadonlySet<string>): { testo: string; conteggi: ConteggiControllo } {
  const conteggi: ConteggiControllo = { nomi: 0, handle: 0, importi: 0, link: 0, trattini: 0 }
  let t = testo.replace(RE_URL, () => {
    conteggi.link++
    return ''
  })
  // an email or a phone number is counted with the handles: it is a way to reach a person
  t = t.replace(RE_EMAIL, () => {
    conteggi.handle++
    return 'un contatto'
  })
  t = t.replace(RE_HANDLE, (_m, prima: string) => {
    conteggi.handle++
    return `${prima}un account`
  })
  t = t.replace(RE_IMPORTO, () => {
    conteggi.importi++
    return 'il prezzo'
  })
  t = t.replace(RE_TELEFONO, () => {
    conteggi.handle++
    return 'un contatto'
  })
  const nomi = sostituisciNomi(t, parole, 'un lead')
  conteggi.nomi = nomi.sostituzioni
  t = nomi.testo.replace(RE_TRATTINO, () => {
    conteggi.trattini++
    return ', '
  })
  return { testo: t.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim(), conteggi }
}

/** Words of a text for the copy check: normalized, no punctuation. */
export function paroleNormalizzate(testo: string): string[] {
  return senzaAccenti(testo).match(RE_PAROLA) ?? []
}

/** The length of a run of words that Claude copied from the notes of the team: eight in a row is a copy. */
export const PAROLE_DI_COPIA = 8

/**
 * Whether `testo` holds `PAROLE_DI_COPIA` words in a row of any of the notes
 * (the answers of the setter, the closer's reasons): a phrase copied, not
 * rephrased. Only when the notes reach Claude.
 */
export function copiaDelleNote(testo: string, note: readonly (readonly string[])[]): boolean {
  const parole = paroleNormalizzate(testo)
  if (parole.length < PAROLE_DI_COPIA) return false
  const finestre = new Set<string>()
  for (let i = 0; i + PAROLE_DI_COPIA <= parole.length; i++) finestre.add(parole.slice(i, i + PAROLE_DI_COPIA).join(' '))
  for (const nota of note) {
    for (let i = 0; i + PAROLE_DI_COPIA <= nota.length; i++) {
      if (finestre.has(nota.slice(i, i + PAROLE_DI_COPIA).join(' '))) return true
    }
  }
  return false
}
