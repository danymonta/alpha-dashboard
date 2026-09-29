// A tiny OpenAI-compatible model for e2e: it answers Alfire's route without
// Groq, so the whole flow (tool call, confirmation, write, answer) is testable
// offline. Start: node e2e/llm-finto.mjs (port 4010), then run the dev server
// with ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1.
import { createServer } from 'node:http'

const PORTA = Number(process.env.PORTA_LLM_FINTO ?? 4010)

// every other request for the unstable tool is refused: the first try, then the retry works
let tentativiInstabili = 0

// like Groq: every reply says the plan's tokens per minute (8K free, 250K Developer)
const TOKEN_AL_MINUTO = process.env.TOKEN_AL_MINUTO_FINTO ?? '8000'

function sse(res, chunks) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'x-ratelimit-limit-tokens': TOKEN_AL_MINUTO,
  })
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

function rifiuto(res, messaggio, codice) {
  res.writeHead(400, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { message: messaggio, type: 'invalid_request_error', code: codice } }))
}

// like Groq: a call to a tool the request did not carry is refused
let strumentiDellaRichiesta = []

function chiamata(res, nome, argomenti) {
  if (!strumentiDellaRichiesta.includes(nome)) {
    return rifiuto(
      res,
      `Tool call validation failed: tool call validation failed: attempted to call tool '${nome}' which was not in request.tools`,
      'tool_use_failed',
    )
  }
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

  const { messages = [], tools = [] } = JSON.parse(corpo || '{}')
  strumentiDellaRichiesta = tools.map((t) => t.function?.name)
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
    // the model reads and then stops without a word (Dany's chat of 29/09/2026)
    if (messages.some((m) => m.role === 'user' && contenuto(m).toLowerCase().includes('leggi e taci'))) return testo(res, '')
    const esito = contenuto(ultimo)
    const strumento = String(ultimo.tool_call_id ?? '').replace('call_', '')
    if (esito.includes('"errore"')) return testo(res, `Errore: ${esito}`)
    return testo(res, esito.includes('"fatto":true') ? `Fatto: ${strumento}.` : 'Questo mese hai incassato 6.950,00 €.')
  }
  const domanda = contenuto(ultimo).toLowerCase()
  // a tool call Groq refuses once ("failed_generation"): asked again, it comes out right
  if (domanda.includes('strumento instabile') && tentativiInstabili++ % 2 === 0) {
    return rifiuto(res, "Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.", 'tool_use_failed')
  }
  if (domanda.includes('costo') || domanda.includes('canva') || domanda.includes('strumento instabile')) {
    return chiamata(res, 'registra_costo', {
      descrizione: 'E2EAlfire Canva',
      importo: 12.99,
      categoria: 'software',
      ricorrente: false,
    })
  }
  if (domanda.includes('vendita')) {
    const oggi = new Date().toISOString().slice(0, 10)
    return chiamata(res, 'registra_vendita', {
      cliente: 'E2EAlfire Loris Presti',
      tipo: 'nuovo',
      prodotto: 'Annuale E2E',
      valore: 2500,
      data_vendita: oggi,
      data_inizio: oggi,
      durata_mesi: 12,
      rate: [{ scadenza: oggi, importo: 2500, incassata_il: oggi, metodo: 'contanti' }],
      setter: 'io',
      closer: 'io',
      fonte: 'referral',
      instagram_handle: 'loris_e2e',
    })
  }
  if (domanda.includes('telefono')) {
    return chiamata(res, 'modifica_cliente', { cliente: 'E2EAlfire Loris Presti', telefono: '+39 333 000 0000' })
  }
  if (domanda.includes('incassato') || domanda.includes('leggi e taci')) return chiamata(res, 'numeri_periodo', {})
  return testo(res, 'Ciao, sono Alfire.')
}).listen(PORTA, '127.0.0.1', () => console.log(`llm finto su ${PORTA}`))
