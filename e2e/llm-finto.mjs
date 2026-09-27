// A tiny OpenAI-compatible model for e2e: it answers Alfire's route without
// Groq, so the whole flow (tool call, confirmation, write, answer) is testable
// offline. Start: node e2e/llm-finto.mjs (port 4010), then run the dev server
// with ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1.
import { createServer } from 'node:http'

const PORTA = Number(process.env.PORTA_LLM_FINTO ?? 4010)

function sse(res, chunks) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

function base(delta, finish = null) {
  return {
    id: 'finto',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'finto',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }
}

function testo(res, parole) {
  sse(res, [
    base({ role: 'assistant', content: '' }),
    base({ reasoning: 'Rispondo in breve.' }),
    ...parole.split(' ').map((p, i) => base({ content: (i ? ' ' : '') + p })),
    { ...base({}, 'stop'), usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
  ])
}

function chiamata(res, nome, argomenti) {
  sse(res, [
    base({ role: 'assistant', reasoning: 'Mi serve uno strumento.' }),
    base({
      role: 'assistant',
      tool_calls: [{ index: 0, id: `call_${nome}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }],
    }),
    { ...base({}, 'tool_calls'), usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
  ])
}

function contenuto(m) {
  return typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(' ')
}

createServer(async (req, res) => {
  let corpo = ''
  for await (const pezzo of req) corpo += pezzo

  if (req.url?.endsWith('/audio/transcriptions')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ text: 'Quanto ho incassato questo mese?' }))
    return
  }
  if (!req.url?.endsWith('/chat/completions')) {
    res.writeHead(404).end()
    return
  }

  const { messages = [] } = JSON.parse(corpo || '{}')
  // like Groq: reasoning sent back on an assistant message is refused
  const conRagionamento = messages.findIndex((m) => m.role === 'assistant' && 'reasoning_content' in m)
  if (conRagionamento >= 0) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        error: {
          message: `'messages.${conRagionamento}' : property 'reasoning_content' is unsupported`,
          type: 'invalid_request_error',
        },
      }),
    )
    return
  }
  const ultimo = messages.at(-1) ?? {}
  if (ultimo.role === 'tool') {
    const esito = contenuto(ultimo)
    return testo(res, esito.includes('"fatto":true') ? 'Fatto, ho registrato il costo.' : 'Questo mese hai incassato 6.950,00 €.')
  }
  const domanda = contenuto(ultimo).toLowerCase()
  if (domanda.includes('costo')) {
    return chiamata(res, 'registra_costo', {
      descrizione: 'E2EAlfire Canva',
      importo: 12.99,
      categoria: 'software',
      ricorrente: false,
    })
  }
  if (domanda.includes('incassato')) return chiamata(res, 'numeri_periodo', {})
  return testo(res, 'Ciao, sono Alfire.')
}).listen(PORTA, '127.0.0.1', () => console.log(`llm finto su ${PORTA}`))
