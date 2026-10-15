import { passoDiRiattivazione, type PassoRiattivazione, type PrioritaLead } from '@/lib/insight/recap'

/**
 * The groups of the Insight's chats, as the artifact "Recap DM Alpha" has
 * them: priority alta, media, bassa (each sorted by how long the lead has been
 * waiting, the longest first, the leads that are not waiting after them in
 * their order), and «Da riattivare» by step (each sorted by days of silence,
 * the longest first).
 */

export type GruppoPriorita = { chiave: PrioritaLead; titolo: string; descrizione: string }

export const GRUPPI_PRIORITA: readonly GruppoPriorita[] = [
  { chiave: 'alta', titolo: 'Priorità alta', descrizione: 'Da gestire oggi' },
  { chiave: 'media', titolo: 'Priorità media', descrizione: 'Da portare avanti' },
  { chiave: 'bassa', titolo: 'Priorità bassa', descrizione: 'Nurturing, fuori target o chiuse' },
]

export const ORDINE_PRIORITA: Record<PrioritaLead, number> = { alta: 0, media: 1, bassa: 2 }

/** The leads by priority (stable: within a priority the recap's own order). */
export function ordinaPerPriorita<T extends { priority: PrioritaLead }>(leads: readonly T[]): T[] {
  return leads
    .map((l, i) => [l, i] as const)
    .sort(([a, i], [b, j]) => (ORDINE_PRIORITA[a.priority] ?? 3) - (ORDINE_PRIORITA[b.priority] ?? 3) || i - j)
    .map(([l]) => l)
}

/**
 * The non-empty priority groups, each sorted by waiting hours (descending);
 * a lead without a wait (`oreAttesa` null) after those with one, in order.
 */
export function raggruppaPerPriorita<T extends { priority: PrioritaLead }>(
  leads: readonly T[],
  oreAttesa: (lead: T) => number | null,
): { gruppo: GruppoPriorita; voci: T[] }[] {
  return GRUPPI_PRIORITA.flatMap((gruppo) => {
    const voci = leads
      .map((l, i) => ({ l, i, ore: l.priority === gruppo.chiave ? oreAttesa(l) : null }))
      .filter(({ l }) => l.priority === gruppo.chiave)
      .sort((a, b) => (b.ore ?? -1) - (a.ore ?? -1) || a.i - b.i)
      .map(({ l }) => l)
    return voci.length ? [{ gruppo, voci }] : []
  })
}

export type GruppoRiattivazione = { passo: PassoRiattivazione; titolo: string; descrizione: string }

export const GRUPPI_RIATTIVAZIONE: readonly GruppoRiattivazione[] = [
  { passo: 1, titolo: 'Fermi da 2 giorni', descrizione: 'Riprendi la conversazione' },
  { passo: 2, titolo: 'Fermi da 5 giorni', descrizione: 'Porta valore' },
  { passo: 3, titolo: 'Fermi da 10 giorni', descrizione: 'Messaggio di chiusura' },
]

/** «Da riattivare»: the non-empty steps, each by days of silence (the longest first, stable). */
export function raggruppaRiattivazione<T extends { step: unknown; days_silent: number }>(
  voci: readonly T[],
): { gruppo: GruppoRiattivazione; voci: T[] }[] {
  return GRUPPI_RIATTIVAZIONE.flatMap((gruppo) => {
    const delPasso = voci
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => passoDiRiattivazione(l.step, l.days_silent) === gruppo.passo)
      .sort((a, b) => (b.l.days_silent || 0) - (a.l.days_silent || 0) || a.i - b.i)
      .map(({ l }) => l)
    return delPasso.length ? [{ gruppo, voci: delPasso }] : []
  })
}
