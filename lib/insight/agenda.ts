import type { ContestoApp, StatoLeadApp, VoceAgendaApp } from '@/lib/insight/contratti'
import { nomeNormalizzato } from '@/lib/insight/contenuti'
import { chatDellaCall, esitoShowUp } from '@/lib/insight/prompt/dati'
import { scheletriAgenda } from '@/lib/insight/unione'
import type { Enums } from '@/lib/supabase/database.types'

/**
 * The agenda and the show-up of the Insight from the app's calls (1.35.0, D3,
 * CLAUDE.md section 29): yesterday's, today's and tomorrow's calls, read with
 * public.insight_agenda() (service role) and kept in the run's contesto_app.
 * Never notes, amounts, contacts or the closer: the function has no such
 * column, and the rows are read here column by column, so nothing else can
 * slip through.
 *
 * The skeletons the recap shows (AgendaRecap, ShowUpRecap) are scheletriAgenda
 * of unione.ts, the same words everywhere:
 * - yesterday: svolta «presentato», no_show «no-show», programmata «da
 *   verificare» with «Esito non ancora registrato dal closer.», riprogrammata
 *   «da verificare» with «In attesa di conferma.»;
 * - today and tomorrow: never a call waiting for a confirmed date
 *   (riprogrammata) nor a cancelled one; the status Claude writes
 *   (confermata, promemoria da inviare, a rischio) is «a rischio» at least
 *   after a no-show of the same lead, and «da verificare» when the lead's
 *   chat is not there (by handle, or by the one Messenger chat with that
 *   exact name: chatDellaCall); unione.ts applies both.
 *
 * Pure: no I/O.
 */

export { chatDellaCall, esitoShowUp, scheletriAgenda }

const GIORNI = new Set(['ieri', 'oggi', 'domani'])
const STATI_CALL: readonly Enums<'call_status'>[] = ['programmata', 'svolta', 'no_show', 'cancellata', 'riprogrammata']
const ESITI: readonly Enums<'call_outcome'>[] = ['chiusa', 'follow_up', 'persa']
const FONTI: readonly Enums<'lead_source'>[] = ['dm_inbound', 'dm_outbound', 'referral', 'organico', 'ads', 'altro']
const STATI_LEAD: readonly Enums<'lead_status'>[] = ['call_fissata', 'follow_up', 'cliente', 'perso']
const RE_USERNAME = /^[a-z0-9._]{1,30}$/
const NOME_MAX = 120

type Riga = Record<string, unknown>

const testo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const intero = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)

function istante(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function tra<T extends string>(v: unknown, ammessi: readonly T[]): T | null {
  return typeof v === 'string' && (ammessi as readonly string[]).includes(v) ? (v as T) : null
}

function nome(v: unknown): string | null {
  const n = testo(v)
  return n === null ? null : [...n.trim()].slice(0, NOME_MAX).join('')
}

function username(v: unknown): string | null {
  return typeof v === 'string' && RE_USERNAME.test(v) ? v : null
}

/**
 * The rows of insight_agenda() as the run keeps them: only the columns of
 * VoceAgendaApp, each checked; a row without its day, call, time or state is
 * left out.
 */
export function vociAgenda(righe: readonly unknown[] | null | undefined): VoceAgendaApp[] {
  const voci: VoceAgendaApp[] = []
  for (const grezza of righe ?? []) {
    if (!grezza || typeof grezza !== 'object') continue
    const r = grezza as Riga
    const giorno = typeof r.giorno === 'string' && GIORNI.has(r.giorno) ? (r.giorno as VoceAgendaApp['giorno']) : null
    const callId = testo(r.call_id)
    const quando = istante(r.programmata_il)
    const stato = tra(r.stato, STATI_CALL)
    if (!giorno || !callId || !quando || !stato || stato === 'cancellata') continue
    voci.push({
      giorno,
      call_id: callId,
      programmata_il: quando,
      lead_id: testo(r.lead_id) ?? '',
      nome: nome(r.nome),
      username: username(r.username),
      fonte: tra(r.fonte, FONTI),
      stato,
      esito: tra(r.esito, ESITI),
      di_follow_up: r.di_follow_up === true,
      volte_spostata: intero(r.volte_spostata),
      no_show_precedenti: intero(r.no_show_precedenti),
    })
  }
  return voci.sort((a, b) => a.programmata_il.localeCompare(b.programmata_il) || a.call_id.localeCompare(b.call_id))
}

/** The rows of insight_stato_lead() as the run keeps them: only the columns of StatoLeadApp. */
export function statiLead(righe: readonly unknown[] | null | undefined): StatoLeadApp[] {
  const stati: StatoLeadApp[] = []
  for (const grezza of righe ?? []) {
    if (!grezza || typeof grezza !== 'object') continue
    const r = grezza as Riga
    const chiave = testo(r.chiave)
    const per = r.per === 'username' || r.per === 'nome' ? r.per : null
    if (!chiave || !per) continue
    stati.push({
      chiave,
      per,
      stato_lead: tra(r.stato_lead, STATI_LEAD),
      fonte: tra(r.fonte, FONTI),
      prossima_call_il: istante(r.prossima_call_il),
      prossima_call_stato: tra(r.prossima_call_stato, STATI_CALL),
      ultimo_esito: tra(r.ultimo_esito, ESITI),
      no_show_precedenti: intero(r.no_show_precedenti),
      cliente: r.cliente === true,
      ha_call: r.ha_call === true,
    })
  }
  return stati
}

/** contesto_app as stored and read back: never anything but its two lists. */
export function contestoApp(valore: unknown): ContestoApp | null {
  if (!valore || typeof valore !== 'object') return null
  const v = valore as { agenda?: unknown; stato_lead?: unknown }
  if (!Array.isArray(v.agenda) || !Array.isArray(v.stato_lead)) return null
  return { agenda: vociAgenda(v.agenda), stato_lead: statiLead(v.stato_lead) }
}

/**
 * The keys insight_stato_lead() is asked for: the Instagram handles of the
 * chats and the Messenger names (normalized as the function does), distinct.
 */
export function chiaviStatoLead(chat: readonly { canale: string; username: string | null; nome: string | null }[]): {
  username: string[]
  nomi: string[]
} {
  const username = new Set<string>()
  const nomi = new Set<string>()
  for (const c of chat) {
    if (c.canale === 'instagram' && c.username) username.add(c.username)
    if (c.canale === 'messenger') {
      const n = nomeNormalizzato(c.nome)
      if (n) nomi.add(n)
    }
  }
  return { username: [...username].sort(), nomi: [...nomi].sort() }
}

