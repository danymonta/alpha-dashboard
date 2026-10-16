/**
 * The links of the Insight page. The recap is written by code from what a
 * model read in untrusted DMs (CLAUDE.md section 29): a link is built only from
 * a username that passes the same check as insight_chat and instagram_esclusi,
 * and a URL of the document is followed only on the one host it belongs to
 * (urlSicuro). Anything else gets no link, never a guess.
 */

/** An Instagram username as stored: the check of insight_chat.username and instagram_esclusi. */
export const RE_USERNAME_INSTAGRAM = /^[a-z0-9._]{1,30}$/

/** A media shortcode: the check of insight_chat.origine_shortcode. */
const RE_SHORTCODE = /^[A-Za-z0-9_-]{5,40}$/

/** The username, lowercase, when it is one; null otherwise. */
export function usernameValido(username: string | null | undefined): string | null {
  const u = username?.trim().toLowerCase().replace(/^@/, '') ?? ''
  return RE_USERNAME_INSTAGRAM.test(u) ? u : null
}

/** The lead's profile (the artifact's `https://instagram.com/<user>`). */
export function linkProfiloInstagram(username: string | null | undefined): string | null {
  const u = usernameValido(username)
  return u ? `https://www.instagram.com/${u}/` : null
}

/** «Apri la chat su Instagram»: the DM thread with the lead, in the app on a phone. */
export function linkChatInstagram(username: string | null | undefined): string | null {
  const u = usernameValido(username)
  return u ? `https://ig.me/m/${u}` : null
}

/** «Apri la inbox Messenger»: Meta's inbox of the Page (a Messenger chat has no address of its own). */
export const LINK_INBOX_MESSENGER = 'https://business.facebook.com/latest/inbox/messenger'

const HOST_SICURI = {
  instagram: new Set(['www.instagram.com', 'instagram.com']),
  meet: new Set(['meet.google.com']),
} as const

/**
 * A URL of the recap, only on its own host over https (a post's permalink on
 * instagram.com, a call on meet.google.com), without credentials; otherwise
 * null and the page shows no link.
 */
export function urlSicuro(url: string | null | undefined, tipo: keyof typeof HOST_SICURI): string | null {
  if (!url) return null
  let letto: URL
  try {
    letto = new URL(url.trim())
  } catch {
    return null
  }
  if (letto.protocol !== 'https:' || letto.username || letto.password || letto.port) return null
  return HOST_SICURI[tipo].has(letto.hostname.toLowerCase()) ? letto.href : null
}

/** A post by its permalink, or by its shortcode when the permalink is missing (Instagram redirects /p/ to a reel too). */
export function linkPost(permalink: string | null | undefined, shortcode?: string | null): string | null {
  const sicuro = urlSicuro(permalink, 'instagram')
  if (sicuro) return sicuro
  return shortcode && RE_SHORTCODE.test(shortcode) ? `https://www.instagram.com/p/${shortcode}/` : null
}

/** «Nel calendario: …» (admin): the content in its panel, in the Marketing area. */
export function linkContenutoCalendario(id: string): string {
  return `/marketing/contenuti?contenuto=${encodeURIComponent(id)}`
}

/** «Gestisci le chat escluse» (admin): the anchor of Impostazioni › Instagram e Messenger. */
export const LINK_CHAT_ESCLUSE = '/settings/instagram#chat-escluse'

/** Impostazioni › Chiavi e collegamenti (1.38.0), where the Instagram token is pasted and regenerated. */
export const LINK_CHIAVE_INSTAGRAM = '/settings/chiavi#instagram'

/** The same for the Page token of Messenger. */
export const LINK_CHIAVE_MESSENGER = '/settings/chiavi#messenger'
