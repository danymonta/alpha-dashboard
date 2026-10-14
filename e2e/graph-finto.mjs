// A tiny Instagram Graph API for e2e: the listing of the posts of the content
// calendar (1.33.0) without Meta. Start: node e2e/graph-finto.mjs (port 4012),
// then run the dev server with E2E_GRAPH_FINTO=http://127.0.0.1:4012 (taken
// only with ENABLE_DEV_LOGIN=true, outside production, on a loopback host:
// lib/instagram/richieste.ts, baseGraph).
//
// It answers /v26.0/me and /v26.0/me/media in two pages with the cursor (and
// a next URL, as Meta writes it, never to be followed), a pinned post on top
// older than the others, and only the token the tests put in the local Vault
// (one with "e2eFinto" in it). GET /__modo?campi=senza_didascalia makes the
// complete fields answer code 100, as Meta may do with caption and
// media_product_type on the Instagram Login; GET /__modo resets it.
// GET /__richieste says how many requests arrived and on which paths (never a
// token); GET /__azzera empties the count. 1.35.0 adds conversations,
// profiles, Messenger and insights.
//
// Every post, caption and shortcode is invented; no cover (the page shows
// the icon), so the browser never asks Instagram's CDN for one.
import { createServer } from 'node:http'

const PORTA = Number(process.env.PORTA_GRAPH_FINTO ?? 4012)
const SEGNO_TOKEN_FINTO = 'e2eFinto'
const PER_PAGINA = 2

let modo = { campi: 'completi' }
let richieste = []

const giorno = 86_400_000

/** The posts, most recent first as Meta gives them: a pinned old one on top. */
function media() {
  const adesso = Date.now()
  const post = (n, giorniFa, tipo, caption) => {
    const codice = `GraphFinto${String(n).padStart(2, '0')}`
    const reel = tipo === 'REELS'
    return {
      id: `1799000000000${String(n).padStart(4, '0')}`,
      shortcode: codice,
      permalink: `https://www.instagram.com/${reel ? 'reel' : 'p'}/${codice}/`,
      timestamp: new Date(adesso - giorniFa * giorno).toISOString().replace('.000Z', '+0000'),
      media_type: reel ? 'VIDEO' : tipo === 'CAROUSEL' ? 'CAROUSEL_ALBUM' : 'IMAGE',
      media_product_type: reel ? 'REELS' : 'FEED',
      caption,
      like_count: 10 * n,
      comments_count: n,
    }
  }
  return [
    // pinned on top, older than the rest
    post(1, 40, 'REELS', 'Il reel fissato in cima al profilo: da dove sono partito.'),
    post(2, 1, 'REELS', 'Un reel finto di ieri per i test del calendario.'),
    post(3, 2, 'CAROUSEL', 'Un carosello finto di due giorni fa.'),
    post(4, 3, 'REELS', 'Un altro reel finto, di tre giorni fa.'),
    post(5, 4, 'IMAGE', 'Una foto finta di quattro giorni fa.'),
  ]
}

const COMPLETI = new Set(['media_product_type', 'caption'])

function manda(res, corpo, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

function errore(res, code, message, status = 400) {
  manda(res, { error: { message, type: 'OAuthException', code } }, status)
}

createServer((req, res) => {
  const u = new URL(req.url ?? '/', `http://127.0.0.1:${PORTA}`)

  if (u.pathname === '/__richieste') return manda(res, { totale: richieste.length, percorsi: richieste })
  if (u.pathname === '/__azzera') {
    richieste = []
    return manda(res, { ok: true })
  }
  if (u.pathname === '/__modo') {
    modo = { campi: u.searchParams.get('campi') === 'senza_didascalia' ? 'senza_didascalia' : 'completi' }
    return manda(res, modo)
  }

  // the path only: never the token in what this server remembers
  richieste.push(u.pathname)
  const token = u.searchParams.get('access_token') ?? ''
  if (!token.includes(SEGNO_TOKEN_FINTO)) return errore(res, 190, 'Invalid OAuth access token')

  const percorso = u.pathname.replace(/^\/v[\d.]+/, '')
  if (percorso === '/me') return manda(res, { user_id: '17841400000000042', username: 'alpha_finto', id: 'app1' })

  if (percorso === '/me/media') {
    const campi = (u.searchParams.get('fields') ?? '').split(',')
    if (modo.campi === 'senza_didascalia' && campi.some((c) => COMPLETI.has(c))) {
      return errore(res, 100, 'Tried accessing nonexisting field (caption) on node type (Media)')
    }
    const tutti = media()
    const dopo = Number(u.searchParams.get('after') ?? 0)
    const pagina = tutti
      .slice(dopo, dopo + PER_PAGINA)
      .map((m) => Object.fromEntries(Object.entries(m).filter(([chiave]) => campi.includes(chiave))))
    const altre = dopo + PER_PAGINA < tutti.length
    return manda(res, {
      data: pagina,
      paging: {
        cursors: { before: String(dopo), after: String(dopo + PER_PAGINA) },
        ...(altre ? { next: `http://127.0.0.1:${PORTA}/SEGUITO-NEXT?access_token=${token}` } : {}),
      },
    })
  }

  errore(res, 100, 'Unsupported get request. Object does not exist', 404)
}).listen(PORTA, '127.0.0.1', () => console.log(`graph finto su ${PORTA}`))
