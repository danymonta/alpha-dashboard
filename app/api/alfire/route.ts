import {
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
import { dettaglioErroreAlfire, messaggioErroreAlfire } from '@/lib/alfire/errori'
import { serveScrivere } from '@/lib/alfire/intento'
import { SCRITTURE } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import { strumentiAlfire } from '@/lib/alfire/strumenti'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Only the last messages travel: the free tier counts every token of every
 * step against 8K a minute and 200K a day (Groq, 28/09/2026).
 */
const MESSAGGI_MAX = 8

function senzaRagionamento(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({ messages, reasoning: 'all', emptyMessages: 'remove' })
}

/**
 * The history the model gets: no reasoning, and no tool calls or results
 * before the last two messages (the answers that used them stay as text).
 * Within one answer the steps keep their tool results (prepareStep below).
 */
function storiaLeggera(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({ messages, reasoning: 'all', toolCalls: 'before-last-2-messages', emptyMessages: 'remove' })
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
  const tutti = strumentiAlfire(supabase, profilo, livelloPm)
  // a question that only reads goes without the write tools: half the tokens
  const tools = serveScrivere(messaggi)
    ? tutti
    : Object.fromEntries(Object.entries(tutti).filter(([nome]) => !(SCRITTURE as readonly string[]).includes(nome)))

  const result = streamText({
    model: modelloAlfire(),
    system: promptAlfire({ nome: profilo.nome.split(' ')[0], ruolo: profilo.ruolo, oggi: oggiRoma() }),
    messages: storiaLeggera(await convertToModelMessages(messaggi, { tools: tutti, ignoreIncompleteToolCalls: true })),
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
    // Groq reserves the maximum answer against the per-minute budget up front
    maxOutputTokens: 900,
    temperature: 0.2,
    providerOptions: { alfire: { reasoningEffort: 'low' } },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        // the real cause in Vercel's logs; a precise, human message in the chat
        console.error('[alfire]', dettaglioErroreAlfire(error))
        return messaggioErroreAlfire(error, { admin: profilo.ruolo === 'admin' })
      },
    }),
  })
}
