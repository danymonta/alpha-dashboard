/**
 * Which post of Instagram is which content of the calendar (Dany, 09/10/2026:
 * «per quanto riguarda i link devi semplicemente prenderli dal mio profilo
 * instagram e matcharli con i contenuti ad oggi online»). Pure: the listing
 * run (lib/instagram/sincronizza-contenuti.ts) reads the posts and the
 * contents, calls abbina() and writes what it says.
 *
 * A pair is a post and a content of a compatible type (a Reel Topic with a
 * reel or a video; a Carousel Topic with a carousel or a single photo). It is
 * scored by how close the Post Date is to the day the post went out (Rome)
 * and by how much the caption says the content's own words: its Name without
 * the calendar's codes, the quote in the Name, the hook of the script, the
 * first quote of the message. Words are compared without accents, emoji,
 * hashtags, mentions and links, weighted by rarity across every caption of
 * the profile (the words of every day, "petto", "allenamento", weigh little).
 *
 * Only the sure pairs link by themselves (a Posted content, the same day or
 * the day after, a caption clearly its own, nothing else near it); the rest
 * are proposals for a person, at most 3 per post. A pair a person undid is
 * never proposed again, but it still competes: refusing one candidate never
 * makes the other one sure. A link does free the other pairs of its post and
 * its content: the matching goes on with what is left until nothing new, so
 * one run says at once what the next one would, and runs again change nothing.
 *
 * Every threshold is here (SOGLIE) and in the tests: after the first real run
 * the toast and the log say how many were linked and proposed, and they are
 * tuned only here.
 */
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import type { StatusContenuto, TipoContenuto } from '@/lib/marketing/etichette'

export type TipoPost = 'reel' | 'carousel' | 'foto'

export type Motivo = 'stessa_data' | 'giorno_vicino' | 'didascalia_simile' | 'unico_del_giorno'

export type PostDaAbbinare = {
  shortcode: string
  /** Rome day of pubblicato_il */
  giorno: string
  tipo: TipoPost
  didascalia: string | null
}

export type ContenutoDaAbbinare = {
  id: string
  tipo: TipoContenuto
  stato: StatusContenuto
  post_date: string | null
  nome: string
  bozza: string | null
  finale: string | null
  messaggio: string | null
}

export type Abbinamento = {
  shortcode: string
  contenuto_id: string
  esito: 'automatico' | 'proposto'
  punteggio: number
  somiglianza: number
  giorni: number | null
  motivi: Motivo[]
}

export const SOGLIE = {
  /** rule A: the caption clearly says the content */
  SIM_SICURA: 0.5,
  /** rule B: enough when nothing else is near on either side */
  SIM_ESCLUSIVA: 0.3,
  /** points over the second best, for the post and for the content (rule A) */
  MARGINE: 15,
  /** minimum score of a proposal */
  PROPOSTA: 40,
  /** ... or this similarity */
  SIM_PROPOSTA: 0.35,
  /** a content without Post Date, or more than GIORNI_MAX days away: only by text */
  SIM_SENZA_DATA: 0.6,
  GIORNI_MAX: 7,
  /** the database keeps at most 366 days between the two (marketing_abbinamenti.giorni) */
  GIORNI_SALVABILI: 366,
  PROPOSTE_PER_POST: 3,
  /** the caption's first characters: the hook is at the top */
  DIDASCALIA_CONFRONTO: 600,
  /** the hook of the script is looked for in this much of the message */
  MESSAGGIO_GANCIO: 3000,
  /** the first quote of the message, in this much */
  MESSAGGIO_CITAZIONE: 800,
  /** a hook or a quote shorter than this says nothing */
  TESTO_MINIMO: 8,
} as const

/** By days apart, 0..7. */
const VICINANZA = [1, 0.6, 0.25, 0.1, 0.1, 0.1, 0.1, 0.1] as const

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Words that say nothing of a content: Italian articles, prepositions (with
 * the article, elided too), conjunctions, pronouns and common verbs; a few
 * English ones (Dany posts in English too); the calendar's own words. In the
 * normalized form: no accents, lower case.
 */
const PAROLE_VUOTE = new Set(
  [
    // articles and prepositions
    'il lo la i gli le un uno una di da in con su per tra fra del dello della dei degli delle dell',
    'al allo alla ai agli alle all dal dallo dalla dai dagli dalle dall nel nello nella nei negli nelle nell',
    'sul sullo sulla sui sugli sulle sull col coi',
    // conjunctions and adverbs
    'e ed o od ma che se perche anche come quando quindi poi pero oppure ne mentre dove cosi ecco',
    'non piu molto tanto tutto tutti tutte ogni gia ancora solo sempre mai qui qua li',
    // pronouns
    'io tu lui lei noi voi loro mi ti si ci vi me te mio mia miei mie tuo tua tuoi tue suo sua suoi sue',
    'nostro nostra nostri nostre vostro vostra questo questa questi queste quello quella quelli quelle',
    'chi cosa cui quale quali',
    // common verbs
    'sono sei siamo siete era ero erano essere stato stata stati ho hai ha abbiamo avete hanno avere',
    'avevo aveva fa fai fare faccio',
    // English
    'the a to of and you your is my this that for on with',
    // the calendar's own words
    'reel reels tof mof bof ita eng it contenuto video hook line cta caption',
  ]
    .join(' ')
    .split(' '),
)

const RE_LINK = /https?:\/\/\S+|www\.\S+/giu
const RE_MENZIONE = /@[\p{L}\p{N}._]+/gu
const RE_HASHTAG = /#[\p{L}\p{N}_]+/gu
// never \p{Emoji}: it takes the digits too
const RE_EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu
const RE_SEGNI = /\p{M}/gu
const RE_NON_PAROLA = /[^\p{L}\p{N}]+/gu
const RE_SOLO_LETTERE = /^\p{L}+$/u
const RE_CIFRA_SOLA = /^\p{N}$/u

/**
 * The words of a text, normalized: no links, mentions, hashtags (the Name's
 * codes like "#6MOF" too) and emoji; no accents, lower case; apostrophes and
 * every other sign separate; no empty words, no single letters or single
 * digits ("2017" and "50" stay); a light stem (a final vowel off the words of
 * at least five letters: "allenamento" and "allenamenti" are one word).
 */
export function parole(testo: string | null | undefined): string[] {
  if (!testo) return []
  const pulito = testo
    .replace(RE_LINK, ' ')
    .replace(RE_MENZIONE, ' ')
    .replace(RE_HASHTAG, ' ')
    .replace(RE_EMOJI, ' ')
    .normalize('NFKD')
    .replace(RE_SEGNI, '')
    .toLowerCase()
    .replace(RE_NON_PAROLA, ' ')
  const out: string[] = []
  for (const parola of pulito.split(' ')) {
    if (!parola || PAROLE_VUOTE.has(parola)) continue
    if ([...parola].length === 1 || RE_CIFRA_SOLA.test(parola)) continue
    out.push(radice(parola))
  }
  return out
}

/** "allenamento" → "allenament": one final vowel off a word of at least five letters. */
function radice(parola: string): string {
  if ([...parola].length >= 5 && RE_SOLO_LETTERE.test(parola)) return parola.replace(/[aeio]$/u, '')
  return parola
}

// ---------------------------------------------------------------------------
// The phrases of a content
// ---------------------------------------------------------------------------

// the dashes are written as escapes: U+2013 (en) and U+2014 (em)
const RE_CODICE_INIZIO = /^\s*(?:reel\s*)?#?\d+\s*[-\u2013]?\s*/iu
const RE_FUNNEL = /\b(?:tof|mof|bof)\b/giu
const RE_LINGUA_FINE = /[-\u2013\u2014]\s*(?:it|ita|eng)\s*$/iu
const RE_CODICE_C = /\bc\d{3,5}\b/giu
/** What the codes leave at the edges: spaces and dashes. */
const RE_TRATTINI_AI_BORDI = /^[\s\-\u2013\u2014]+|[\s\-\u2013\u2014]+$/gu
/** A quote: "…", “…” or «…». */
const RE_CITAZIONE = /"([^"\n]+)"|“([^”\n]+)”|«([^»\n]+)»/u
const RE_VIRGOLETTE = /["“”«»]/gu
/** "Hook: the text", "**Hook a schermo:** the text", "> Hook: …" */
const RE_GANCIO_IN_RIGA = /^[\s#*>]*hook(?:\s+a\s+schermo)?[\s*]*:[\s*]*(.*)$/iu
/** A heading "Hook" alone: "**Hook**", "#### Hook", "**Hook a schermo**", "Hook:" */
const RE_GANCIO_TITOLO = /^[\s#*>]*hook(?:\s+a\s+schermo)?[\s*:]*$/iu
/** Another label of the template: never a hook. */
const RE_ETICHETTA = /^(?:line|cta|hook|caption)(?:\s+a\s+schermo)?\s*:/iu
const RE_PUNTINI = /^(?:…|\.{3})$/u

/** The Name without the calendar's codes: "Reel #5 - TOF - …", "#6MOF "…" (em dash) IT", "CONTENUTO c4993". */
export function nomeSenzaCodici(nome: string): string {
  return nome
    .replace(RE_CODICE_INIZIO, '')
    .replace(RE_FUNNEL, ' ')
    .replace(RE_LINGUA_FINE, '')
    .replace(RE_CODICE_C, ' ')
    .replace(RE_TRATTINI_AI_BORDI, '')
}

/** The first quote of at least TESTO_MINIMO characters, without links. */
function primaCitazione(testo: string): string | null {
  const senzaLink = testo.replace(RE_LINK, ' ')
  const re = new RegExp(RE_CITAZIONE.source, 'gu')
  for (const m of senzaLink.matchAll(re)) {
    const citazione = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if ([...citazione].length >= SOGLIE.TESTO_MINIMO) return citazione
  }
  return null
}

/** A hook as written, cleaned of Markdown and quotes; null when it is not one. */
function gancioValido(grezzo: string): string | null {
  const testo = grezzo.replace(/[*#>]/gu, ' ').replace(RE_VIRGOLETTE, ' ').replace(/\s+/gu, ' ').trim()
  if ([...testo].length < SOGLIE.TESTO_MINIMO) return null
  if (RE_ETICHETTA.test(testo) || RE_PUNTINI.test(testo)) return null
  return testo
}

/** The hook of a script: "Hook: text" on its line, or the first line under a heading "Hook". */
export function gancio(testo: string | null | undefined): string | null {
  if (!testo) return null
  const righe = testo.split(/\r?\n/u)
  for (let i = 0; i < righe.length; i++) {
    const riga = righe[i]
    const inRiga = RE_GANCIO_IN_RIGA.exec(riga)
    if (inRiga && inRiga[1].replace(/[\s*]/gu, '') !== '') {
      const trovato = gancioValido(inRiga[1])
      if (trovato) return trovato
      continue
    }
    if (RE_GANCIO_TITOLO.test(riga)) {
      const prossima = righe.slice(i + 1).find((r) => r.trim() !== '')
      if (prossima === undefined) return null
      const trovato = gancioValido(prossima)
      if (trovato) return trovato
    }
  }
  return null
}

/**
 * At most four phrases a caption could say: the Name without codes, the
 * quote in the Name, the hook (Final, then Bozza, then the message), the first
 * quote of the message. Never a link or a shortcode of the message: it holds
 * other creators' reels.
 */
export function fontiDelContenuto(c: Pick<ContenutoDaAbbinare, 'nome' | 'bozza' | 'finale' | 'messaggio'>): string[] {
  const messaggio = c.messaggio ?? ''
  const candidate = [
    nomeSenzaCodici(c.nome),
    primaCitazione(c.nome),
    gancio(c.finale) ?? gancio(c.bozza) ?? gancio(messaggio.slice(0, SOGLIE.MESSAGGIO_GANCIO)),
    primaCitazione(messaggio.slice(0, SOGLIE.MESSAGGIO_CITAZIONE)),
  ]
  const fonti: string[] = []
  const viste = new Set<string>()
  for (const frase of candidate) {
    if (!frase) continue
    const chiave = parole(frase).join(' ')
    if (chiave === '' || viste.has(chiave)) continue
    viste.add(chiave)
    fonti.push(frase)
  }
  return fonti
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/**
 * The weight of each word over the stored captions: ln(1 + N / (1 + df)).
 * A word of every caption weighs little; a word of none weighs the most.
 */
export function pesiParole(didascalie: readonly (string | null)[]): (parola: string) => number {
  const df = new Map<string, number>()
  let n = 0
  for (const d of didascalie) {
    if (!d) continue
    n++
    for (const p of new Set(parole(d))) df.set(p, (df.get(p) ?? 0) + 1)
  }
  return (parola) => Math.log(1 + n / (1 + (df.get(parola) ?? 0)))
}

/**
 * How much a caption says a content's phrases, 0..1: for each phrase the
 * weighted share of its words found in the caption's first 600 characters,
 * times min(1, k / 3) (one or two words alone are not enough); the best
 * phrase, at 3 decimals.
 */
export function somiglianza(didascalia: string | null, fonti: readonly string[], peso: (parola: string) => number): number {
  if (!didascalia || fonti.length === 0) return 0
  const nella = new Set(parole([...didascalia].slice(0, SOGLIE.DIDASCALIA_CONFRONTO).join('')))
  let migliore = 0
  for (const frase of fonti) {
    const distinte = [...new Set(parole(frase))]
    if (distinte.length === 0) continue
    let totale = 0
    let trovato = 0
    for (const p of distinte) {
      const w = peso(p)
      totale += w
      if (nella.has(p)) trovato += w
    }
    if (totale <= 0) continue
    const c = (trovato / totale) * Math.min(1, distinte.length / 3)
    if (c > migliore) migliore = c
  }
  return Math.round(migliore * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Posts as the run reads them
// ---------------------------------------------------------------------------

/** A reel (or any video) is a reel; a carousel a carousel; a single image a photo. */
export function tipoDelPost(p: { media_type: string; reel: boolean }): TipoPost {
  if (p.reel || p.media_type === 'VIDEO') return 'reel'
  return p.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'foto'
}

/** A stored post, as abbina() wants it: the Rome day of its publication (01:30 in Rome is that day). */
export function postDaAbbinare(riga: {
  shortcode: string
  media_type: string
  reel: boolean
  pubblicato_il: string
  didascalia: string | null
}): PostDaAbbinare | null {
  const giorno = giornoRoma(riga.pubblicato_il)
  if (!giorno) return null
  return { shortcode: riga.shortcode, giorno, tipo: tipoDelPost(riga), didascalia: riga.didascalia }
}

/** A Reel Topic with a reel; a Carousel Topic with a carousel or a single photo. */
export function tipiCompatibili(post: TipoPost, contenuto: TipoContenuto): boolean {
  return contenuto === 'reel' ? post === 'reel' : post === 'carousel' || post === 'foto'
}

/** Days between two 'YYYY-MM-DD', never negative. */
export function giorniTra(a: string, b: string): number {
  const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.abs(Math.round((ms(a) - ms(b)) / 86_400_000))
}

/** `${shortcode}|${contenuto_id}`: how a refused pair is looked up. */
export function chiaveCoppia(shortcode: string, contenutoId: string): string {
  return `${shortcode}|${contenutoId}`
}

// ---------------------------------------------------------------------------
// The matching
// ---------------------------------------------------------------------------

type Coppia = {
  post: PostDaAbbinare
  contenuto: ContenutoDaAbbinare
  punteggio: number
  somiglianza: number
  giorni: number | null
  rifiutata: boolean
}

/** Score, then fewer days, then the most recent Post Date, then the ids: the same order every run. */
function ordine(a: Coppia, b: Coppia): number {
  if (a.punteggio !== b.punteggio) return b.punteggio - a.punteggio
  const ga = a.giorni ?? Number.POSITIVE_INFINITY
  const gb = b.giorni ?? Number.POSITIVE_INFINITY
  if (ga !== gb) return ga - gb
  const da = a.contenuto.post_date ?? ''
  const db = b.contenuto.post_date ?? ''
  if (da !== db) return da < db ? 1 : -1
  if (a.contenuto.id !== b.contenuto.id) return a.contenuto.id < b.contenuto.id ? -1 : 1
  return a.post.shortcode < b.post.shortcode ? -1 : a.post.shortcode > b.post.shortcode ? 1 : 0
}

/**
 * The links and the proposals. `post`: not linked, not excluded, not deleted,
 * from the calendar's start minus 3 days. `contenuti`: without URL, not
 * Canceled. `rifiutati`: chiaveCoppia() of the pairs a person undid.
 * `didascalieDelCorpus`: every stored caption, for the words' weights.
 * `automatici: false` (after a person's tap): nothing links by itself, every
 * pair is at most a proposal.
 */
export function abbina(input: {
  post: readonly PostDaAbbinare[]
  contenuti: readonly ContenutoDaAbbinare[]
  rifiutati: ReadonlySet<string>
  didascalieDelCorpus: readonly (string | null)[]
  automatici?: boolean
}): Abbinamento[] {
  const peso = pesiParole(input.didascalieDelCorpus)
  const automatici = input.automatici ?? true
  const contenuti = input.contenuti.filter((c) => c.stato !== 'canceled')
  const fonti = new Map(contenuti.map((c) => [c.id, fontiDelContenuto(c)]))

  // Every compatible pair (refused ones too: they still compete) and, among
  // them, the ones worth a link or a proposal: within a week, or further
  // (or without Post Date) only with a caption that clearly says the content.
  // The others are only measured against (rule B, laPiuSimile).
  const confronti: Coppia[] = []
  const coppie: Coppia[] = []
  for (const post of input.post) {
    for (const contenuto of contenuti) {
      if (!tipiCompatibili(post.tipo, contenuto.tipo)) continue
      const giorni = contenuto.post_date ? giorniTra(post.giorno, contenuto.post_date) : null
      if (giorni !== null && giorni > SOGLIE.GIORNI_SALVABILI) continue
      const sim = somiglianza(post.didascalia, fonti.get(contenuto.id) ?? [], peso)
      const vicinanza = giorni !== null && giorni <= SOGLIE.GIORNI_MAX ? VICINANZA[giorni] : 0
      const coppia: Coppia = {
        post,
        contenuto,
        giorni,
        somiglianza: sim,
        punteggio: Math.round(100 * (0.6 * sim + 0.4 * vicinanza)),
        rifiutata: input.rifiutati.has(chiaveCoppia(post.shortcode, contenuto.id)),
      }
      confronti.push(coppia)
      if ((giorni === null || giorni > SOGLIE.GIORNI_MAX) && sim < SOGLIE.SIM_SENZA_DATA) continue
      coppie.push(coppia)
    }
  }

  /**
   * The rules over a set of pairs: the margins (rule A) and "nothing else
   * near" (rule B, unico_del_giorno) are measured against that set only;
   * "the most similar" (rule B, laPiuSimile) against every compatible pair
   * still free (`confrontiLiberi`), whatever its distance.
   */
  const regole = (insieme: readonly Coppia[], confrontiLiberi: readonly Coppia[]) => {
    const delPost = new Map<string, Coppia[]>()
    const delContenuto = new Map<string, Coppia[]>()
    for (const c of insieme) {
      const p = delPost.get(c.post.shortcode)
      if (p) p.push(c)
      else delPost.set(c.post.shortcode, [c])
      const k = delContenuto.get(c.contenuto.id)
      if (k) k.push(c)
      else delContenuto.set(c.contenuto.id, [c])
    }
    // the highest similarity of each post and of each content, over every free compatible pair
    const simPost = new Map<string, number>()
    const simContenuto = new Map<string, number>()
    for (const c of confrontiLiberi) {
      simPost.set(c.post.shortcode, Math.max(simPost.get(c.post.shortcode) ?? 0, c.somiglianza))
      simContenuto.set(c.contenuto.id, Math.max(simContenuto.get(c.contenuto.id) ?? 0, c.somiglianza))
    }
    const migliorAltra = (altre: Coppia[] | undefined, questa: Coppia) =>
      Math.max(Number.NEGATIVE_INFINITY, ...(altre ?? []).filter((x) => x !== questa).map((x) => x.punteggio))
    const vicinaAltra = (altre: Coppia[] | undefined, questa: Coppia) =>
      (altre ?? []).some((x) => x !== questa && x.giorni !== null && x.giorni <= 1)
    /**
     * Rule B weighs the days only: a pair of the same post or of the same
     * content with a closer caption, days away (a Post Date that slipped and
     * nobody moved, even beyond a week, or no Post Date at all), makes it
     * unsure, whatever its distance. The pair itself is in the set, so its
     * similarity at least equal to the highest means no other is closer.
     */
    const laPiuSimile = (c: Coppia) =>
      c.somiglianza >= (simPost.get(c.post.shortcode) ?? 0) &&
      c.somiglianza >= (simContenuto.get(c.contenuto.id) ?? 0)

    const unico = (c: Coppia) =>
      c.giorni === 0 && !vicinaAltra(delPost.get(c.post.shortcode), c) && !vicinaAltra(delContenuto.get(c.contenuto.id), c)

    const sicura = (c: Coppia): boolean => {
      if (!automatici || c.rifiutata || c.contenuto.stato !== 'posted' || c.giorni === null || c.giorni > 1) return false
      const regolaA =
        c.somiglianza >= SOGLIE.SIM_SICURA &&
        c.punteggio - migliorAltra(delPost.get(c.post.shortcode), c) >= SOGLIE.MARGINE &&
        c.punteggio - migliorAltra(delContenuto.get(c.contenuto.id), c) >= SOGLIE.MARGINE
      const regolaB = c.somiglianza >= SOGLIE.SIM_ESCLUSIVA && unico(c) && laPiuSimile(c)
      return regolaA || regolaB
    }

    const motivi = (c: Coppia): Motivo[] => {
      const m: Motivo[] = []
      if (c.giorni === 0) m.push('stessa_data')
      if (c.giorni === 1) m.push('giorno_vicino')
      if (c.somiglianza >= SOGLIE.SIM_ESCLUSIVA) m.push('didascalia_simile')
      if (unico(c)) m.push('unico_del_giorno')
      return m
    }

    const verso = (c: Coppia, esito: Abbinamento['esito']): Abbinamento => ({
      shortcode: c.post.shortcode,
      contenuto_id: c.contenuto.id,
      esito,
      punteggio: c.punteggio,
      somiglianza: c.somiglianza,
      giorni: c.giorni,
      motivi: motivi(c),
    })

    return { sicura, verso }
  }

  const presiPost = new Set<string>()
  const presiContenuti = new Set<string>()
  const libera = (c: Coppia) => !presiPost.has(c.post.shortcode) && !presiContenuti.has(c.contenuto.id)
  const risultato: Abbinamento[] = []

  // The sure ones, best first, a post and a content once each; then again on
  // the pairs left free, until nothing new. A link can leave the other post
  // and content of that day alone, and the next run (which no longer reads a
  // linked post nor a content with a URL) would link them: one run says at
  // once what two would, and a second run on the same data links nothing new.
  let libere = [...coppie].sort(ordine)
  let confrontiLiberi: readonly Coppia[] = confronti
  let r = regole(libere, confrontiLiberi)
  for (;;) {
    let nuove = 0
    for (const c of libere) {
      if (!libera(c) || !r.sicura(c)) continue
      presiPost.add(c.post.shortcode)
      presiContenuti.add(c.contenuto.id)
      risultato.push(r.verso(c, 'automatico'))
      nuove++
    }
    if (nuove === 0) break
    libere = libere.filter(libera)
    confrontiLiberi = confrontiLiberi.filter(libera)
    r = regole(libere, confrontiLiberi)
  }

  // the proposals: neither a post nor a content already taken, at most 3 per post
  const perPost = new Map<string, number>()
  for (const c of libere) {
    if (c.rifiutata) continue
    if (c.punteggio < SOGLIE.PROPOSTA && c.somiglianza < SOGLIE.SIM_PROPOSTA) continue
    const gia = perPost.get(c.post.shortcode) ?? 0
    if (gia >= SOGLIE.PROPOSTE_PER_POST) continue
    perPost.set(c.post.shortcode, gia + 1)
    risultato.push(r.verso(c, 'proposto'))
  }

  return risultato
}
