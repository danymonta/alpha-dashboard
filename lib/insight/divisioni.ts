import { attendeRisposta } from '@/lib/insight/filtri'
import { ORDINE_PRIORITA } from '@/lib/insight/priorita'
import type { LeadRecap } from '@/lib/insight/recap'

/**
 * The divisions of the Insight's chats (Dany, 27/10/2026: «una divisione tra i
 * messaggi a cui dobbiamo rispondere, quelli che richiedono followup e quelli
 * invece in attesa… sempre classificati con importanza e urgenza in base a
 * quanto siamo vicini a prendere la call»). Computed by code from what the
 * recap already has, never by Claude:
 * - «Da rispondere»: the lead wrote last and is waiting (the one rule of D8,
 *   attendeRisposta: the «Attendono risposta» tile counts the same leads);
 * - «Follow-up»: we wrote last and there is a message to send now (the setter
 *   instructions leave suggested_message empty when nothing is to be sent),
 *   plus every chat of «Da riattivare»;
 * - «In attesa»: we wrote last and nothing is to be sent now, the lead has to
 *   answer.
 * Closed and lost chats (perso, uscita) are in none of the three.
 *
 * Inside a division the chats are grouped by how close the call is (the
 * importance: the stage of the flow, lib/insight/schema.ts FASI; a lead off
 * target goes to the last group), each group by how deep in the flow, then
 * the priority Claude gave, then how long the lead has been waiting (the
 * urgency, the «aspetta da» pill) or silent.
 */

export const CHIAVI_DIVISIONE = ['tutte', 'rispondere', 'follow_up', 'attesa'] as const
export type ChiaveDivisione = (typeof CHIAVI_DIVISIONE)[number]
export type Divisione = Exclude<ChiaveDivisione, 'tutte'>

export const DIVISIONI: Record<ChiaveDivisione, { etichetta: string; titolo: string; descrizione: string }> = {
  tutte: { etichetta: 'Tutte', titolo: 'Chat per priorità', descrizione: 'Tutte le chat, per priorità.' },
  rispondere: {
    etichetta: 'Da rispondere',
    titolo: 'Da rispondere',
    descrizione: 'Il lead ha scritto per ultimo e aspetta una risposta.',
  },
  follow_up: {
    etichetta: 'Follow-up',
    titolo: 'Follow-up',
    descrizione: 'Abbiamo scritto noi per ultimi e c’è un messaggio da mandare adesso, o la chat è da riattivare.',
  },
  attesa: {
    etichetta: 'In attesa',
    titolo: 'In attesa',
    descrizione: 'Abbiamo scritto noi per ultimi: ora tocca al lead, niente da mandare adesso.',
  },
}

export const LIVELLI_VICINANZA = ['vicina', 'prenotata', 'qualifica', 'apertura', 'lontana'] as const
export type LivelloVicinanza = (typeof LIVELLI_VICINANZA)[number]

export const VICINANZA: Record<LivelloVicinanza, { titolo: string; descrizione: string }> = {
  vicina: { titolo: 'A un passo dalla call', descrizione: 'Call proposta o Calendly inviato' },
  prenotata: { titolo: 'Call prenotata', descrizione: 'Da portare alla call' },
  qualifica: { titolo: 'In qualifica', descrizione: 'Obiettivi, difficoltà, routine, urgenza' },
  apertura: { titolo: 'Primi messaggi', descrizione: 'Aggancio e valore' },
  lontana: { titolo: 'Nurture o fuori target', descrizione: 'Lontani dalla call' },
}

/** The flow's stages, the closest to the call first (deeper in the flow = closer). */
const AVANZAMENTO: readonly string[] = [
  'calendly inviato',
  'proposta call',
  'call prenotata',
  'urgenza',
  'lavoro',
  'routine',
  'difficoltà',
  'obiettivi',
  'età e provenienza',
  'pitch',
  'check',
  'valore',
  'mini-audit',
  'messaggio 2',
  'messaggio 1',
  'nurture',
]

const LIVELLO_FASE: Record<string, LivelloVicinanza> = {
  'calendly inviato': 'vicina',
  'proposta call': 'vicina',
  'call prenotata': 'prenotata',
  urgenza: 'qualifica',
  lavoro: 'qualifica',
  routine: 'qualifica',
  difficoltà: 'qualifica',
  obiettivi: 'qualifica',
  'età e provenienza': 'qualifica',
  pitch: 'qualifica',
  check: 'apertura',
  valore: 'apertura',
  'mini-audit': 'apertura',
  'messaggio 2': 'apertura',
  'messaggio 1': 'apertura',
}

const fase = (stage: string) => stage.trim().toLowerCase()

export function chiusa(lead: Pick<LeadRecap, 'stage'>): boolean {
  return ['perso', 'uscita'].includes(fase(lead.stage))
}

type LeadDivisibile = Pick<LeadRecap, 'stage' | 'last_from' | 'suggested_message' | 'target' | 'priority'> & {
  days_silent?: number
}

/** The division of a chat, or null for a closed or lost one. */
export function divisioneDi(lead: LeadDivisibile): Divisione | null {
  if (chiusa(lead)) return null
  if (attendeRisposta(lead)) return 'rispondere'
  if (lead.days_silent !== undefined) return 'follow_up'
  return lead.suggested_message.trim() ? 'follow_up' : 'attesa'
}

/** How close the call is: from the stage; a lead off target is always far. */
export function vicinanzaDi(lead: Pick<LeadRecap, 'stage' | 'target'>): LivelloVicinanza {
  if (lead.target === 'no') return 'lontana'
  return LIVELLO_FASE[fase(lead.stage)] ?? 'lontana'
}

const avanzamento = (stage: string) => {
  const i = AVANZAMENTO.indexOf(fase(stage))
  return i < 0 ? AVANZAMENTO.length : i
}
const ORDINE_TARGET: Record<string, number> = { si: 0, 'da verificare': 1, no: 2 }

/**
 * The chats of a division, merged from the leads and «Da riattivare» (a chat
 * once, by conversation), grouped by how close the call is; each group by the
 * stage, the target, Claude's priority, then the urgency (`urgenza`: hours of
 * waiting or days of silence, the highest first; null after).
 */
export function raggruppaDivisione<T extends LeadDivisibile & { conversation_id: string }>(
  divisione: Divisione,
  voci: readonly T[],
  urgenza: (lead: T) => number | null,
): { livello: LivelloVicinanza; voci: T[] }[] {
  const viste = new Set<string>()
  const della = voci.filter((l) => {
    if (divisioneDi(l) !== divisione) return false
    if (l.conversation_id && viste.has(l.conversation_id)) return false
    if (l.conversation_id) viste.add(l.conversation_id)
    return true
  })
  return LIVELLI_VICINANZA.flatMap((livello) => {
    const delLivello = della
      .map((l, i) => ({ l, i, u: urgenza(l) }))
      .filter(({ l }) => vicinanzaDi(l) === livello)
      .sort(
        (a, b) =>
          avanzamento(a.l.stage) - avanzamento(b.l.stage) ||
          (ORDINE_TARGET[a.l.target] ?? 3) - (ORDINE_TARGET[b.l.target] ?? 3) ||
          (ORDINE_PRIORITA[a.l.priority] ?? 3) - (ORDINE_PRIORITA[b.l.priority] ?? 3) ||
          (b.u ?? -1) - (a.u ?? -1) ||
          a.i - b.i,
      )
      .map(({ l }) => l)
    return delLivello.length ? [{ livello, voci: delLivello }] : []
  })
}

/** How many chats each division has (a chat once, by conversation). */
export function contaDivisioni(
  leads: readonly (LeadDivisibile & { conversation_id: string })[],
  riattivare: readonly (LeadDivisibile & { conversation_id: string })[],
): Record<ChiaveDivisione, number> {
  const conti: Record<ChiaveDivisione, number> = { tutte: 0, rispondere: 0, follow_up: 0, attesa: 0 }
  const viste = new Set<string>()
  for (const l of [...leads, ...riattivare]) {
    if (l.conversation_id) {
      if (viste.has(l.conversation_id)) continue
      viste.add(l.conversation_id)
    }
    conti.tutte++
    const d = divisioneDi(l)
    if (d) conti[d]++
  }
  return conti
}
