/**
 * The links of the content sections (01/11/2026, Dany: link cliccabili «stile
 * Google Drive»). Pure: the editor (editor-markdown.ts, menu-link.tsx) and the
 * tests share it.
 *
 * - What opens: only an http or https address, never `javascript:` or another
 *   scheme (`hrefApribile`).
 * - What the person writes in «Modifica»: an address with or without
 *   `https://` (`normalizzaHref`); anything that is not http(s) is refused.
 * - The Markdown stays the person's: `[testo](url)` comes back as it was, and a
 *   bare address (`https://…`, `www.…`, `<https://…>`) comes back bare. The
 *   serializer of @tiptap/markdown escapes the text of every link («_» becomes
 *   «\_»), which would break a bare address; the link mark marks it with two
 *   private characters instead and `ripristinaIndirizzi` puts the address back
 *   as it was written.
 */

/** The two marks around a bare address in the serializer's output: private-use characters, never in a text. */
export const INIZIO_NUDO = ''
export const FINE_NUDO = ''

/** The forms of an address written without `[testo](…)`: bare, or between angle brackets. */
export type FormaIndirizzo = 'nudo' | 'angolare'

/**
 * The form of a link token of marked: `nudo` for an address GFM found in the
 * text (`https://…`, `www.…`, an email), `angolare` for `<https://…>`, null for
 * `[testo](url)`.
 */
export function formaDelToken(token: { raw?: string; text?: string }): FormaIndirizzo | null {
  const raw = token.raw ?? ''
  if (raw.startsWith('[')) return null
  if (raw.startsWith('<') && raw.endsWith('>')) return 'angolare'
  return raw !== '' && raw === token.text ? 'nudo' : null
}

/**
 * Whether the text of a bare link still is its address: only then it goes back
 * bare. An address edited into other words is a `[testo](url)`.
 */
export function restaIndirizzo(testo: string, href: string): boolean {
  if (!testo) return false
  return href === testo || href === `http://${testo}` || href === `https://${testo}` || href === `mailto:${testo}`
}

/** The serializer's escapes and entities taken back out of a bare address. */
function senzaEscape(testo: string): string {
  return testo
    .replace(/\\([\\`*_[\]~])/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** The Markdown of the editor with every bare address as it was written (see above). */
export function ripristinaIndirizzi(markdown: string): string {
  if (!markdown.includes(INIZIO_NUDO)) return markdown
  return markdown
    .replace(new RegExp(`${INIZIO_NUDO}([^${FINE_NUDO}]*)${FINE_NUDO}`, 'g'), (_m, indirizzo: string) => senzaEscape(indirizzo))
    .replaceAll(INIZIO_NUDO, '')
    .replaceAll(FINE_NUDO, '')
}

/** The address, when it opens: http or https only. Null for every other scheme, a relative path, a broken one. */
export function hrefApribile(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** What the person wrote in «Modifica»: `https://` added when there is no scheme; null when it is not an http(s) address. */
export function normalizzaHref(scritto: string): string | null {
  const testo = scritto.trim()
  if (!testo || /\s/.test(testo)) return null
  const conSchema = /^[a-z][a-z0-9+.-]*:/i.test(testo) ? testo : `https://${testo.replace(/^\/+/, '')}`
  const apribile = hrefApribile(conSchema)
  // a host with a dot (esempio.it), or localhost: «ciao» alone is not an address
  if (!apribile) return null
  const host = new URL(apribile).hostname
  return host.includes('.') || host === 'localhost' ? conSchema : null
}

/** The address as the popup shows it: without the scheme and «www.», at most `max` characters. */
export function abbreviaHref(href: string, max = 40): string {
  const corto = href.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, '').replace(/^www\./i, '').replace(/\/$/, '')
  const caratteri = [...corto]
  return caratteri.length > max ? `${caratteri.slice(0, max - 1).join('')}…` : corto
}
