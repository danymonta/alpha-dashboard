/**
 * The link of a Fathom recording pasted by the closer (1.37.0): cleaned, and
 * reduced to a key that two forms of the same link share. Pure.
 *
 * Forms (Fathom shares): https://fathom.video/calls/<digits>,
 * https://fathom.video/share/<token> and /share/{h,i,p,u}/<token>, the same on
 * fathom.ai, with or without www. The number of /calls/<n> is NOT the id of the
 * recording on the API: the match is always «the same link, or nothing», never
 * an id taken from the address.
 */
export type LinkNormalizzato =
  | { ok: true; tipo: 'calls' | 'share' | 'altro'; canonico: string; chiave: string; fathom: boolean }
  | { ok: false; errore: string }

export const LINK_INCOMPLETO = 'Incolla il link completo, con https://'

const RE_CALLS = /^\/calls\/(\d+)$/
const RE_SHARE = /^\/share\/(?:[hipu]\/)?([A-Za-z0-9_-]{3,200})$/

export function normalizzaLink(testo: string): LinkNormalizzato {
  let t = testo.trim().replace(/^["'“”‘’<(]+/, '').replace(/["'“”‘’>),.;]+$/, '').trim()
  if (t === '' || /\s/.test(t) || /^javascript:/i.test(t)) return { ok: false, errore: LINK_INCOMPLETO }
  if (/^http:\/\//i.test(t)) t = 'https://' + t.slice('http://'.length)
  if (!/^https:\/\//i.test(t)) return { ok: false, errore: LINK_INCOMPLETO }
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return { ok: false, errore: LINK_INCOMPLETO }
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const percorso = url.pathname.replace(/\/+$/, '')
  const fathom = host === 'fathom.video' || host === 'fathom.ai'
  if (fathom) {
    const calls = RE_CALLS.exec(percorso)
    if (calls) return { ok: true, tipo: 'calls', canonico: `https://${host}/calls/${calls[1]}`, chiave: `calls:${calls[1]}`, fathom }
    const share = RE_SHARE.exec(percorso)
    if (share) {
      return { ok: true, tipo: 'share', canonico: `https://${host}${percorso}`, chiave: `share:${share[1]}`, fathom }
    }
  }
  const canonico = `https://${host}${percorso}`
  return { ok: true, tipo: 'altro', canonico, chiave: `url:${canonico}`, fathom }
}

/** Whether two links are the same recording (equal keys), whatever their form. */
export function stessoLink(a: string, b: string): boolean {
  const x = normalizzaLink(a)
  const y = normalizzaLink(b)
  return x.ok && y.ok && x.chiave === y.chiave
}

/** The key as pasted from Fathom's panel: «FATHOM_API_KEY=…», «X-Api-Key: …», quotes and spaces off. */
export function pulisciChiave(incollato: string): string {
  return incollato
    .trim()
    .replace(/^(?:export\s+)?(?:FATHOM_API_KEY\s*=|X-Api-Key\s*:)\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()
}
