import { getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
import { z } from 'zod'

/**
 * Answers at a tap (Dany, 29/09/2026): Alfire asks a closed question, or
 * proposes what to ask next, and the chat shows the options as buttons. A tap
 * sends the option as the user's own message: nothing is written by it, a write
 * still goes through its card and "Conferma".
 *
 * The tool has no execute: the model's call ends its answer and waits in the
 * chat, never blocking a typed or spoken answer instead of a tap.
 */
export const PROPONI_RISPOSTE = 'proponi_risposte'

// what each field means is in the description below: every character travels with every request
export const schemaProposte = z.object({
  tipo: z.enum(['scelta', 'seguito']),
  domanda: z.string().max(120).optional().describe('Solo per scelta'),
  opzioni: z.array(z.string().min(1).max(60)).min(2).max(4).describe('Brevi, come le scriverebbe l’utente'),
})

export type Proposte = z.infer<typeof schemaProposte>

export const DESCRIZIONE_PROPOSTE =
  'Mostra bottoni di risposta sotto il tuo messaggio: un tocco manda l’opzione come messaggio dell’utente. ' +
  'Chiamalo per ultimo e da solo, dopo aver scritto il testo: ferma la risposta. ' +
  'scelta: domanda chiusa (quale cliente, quale rata, quale mese, sì o no), scritta anche nel testo; opzioni = ' +
  'i candidati che gli strumenti elencano. Mai per confermare una scrittura: la conferma è la scheda. ' +
  'seguito: dopo una risposta scritta, fino a 3 domande successive davvero utili, non a ogni messaggio. ' +
  'Non scrive niente: le scritture restano allo strumento con la scheda di conferma, mai insieme.'

type Parte = UIMessage['parts'][number]

export function isProposta(parte: Parte): boolean {
  return isToolUIPart(parte) && getToolName(parte) === PROPONI_RISPOSTE
}

/** The options of a call, when its input is complete and valid; null otherwise. */
export function leggiProposte(input: unknown): Proposte | null {
  const r = schemaProposte.safeParse(input)
  return r.success ? r.data : null
}

/**
 * Whether a proposal answers on its own: a closed question does (the user
 * picks), follow-ups do not. Follow-ups with no text are the model stopping
 * without a word, or calling them next to a read, which ends the answer before
 * the read is used: the chat still offers "Riprova".
 */
export function propostaCheRisponde(input: unknown): boolean {
  return leggiProposte(input)?.tipo === 'scelta'
}

function normalizza(testo: string): string {
  return testo.toLowerCase().replace(/\s+/g, ' ').trim()
}

function testoDi(m: UIMessage): string {
  return m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
}

/**
 * The question of a proposal when the message's text does not already say it:
 * the chat shows it above the buttons, and the model reads it back (below).
 */
export function domandaNonDetta(messaggio: UIMessage, proposte: Proposte | null): string | null {
  const domanda = proposte?.domanda?.trim()
  if (!domanda) return null
  return normalizza(testoDi(messaggio)).includes(normalizza(domanda)) ? null : domanda
}

/**
 * The history the model reads again: every proponi_risposte call leaves, and
 * its question stays as text when the message did not already say it. So the
 * next answer knows what the user is answering, no call waits for an output
 * (Groq wants one for each), and no request pays for old options.
 */
export function proposteComeTesto(messaggi: UIMessage[]): UIMessage[] {
  return messaggi.map((m) => {
    if (m.role !== 'assistant' || !m.parts.some(isProposta)) return m
    return {
      ...m,
      parts: m.parts.flatMap((p): Parte[] => {
        if (!isProposta(p)) return [p]
        const domanda = isToolUIPart(p) ? domandaNonDetta(m, leggiProposte(p.input)) : null
        return domanda ? [{ type: 'text', text: domanda }] : []
      }),
    }
  })
}

/**
 * The chat goes on by itself after the user answered every confirmation card
 * of the last answer. A proposal waiting for its tap is not a card: it must
 * never hold a confirmed write back.
 */
export function confermeComplete({ messages }: { messages: UIMessage[] }): boolean {
  const ultimo = messages.at(-1)
  if (!ultimo || ultimo.role !== 'assistant') return false
  const senzaProposte = { ...ultimo, parts: ultimo.parts.filter((p) => !isProposta(p)) }
  return lastAssistantMessageIsCompleteWithApprovalResponses({ messages: [...messages.slice(0, -1), senzaProposte] })
}

/**
 * Which option the user answered with: the message after the proposal, when
 * it is the user's and says one of the options word for word (a tap does).
 * Anything else typed or dictated is an answer too, just not one of these.
 */
export function rispostaScelta(seguente: UIMessage | undefined, opzioni: readonly string[]): string | null {
  if (!seguente || seguente.role !== 'user') return null
  const risposta = normalizza(testoDi(seguente))
  return opzioni.find((o) => normalizza(o) === risposta) ?? null
}
