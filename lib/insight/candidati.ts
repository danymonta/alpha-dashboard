import { statoLeadDi, tipoDellaScheda, ultimaSchedaPerChat } from '@/lib/insight/contenuti'
import type { CandidatoRiattivazione, ChatSalvata, SchedaSalvata, StatoLeadApp } from '@/lib/insight/contratti'
import type { PassoRiattivazione, TargetLead } from '@/lib/insight/recap'
import { giornoRoma } from '@/lib/setting/conteggio-dm'

/**
 * The leads to reactivate (1.35.0, CLAUDE.md section 29, the artifact's «Da
 * riattivare»): from the history of the last 14 days, the chats that stopped
 * (whoever wrote last) and are not among today's chats. Code decides who is a
 * candidate, how many days of silence and the step; Claude writes the message
 * (riattivazione block).
 *
 * A candidate is a chat of insight_chat whose last message is 1 to 14 Rome
 * days old, not in today's set, never a non-lead or an under-14 chat (D25).
 * Never: a lead whose latest card says «perso» or not to be contacted
 * (no_contatto), a client of the app (`cliente`, D15: code only), a lead the
 * app marks «perso». The ones in target first, then «da verificare», then
 * «no»; inside each, the longest silent first; at most 20.
 *
 * The step follows the routine's rule: 3 from 10 days of silence (an elegant
 * exit), 2 from 5 (a message of value), otherwise 1 (the setter's FOLLOW-UP
 * rules). Days are Rome calendar days, so a change of daylight saving time
 * never moves a chat to another step.
 *
 * Pure: no I/O, no clock but the day passed in.
 */

export const CANDIDATI_MAX = 20
export const GIORNI_SILENZIO_MIN = 1
export const GIORNI_SILENZIO_MAX = 14

const GIORNO_MS = 86_400_000

/** Calendar days between two Rome days ('YYYY-MM-DD'): to - from. */
export function giorniTra(dal: string, al: string): number {
  return Math.round((Date.parse(`${al}T12:00:00Z`) - Date.parse(`${dal}T12:00:00Z`)) / GIORNO_MS)
}

/** Rome days since a chat's last message (0 today); null without a valid instant. */
export function giorniDiSilenzio(ultimoIl: string | null, oggi: string): number | null {
  const giorno = ultimoIl ? giornoRoma(ultimoIl) : null
  return giorno ? giorniTra(giorno, oggi) : null
}

/** 3 from 10 days, 2 from 5, otherwise 1. */
export function passoDiSilenzio(giorni: number): PassoRiattivazione {
  if (giorni >= 10) return 3
  if (giorni >= 5) return 2
  return 1
}

type DatiCard = { stage?: unknown; no_contatto?: unknown; target?: unknown }

function datiDi(s: SchedaSalvata | undefined): DatiCard {
  return s && s.dati !== null && typeof s.dati === 'object' ? (s.dati as DatiCard) : {}
}

const ORDINE_TARGET: Record<TargetLead, number> = { si: 0, 'da verificare': 1, no: 2 }

function target(valore: unknown): TargetLead {
  return valore === 'si' || valore === 'no' || valore === 'da verificare' ? valore : 'da verificare'
}

/**
 * The candidates of one channel (or both: the keys are the conversations).
 * `schede` are the cards of the earlier runs, oldest first (the latest one
 * of each chat counts, as ultimaSchedaPerChat reads it); `oggi` the Rome day
 * of the run; `delGiorno` the conversation ids of today's set.
 */
export function candidatiRiattivazione(op: {
  chat: readonly ChatSalvata[]
  delGiorno: ReadonlySet<string>
  schede: readonly SchedaSalvata[]
  statoLead: readonly StatoLeadApp[]
  oggi: string
}): CandidatoRiattivazione[] {
  const ultime = ultimaSchedaPerChat(op.schede)
  // Claude's «do not reactivate» (a client, a request not to be contacted) on
  // the latest reactivation card of an unchanged chat stands
  const nonRiattivare = new Set<string>()
  for (const s of op.schede) {
    if (s.tipo !== 'riattivazione') continue
    if ((s.dati as { tipo?: unknown } | null)?.tipo === 'non_lead') nonRiattivare.add(s.chiave)
    else nonRiattivare.delete(s.chiave)
  }
  const scelti: (CandidatoRiattivazione & { target: TargetLead })[] = []
  for (const c of op.chat) {
    if (c.non_lead || c.minore_14 || op.delGiorno.has(c.conversazione_id)) continue
    const giorni = giorniDiSilenzio(c.ultimo_il, op.oggi)
    if (giorni === null || giorni < GIORNI_SILENZIO_MIN || giorni > GIORNI_SILENZIO_MAX) continue
    if (nonRiattivare.has(c.conversazione_id)) continue
    const scheda = ultime.get(c.conversazione_id)
    if (scheda && tipoDellaScheda(scheda) === 'non_lead') continue
    const d = datiDi(scheda)
    if (typeof d.stage === 'string' && d.stage.trim().toLowerCase() === 'perso') continue
    if (d.no_contatto === true) continue
    const app = statoLeadDi(c, op.statoLead)
    if (app?.cliente || app?.stato_lead === 'perso') continue
    scelti.push({
      conversazione_id: c.conversazione_id,
      giorni_silenzio: giorni,
      passo: passoDiSilenzio(giorni),
      target: scheda ? target(d.target) : target(c.ultimo_target),
    })
  }
  return scelti
    .sort(
      (a, b) =>
        ORDINE_TARGET[a.target] - ORDINE_TARGET[b.target] ||
        b.giorni_silenzio - a.giorni_silenzio ||
        a.conversazione_id.localeCompare(b.conversazione_id),
    )
    .slice(0, CANDIDATI_MAX)
    .map(({ conversazione_id, giorni_silenzio, passo }) => ({ conversazione_id, giorni_silenzio, passo }))
}
