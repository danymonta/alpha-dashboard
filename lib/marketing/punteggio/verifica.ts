import { Pulitore, type EsitoVerifica, type OpzioniVerifica } from '@/lib/marketing/analisi/verifica'
import { senzaAccenti } from '@/lib/marketing/analisi/oscura'
import type { PunteggioModello } from '@/lib/marketing/punteggio/schema'
import {
  calcolaPunteggio,
  chiudiPunteggioAtteso,
  DURATA_MAX_SECONDI,
  ECCESSO_LUNGHEZZA,
  FLAG_DI_CLAUDE,
  FLAG_SENZA_RIGA,
  NOME_TIPO,
  PENALITA,
  puntiRecuperabili,
  SEGNALAZIONI_DI_CLAUDE,
  vociDelTipo,
  type FlagPenalita,
  type IdCriterio,
  type TipoPunteggio,
} from '@/lib/marketing/punteggio/tabelle'
import {
  CATEGORIE_HOOK,
  VERSIONE_FORMATO_PUNTEGGIO,
  type CategoriaHook,
  type CriterioValutato,
  type PenalitaValutata,
  type ProblemaPrioritario,
  type PunteggioContenuto,
} from '@/lib/marketing/punteggio/tipi'

/**
 * The strict layer and the final check of what Claude writes in the content
 * scoring (1.39.0, CLAUDE.md section 30). Pure.
 *
 * Claude's votes become a score here, with the tables of tabelle.ts. A
 * criterion that is missing, or the tipo that is not one of the three, makes
 * the whole answer unreadable (null). The rest is cut or dropped, never
 * refused: a citation must be a literal passage of what was published (the
 * transcript, the caption, the on-screen text), otherwise it is dropped and the
 * criterion stays with «citazione non trovata»; a penalty with a line that is
 * not in the content is dropped (it cannot be proved); the long dash, the emoji,
 * the forbidden phrase and an excessive length are found by the code itself,
 * whatever Claude says; a hook alternative of 10 words or more is dropped;
 * every text then goes through the same cleaning as the analysis (no name, no
 * handle, no amount, no link, no long dash) and has no emoji; a rewritten
 * script has no bullet. The expected score is kept coherent with what the
 * rewrite can still gain.
 */

export const LIMITI = {
  tipoMotivo: 200,
  citazione: 220,
  motivazione: 320,
  correzione: 320,
  riga: 160,
  penalitaDescrizione: 160,
  puntoForza: 220,
  problema: 220,
  benchmark: 320,
  istruzione: 300,
  hook: 140,
  perche: 200,
  script: 6000,
  caption: 600,
  nota: 200,
  segnalazione: 240,
} as const

/** A hook alternative has fewer than this many words (section 11: «sotto le 10 parole»). */
export const HOOK_PAROLE_MAX = 9

// ---------------------------------------------------------------------------
// Words, passages, emoji
// ---------------------------------------------------------------------------

export function contaParole(testo: string): number {
  return testo
    .trim()
    .split(/\s+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p)).length
}

/** A text for comparing a quotation with its source: no case, no accents, no punctuation. */
export function normalizza(testo: string): string {
  return senzaAccenti(testo.replace(/[’‘`´]/g, "'"))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Whether `citazione` is a literal passage of `fonte`: compared without case,
 * accents or punctuation, across line breaks; an ellipsis splits it in passages
 * that must each be there. Empty is never a passage.
 */
export function citazioneTrovata(citazione: string, fonteNormalizzata: string): boolean {
  const pezzi = citazione
    .split(/…|\.{3}/)
    .map(normalizza)
    .filter((p) => p !== '')
  if (pezzi.length === 0) return false
  return pezzi.every((p) => fonteNormalizzata.includes(p))
}

const RE_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}\u{200D}]/gu
const RE_TRATTINO = /[–—]/

export function senzaEmoji(testo: string): string {
  return testo.replace(RE_EMOJI, '')
}

/** A bullet at the start of a line is taken off (a script is prose, section 5). */
export function senzaElenchi(testo: string): string {
  return testo.replace(/^[ \t]*[-*•]\s+/gm, '')
}

const intorno = (testo: string, indice: number) => {
  const da = Math.max(0, indice - 30)
  return testo.slice(da, indice + 50).replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// What the code finds by itself
// ---------------------------------------------------------------------------

export type FontiPunteggio = {
  /** the transcript sent to Claude, as plain text */
  parlato: string
  /** the caption sent to Claude; empty when there is none */
  didascalia: string
  /** the on-screen texts of the visual card, when it was made */
  testoSchermo: readonly string[]
}

export type ContestoPunteggio = {
  /** the type the Reel Type of the linked content declares; null: Claude deduces it */
  tipoDichiarato: TipoPunteggio | null
  /** the real duration, or the estimate from the words (2.5 per second) */
  durataSecondi: number | null
}

const FRASE_VIETATA = normalizza('Non è solo fisico. È sicurezza personale.')

/** The flags the code sees in the published texts and in the duration (the long dash, emoji, the forbidden phrase, the length). */
export function flagDelCodice(f: FontiPunteggio, c: ContestoPunteggio, tipo: TipoPunteggio): { flag: FlagPenalita; riga: string }[] {
  const testi = [f.parlato, f.didascalia, ...f.testoSchermo].filter((t) => t.trim() !== '')
  const fuori: { flag: FlagPenalita; riga: string }[] = []
  const prima = <T>(trova: (t: string) => T | null): T | null => {
    for (const t of testi) {
      const r = trova(t)
      if (r) return r
    }
    return null
  }
  const dash = prima((t) => {
    const i = t.search(RE_TRATTINO)
    return i >= 0 ? intorno(t, i) : null
  })
  if (dash !== null) fuori.push({ flag: 'EM_DASH', riga: dash })
  const emoji = prima((t) => {
    const m = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/u.exec(t)
    return m ? intorno(t, m.index) : null
  })
  if (emoji !== null) fuori.push({ flag: 'EMOJI', riga: emoji })
  if (testi.some((t) => normalizza(t).includes(FRASE_VIETATA))) fuori.push({ flag: 'FRASE_VIETATA', riga: 'Non è solo fisico. È sicurezza personale.' })
  const limite = DURATA_MAX_SECONDI[tipo]
  if (c.durataSecondi !== null && c.durataSecondi > limite * ECCESSO_LUNGHEZZA) {
    fuori.push({ flag: 'LUNGHEZZA_ECCESSIVA', riga: `Durata ${Math.round(c.durataSecondi)} secondi contro i ${limite} del tipo.` })
  }
  return fuori
}

// ---------------------------------------------------------------------------
// The whole check
// ---------------------------------------------------------------------------

const VERSO_TIPO: Record<string, TipoPunteggio> = { REEL_TOF: 'tof', REEL_MOF: 'mof', REEL_BOF: 'bof' }
const eCategoria = (c: string): c is CategoriaHook => (CATEGORIE_HOOK as readonly string[]).includes(c)

/**
 * The score as the database keeps it. null: the answer cannot become a score
 * (a type that is not a reel's, or a criterion of the type with no vote).
 */
export function verificaPunteggio(
  m: PunteggioModello,
  f: FontiPunteggio,
  c: ContestoPunteggio,
  o: OpzioniVerifica,
): EsitoVerifica<PunteggioContenuto> | null {
  const tipo = c.tipoDichiarato ?? VERSO_TIPO[m.tipo] ?? null
  if (!tipo) return null

  // 1. the votes: one for every criterion of the type, none missing
  const voci = vociDelTipo(tipo)
  const dato = new Map<string, PunteggioModello['criteri'][number]>()
  for (const x of m.criteri) if (!dato.has(x.id)) dato.set(x.id, x)
  if (!voci.every((v) => dato.has(v.id) && Number.isFinite(dato.get(v.id)?.voto))) return null

  const p = new Pulitore(o)
  let scartate = 0
  const pubblicato = normalizza([f.parlato, f.didascalia, ...f.testoSchermo].join('\n'))

  // 2. the hook
  const testoHook = m.hook.testo.trim() || f.parlato.trim().split(/\s+/).slice(0, 12).join(' ') || (f.testoSchermo[0] ?? '')
  const paroleHook = contaParole(testoHook)
  const hookPulito = p.testo(senzaEmoji(testoHook), LIMITI.hook) ?? ''

  // 3. the flags: Claude's with a line that is in the content, and the code's own
  const flag: FlagPenalita[] = []
  const penalita: PenalitaValutata[] = []
  const aggiungi = (fl: FlagPenalita, riga: string, da: 'codice' | 'claude') => {
    if (flag.includes(fl)) return
    flag.push(fl)
    penalita.push({
      flag: fl,
      valore: PENALITA[fl].valore,
      descrizione: PENALITA[fl].descrizione,
      riga: p.testoOVuoto(senzaEmoji(riga), LIMITI.riga),
      da,
    })
  }
  for (const x of m.penalita) {
    const fl = x.flag as FlagPenalita
    if (!(FLAG_DI_CLAUDE as readonly string[]).includes(fl)) continue
    const solo = PENALITA[fl].soloTipi
    if (solo && !solo.includes(tipo)) continue
    if (!(FLAG_SENZA_RIGA as readonly string[]).includes(fl) && !citazioneTrovata(x.riga, pubblicato)) {
      scartate++
      continue
    }
    aggiungi(fl, FLAG_SENZA_RIGA.includes(fl) ? '' : x.riga, 'claude')
  }
  for (const x of flagDelCodice(f, c, tipo)) aggiungi(x.flag, x.riga, 'codice')

  // 4. the formal violations the flags do not cover: each needs its line in the content
  const altreFormali = m.violazioni_formali
    .filter((x) => {
      const trovata = citazioneTrovata(x.riga, pubblicato)
      if (!trovata) scartate++
      return trovata
    })
    .slice(0, 3)
    .map((x) => ({ descrizione: p.testoOVuoto(senzaEmoji(x.descrizione), LIMITI.nota), riga: p.testoOVuoto(senzaEmoji(x.riga), LIMITI.riga) }))
    .filter((x) => x.descrizione !== '')

  // 5. the score
  const voti: Partial<Record<IdCriterio, number>> = {}
  for (const v of voci) voti[v.id] = dato.get(v.id)?.voto ?? 0
  const senzaCaption = f.didascalia.trim() === ''
  const e = calcolaPunteggio({
    tipo,
    voti,
    paroleHook,
    hookCitaIcp: m.hook.cita_icp,
    flag,
    violazioniFormaliExtra: altreFormali.length,
    senzaCaption,
  })

  // 6. the criteria, with the passage that must be a real one
  const criteri: CriterioValutato[] = e.criteri.map((k) => {
    const x = dato.get(k.id)!
    const cit = x.citazione.trim()
    const trovata = cit === '' ? true : citazioneTrovata(cit, pubblicato)
    return {
      ...k,
      citazione: cit !== '' && trovata ? p.testo(senzaEmoji(cit), LIMITI.citazione) : null,
      citazione_trovata: trovata,
      motivazione: p.testoOVuoto(senzaEmoji(x.motivazione), LIMITI.motivazione),
      correzione: p.testoOVuoto(senzaEmoji(x.correzione), LIMITI.correzione),
    }
  })

  // 7. the priorities: by the points still to gain, computed here
  const visti = new Set<string>()
  const problemi: ProblemaPrioritario[] = m.problemi_prioritari
    .flatMap((x) => {
      const k = criteri.find((y) => y.id === x.criterio)
      if (!k || visti.has(k.id)) return []
      const impatto = puntiRecuperabili(k)
      const problema = p.testo(senzaEmoji(x.problema), LIMITI.problema)
      if (impatto <= 0 || !problema) return []
      visti.add(k.id)
      return [{ criterio: k.id, nome: k.nome, problema, impatto_punti: impatto }]
    })
    .sort((a, b) => b.impatto_punti - a.impatto_punti)
    .slice(0, 5)
    .map((x, i) => ({ ordine: i + 1, ...x }))

  // 8. the remarks
  const segnalazioni: string[] = []
  for (const s of m.segnalazioni) {
    if (!(SEGNALAZIONI_DI_CLAUDE as readonly string[]).includes(s.tipo)) continue
    const nota = p.testoOVuoto(senzaEmoji(s.nota), LIMITI.nota)
    const parola = s.tipo === 'NUMERO_INCOERENTE' ? 'Numero da verificare' : 'Classificazione dubbia'
    const riga = nota ? `${parola}: ${nota}` : parola
    if (!segnalazioni.includes(riga)) segnalazioni.push(riga.slice(0, LIMITI.segnalazione))
  }
  if (senzaCaption) segnalazioni.push('Caption non valutata')
  if (paroleHook === 0 || testoHook === '') segnalazioni.push('Hook non trovato')

  // 9. the redo
  const hookAlt = m.rifacimento.hook_alternativi
    .flatMap((x) => {
      const t = p.testo(senzaEmoji(x.testo), LIMITI.hook)
      if (!t || contaParole(t) > HOOK_PAROLE_MAX || !eCategoria(x.categoria)) {
        scartate++
        return []
      }
      return [{ testo: t, categoria: x.categoria, perche_funziona: p.testoOVuoto(senzaEmoji(x.perche_funziona), LIMITI.perche) }]
    })
    .slice(0, 3)
  const script = p.testo(senzaElenchi(senzaEmoji(m.rifacimento.script_riscritto)), LIMITI.script) ?? ''
  const rifacimento = {
    istruzioni: p.elenco(m.rifacimento.istruzioni.map(senzaEmoji), 5, LIMITI.istruzione),
    hook_alternativi: hookAlt,
    script_riscritto: script,
    caption_riscritta: p.testoOVuoto(senzaEmoji(m.rifacimento.caption_riscritta), LIMITI.caption),
    punteggio_atteso: chiudiPunteggioAtteso(m.rifacimento.punteggio_atteso, e),
  }

  const dati: PunteggioContenuto = {
    versione: VERSIONE_FORMATO_PUNTEGGIO,
    tipo,
    tipo_origine: c.tipoDichiarato ? 'dichiarato' : 'dedotto',
    motivo_classificazione: p.testoOVuoto(senzaEmoji(m.motivo_classificazione), LIMITI.tipoMotivo),
    durata_stimata_secondi: c.durataSecondi === null ? null : Math.round(c.durataSecondi),
    hook: { testo: hookPulito, parole: paroleHook, cita_icp: m.hook.cita_icp },
    totale_grezzo: e.totale_grezzo,
    penalita_totali: e.penalita_totali,
    totale: e.totale,
    fascia: e.fascia,
    limiti_applicati: e.limiti_applicati,
    violazioni_formali: e.violazioni_formali,
    altre_violazioni_formali: altreFormali,
    criteri,
    penalita: penalita.filter((x) => x.valore !== 0),
    punti_di_forza: p.elenco(m.punti_di_forza.map(senzaEmoji), 3, LIMITI.puntoForza),
    problemi_prioritari: problemi,
    confronto_benchmark: p.testo(m.confronto_benchmark === null ? null : senzaEmoji(m.confronto_benchmark), LIMITI.benchmark),
    segnalazioni,
    rifacimento,
  }
  return { dati, conteggi: p.conteggi, scartate: scartate + p.scartate }
}

export { NOME_TIPO }
