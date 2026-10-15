import { createHash } from 'node:crypto'

import type { CanaleInsight, ChatPerAnalisi, TipoScheda } from '@/lib/insight/contratti'
import { corpoChat } from '@/lib/insight/prompt/dati'
import { VERSIONE_PROMPT } from '@/lib/insight/prompt'

/**
 * The impronta of a card (1.35.0, CLAUDE.md section 29): what Claude read to
 * write it. A validated card with the same impronta, the same Rome day and
 * channel is copied from an earlier run without a model call (a second
 * «Aggiorna dati» the same day reanalyses only the chats that changed).
 *
 * sha256 of VERSIONE_PROMPT | model | effort | channel | step | what the
 * model reads of the chat (its normalized transcript, its facts with the
 * hours of waiting as a band: <12h, 12-24h, 24-48h, >48h, the call in the
 * agenda). The ICP, the sources and the schemas change only with
 * VERSIONE_PROMPT, so a new prompt reanalyses everything.
 *
 * A placeholder card (analysis failed) gets an impronta that no chat can
 * have: it is never copied, the next run tries again.
 */

export function sha256(testo: string): string {
  return createHash('sha256').update(testo, 'utf8').digest('hex')
}

const spaziUniti = (s: string) => s.replace(/\s+/gu, ' ').trim()

/** The transcript as the impronta reads it: every run of spaces made one. */
function chatNormalizzata(chat: ChatPerAnalisi): ChatPerAnalisi {
  return { ...chat, messaggi: chat.messaggi.map((m) => ({ ...m, testo: spaziUniti(m.testo) })) }
}

export function improntaChat(op: {
  modello: string
  effort: string
  canale: CanaleInsight
  passo: 'schede' | 'riattivazione'
  chat: ChatPerAnalisi
}): string {
  const corpo = corpoChat(chatNormalizzata(op.chat), { fascia: true })
  return sha256([VERSIONE_PROMPT, op.modello, op.effort, op.canale, op.passo, JSON.stringify(corpo)].join('|'))
}

/** The impronta of an agenda or show-up card: what the agenda block sent for that call (without its ref). */
export function improntaCall(op: { modello: string; effort: string; tipo: 'agenda' | 'show_up'; corpo: Record<string, unknown> }): string {
  return sha256([VERSIONE_PROMPT, op.modello, op.effort, 'instagram', op.tipo, JSON.stringify(op.corpo)].join('|'))
}

/** A placeholder's impronta: never equal to a chat's (it has no model, no effort, no version). */
export function improntaSegnaposto(tipo: TipoScheda, chiave: string, motivo: string): string {
  return sha256(['segnaposto', tipo, chiave, motivo].join('|'))
}
