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

import { alfireConfigurata, budgetAlfire, modelloAlfire, pianoAlfire } from '@/lib/alfire/config'
import { dettaglioErroreAlfire, erroreStrumentoRiprovabile, messaggioErroreAlfire } from '@/lib/alfire/errori'
import { conversazioneScrive } from '@/lib/alfire/intento'
import { SCRITTURE } from '@/lib/alfire/permessi'
import { promptAlfire } from '@/lib/alfire/prompt'
import { strumentiAlfire } from '@/lib/alfire/strumenti'
import { livelloPmEffettivo } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  // only the last messages travel: every step sends them again (budgetAlfire)
  const budget = budgetAlfire()
  let messaggi: UIMessage[]
  try {
    const corpo = (await req.json()) as { messages?: UIMessage[] }
    messaggi = Array.isArray(corpo.messages) ? corpo.messages.slice(-budget.messaggi) : []
  } catch {
    return Response.json({ errore: 'Richiesta non valida.' }, { status: 400 })
  }
  if (messaggi.length === 0) return Response.json({ errore: 'Nessun messaggio.' }, { status: 400 })

  const supabase = await createClient()
  const livelloPm = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm)
  // every tool of the role: an agent reads and writes whenever the conversation
  // asks for it, even after a "ci sei?" (Dany, 29/09/2026). On the free tier a
  // chat that never asked to write goes without the write tools, to fit 8K a minute.
  const tutti = strumentiAlfire(supabase, profilo, livelloPm)
  const tools =
    budget.sempreTutti || conversazioneScrive(messaggi)
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
    stopWhen: isStepCount(budget.passi),
    // Groq reserves the maximum answer against the per-minute budget up front
    maxOutputTokens: budget.risposta,
    temperature: 0.2,
    providerOptions: { alfire: { reasoningEffort: 'low' } },
    // a tool call Groq refuses mid-stream: the same step again, twice at most
    streamRetries: 2,
    onError: ({ error }) => (erroreStrumentoRiprovabile(error) ? { retry: true as const } : undefined),
    // what each answer costs, in Vercel's logs: no content, only token counts
    onFinish: ({ totalUsage }) => {
      console.info(
        '[alfire] token',
        JSON.stringify({
          ruolo: profilo.ruolo,
          piano: pianoAlfire(),
          input: totalUsage.inputTokens,
          inCache: totalUsage.inputTokenDetails?.cacheReadTokens,
          output: totalUsage.outputTokens,
        }),
      )
    },
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
