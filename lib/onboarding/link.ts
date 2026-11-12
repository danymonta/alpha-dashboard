import { publicEnv } from '@/lib/env'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'

/**
 * The personal link of an onboarding (1.77.0): /join/<slug>-<token>, from APP_URL and
 * never from the Host header (the same rule as lib/auth/origine.ts and lib/mcp/indirizzi.ts).
 * The slug is the readable part (name and surname), the token the secret one: 64
 * hexadecimal characters, of which the database keeps only the sha256. The page /join
 * itself is release B: here only the address and the ready message, which the card shows
 * once the client area is open (onboarding_impostazioni.aperto_ai_clienti).
 */

/** The same rule as the check of onboarding_inviti.slug. */
export const SLUG_VALIDO = /^[a-z0-9-]{1,60}$/
/** The same rule as the check of onboarding_inviti_token.token: two uuids without hyphens. */
export const TOKEN_VALIDO = /^[0-9a-f]{64}$/

const CON_ACCENTO = 'àáâãäåāèéêëēìíîïīòóôõöōùúûüūçñýÿ'
const SENZA_ACCENTO = 'aaaaaaaeeeeeiiiiioooooouuuuucnyy'

/**
 * «mario-rossi» from name and surname: lower case, without accents, hyphens, 60 characters
 * at most, «cliente» when nothing is left. The same steps as public.onboarding_slug, which
 * is the one that writes the slug: this is for the pages that show it before it exists.
 */
export function slugOnboarding(nome: string | null | undefined, cognome: string | null | undefined): string {
  const testo = [nome, cognome]
    .filter((parte): parte is string => parte != null)
    .join(' ')
    .toLowerCase()
  const senzaAccenti = Array.from(testo, (carattere) => {
    const i = CON_ACCENTO.indexOf(carattere)
    return i >= 0 ? SENZA_ACCENTO[i] : carattere
  }).join('')
  const slug = senzaAccenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || 'cliente'
}

function senzaBarraFinale(valore: string): string {
  return valore.replace(/\/+$/, '')
}

/** The address the client opens: null when the slug or the token are not the ones the database writes. */
export function linkJoin(slug: string, token: string, appUrl: string = publicEnv.appUrl): string | null {
  if (!SLUG_VALIDO.test(slug) || !TOKEN_VALIDO.test(token)) return null
  return `${senzaBarraFinale(appUrl)}/join/${slug}-${token}`
}

/** The last segment of the link back into its two parts: the token is the last 64 characters. */
export function separaJoin(segmento: string): { slug: string; token: string } | null {
  const m = /^([a-z0-9-]{1,60})-([0-9a-f]{64})$/.exec(segmento)
  return m ? { slug: m[1], token: m[2] } : null
}

/** «Mario» of «Mario Rossi»: the message greets by first name. */
export function nomeDiBattesimo(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * The ready message of the specification (section 2.1.1), with the link at the end. It goes
 * to the client, so it is Italian whatever the language of the interface.
 */
export function messaggioPronto(nome: string | null | undefined, link: string): string {
  const battesimo = nomeDiBattesimo(nome)
  const t = ONBOARDING.it.messaggio
  return battesimo ? t.testo(battesimo, link) : t.testoSenzaNome(link)
}
