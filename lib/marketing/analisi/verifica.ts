import type { AnalisiModello, IdeaModello, SchedaVisivaModello } from '@/lib/marketing/analisi/schema'
import { copiaDelleNote, ripulisciUscita, type ConteggiControllo } from '@/lib/marketing/analisi/oscura'
import type { AnalisiContenuto, IdeaContenuto, IdeeDaProporre, SchedaVisiva } from '@/lib/marketing/analisi/tipi'
import {
  ETICHETTA_FORMAT,
  ETICHETTA_REEL_TYPE,
  valoreDaEtichetta,
  type FormatContenuto,
  type ReelType,
} from '@/lib/marketing/etichette'

/**
 * The strict layer and the final check of what Claude writes in the reel
 * analysis (1.36.0, CLAUDE.md section 30, D20). Pure.
 *
 * The lengths and the numbers are cut, never refused: only an analysis with no
 * summary and no idea, or a card with no summary, fails. Every text then goes
 * through ripulisciUscita (no name, no handle, no amount, no link, no long
 * dash); with the notes of the team switched on, an entry that copies eight
 * words in a row from a note is dropped. The refs of the contents come back
 * to ids only if they were sent; a Reel Type or a Format that is not
 * Notion's discards the idea.
 */

/** The longest of each text, in characters. */
export const LIMITI = {
  sintesiVisiva: 600,
  breve: 300,
  corto: 160,
  sequenza: 200,
  ambiente: 40,
  leva: 120,
  perche: 400,
  sintesi: 600,
  funzionato: 200,
  miglioraCosa: 200,
  miglioraCome: 300,
  daiLead: 400,
  nomeIdea: 120,
  gancioIdea: 160,
  messaggioIdea: 400,
  rigaScript: 200,
  perIdea: 300,
} as const

const GANCIO_PAROLE_MAX = 12

const taglia = (testo: string, max: number) => {
  const caratteri = [...testo.trim().replace(/[ \t]+/g, ' ')]
  return caratteri.length <= max ? caratteri.join('') : `${caratteri.slice(0, max - 1).join('').trimEnd()}…`
}

export type OpzioniVerifica = {
  /** the names to blank (paroleDaOscurare) */
  parole: ReadonlySet<string>
  /** the notes of the team as normalized words, when they reached Claude; else empty */
  note: readonly (readonly string[])[]
}

export type EsitoVerifica<T> = { dati: T; conteggi: ConteggiControllo; scartate: number }

function somma(a: ConteggiControllo, b: ConteggiControllo): ConteggiControllo {
  return { nomi: a.nomi + b.nomi, handle: a.handle + b.handle, importi: a.importi + b.importi, link: a.link + b.link, trattini: a.trattini + b.trattini }
}

/** A text cut and cleaned; null when nothing is left (or a note was copied). */
class Pulitore {
  conteggi: ConteggiControllo = { nomi: 0, handle: 0, importi: 0, link: 0, trattini: 0 }
  scartate = 0
  constructor(private readonly o: OpzioniVerifica) {}

  /** Cut to `max`, then cleaned; a copy of a note is dropped (null, counted). */
  testo(valore: string | null | undefined, max: number): string | null {
    if (valore === null || valore === undefined) return null
    const tagliato = taglia(valore, max)
    if (tagliato === '') return null
    const { testo, conteggi } = ripulisciUscita(tagliato, this.o.parole)
    this.conteggi = somma(this.conteggi, conteggi)
    if (this.o.note.length > 0 && copiaDelleNote(testo, this.o.note)) {
      this.scartate++
      return null
    }
    return testo === '' ? null : testo
  }

  /** The same, never null: an empty string. */
  testoOVuoto(valore: string | null | undefined, max: number): string {
    return this.testo(valore, max) ?? ''
  }

  elenco(valori: readonly string[], quanti: number, max: number): string[] {
    const fuori: string[] = []
    for (const v of valori) {
      const t = this.testo(v, max)
      if (t) fuori.push(t)
      if (fuori.length >= quanti) break
    }
    return fuori
  }
}

// ---------------------------------------------------------------------------
// The visual card
// ---------------------------------------------------------------------------

/**
 * The card as the database keeps it: lengths cut, the moments of the sequence
 * inside the reel (`durata`; a tract outside it is dropped, at most 12), the
 * labels as values (an unknown one is null), the script only if the reel is
 * linked to the calendar. null: a card with no summary.
 */
export function verificaScheda(
  m: SchedaVisivaModello,
  contesto: { durata: number | null; collegato: boolean },
  o: OpzioniVerifica,
): EsitoVerifica<SchedaVisiva> | null {
  const p = new Pulitore(o)
  const sintesi = p.testo(m.sintesi_visiva, LIMITI.sintesiVisiva)
  if (!sintesi) return null
  const durata = contesto.durata
  const dentro = (n: number) => Number.isFinite(n) && n >= 0 && (durata === null || n <= durata + 0.5)

  const sequenza = m.sequenza
    .filter((t) => dentro(t.da) && dentro(t.a) && t.a >= t.da)
    .slice(0, 12)
    .map((t) => ({
      da: Math.round(t.da * 10) / 10,
      a: Math.round(t.a * 10) / 10,
      cosa_si_vede: p.testoOVuoto(t.cosa_si_vede, LIMITI.sequenza),
      testo_a_schermo: p.testo(t.testo_a_schermo, LIMITI.sequenza),
    }))

  const reelType = m.classificazione.reel_type ? valoreDaEtichetta(ETICHETTA_REEL_TYPE, m.classificazione.reel_type) : null
  const formato = m.classificazione.format ? valoreDaEtichetta(ETICHETTA_FORMAT, m.classificazione.format) : null

  const dati: SchedaVisiva = {
    sintesi_visiva: sintesi,
    gancio: {
      livello: m.gancio.livello,
      cosa_si_vede: p.testoOVuoto(m.gancio.cosa_si_vede, LIMITI.breve),
      parole: p.testo(m.gancio.parole, LIMITI.breve),
      testo_a_schermo: p.testo(m.gancio.testo_a_schermo, LIMITI.corto),
      perche: p.testoOVuoto(m.gancio.perche, LIMITI.breve),
      alternativa: p.testoOVuoto(m.gancio.alternativa, LIMITI.corto),
    },
    sequenza,
    ritmo: {
      livello: m.ritmo.livello,
      osservazione: p.testoOVuoto(m.ritmo.osservazione, LIMITI.breve),
      calo: m.ritmo.calo
        ? {
            secondo: m.ritmo.calo.secondo !== null && dentro(m.ritmo.calo.secondo) ? Math.round(m.ritmo.calo.secondo * 10) / 10 : null,
            cosa: p.testoOVuoto(m.ritmo.calo.cosa, LIMITI.breve),
          }
        : null,
    },
    testo_a_schermo: {
      leggibile: m.testo_a_schermo.leggibile,
      sopra_il_volto: m.testo_a_schermo.sopra_il_volto,
      osservazione: p.testoOVuoto(m.testo_a_schermo.osservazione, LIMITI.corto),
    },
    cta: {
      presente: m.cta.presente,
      testo: p.testo(m.cta.testo, LIMITI.corto),
      secondo: m.cta.secondo !== null && dentro(m.cta.secondo) ? Math.round(m.cta.secondo * 10) / 10 : null,
      osservazione: p.testoOVuoto(m.cta.osservazione, LIMITI.breve),
      proposta: p.testoOVuoto(m.cta.proposta, LIMITI.corto),
    },
    produzione: {
      luce: m.produzione.luce,
      audio: m.produzione.audio,
      inquadratura: p.testoOVuoto(m.produzione.inquadratura, LIMITI.breve),
      osservazione: p.testoOVuoto(m.produzione.osservazione, LIMITI.breve),
    },
    ambiente: p.elenco(m.ambiente, 4, LIMITI.ambiente),
    icp: {
      aderenza: m.icp.aderenza,
      leve_usate: p.elenco(m.icp.leve_usate, 4, LIMITI.leva),
      leve_mancanti: p.elenco(m.icp.leve_mancanti, 4, LIMITI.leva),
      frase_del_cliente: p.testo(m.icp.frase_del_cliente, LIMITI.leva),
      rischio: p.testo(m.icp.rischio, LIMITI.breve),
    },
    script:
      contesto.collegato && m.script
        ? { segue: m.script.segue, differenze: p.testoOVuoto(m.script.differenze, LIMITI.breve) }
        : null,
    classificazione: { reel_type: reelType, format: formato },
  }
  return { dati, conteggi: p.conteggi, scartate: p.scartate }
}

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

export type Candidato = { ref: string; contenuto_id: string }

export type ContestoAnalisi = {
  /** the candidates sent as C1..C8, translated back to ids */
  candidati: readonly Candidato[]
  /** how many ideas, and of which kind, were asked for */
  idee: IdeeDaProporre
  /** the Names already in the calendar (normalized with chiaveNome), never proposed again */
  nomiInCalendario: ReadonlySet<string>
}

/** A name compared without case, accents or spaces. */
export function chiaveNome(nome: string): string {
  return nome.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const ORDINE_PRIORITA = { alta: 0, media: 1, bassa: 2 } as const

function verificaIdea(i: IdeaModello, p: Pulitore, esistenti: ReadonlySet<string>): IdeaContenuto | null {
  const reel_type = valoreDaEtichetta(ETICHETTA_REEL_TYPE, i.reel_type)
  if (!reel_type) return null
  let format: FormatContenuto | null = null
  if (i.format !== null) {
    format = valoreDaEtichetta(ETICHETTA_FORMAT, i.format)
    // a Format that is not Notion's: the idea is dropped, never guessed
    if (!format) return null
  }
  const name = p.testo(i.name, LIMITI.nomeIdea)
  if (!name || esistenti.has(chiaveNome(name))) return null
  const hook = p.testo(i.script.hook, LIMITI.rigaScript)
  const gancioPieno = p.testo(i.gancio, LIMITI.gancioIdea) ?? hook
  if (!hook || !gancioPieno) return null
  const gancio = gancioPieno.split(/\s+/).slice(0, GANCIO_PAROLE_MAX).join(' ')
  const cta = p.testoOVuoto(i.script.cta, LIMITI.rigaScript)
  return {
    tipo: i.tipo,
    name,
    reel_type: reel_type as ReelType,
    format,
    gancio,
    messaggio: p.testoOVuoto(i.messaggio, LIMITI.messaggioIdea),
    script: { hook, righe: p.elenco(i.script.righe, 8, LIMITI.rigaScript), cta },
    perche: p.testoOVuoto(i.perche, LIMITI.perIdea),
  }
}

/**
 * The analysis as the database keeps it. null: no summary and no idea at all.
 */
export function verificaAnalisi(m: AnalisiModello, c: ContestoAnalisi, o: OpzioniVerifica): EsitoVerifica<AnalisiContenuto> | null {
  const p = new Pulitore(o)
  const sintesi = p.testo(m.sintesi, LIMITI.sintesi)
  const esistenti = new Set(c.nomiInCalendario)
  const idee: IdeaContenuto[] = []
  for (const i of m.idee) {
    const idea = verificaIdea(i, p, esistenti)
    if (!idea) continue
    esistenti.add(chiaveNome(idea.name))
    idee.push(idea)
    if (idee.length >= c.idee.quante) break
  }
  if (!sintesi && idee.length === 0) return null

  let collegamento: AnalisiContenuto['collegamento'] = null
  if (m.collegamento) {
    const trovato = c.candidati.find((x) => x.ref === m.collegamento?.ref)
    const perche = p.testo(m.collegamento.perche, LIMITI.breve)
    // only a ref that was sent: Claude never writes an id
    if (trovato && perche) collegamento = { contenuto_id: trovato.contenuto_id, sicurezza: m.collegamento.sicurezza, perche }
  }

  const dati: AnalisiContenuto = {
    perche_verdetto: p.testoOVuoto(m.perche_verdetto, LIMITI.perche),
    sintesi: sintesi ?? '',
    cosa_ha_funzionato: p.elenco(m.cosa_ha_funzionato, 4, LIMITI.funzionato),
    da_migliorare: [...m.da_migliorare]
      .sort((a, b) => ORDINE_PRIORITA[a.priorita] - ORDINE_PRIORITA[b.priorita])
      .flatMap((x) => {
        const cosa = p.testo(x.cosa, LIMITI.miglioraCosa)
        return cosa ? [{ cosa, come: p.testoOVuoto(x.come, LIMITI.miglioraCome), priorita: x.priorita }] : []
      })
      .slice(0, 5),
    dai_lead: p.testo(m.dai_lead, LIMITI.daiLead),
    collegamento,
    idee,
  }
  return { dati, conteggi: p.conteggi, scartate: p.scartate }
}
