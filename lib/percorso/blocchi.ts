/**
 * The blocks of every content of the client (contenuti_blocchi, release B1a), as the page
 * receives them from percorso_cliente(): read by `id` and by `tipo`, never by position.
 * A union that grows: v3 (the training modules) uses the same blocks and the same
 * components (docs/onboarding/rilascio-b.md, «Pronto per i moduli formativi»). A block of a
 * kind this release does not know is dropped, never shown raw.
 */

type Base = { id: string; titolo: string | null; corpo: string | null }

export type BloccoTesto = Base & { tipo: 'testo' }
export type BloccoAvviso = Base & { tipo: 'avviso' }
export type BloccoVideo = Base & {
  tipo: 'video'
  youtubeId: string
  obbligatorio: boolean
  video: { percentuale: number; visto: boolean }
}
export type BloccoRegola = Base & { tipo: 'regola'; titolo: string }
export type BloccoVoce = Base & { tipo: 'voce'; titolo: string }
export type BloccoPulsante = Base & { tipo: 'pulsante'; titolo: string; url: string }
export type BloccoDomande = Base & { tipo: 'domande' }

export type BloccoPercorso =
  | BloccoTesto
  | BloccoAvviso
  | BloccoVideo
  | BloccoRegola
  | BloccoVoce
  | BloccoPulsante
  | BloccoDomande

export type TipoBlocco = BloccoPercorso['tipo']

export const TIPI_BLOCCO_NOTI: readonly TipoBlocco[] = ['testo', 'avviso', 'video', 'regola', 'voce', 'pulsante', 'domande']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function testo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

/** One block from the JSON of percorso_cliente(); null when it is not one this release knows. */
export function leggiBlocco(valore: unknown): BloccoPercorso | null {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null
  const v = valore as Record<string, unknown>
  if (typeof v.id !== 'string' || !UUID.test(v.id)) return null
  const base: Base = { id: v.id, titolo: testo(v.titolo), corpo: testo(v.corpo) }
  switch (v.tipo) {
    case 'testo':
    case 'avviso':
    case 'domande':
      return { ...base, tipo: v.tipo }
    case 'video': {
      const youtubeId = typeof v.youtube_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.youtube_id) ? v.youtube_id : null
      if (!youtubeId) return null
      const video = v.video && typeof v.video === 'object' ? (v.video as Record<string, unknown>) : {}
      return {
        ...base,
        tipo: 'video',
        youtubeId,
        obbligatorio: v.obbligatorio === true,
        video: { percentuale: numero(video.percentuale), visto: video.visto === true },
      }
    }
    case 'regola':
    case 'voce':
      return base.titolo ? { ...base, tipo: v.tipo, titolo: base.titolo } : null
    case 'pulsante': {
      const url = typeof v.url === 'string' && v.url.startsWith('https://') ? v.url : null
      return base.titolo && url ? { ...base, tipo: 'pulsante', titolo: base.titolo, url } : null
    }
    default:
      return null
  }
}

export function leggiBlocchi(valore: unknown): BloccoPercorso[] {
  if (!Array.isArray(valore)) return []
  return valore.map(leggiBlocco).filter((b): b is BloccoPercorso => b !== null)
}

/** The compulsory videos of a step not seen yet. */
export function videoDaVedere(blocchi: readonly BloccoPercorso[]): BloccoVideo[] {
  return blocchi.filter((b): b is BloccoVideo => b.tipo === 'video' && b.obbligatorio && !b.video.visto)
}

/**
 * The order of step 1 «Benvenuto»: every block that is not a video (in the CMS order), then the
 * team, then the videos, then the one action. So «Ho guardato il video» sits right under the
 * player. The admin's preview uses the same order.
 */
export function ordineBenvenuto<B extends { tipo: string }>(blocchi: readonly B[]): { testi: B[]; video: B[] } {
  return { testi: blocchi.filter((b) => b.tipo !== 'video'), video: blocchi.filter((b) => b.tipo === 'video') }
}

/** The ids of the rules of a step: what «Accetto e vado avanti» sends. */
export function idRegole(blocchi: readonly BloccoPercorso[]): string[] {
  return blocchi.filter((b) => b.tipo === 'regola').map((b) => b.id)
}

/** A placeholder of the seed that the admin must still replace (specification 13-bis.7). */
export const SEGNAPOSTO = '[Da scrivere'
export const YOUTUBE_SEGNAPOSTO = 'XXXXXXXXXXX'

export function haSegnaposto(b: { titolo?: string | null; corpo?: string | null; youtube_id?: string | null }): boolean {
  return Boolean(
    b.titolo?.includes(SEGNAPOSTO) || b.corpo?.includes(SEGNAPOSTO) || b.youtube_id === YOUTUBE_SEGNAPOSTO,
  )
}

/**
 * The last step this release serves (the same as onboarding_ultimo_passo_servito() in SQL:
 * 'regole' in B1a). The CMS says that the steps after it are not seen yet.
 */
export const ULTIMO_PASSO_SERVITO = 'regole'
