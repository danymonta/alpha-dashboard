import type { LeadRecap, NonLeadRecap } from '@/lib/insight/recap'

/**
 * The five numbers of the Insight that filter the chats, as the artifact
 * "Recap DM Alpha" has them, with the three counts Dany had corrected
 * (08/10/2026, spec 1.35.0 D8 and D9):
 * - «Attendono risposta» (and the «aspetta da» pill, lib/insight/attesa.ts)
 *   only when the last message is the lead's, the stage not perso or uscita:
 *   the artifact read «attende» in the status, which the model also wrote
 *   when *we* were waiting;
 * - «Chiusi / persi» also counts «uscita» (on 08/10 the tile said 0 while the
 *   recap's own summary said 7, all «uscita»).
 * «Chat attive» counts the leads and the chats that are not leads, as the
 * artifact; the others count the leads only.
 */

export const CHIAVI_FILTRO = ['tutte', 'target', 'attesa', 'call', 'persi'] as const
export type ChiaveFiltro = (typeof CHIAVI_FILTRO)[number]

type LeadFiltrabile = Pick<LeadRecap, 'target' | 'stage' | 'last_from'>

const fase = (stage: string) => stage.trim().toLowerCase()

/** The one rule of D8: the tile, the pill and summary.awaiting_reply. */
export function attendeRisposta(lead: Pick<LeadRecap, 'stage' | 'last_from'>): boolean {
  return lead.last_from === 'lead' && !['perso', 'uscita'].includes(fase(lead.stage))
}

export type Filtro = {
  /** the tile's label */
  etichetta: string
  /** the filtered section's title */
  titolo: string
  /** the alert tile: its number is red (with an icon) above 0 */
  allarme: boolean
  test: (lead: LeadFiltrabile) => boolean
}

export const FILTRI: Record<ChiaveFiltro, Filtro> = {
  tutte: { etichetta: 'Chat attive', titolo: 'Tutte le chat attive', allarme: false, test: () => true },
  target: { etichetta: 'Lead in target', titolo: 'Lead in target', allarme: false, test: (l) => l.target === 'si' },
  attesa: { etichetta: 'Attendono risposta', titolo: 'Attendono risposta', allarme: true, test: attendeRisposta },
  call: { etichetta: 'Call prenotate', titolo: 'Call prenotate', allarme: false, test: (l) => /call prenotata/i.test(l.stage) },
  persi: { etichetta: 'Chiusi / persi', titolo: 'Chiusi / persi', allarme: false, test: (l) => /perso|chiuso|uscita/i.test(l.stage) },
}

export function eFiltro(valore: unknown): valore is ChiaveFiltro {
  return typeof valore === 'string' && (CHIAVI_FILTRO as readonly string[]).includes(valore)
}

/** The tile's number: «Chat attive» = leads + non-leads, the others the matching leads. */
export function contaFiltro(chiave: ChiaveFiltro, leads: readonly LeadFiltrabile[], nonLeads: readonly NonLeadRecap[]): number {
  if (chiave === 'tutte') return leads.length + nonLeads.length
  return leads.filter(FILTRI[chiave].test).length
}

/** The leads a filter shows (the non-leads have their own box under «Chat attive»). */
export function applicaFiltro<T extends LeadFiltrabile>(chiave: ChiaveFiltro, leads: readonly T[]): T[] {
  return leads.filter(FILTRI[chiave].test)
}
