import type { LeadRecap, NonLeadRecap } from '@/lib/insight/recap'

/**
 * «Cerca una persona» in the Insight (1.71.0, Dany, 07/11/2026: «posso cercare il
 * nome della persona con cui chattiamo»): the chats of the recap on screen whose
 * name or username contains what was typed. Only the recap the page already has:
 * no query, no new data, nothing saved.
 *
 * The match ignores case, accents, a leading «@» and the dots, underscores and
 * spaces of a username: «mario rossi», «Màrio» and «@mario_rossi» all find
 * «mario_rossi · Mario Rossi». Every word typed must be there.
 */

/** Lower case, no accents, no «@», «.» «_» «-» as spaces, spaces collapsed. */
export function normalizzaRicerca(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/@/g, ' ')
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Cercabile = { username?: string; name?: string }

/** The words of the query, none empty; [] means «no search». */
export function paroleRicerca(query: string): string[] {
  const n = normalizzaRicerca(query)
  return n ? n.split(' ') : []
}

/** True when every word typed is in the name or the username (also glued: «mariorossi»). */
export function corrisponde(voce: Cercabile, parole: readonly string[]): boolean {
  if (!parole.length) return false
  const nome = normalizzaRicerca(voce.name ?? '')
  const utente = normalizzaRicerca(voce.username ?? '')
  const testo = `${nome} ${utente}`
  const attaccato = `${nome.replace(/ /g, '')} ${utente.replace(/ /g, '')}`
  return parole.every((p) => testo.includes(p) || attaccato.includes(p))
}

export type RisultatoRicerca<L> = { leads: L[]; nonLeads: NonLeadRecap[] }

/**
 * The leads (the main list first, then «Da riattivare»: one card per chat, by
 * conversation_id) and the chats that are not leads matching the query.
 */
export function cercaChat<L extends Pick<LeadRecap, 'conversation_id' | 'username' | 'name'>>(
  query: string,
  gruppi: readonly (readonly L[])[],
  nonLeads: readonly NonLeadRecap[],
): RisultatoRicerca<L> {
  const parole = paroleRicerca(query)
  if (!parole.length) return { leads: [], nonLeads: [] }
  const viste = new Set<string>()
  const leads: L[] = []
  for (const gruppo of gruppi) {
    for (const lead of gruppo) {
      if (viste.has(lead.conversation_id) || !corrisponde(lead, parole)) continue
      viste.add(lead.conversation_id)
      leads.push(lead)
    }
  }
  return { leads, nonLeads: nonLeads.filter((n) => corrisponde(n, parole)) }
}
