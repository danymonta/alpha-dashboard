/**
 * The two pages «Pubblicati» replaces (25/10/2026) keep their old addresses as permanent
 * redirects (a link in an email, a bookmark, a call's «Dalle registrazioni»): /marketing/instagram
 * (Post di Instagram) and /marketing/analisi (Analisi dei reel). What has a meaning on the
 * new page goes along, nothing else:
 *   - ?reel=<media id>            the reel's panel (and ?scheda=, the tab of the panel);
 *   - ?contenuto=<uuid>           the content's panel;
 *   - ?periodo=30|90|180          the period;
 *   - ?verdetto=cambiare          -> ?cambiare=1 (the reels that say «Cambiare»);
 *   - ?senza_contenuto=1          -> ?piano=fuori (the posts not in the Piano editoriale).
 * The verdict «Spingere» or «Mantenere», the score band and the order have no filter on the
 * new page: they are left out, and the page opens on every post.
 *
 * Pure and self-contained (no imports): the proxy runs it before anything is rendered, so the
 * answer is a real 308 and the address of a person who is not logged in goes to the login and
 * back to the new page. Tested in Vitest.
 */

export const PERCORSI_VECCHI = ['/marketing/instagram', '/marketing/analisi'] as const

const PERCORSO_NUOVO = '/marketing/pubblicati'
const RE_MEDIA_ID = /^[0-9]{1,30}$/
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERIODI = ['90', '180']
const SCHEDE = ['rifare', 'perche', 'numeri']

type Parametri = URLSearchParams | Record<string, string | string[] | undefined>

function leggi(sp: Parametri, chiave: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(chiave) ?? undefined
  const v = sp[chiave]
  return Array.isArray(v) ? v[0] : v
}

/** Whether a path is one of the two old pages (a trailing slash too). */
export function eVecchiaPagina(percorso: string): boolean {
  const pulito = percorso.length > 1 ? percorso.replace(/\/+$/, '') : percorso
  return (PERCORSI_VECCHI as readonly string[]).includes(pulito)
}

/** The address of Pubblicati for a request to an old page, with the parameters that still mean something. */
export function indirizzoDaVecchiaPagina(sp: Parametri): string {
  const p = new URLSearchParams()
  const periodo = leggi(sp, 'periodo')
  if (periodo && PERIODI.includes(periodo)) p.set('periodo', periodo)
  if (leggi(sp, 'verdetto') === 'cambiare') p.set('cambiare', '1')
  if (leggi(sp, 'senza_contenuto') === '1') p.set('piano', 'fuori')
  const reel = leggi(sp, 'reel')
  if (reel && RE_MEDIA_ID.test(reel)) {
    p.set('reel', reel)
    const scheda = leggi(sp, 'scheda')
    if (scheda && SCHEDE.includes(scheda)) p.set('scheda', scheda)
  }
  const contenuto = leggi(sp, 'contenuto')
  if (contenuto && RE_UUID.test(contenuto)) p.set('contenuto', contenuto)
  const testo = p.toString()
  return testo ? `${PERCORSO_NUOVO}?${testo}` : PERCORSO_NUOVO
}
