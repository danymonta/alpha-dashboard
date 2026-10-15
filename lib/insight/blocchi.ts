import type { BloccoPianificato, ChatSalvata, PianificaBlocchi } from '@/lib/insight/contratti'

/**
 * How the chats of a run are packed into blocks for Claude (1.35.0, CLAUDE.md
 * section 29): up to 10 chats and about 5,000 transcript tokens per block
 * (8 chats for the reactivation), the largest first; a chat over the budget
 * goes alone. Never an under-14 chat (D25: Claude never receives it again).
 * The order is stable: the same chats give the same blocks.
 *
 * Tokens are estimated from characters (/ 3.4, Italian text): the budget is a
 * packing rule, not a limit of the API.
 */

export const CHAT_PER_BLOCCO = 10
export const CANDIDATI_PER_BLOCCO = 8
export const TOKEN_PER_BLOCCO = 5_000
export const CARATTERI_PER_TOKEN = 3.4
/** The per-message overhead of the payload (author, time, keys), in characters. */
const CARATTERI_PER_MESSAGGIO = 40

/** The characters of a chat's transcript as the payload carries it. */
export function caratteriTrascrizione(messaggi: readonly { testo: string }[]): number {
  return messaggi.reduce((n, m) => n + m.testo.length + CARATTERI_PER_MESSAGGIO, 0)
}

export function tokenStimati(caratteri: number): number {
  return Math.ceil(caratteri / CARATTERI_PER_TOKEN)
}

type ChatDaPianificare = Pick<ChatSalvata, 'conversazione_id' | 'messaggi' | 'minore_14'>

/** Packs the chats of one channel and step into blocks numbered from 0. */
export const pianificaBlocchi: PianificaBlocchi = ({ canale, tipo, chats }) => {
  const massimo = tipo === 'riattivazione' ? CANDIDATI_PER_BLOCCO : CHAT_PER_BLOCCO
  const visti = new Set<string>()
  const ordinate = chats
    .filter((c: ChatDaPianificare) => {
      if (c.minore_14 || visti.has(c.conversazione_id)) return false
      visti.add(c.conversazione_id)
      return true
    })
    .map((c) => ({ chiave: c.conversazione_id, token: tokenStimati(caratteriTrascrizione(c.messaggi)) }))
    .sort((a, b) => b.token - a.token || a.chiave.localeCompare(b.chiave))

  const blocchi: { chiavi: string[]; token: number }[] = []
  for (const c of ordinate) {
    const aperto = blocchi.at(-1)
    if (aperto && aperto.chiavi.length < massimo && aperto.token + c.token <= TOKEN_PER_BLOCCO) {
      aperto.chiavi.push(c.chiave)
      aperto.token += c.token
    } else {
      blocchi.push({ chiavi: [c.chiave], token: c.token })
    }
  }
  return blocchi.map(
    (b, indice): BloccoPianificato => ({ canale, tipo, indice, chiavi: b.chiavi }),
  )
}

/** Two halves of a list (the first one larger when odd); a single element cannot be halved. */
export function dimezza<T>(elementi: readonly T[]): [T[], T[]] {
  const meta = Math.ceil(elementi.length / 2)
  return [elementi.slice(0, meta), elementi.slice(meta)]
}
