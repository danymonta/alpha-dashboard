import 'server-only'

import { z } from 'zod/v4'

import { baseFathom, FINESTRA_DOPO_MS, FINESTRA_PRIMA_MS, PAGINE_MAX_PER_LINK, SEGNO_CHIAVE_FINTA } from '@/lib/fathom/config'
import { ErroreFathom } from '@/lib/fathom/frasi'
import { stessoLink } from '@/lib/fathom/link'
import {
  ElencoSchema,
  leggiRiunione,
  leggiRiunionePerAbbinamento,
  type Riunione,
  type RiunionePerAbbinamento,
} from '@/lib/fathom/riunione'
import { hostDiLoopback } from '@/lib/instagram/richieste'

/**
 * Fathom's API (1.37.0, CLAUDE.md section 31), read with the admin's key (kept in
 * Vault, read by the service role): `X-Api-Key`, base https://api.fathom.ai/external/v1.
 *
 * What the app asks: the list of meetings only to find the recording behind a
 * link a closer pasted (a window around the call, never the whole list, no
 * `include_*`), the transcript and the summary of one recording (read when
 * someone opens them or when Claude analyses the call, never stored), and the
 * meeting types, only to try the key.
 *
 * Errors: 401 the key, 429 the rate limit (Retry-After), any other 4xx
 * «non_trovata» (the documentation lists 200, 400, 401 and 429 only), 5xx and
 * the network «rete», the time «tempo», a 200 the schema cannot read «formato».
 * The key is only in the header; every message is a fixed sentence. A test key
 * never leaves for a host that is not loopback.
 */

type Opzioni = { chiave: string; base?: string; fetch?: typeof fetch }

const TIMEOUT_ELENCO_MS = 10_000
const TIMEOUT_PESANTE_MS = 20_000
const ATTESA_429_MAX_MS = 10_000

function base(op: Opzioni): string {
  const b = op.base ?? baseFathom()
  if (op.chiave.includes(SEGNO_CHIAVE_FINTA)) {
    let ok = false
    try {
      ok = hostDiLoopback(new URL(b).hostname)
    } catch {
      ok = false
    }
    if (!ok) throw new ErroreFathom('chiave')
  }
  return b.replace(/\/+$/, '')
}

async function chiedi(op: Opzioni, percorso: string, query: URLSearchParams, timeoutMs: number, segnale?: AbortSignal): Promise<unknown> {
  const url = `${base(op)}${percorso}${query.size > 0 ? `?${query}` : ''}`
  const f = op.fetch ?? fetch
  for (let tentativo = 0; ; tentativo++) {
    let risposta: Response
    try {
      risposta = await f(url, {
        headers: { 'X-Api-Key': op.chiave, Accept: 'application/json' },
        signal: segnale ? AbortSignal.any([segnale, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      })
    } catch (e) {
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ErroreFathom('tempo')
      if (tentativo === 0) continue
      throw new ErroreFathom('rete')
    }
    if (risposta.status === 401) throw new ErroreFathom('chiave')
    if (risposta.status === 429) {
      const attesa = Number(risposta.headers.get('retry-after')) * 1000
      if (tentativo === 0 && Number.isFinite(attesa) && attesa >= 0 && attesa <= ATTESA_429_MAX_MS) {
        await new Promise((r) => setTimeout(r, attesa))
        continue
      }
      throw new ErroreFathom('limite', Number.isFinite(attesa) ? attesa : 0)
    }
    if (risposta.status >= 500) {
      if (tentativo === 0) continue
      throw new ErroreFathom('rete')
    }
    if (!risposta.ok) throw new ErroreFathom('non_trovata')
    try {
      return await risposta.json()
    } catch {
      throw new ErroreFathom('formato')
    }
  }
}

/** One page of the list of meetings between two instants (Fathom's created_at), 10 at most. No include_*. */
export async function paginaRiunioni(
  op: Opzioni & { dal: Date; al: Date; cursore?: string | null; segnale?: AbortSignal },
): Promise<{ riunioni: Riunione[]; prossimo: string | null }> {
  const q = new URLSearchParams({ created_after: op.dal.toISOString(), created_before: op.al.toISOString() })
  if (op.cursore) q.set('cursor', op.cursore)
  const corpo = await chiedi(op, '/meetings', q, TIMEOUT_ELENCO_MS, op.segnale)
  const letto = ElencoSchema.safeParse(corpo)
  if (!letto.success) throw new ErroreFathom('formato')
  const riunioni = letto.data.items.map(leggiRiunione).filter((r): r is Riunione => r !== null)
  return { riunioni, prossimo: letto.data.next_cursor ?? null }
}

/**
 * The meetings of a period, for the matching of 1.65.0 (lib/fathom/abbina.ts):
 * the same list, a page after another up to `pagineMax`, with the invitees'
 * names kept in memory only. `completo` says whether the last page was reached.
 */
export async function riunioniDelPeriodo(
  op: Opzioni & { dal: Date; al: Date; pagineMax: number; segnale?: AbortSignal },
): Promise<{ riunioni: RiunionePerAbbinamento[]; completo: boolean; richieste: number }> {
  const riunioni: RiunionePerAbbinamento[] = []
  let cursore: string | null = null
  for (let pagina = 0; pagina < op.pagineMax; pagina++) {
    const q = new URLSearchParams({ created_after: op.dal.toISOString(), created_before: op.al.toISOString() })
    if (cursore) q.set('cursor', cursore)
    const corpo = await chiedi(op, '/meetings', q, TIMEOUT_ELENCO_MS, op.segnale)
    const letto = ElencoSchema.safeParse(corpo)
    if (!letto.success) throw new ErroreFathom('formato')
    for (const grezza of letto.data.items) {
      const r = leggiRiunionePerAbbinamento(grezza)
      if (r) riunioni.push(r)
    }
    cursore = letto.data.next_cursor ?? null
    if (!cursore) return { riunioni, completo: true, richieste: pagina + 1 }
  }
  return { riunioni, completo: false, richieste: op.pagineMax }
}

export type EsitoCercaLink =
  | { trovata: true; riunione: Riunione; richieste: number }
  | { trovata: false; richieste: number }

/**
 * The recording behind a pasted link: the list of meetings from a day before
 * the call to three days after, up to three pages, compared with the link
 * (equal keys or nothing). The other meetings are dropped in memory.
 */
export async function cercaRegistrazionePerLink(
  op: Opzioni & { link: string; programmataIl: Date; segnale?: AbortSignal; paginaMax?: number },
): Promise<EsitoCercaLink> {
  const dal = new Date(op.programmataIl.getTime() - FINESTRA_PRIMA_MS)
  const al = new Date(op.programmataIl.getTime() + FINESTRA_DOPO_MS)
  let cursore: string | null = null
  let richieste = 0
  for (let pagina = 0; pagina < (op.paginaMax ?? PAGINE_MAX_PER_LINK); pagina++) {
    const { riunioni, prossimo } = await paginaRiunioni({ ...op, dal, al, cursore })
    richieste++
    for (const r of riunioni) {
      if (stessoLink(r.url, op.link) || (r.share_url !== null && stessoLink(r.share_url, op.link))) {
        return { trovata: true, riunione: r, richieste }
      }
    }
    if (!prossimo) break
    cursore = prossimo
  }
  return { trovata: false, richieste }
}

const SegmentoSchema = z.object({
  speaker: z.object({
    display_name: z.union([z.string(), z.null()]).optional(),
    matched_calendar_invitee_email: z.union([z.string(), z.null()]).optional(),
  }),
  text: z.string(),
  timestamp: z.string(),
})
const TrascrizioneSchema = z.object({ transcript: z.array(SegmentoSchema) })

export type SegmentoGrezzo = z.infer<typeof SegmentoSchema>

/** The transcript of a recording, read now (synchronous, no destination_url). Never stored. */
export async function trascrizione(op: Opzioni & { recordingId: number; segnale?: AbortSignal }): Promise<SegmentoGrezzo[]> {
  const corpo = await chiedi(op, `/recordings/${op.recordingId}/transcript`, new URLSearchParams(), TIMEOUT_PESANTE_MS, op.segnale)
  const letto = TrascrizioneSchema.safeParse(corpo)
  if (!letto.success) throw new ErroreFathom('formato')
  return letto.data.transcript
}

const RiassuntoSchema = z.object({ summary: z.object({ markdown_formatted: z.string() }) })

/** Fathom's own summary of a recording (always in English), read now. Never stored. */
export async function riassunto(op: Opzioni & { recordingId: number; segnale?: AbortSignal }): Promise<string> {
  const corpo = await chiedi(op, `/recordings/${op.recordingId}/summary`, new URLSearchParams(), TIMEOUT_PESANTE_MS, op.segnale)
  const letto = RiassuntoSchema.safeParse(corpo)
  if (!letto.success) throw new ErroreFathom('formato')
  return letto.data.summary.markdown_formatted.slice(0, 20_000)
}

/** Tries the key without reading a meeting: the types of meeting (names only, dropped). */
export async function provaChiave(op: Opzioni): Promise<void> {
  const corpo = await chiedi(op, '/meeting_types', new URLSearchParams(), TIMEOUT_ELENCO_MS)
  if (typeof corpo !== 'object' || corpo === null) throw new ErroreFathom('formato')
}
