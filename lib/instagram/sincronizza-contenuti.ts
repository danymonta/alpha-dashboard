import 'server-only'

import { aggiungiGiorni, formatOra } from '@/lib/date'
import {
  creaGraphContenuti,
  type LivelloCampi,
  type MediaLetto,
} from '@/lib/instagram/contenuti'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { baseGraph, ErroreInstagram, type OpzioniGraph } from '@/lib/instagram/richieste'
import {
  abbina,
  chiaveCoppia,
  postDaAbbinare,
  type Abbinamento,
  type ContenutoDaAbbinare,
  type PostDaAbbinare,
} from '@/lib/marketing/abbinamento'
import { inizioGiornoRoma, normalizzaUsername } from '@/lib/setting/conteggio-dm'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The listing run of the content calendar (1.33.0): every morning (the cron
 * contenuti-instagram) and with "Aggiorna da Instagram" (admin and
 * marketing, from a route). Reads the posts and reels of the last 180 days of
 * the connected account with the token of Impostazioni › Instagram, saves
 * them in instagram_contenuti and links them to the calendar
 * (lib/marketing/abbinamento.ts): by itself only the sure pairs, the others
 * are proposals for a person ("Da collegare").
 *
 * One run at a time (the lease of instagram_contenuti_stato); the token is
 * only read here, never refreshed: the DM report's night refreshes it, so two
 * jobs never contend for Vault. Never throws: every way out records the
 * outcome (instagram_contenuti_fine_giro) with a sentence in Italian. The log
 * says counts only: never a caption, a permalink, a CDN URL, a username or
 * the token. No lead data anywhere.
 */

/** The run works with the service role (it writes what no session can). */
export type AdminClient = Pick<ReturnType<typeof createAdminClient>, 'rpc' | 'from'>

/** How far back the run reads: covers the calendar and what 1.36.0 wants. */
export const GIORNI_LETTI = 180
/** At most this many media a run (8 pages of 50). */
export const MEDIA_PER_GIRO = 400
/** Upserts and reads by id in blocks of this many. */
const BLOCCO = 100
/** The posts the matching reads (the newest; PostgREST's max_rows is 1000). */
const POST_LETTI_MAX = 1000

export type CausaContenuti = 'senza_token' | 'token' | 'limite' | 'rete' | 'tempo' | 'meta' | 'database'

/** The sentences of the run, for the page, Impostazioni and the toast. */
export const FRASI_CONTENUTI: Record<Exclude<CausaContenuti, 'tempo' | 'meta'>, string> & { meta: string } = {
  senza_token: 'Instagram non è collegato: l’admin incolla il token in Impostazioni › Instagram.',
  token: 'Il token di Instagram è scaduto: l’admin ne incolla uno nuovo in Impostazioni › Instagram.',
  limite: 'Instagram ha chiesto di rallentare: il resto arriva col prossimo aggiornamento.',
  rete: 'Instagram non ha risposto: riprova più tardi.',
  meta: 'Instagram ha rifiutato la lettura dei post.',
  database: 'I post non si salvano: riprova più tardi.',
}

export const FRASE_IN_CORSO = 'Un aggiornamento è già in corso: riprova tra qualche minuto.'

/**
 * "Aggiornato alle 06:12: riprova tra 3 minuti." (the manual run waits 5
 * minutes after the last one); after a run that failed (Meta's limits, the
 * network: only a failure for the token never waits) "Ultimo tentativo alle
 * 06:12: …", never "Aggiornato".
 */
export function fraseAppenaFatto(il: string, adesso: Date, fallito = false): string {
  const fine = Date.parse(il)
  const minuti = Number.isFinite(fine) ? Math.max(1, Math.ceil((fine + 5 * 60_000 - adesso.getTime()) / 60_000)) : 5
  const ora = Number.isFinite(fine) ? formatOra(new Date(fine)) : null
  const quando = fallito
    ? ora
      ? `Ultimo tentativo alle ${ora}`
      : 'Appena tentato'
    : ora
      ? `Aggiornato alle ${ora}`
      : 'Appena aggiornato'
  return `${quando}: riprova tra ${minuti === 1 ? '1 minuto' : `${minuti} minuti`}.`
}

export type EsitoContenuti = {
  esito: 'ok' | 'parziale' | 'fallito'
  /** media saved */
  letti: number
  /** of which never seen before */
  nuovi: number
  /** marked no longer on Instagram */
  eliminati: number
  /** given by Meta but not valid */
  scartati: number
  collegati: number
  proposti: number
  campi: LivelloCampi | null
  /** the sentence in Italian, never Meta's raw text with a token */
  errore: string | null
  causa: CausaContenuti | null
  /** the lease was taken: another run is going, or one ended less than 5 minutes ago (manual) */
  rifiutato?: 'in_corso' | 'appena_fatto'
  /** when that run started (in_corso) or ended (appena_fatto) */
  dal?: string
}

class ErroreDatabase extends Error {
  constructor(cosa: string, codice?: string) {
    super(`${cosa}${codice ? ` (${codice})` : ''}`)
    this.name = 'ErroreDatabase'
  }
}

/** The columns of a media that the listing read: a key not read is not written. */
function riga(m: MediaLetto, lettoIl: string) {
  return { ...m, letto_il: lettoIl, eliminato_il: null }
}

/**
 * The listing upsert (only the columns read, letto_il = now, eliminato_il =
 * null: a media that came back is no longer deleted), in blocks of 100 rows
 * with the same columns (a step down halfway leaves some rows without the
 * caption, and PostgREST would write null where a key is missing). 1.35.0's
 * Insight calls it for the media it reads; it never marks deletions.
 * Throws on a database error. Returns how many rows it saved.
 */
export async function salvaElencoContenuti(db: AdminClient, media: readonly MediaLetto[]): Promise<number> {
  const lettoIl = new Date().toISOString()
  const perColonne = new Map<string, MediaLetto[]>()
  for (const m of media) {
    const chiave = Object.keys(m).sort().join(',')
    perColonne.set(chiave, [...(perColonne.get(chiave) ?? []), m])
  }
  let salvati = 0
  for (const gruppo of perColonne.values()) {
    for (let i = 0; i < gruppo.length; i += BLOCCO) {
      const blocco = gruppo.slice(i, i + BLOCCO).map((m) => riga(m, lettoIl))
      const { error } = await db.from('instagram_contenuti').upsert(blocco, { onConflict: 'media_id' })
      if (error) throw new ErroreDatabase('instagram_contenuti non salvati', error.code)
      salvati += blocco.length
    }
  }
  return salvati
}

/** How many of these media the table did not have yet (only for the log and the toast). */
async function contaNuovi(db: AdminClient, ids: readonly string[]): Promise<number> {
  let gia = 0
  for (let i = 0; i < ids.length; i += BLOCCO) {
    const blocco = ids.slice(i, i + BLOCCO)
    const { data, error } = await db.from('instagram_contenuti').select('media_id').in('media_id', blocco)
    if (error) throw new ErroreDatabase('instagram_contenuti non letti', error.code)
    gia += (data ?? []).length
  }
  return ids.length - gia
}

/**
 * The links of the calendar again, from what the database has (no call to
 * Instagram): after the listing (automatico: the sure pairs link by
 * themselves) and after a person's tap (scollega, rimetti, crea: nothing
 * links by itself, the proposals are redone at once). Throws on a database
 * error.
 */
export async function ricalcolaAbbinamenti(op: {
  db: AdminClient
  automatico: boolean
  adesso?: Date
}): Promise<{ collegati: number; proposti: number }> {
  const { db } = op
  const [inizio, contenuti, collegati, rifiuti, esclusi, post] = await Promise.all([
    db
      .from('marketing_contenuti')
      .select('post_date')
      .neq('stato', 'canceled')
      .not('post_date', 'is', null)
      .order('post_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.rpc('marketing_contenuti_per_abbinamento'),
    db.from('marketing_contenuti').select('instagram_shortcode').not('instagram_shortcode', 'is', null),
    db.from('marketing_abbinamenti_rifiutati').select('shortcode, contenuto_id'),
    db.from('marketing_post_esclusi').select('shortcode'),
    db
      .from('instagram_contenuti')
      .select('shortcode, media_type, reel, pubblicato_il, didascalia, eliminato_il')
      .order('pubblicato_il', { ascending: false })
      .limit(POST_LETTI_MAX),
  ])
  for (const [nome, letto] of [
    ['inizio', inizio],
    ['contenuti', contenuti],
    ['collegati', collegati],
    ['rifiuti', rifiuti],
    ['esclusi', esclusi],
    ['post', post],
  ] as const) {
    if (letto.error) throw new ErroreDatabase(`abbinamenti: ${nome} non letti`, letto.error.code)
  }

  const giaCollegati = new Set((collegati.data ?? []).map((r) => r.instagram_shortcode))
  const fuori = new Set((esclusi.data ?? []).map((r) => r.shortcode))
  const primoGiorno = inizio.data?.post_date ?? null
  // the posts from the calendar's first Post Date minus 3 days: the older ones are not work
  const dal = primoGiorno ? inizioGiornoRoma(aggiungiGiorni(primoGiorno, -3)).getTime() : null
  const daAbbinare: PostDaAbbinare[] = []
  for (const p of post.data ?? []) {
    if (dal === null || p.eliminato_il || giaCollegati.has(p.shortcode) || fuori.has(p.shortcode)) continue
    if (Date.parse(p.pubblicato_il) < dal) continue
    const pronto = postDaAbbinare(p)
    if (pronto) daAbbinare.push(pronto)
  }

  const coppie = abbina({
    post: daAbbinare,
    contenuti: (contenuti.data ?? []) as ContenutoDaAbbinare[],
    rifiutati: new Set((rifiuti.data ?? []).map((r) => chiaveCoppia(r.shortcode, r.contenuto_id))),
    didascalieDelCorpus: (post.data ?? []).map((p) => p.didascalia),
    automatici: op.automatico,
  })

  let fatti = 0
  const proposte: Abbinamento[] = []
  for (const coppia of coppie) {
    if (coppia.esito === 'proposto') {
      proposte.push(coppia)
      continue
    }
    // the sure ones, best first (abbina's order): one the database refuses
    // (a person wrote a URL meanwhile, the post went elsewhere) is a proposal
    const { data, error } = await db.rpc('instagram_collega_da_solo', {
      p_shortcode: coppia.shortcode,
      p_contenuto: coppia.contenuto_id,
      p_punteggio: coppia.punteggio,
      p_somiglianza: coppia.somiglianza,
      p_giorni: coppia.giorni as number,
      p_motivi: coppia.motivi,
    })
    if (error) throw new ErroreDatabase('collegamento automatico non riuscito', error.code)
    if (data === true) fatti++
    else proposte.push({ ...coppia, esito: 'proposto' })
  }

  const { data: scritte, error } = await db.rpc('instagram_salva_proposte', {
    p_proposte: proposte.map((p) => ({
      shortcode: p.shortcode,
      contenuto_id: p.contenuto_id,
      punteggio: p.punteggio,
      somiglianza: p.somiglianza,
      giorni: p.giorni,
      motivi: p.motivi,
    })),
  })
  if (error) throw new ErroreDatabase('proposte non salvate', error.code)
  return { collegati: fatti, proposti: typeof scritte === 'number' ? scritte : 0 }
}

type OpzioniGiro = {
  db: AdminClient
  motivo: 'notte' | 'manuale'
  /** epoch ms: past it no new request to Instagram starts */
  entro: number
  adesso?: Date
  /** where and how to reach the Graph API (the tests point it at a fake); the base defaults to baseGraph() */
  graph?: Pick<OpzioniGraph, 'base' | 'versione' | 'fetch' | 'attendi' | 'timeoutMs'>
}

/** What a Graph error means for the run: its cause and sentence. */
function daErrore(e: ErroreInstagram): { causa: CausaContenuti; errore: string | null } {
  switch (e.tipo) {
    case 'token':
      return { causa: 'token', errore: FRASI_CONTENUTI.token }
    case 'limite':
      return { causa: 'limite', errore: FRASI_CONTENUTI.limite }
    case 'rete':
      return { causa: 'rete', errore: FRASI_CONTENUTI.rete }
    case 'tempo':
      return { causa: 'tempo', errore: null }
    default:
      // Meta's message is already blanked of the token (richieste.ts)
      return { causa: 'meta', errore: `${FRASI_CONTENUTI.meta} ${e.message}`.slice(0, 500) }
  }
}

/**
 * The listing run: lease, token (read, never refreshed), the account, the
 * media of the last 180 days, the deletions after a complete reading, the
 * links, the outcome. Never throws.
 */
export async function aggiornaContenutiInstagram(op: OpzioniGiro): Promise<EsitoContenuti> {
  const { db, motivo } = op
  const avvio = Date.now()
  const adesso = op.adesso ?? new Date()
  const esito: EsitoContenuti = {
    esito: 'fallito',
    letti: 0,
    nuovi: 0,
    eliminati: 0,
    scartati: 0,
    collegati: 0,
    proposti: 0,
    campi: null,
    errore: null,
    causa: null,
  }

  // 1. the lease: one run at a time
  let giro: string
  try {
    const { data, error } = await db.rpc('instagram_contenuti_inizia_giro', { p_motivo: motivo })
    if (error) throw new ErroreDatabase('lease non preso', error.code)
    const risposta = (data ?? {}) as { giro?: unknown; rifiutato?: unknown; dal?: unknown; il?: unknown; esito?: unknown }
    if (risposta.rifiutato === 'in_corso') {
      return { ...esito, rifiutato: 'in_corso', dal: String(risposta.dal ?? ''), errore: FRASE_IN_CORSO }
    }
    if (risposta.rifiutato === 'appena_fatto') {
      const il = String(risposta.il ?? '')
      return { ...esito, rifiutato: 'appena_fatto', dal: il, errore: fraseAppenaFatto(il, adesso, risposta.esito === 'fallito') }
    }
    if (typeof risposta.giro !== 'string') throw new ErroreDatabase('lease senza id')
    giro = risposta.giro
  } catch (e) {
    console.error('[contenuti-instagram] giro non iniziato:', e instanceof Error ? e.message : 'errore')
    return { ...esito, causa: 'database', errore: FRASI_CONTENUTI.database }
  }

  let account: string | null = null
  try {
    // 2. the token, from Vault (service role only): read, never refreshed here
    const { data: salvato, error: erroreToken } = await db.rpc('instagram_token')
    if (erroreToken) throw new ErroreDatabase('token non letto', erroreToken.code)
    const token = typeof salvato === 'string' ? salvato.trim() : ''
    if (!token) {
      esito.causa = 'senza_token'
      esito.errore = FRASI_CONTENUTI.senza_token
      return esito
    }

    const graph = creaGraphContenuti({
      ...op.graph,
      base: op.graph?.base ?? baseGraph(),
      token,
      entro: op.entro,
    })

    // 3. the account
    let errore: ErroreInstagram | null = null
    try {
      account = normalizzaUsername((await graph.me()).username)
    } catch (e) {
      if (!(e instanceof ErroreInstagram)) throw e
      errore = e
    }

    // 4. the media of the last 180 days (and the pinned ones on top)
    const dal = new Date(adesso.getTime() - GIORNI_LETTI * 86_400_000)
    let media: MediaLetto[] = []
    let completo = false
    if (!errore) {
      const elenco = await graph.contenutiDal(dal, MEDIA_PER_GIRO)
      media = elenco.media
      completo = elenco.completo
      errore = elenco.errore
      esito.campi = elenco.campi
      esito.scartati = elenco.scartati
    }
    if (media.length > 0) {
      const ids = media.map((m) => m.media_id)
      esito.nuovi = await contaNuovi(db, ids)
      esito.letti = await salvaElencoContenuti(db, media)
      // only a complete reading says what is gone (a deleted or archived post stays, marked)
      if (completo && !errore) {
        const { data, error } = await db.rpc('instagram_contenuti_segna_eliminati', {
          p_dal: dal.toISOString(),
          p_presenti: ids,
        })
        if (error) throw new ErroreDatabase('eliminati non segnati', error.code)
        esito.eliminati = typeof data === 'number' ? data : 0
      }
    }

    // 5. the links, with what is there (also after a failure halfway)
    const abbinamenti = await ricalcolaAbbinamenti({ db, automatico: true, adesso })
    esito.collegati = abbinamenti.collegati
    esito.proposti = abbinamenti.proposti

    // 6. the outcome
    if (!errore) {
      esito.esito = 'ok'
    } else {
      const { causa, errore: frase } = daErrore(errore)
      esito.causa = causa
      esito.errore = frase
      esito.esito =
        causa === 'tempo' || ((causa === 'limite' || causa === 'rete') && esito.letti > 0) ? 'parziale' : 'fallito'
      if (causa === 'token') {
        // Impostazioni › Instagram shows the expired token as for the DMs
        const { error } = await db.rpc('instagram_errore', { p_messaggio: FRASI_ERRORE.token })
        if (error) console.error('[contenuti-instagram] errore del token non registrato:', error.code ?? 'errore')
      }
    }
    return esito
  } catch (e) {
    console.error('[contenuti-instagram] giro interrotto:', e instanceof Error ? e.name : 'errore')
    esito.esito = 'fallito'
    esito.causa = 'database'
    esito.errore = FRASI_CONTENUTI.database
    return esito
  } finally {
    const { data: chiuso, error } = await db.rpc('instagram_contenuti_fine_giro', {
      p_giro: giro,
      p_esito: esito.esito,
      p_letti: esito.letti,
      p_collegati: esito.collegati,
      p_proposti: esito.proposti,
      p_campi: esito.campi as string,
      p_account: account as string,
      p_errore: esito.errore as string,
      // only a failure for the token lets "Aggiorna da Instagram" start again at once
      p_causa: esito.causa as string,
    })
    if (error) console.error('[contenuti-instagram] esito non registrato:', error.code ?? 'errore')
    else if (chiuso === false) console.error('[contenuti-instagram] lease scaduto: esito non registrato')
    console.info('[contenuti-instagram] giro', {
      motivo,
      esito: esito.esito,
      causa: esito.causa,
      letti: esito.letti,
      nuovi: esito.nuovi,
      scartati: esito.scartati,
      eliminati: esito.eliminati,
      collegati: esito.collegati,
      proposti: esito.proposti,
      campi: esito.campi,
      secondi: Math.round((Date.now() - avvio) / 100) / 10,
    })
  }
}
