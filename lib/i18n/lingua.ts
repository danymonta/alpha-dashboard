import type { AppRole } from '@/lib/auth/roles'

/**
 * The language of the interface (1.53.0, Dany 22/10/2026: «Dai la possibilità di vedere
 * tutta l'app in inglese… con la bandierina»; «Il business coach deve avere accesso in
 * lettura in inglese ai dati in modo semplice»). Italian is the base language: every word
 * of the app is Italian first, English is the second. Chosen per device in a cookie, like
 * the theme, and read by the server in the first byte: no prefix in the URLs, no flash.
 * What people write (names, notes, scripts), what Claude writes, the emails, Alfire and
 * the database's own messages stay Italian.
 */
export const LINGUE = ['it', 'en'] as const
export type Lingua = (typeof LINGUE)[number]

export const COOKIE_LINGUA = 'alpha_lingua'

/** The locale of the numbers and the dates: «1.250,00 €» and «€1,250.00». */
export const LOCALE: Record<Lingua, string> = { it: 'it-IT', en: 'en-IE' }

export function eLingua(valore: unknown): valore is Lingua {
  return typeof valore === 'string' && (LINGUE as readonly string[]).includes(valore)
}

/**
 * The language of a request: the device's choice when there is one; without it, English
 * for the business coach (an English-speaking consultant) and Italian for everyone else,
 * so whoever touches nothing sees nothing change.
 */
export function linguaIniziale(cookie: string | null | undefined, ruolo: AppRole | null | undefined): Lingua {
  if (eLingua(cookie)) return cookie
  return ruolo === 'business_coach' ? 'en' : 'it'
}

export const UN_ANNO_IN_SECONDI = 60 * 60 * 24 * 365

/**
 * The words of a dictionary with the same shape in another language: every string a
 * string, every function the same parameters. The compiler holds the keys of the two
 * languages together; tests/i18n-chiavi.test.ts checks them again at run time.
 */
export type Testi<T> = T extends string
  ? string
  : T extends (...argomenti: infer A) => infer R
    ? (...argomenti: A) => R extends string ? string : R
    : T extends readonly (infer U)[]
      ? readonly Testi<U>[]
      : T extends object
        ? { [K in keyof T]: Testi<T[K]> }
        : T

export type Bilingue<T> = Record<Lingua, T>

/** A dictionary in the two languages: Italian first, English with the same keys. */
export function bilingue<T>(it: T, en: Testi<T>): Bilingue<T> {
  return { it, en: en as unknown as T }
}

/** The line that tells an English reader the content below is the team's own, in Italian. */
export const NOTA_CONTENUTO_ITALIANO = 'Content written by the team, in Italian.'
