import type { Fonte } from '@/lib/insight/canale'
import type { LeadRecap } from '@/lib/insight/recap'

/**
 * «Copia chat»: the transcript of a lead's chat, word for word the artifact
 * "Recap DM Alpha"'s, so it pastes the same into Claude or a note:
 *
 *   Conversazione Instagram con @user (Nome)
 *
 *   [08/10 21:27] @user: …
 *   [08/10 21:30] Percorso Alpha: …
 *
 * Messenger names the lead by his name («Lead» without one), never a handle.
 */
export function chiCopia(lead: Pick<LeadRecap, 'username' | 'name'>, fonte: Fonte): string {
  return fonte === 'messenger' ? lead.name || 'Lead' : `@${lead.username || 'lead'}`
}

export function trascrizioneChat(lead: Pick<LeadRecap, 'username' | 'name' | 'messages'>, fonte: Fonte): string {
  const chi = chiCopia(lead, fonte)
  const nome = fonte !== 'messenger' && lead.name ? ` (${lead.name})` : ''
  const intestazione = `Conversazione ${fonte === 'messenger' ? 'Messenger' : 'Instagram'} con ${chi}${nome}`
  const righe = lead.messages.map((m) => `[${m.time || ''}] ${m.from === 'alpha' ? 'Percorso Alpha' : chi}: ${m.text || ''}`)
  return [intestazione, '', ...righe].join('\n')
}
