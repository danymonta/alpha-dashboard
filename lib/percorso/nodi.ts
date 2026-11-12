/**
 * The 7 nodes of the client's timeline (release B1a, docs/onboarding/rilascio-b.md,
 * «Interfaccia del cliente»). The database has the order and the key of each node
 * (onboarding_passi_def.nodo, percorso_cliente().nodi); here only their words. A node that
 * is not here keeps its key as the label, so a new flow never breaks the page.
 */
export const CHIAVI_NODI = [
  'benvenuto',
  'questionario',
  'call_prenotata',
  'community',
  'call_onboarding',
  'settimana_test',
  'inizio_percorso',
] as const

export type ChiaveNodo = (typeof CHIAVI_NODI)[number]

export const ETICHETTE_NODI: Record<ChiaveNodo, { breve: string; lunga: string }> = {
  benvenuto: { breve: 'Benvenuto', lunga: 'Benvenuto e regole del percorso' },
  questionario: { breve: 'Questionario', lunga: 'Il questionario iniziale' },
  call_prenotata: { breve: 'Call prenotata', lunga: 'La tua call di onboarding prenotata' },
  community: { breve: 'Community', lunga: 'Entra nella community e presentati' },
  call_onboarding: { breve: 'Call di onboarding', lunga: 'La call di onboarding con il tuo coach' },
  settimana_test: { breve: 'Settimana test', lunga: 'La settimana test' },
  inizio_percorso: { breve: 'Inizio percorso', lunga: 'Il tuo percorso inizia' },
}

export function eChiaveNodo(chiave: unknown): chiave is ChiaveNodo {
  return typeof chiave === 'string' && (CHIAVI_NODI as readonly string[]).includes(chiave)
}

export function etichettaNodo(chiave: string, forma: 'breve' | 'lunga' = 'breve'): string {
  return eChiaveNodo(chiave) ? ETICHETTE_NODI[chiave][forma] : chiave
}

export type StatoNodo = 'completato' | 'attuale' | 'futuro'

/** The accessible name of a node button: «Questionario, completato», «… attuale», «… si sblocca dopo Benvenuto». */
export function nomeAccessibileNodo(chiave: string, stato: StatoNodo, precedente: string | null): string {
  const etichetta = etichettaNodo(chiave)
  if (stato === 'completato') return `${etichetta}, completato`
  if (stato === 'attuale') return `${etichetta}, attuale`
  return precedente ? `${etichetta}, si sblocca dopo ${etichettaNodo(precedente)}` : `${etichetta}, da sbloccare`
}
