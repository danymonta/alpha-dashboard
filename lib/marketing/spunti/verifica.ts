import { ICP } from '@/lib/marketing/icp'
import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE, valoreDaEtichetta } from '@/lib/marketing/etichette'
import { Pulitore, chiaveNome, type OpzioniVerifica } from '@/lib/marketing/analisi/verifica'
import { paroleNormalizzate } from '@/lib/marketing/analisi/oscura'
import { numeriDi, type FontiPreparate } from '@/lib/marketing/spunti/fonti'
import type { SpuntiModello } from '@/lib/marketing/spunti/schema'
import { SOGLIA_FONTI, type FonteSpunto, type IdeaSpunto, type SpuntiContenuto, type VoceSpunto } from '@/lib/marketing/spunti/tipi'

/**
 * The strict layer and the final check of the weekly brief (1.37.0, CLAUDE.md section 31). Pure.
 *
 * - References: only the kinds each section may cite, and only those that were sent; an entry
 *   with no valid reference goes (every point of the brief has its why).
 * - Threshold: a theme, an objection or a question stands only on SOGLIA_FONTI sources at least
 *   (a DM theme weighs its chats; a day of the setter's answers, a call weighs one, and once even if
 *   it comes from the reason of the closer and from its analysis); below it the entry goes.
 * - The sources of a theme are worked out from its references, never taken from the model.
 * - Texts: lengths cut (never refused), names, handles, amounts, links and long dashes cleaned;
 *   eight words in a row copied from the team's texts take the entry out; a long quoted piece
 *   (more than four words) that is not a phrase of the ICP takes out an entry that talks about
 *   leads: the Marketing area gets themes, not the leads' words; in the prose a number that is not
 *   in a fact or in the ICP takes the entry out (names, hooks and scripts keep their own).
 * - Ideas: 5 to 8, Reel Type and Format as Notion's labels (an unknown one drops the idea), a Name
 *   already in the calendar drops it.
 * Fails only a brief with no summary and no idea. The counts go to the log, never a text.
 */
export const LIMITI_SPUNTI = {
  inBreve: 600, voce: 200, perche: 200, tema: 80, cosaDicono: 240, obiezione: 120, scioglie: 240, domanda: 160, risposta: 240,
  nome: 120, gancio: 100, messaggio: 300, riga: 160, cta: 120, hook: 120,
  cosaFunziona: 5, temi: 8, obiezioni: 6, domande: 6, voci: 5, idee: 8, righe: 5, slide: 8,
} as const

const GANCIO_PAROLE_MAX = 12
/** What each section may cite. */
const AMMESSI = {
  voci: ['R', 'P', 'F'],
  temi: ['D', 'S', 'K', 'C', 'F'],
  obiezioni: ['D', 'S', 'K', 'C', 'F'],
  domande: ['D', 'S', 'C'],
  idee: ['R', 'P', 'F', 'D', 'S', 'K', 'C'],
} as const

const RE_VIRGOLETTE = /[«“"]([^»”"]{1,400})[»”"]/gu
const ICP_NORMALIZZATO = paroleNormalizzate(ICP).join(' ')

/** A quoted piece of more than four words that is not a phrase of the ICP. */
export function citazioneLunga(testo: string): boolean {
  for (const m of testo.matchAll(RE_VIRGOLETTE)) {
    const parole = paroleNormalizzate(m[1])
    if (parole.length > 4 && !ICP_NORMALIZZATO.includes(parole.join(' '))) return true
  }
  return false
}

export type ConteggiSpunti = { nomi: number; handle: number; importi: number; link: number; trattini: number; soglia: number; copie: number; cifre: number; virgolette: number; riferimenti: number }

export type EsitoVerificaSpunti = { dati: SpuntiContenuto; conteggi: ConteggiSpunti } | null

export function verificaSpunti(m: SpuntiModello, f: FontiPreparate): EsitoVerificaSpunti {
  const opz: OpzioniVerifica = { parole: f.parole, note: f.note }
  const p = new Pulitore(opz)
  const extra = { soglia: 0, cifre: 0, virgolette: 0, riferimenti: 0 }

  const ammessi = (rif: readonly string[], tipi: readonly string[]) =>
    [...new Set(rif.map((x) => x.trim()))].filter((x) => f.rifInviati.has(x) && tipi.includes(x[0]))

  /** The weight of the distinct sources behind the references. */
  const peso = (rif: readonly string[]): number => {
    let somma = 0
    const viste = new Set<string>()
    for (const r of rif) {
      const w = f.pesi.get(r)
      if (!w) continue
      if (w.k) {
        if (viste.has(w.k)) continue
        viste.add(w.k)
      }
      somma += w.n
    }
    return somma
  }
  const fontiDi = (rif: readonly string[]): FonteSpunto[] => {
    const out = new Set<FonteSpunto>()
    for (const r of rif) {
      out.add(r[0] === 'D' ? 'dm' : r[0] === 'S' ? 'setting' : r[0] === 'K' || r[0] === 'C' ? 'call' : 'contenuti')
    }
    return [...out]
  }
  /** Prose: a number that is in no fact and not in the ICP takes the entry out. */
  const cifreOk = (...testi: string[]): boolean => {
    for (const t of testi) for (const n of numeriDi(t)) if (!f.numeriAmmessi.has(n)) return false
    return true
  }

  const voci = (a: SpuntiModello['mantieni'], quante: number): VoceSpunto[] => {
    const out: VoceSpunto[] = []
    for (const v of a) {
      const rif = ammessi(v.rif, AMMESSI.voci)
      if (rif.length === 0) { extra.riferimenti++; continue }
      const testo = p.testo(v.testo, LIMITI_SPUNTI.voce)
      const perche = p.testo(v.perche, LIMITI_SPUNTI.perche)
      if (!testo || !perche) continue
      if (!cifreOk(testo, perche)) { extra.cifre++; continue }
      out.push({ testo, perche, rif })
      if (out.length >= quante) break
    }
    return out
  }

  const temi: SpuntiContenuto['temi'] = []
  for (const t of m.temi) {
    const rif = ammessi(t.rif, AMMESSI.temi)
    if (rif.length === 0) { extra.riferimenti++; continue }
    if (peso(rif) < SOGLIA_FONTI) { extra.soglia++; continue }
    const tema = p.testo(t.tema, LIMITI_SPUNTI.tema)
    const cosa = p.testo(t.cosa_dicono, LIMITI_SPUNTI.cosaDicono)
    if (!tema || !cosa) continue
    if (citazioneLunga(cosa) || citazioneLunga(tema)) { extra.virgolette++; continue }
    if (!cifreOk(tema, cosa)) { extra.cifre++; continue }
    temi.push({ tema, cosa_dicono: cosa, fonti: fontiDi(rif), tendenza: t.tendenza, rif })
    if (temi.length >= LIMITI_SPUNTI.temi) break
  }

  const obiezioni: SpuntiContenuto['obiezioni'] = []
  for (const o of m.obiezioni) {
    const rif = ammessi(o.rif, AMMESSI.obiezioni)
    if (rif.length === 0) { extra.riferimenti++; continue }
    if (peso(rif) < SOGLIA_FONTI) { extra.soglia++; continue }
    const obiezione = p.testo(o.obiezione, LIMITI_SPUNTI.obiezione)
    const scioglie = p.testo(o.contenuto_che_la_scioglie, LIMITI_SPUNTI.scioglie)
    const perche = p.testo(o.perche, LIMITI_SPUNTI.perche)
    if (!obiezione || !scioglie || !perche) continue
    if (citazioneLunga(obiezione)) { extra.virgolette++; continue }
    if (!cifreOk(obiezione, scioglie, perche)) { extra.cifre++; continue }
    obiezioni.push({ obiezione, dove_pesa: o.dove_pesa, contenuto_che_la_scioglie: scioglie, perche, rif })
    if (obiezioni.length >= LIMITI_SPUNTI.obiezioni) break
  }

  const domande: SpuntiContenuto['domande'] = []
  for (const d of m.domande) {
    const rif = ammessi(d.rif, AMMESSI.domande)
    if (rif.length === 0) { extra.riferimenti++; continue }
    if (peso(rif) < SOGLIA_FONTI) { extra.soglia++; continue }
    const domanda = p.testo(d.domanda, LIMITI_SPUNTI.domanda)
    const risposta = p.testo(d.risposta_in_breve, LIMITI_SPUNTI.risposta)
    if (!domanda || !risposta) continue
    if (citazioneLunga(domanda)) { extra.virgolette++; continue }
    if (!cifreOk(domanda, risposta)) { extra.cifre++; continue }
    domande.push({ domanda, risposta_in_breve: risposta, rif })
    if (domande.length >= LIMITI_SPUNTI.domande) break
  }

  // the ideas
  const esistenti = new Set(f.nomiInCalendario)
  const idee: IdeaSpunto[] = []
  for (const i of m.idee) {
    const rif = ammessi(i.rif, AMMESSI.idee)
    if (rif.length === 0) { extra.riferimenti++; continue }
    const reelType = valoreDaEtichetta(ETICHETTA_REEL_TYPE, i.reel_type)
    if (!reelType) continue
    let format: IdeaSpunto['format'] = null
    if (i.format !== null) {
      format = valoreDaEtichetta(ETICHETTA_FORMAT, i.format)
      if (!format) continue
    }
    const name = p.testo(i.name, LIMITI_SPUNTI.nome)
    if (!name || esistenti.has(chiaveNome(name))) continue
    const hook = p.testo(i.script.hook, LIMITI_SPUNTI.hook)
    const gancioPieno = p.testo(i.gancio, LIMITI_SPUNTI.gancio) ?? hook
    if (!hook || !gancioPieno) continue
    const perche = p.testoOVuoto(i.perche, LIMITI_SPUNTI.perche)
    if (!cifreOk(perche)) { extra.cifre++; continue }
    esistenti.add(chiaveNome(name))
    idee.push({
      modello: i.modello,
      nasce_da: i.nasce_da,
      fase: i.fase,
      name,
      reel_type: reelType,
      format,
      gancio: gancioPieno.split(/\s+/).slice(0, GANCIO_PAROLE_MAX).join(' '),
      messaggio: p.testoOVuoto(i.messaggio, LIMITI_SPUNTI.messaggio),
      script: {
        hook,
        righe: p.elenco(i.script.righe, i.modello === 'carousel' ? LIMITI_SPUNTI.slide : LIMITI_SPUNTI.righe, LIMITI_SPUNTI.riga),
        cta: p.testoOVuoto(i.script.cta, LIMITI_SPUNTI.cta),
      },
      perche,
      rif,
    })
    if (idee.length >= LIMITI_SPUNTI.idee) break
  }

  const inBreve = p.testo(m.in_breve, LIMITI_SPUNTI.inBreve) ?? ''
  if (inBreve === '' && idee.length === 0) return null

  const dati: SpuntiContenuto = {
    versione: 'spunti',
    in_breve: inBreve,
    cosa_funziona: voci(m.cosa_funziona, LIMITI_SPUNTI.cosaFunziona),
    temi,
    obiezioni,
    domande,
    mantieni: voci(m.mantieni, LIMITI_SPUNTI.voci),
    cambia: voci(m.cambia, LIMITI_SPUNTI.voci),
    potenzia: voci(m.potenzia, LIMITI_SPUNTI.voci),
    idee,
    fatti: {},
  }
  // the sentences of the facts the brief quotes (the numbers are the database's)
  const citati = new Set<string>()
  for (const lista of [dati.cosa_funziona, dati.temi, dati.obiezioni, dati.domande, dati.mantieni, dati.cambia, dati.potenzia, dati.idee]) {
    for (const x of lista) for (const r of (x as { rif: string[] }).rif) citati.add(r)
  }
  for (const r of citati) {
    const frase = f.fatti.get(r)
    if (frase) dati.fatti[r] = frase
  }
  return { dati, conteggi: { ...p.conteggi, copie: p.scartate, ...extra } }
}
