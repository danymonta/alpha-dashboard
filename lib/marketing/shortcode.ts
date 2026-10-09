/**
 * The shortcode of a published Instagram post, from the URL property of a
 * content: the twin of the generated column marketing_contenuti.instagram_shortcode
 * (20261009120100_contenuti_marketing.sql), same regex, same cases in Vitest
 * (tests/marketing-shortcode.test.ts) and pgTAP (67_contenuti_marketing.sql).
 *
 * It is the one join key between a calendar row, an Insight "Contenuto
 * pubblicato" (its permalink, 1.33.0) and an Instagram media (1.34.0): they
 * import this, never a regex of their own. Case-sensitive like Postgres.
 *
 * Not a shortcode: /share/ links (a redirect token, not the post) and the
 * /reels/audio/ pages. Inspiration is never read: it is other creators' reels.
 */
export const RE_SHORTCODE =
  /^https?:\/\/(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?!share\/)(?:[A-Za-z0-9._]+\/)?(?:p|reels?|tv)\/(?!audio\/)([A-Za-z0-9_-]{5,40})/

export function shortcodeInstagram(url: string | null | undefined): string | null {
  if (!url) return null
  return RE_SHORTCODE.exec(url)?.[1] ?? null
}

const RE_CONDIVISIONE = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/share\//i

/**
 * An instagram.com/share/… link: what "Copia link" of the app gives. It is a
 * redirect, not the post, so it has no shortcode: the form explains how to
 * copy the post's own address.
 */
export function linkDiCondivisione(url: string): boolean {
  return RE_CONDIVISIONE.test(url.trim())
}
