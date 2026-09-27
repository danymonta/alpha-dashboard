import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  pruneMessages,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from 'ai'

import { alfireConfigurata, modelloAlfire } from '@/lib/alfire/config'
import { SCRITTURE } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import { strumentiAlfire } from '@/lib/alfire/strumenti'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Only the last messages travel: the free tier has a per-minute token budget. */
const MESSAGGI_MAX = 12

function senzaRagionamento(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({ messages, reasoning: 'all', emptyMessages: 'remove' })
}

function messaggioErrore(error: unknown): string {
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return 'Alfire ha raggiunto il limite gratuito di questo minuto. Riprova tra poco.'
  }
  if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) {
    return 'La chiave di Alfire non è valida: controlla ALFIRE_API_KEY.'
  }
  return 'Alfire non ha risposto. Riprova.'
}

export async function POST(req: Request) {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return Response.json({ errore: 'Sessione scaduta. Rientra e riprova.' }, { status: 401 })
  }
  if (!alfireConfigurata()) {
    return Response.json({ errore: 'Alfire non è ancora configurata.' }, { status: 503 })
  }

  let messaggi: UIMessage[]
  try {
    const corpo = (await req.json()) as { messages?: UIMessage[] }
    messaggi = Array.isArray(corpo.messages) ? corpo.messages.slice(-MESSAGGI_MAX) : []
  } catch {
    return Response.json({ errore: 'Richiesta non valida.' }, { status: 400 })
  }
  if (messaggi.length === 0) return Response.json({ errore: 'Nessun messaggio.' }, { status: 400 })

  const supabase = await createClient()
  const livelloPm = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm)
  const tools = strumentiAlfire(supabase, profilo, livelloPm)

  const result = streamText({
    model: modelloAlfire(),
    system: promptAlfire({ nome: profilo.nome.split(' ')[0], ruolo: profilo.ruolo, oggi: oggiRoma() }),
    messages: senzaRagionamento(await convertToModelMessages(messaggi, { tools, ignoreIncompleteToolCalls: true })),
    // gpt-oss reasons before answering; Groq refuses that reasoning when it comes
    // back as reasoning_content in the next step (after a tool call). The model
    // does not need it to go on, so every step starts without it.
    prepareStep: ({ messages }) => ({ messages: senzaRagionamento(messages) }),
    tools,
    // every write waits for the user's tap in the chat
    toolApproval: Object.fromEntries(
      SCRITTURE.filter((nome) => nome in tools).map((nome) => [nome, 'user-approval' as const]),
    ),
    stopWhen: isStepCount(5),
    maxOutputTokens: 1200,
    temperature: 0.2,
    providerOptions: { alfire: { reasoningEffort: 'low' } },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, onError: messaggioErrore }),
  })
}
