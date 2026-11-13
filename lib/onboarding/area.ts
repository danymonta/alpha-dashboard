import type { Lingua } from '@/lib/i18n/lingua'

/**
 * What the database says is missing before opening («Prima di aprire l'area clienti: …»):
 * the list as it came, one line per problem, in the page's language.
 */
export function problemiApertura(messaggio: string, lingua: Lingua): string[] | null {
  const m = /^Prima di aprire l['’]area clienti: (.+)\.$/.exec(messaggio)
  if (!m) return null
  const parti = m[1].split(', ').map((p) => p.trim()).filter(Boolean)
  return traduciProblemi(parti, lingua)
}

/** The problems one per line (the database's Italian words) in the page's language. */
export function traduciProblemi(parti: readonly string[], lingua: Lingua): string[] {
  if (lingua === 'it') return [...parti]
  return parti.map((p) => {
    let x: RegExpExecArray | null
    if ((x = /^(\d+) contenut[oi] ha(?:nno)? ancora «\[Da scrivere»$/.exec(p))) {
      return `${x[1]} ${x[1] === '1' ? 'content still has' : 'contents still have'} «[Da scrivere»`
    }
    if ((x = /^(\d+) video ha(?:nno)? ancora l['’]id segnaposto$/.exec(p))) {
      return `${x[1]} ${x[1] === '1' ? 'video still has' : 'videos still have'} the placeholder id`
    }
    if (/link della community/.test(p)) return 'the community link is missing'
    if (/pagina di prenotazione/.test(p)) return 'the booking page address is missing'
    return p
  })
}
