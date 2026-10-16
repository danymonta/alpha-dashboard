/**
 * The tables of the content scoring (1.39.0, CLAUDE.md section 30), from Dany's
 * guide (Part C, sections 21, 23 and 24), as typed constants, and the one
 * function that turns Claude's votes into a score. Pure: no server-only, the
 * page reads the labels too.
 *
 * Claude gives the votes (integers from 0 to 10), the citations, the reasons,
 * the corrections and the flags of the penalties with the line that caused
 * them. EVERYTHING ELSE is computed here: the weighted scores, the sum, the
 * penalties, the caps of a criterion and of the total, the band. A test
 * (tests/punteggio-tabelle.test.ts) compares these tables with the ones written
 * in the guide's text, so the two can never drift apart.
 *
 * Only the reels are scored: the guide has the tables of the stories too, but
 * the app has no stories, and a carousel has no table at all (the page says
 * «Il punteggio vale per i reel»).
 */

export const TIPI_PUNTEGGIO = ['tof', 'mof', 'bof'] as const
export type TipoPunteggio = (typeof TIPI_PUNTEGGIO)[number]

/** The names of the guide («REEL_TOF»), the ones Claude writes. */
export const NOME_TIPO: Record<TipoPunteggio, 'REEL_TOF' | 'REEL_MOF' | 'REEL_BOF'> = {
  tof: 'REEL_TOF',
  mof: 'REEL_MOF',
  bof: 'REEL_BOF',
}
export const ETICHETTA_TIPO: Record<TipoPunteggio, string> = {
  tof: 'Attrazione (TOF)',
  mof: 'Consapevolezza (MOF)',
  bof: 'Conversione (BOF)',
}

export type IdCriterio = 'H' | 'ST' | 'EV' | 'CH' | 'ID' | 'TV' | 'SP' | 'RL' | 'CT' | 'CA' | 'CF' | 'PR' | 'OB' | 'AP'
export const TUTTI_I_CRITERI = ['H', 'ST', 'EV', 'CH', 'ID', 'TV', 'SP', 'RL', 'CT', 'CA', 'CF', 'PR', 'OB', 'AP'] as const

export type VoceTabella = { id: IdCriterio; nome: string; peso: number }

/** Section 21: the weights per type, each table sums to 100. */
export const PESI: Record<TipoPunteggio, readonly VoceTabella[]> = {
  tof: [
    { id: 'H', nome: 'Hook', peso: 20 },
    { id: 'ST', nome: 'Arco narrativo ed emozione', peso: 25 },
    { id: 'ID', nome: 'Identificazione ICP', peso: 15 },
    { id: 'TV', nome: 'Tono di voce e linguaggio', peso: 10 },
    { id: 'SP', nome: 'Specificità e autenticità', peso: 10 },
    { id: 'RL', nome: 'Ritmo e lunghezza', peso: 5 },
    { id: 'CT', nome: 'CTA coerente con TOF', peso: 5 },
    { id: 'CA', nome: 'Caption', peso: 5 },
    { id: 'CF', nome: 'Conformità formale', peso: 5 },
  ],
  mof: [
    { id: 'H', nome: 'Hook', peso: 20 },
    { id: 'EV', nome: 'Valore educativo (Hook, Teach, Apply)', peso: 25 },
    { id: 'CH', nome: 'Chiarezza e semplicità', peso: 10 },
    { id: 'ID', nome: 'Identificazione ICP', peso: 10 },
    { id: 'TV', nome: 'Tono di voce e autorevolezza', peso: 10 },
    { id: 'AP', nome: 'Applicabilità concreta', peso: 10 },
    { id: 'RL', nome: 'Ritmo e lunghezza', peso: 5 },
    { id: 'CT', nome: 'CTA coerente con MOF', peso: 5 },
    { id: 'CA', nome: 'Caption', peso: 3 },
    { id: 'CF', nome: 'Conformità formale', peso: 2 },
  ],
  bof: [
    { id: 'H', nome: 'Hook', peso: 15 },
    { id: 'PR', nome: 'Proof e trasformazione', peso: 25 },
    { id: 'OB', nome: 'Meccanismo e gestione dell’obiezione', peso: 15 },
    { id: 'ID', nome: 'Identificazione ICP', peso: 10 },
    { id: 'TV', nome: 'Tono di voce e autorevolezza', peso: 10 },
    { id: 'CT', nome: 'CTA di conversione', peso: 15 },
    { id: 'RL', nome: 'Ritmo e lunghezza', peso: 3 },
    { id: 'CA', nome: 'Caption', peso: 4 },
    { id: 'CF', nome: 'Conformità formale', peso: 3 },
  ],
}

export function vociDelTipo(tipo: TipoPunteggio): readonly VoceTabella[] {
  return PESI[tipo]
}

/** Section 23: the penalty flags. `valore` is what is added to the total (negative); 0 = only a remark. */
export const FLAG_PENALITA = [
  'FRASE_VIETATA',
  'EM_DASH',
  'EMOJI',
  'ACCENTI',
  'PROMESSA_IRREALISTICA',
  'PALESTRA_O_INTEGRATORI',
  'HARD_CTA_TOF',
  'NO_CTA_BOF',
  'PECTUS_SENZA_POSTURA',
  'CALCO_INGLESE',
  'INFO_DUMP',
  'GERGO',
  'CHIUSURA_RETORICA',
  'ELENCO_PUNTATO',
  'LUNGHEZZA_ECCESSIVA',
  'NUMERO_INCOERENTE',
  'CLASSIFICAZIONE_DUBBIA',
] as const
export type FlagPenalita = (typeof FLAG_PENALITA)[number]

export type RegolaPenalita = {
  valore: number
  descrizione: string
  /** the criterion whose vote is capped by this flag, and the cap */
  tetto?: { criterio: IdCriterio; max: number }
  /** only for these types (the others ignore the flag) */
  soloTipi?: readonly TipoPunteggio[]
  /** counts as a violation of the formal conformity (CF): ten minus two for each */
  formale?: boolean
}

export const PENALITA: Record<FlagPenalita, RegolaPenalita> = {
  FRASE_VIETATA: { valore: -15, descrizione: 'Contiene la frase vietata «Non è solo fisico. È sicurezza personale.»', formale: true },
  EM_DASH: { valore: -5, descrizione: 'Contiene un trattino lungo o medio', tetto: { criterio: 'CF', max: 4 }, formale: true },
  EMOJI: { valore: -3, descrizione: 'Contiene emoji', formale: true },
  ACCENTI: { valore: -3, descrizione: 'Mancano gli accenti in parole italiane', formale: true },
  PROMESSA_IRREALISTICA: { valore: -10, descrizione: 'Risultato garantito, tempi non credibili, «senza fatica»' },
  PALESTRA_O_INTEGRATORI: { valore: -10, descrizione: 'Consiglia palestra o integratori, in contrasto con l’offerta' },
  HARD_CTA_TOF: { valore: -8, descrizione: 'Vendita diretta in un contenuto di attrazione', tetto: { criterio: 'CT', max: 3 }, soloTipi: ['tof'] },
  NO_CTA_BOF: { valore: -10, descrizione: 'Contenuto di conversione senza CTA', tetto: { criterio: 'CT', max: 2 }, soloTipi: ['bof'] },
  PECTUS_SENZA_POSTURA: { valore: -6, descrizione: 'Il pectus excavatum ridotto a «fare palestra» o «costruire muscolo», senza la postura' },
  CALCO_INGLESE: { valore: -4, descrizione: 'Frasi tradotte letteralmente dall’inglese' },
  INFO_DUMP: { valore: -5, descrizione: 'Più di 3 punti o concetti non gerarchizzati' },
  GERGO: { valore: -3, descrizione: 'Termini tecnici non spiegati' },
  CHIUSURA_RETORICA: { valore: -3, descrizione: 'Frase a effetto dopo la CTA o a chiusura dello script' },
  ELENCO_PUNTATO: { valore: -3, descrizione: 'Elenco puntato nello script o nella caption', formale: true },
  LUNGHEZZA_ECCESSIVA: { valore: -5, descrizione: 'Oltre il 30% sopra il limite di durata del tipo' },
  NUMERO_INCOERENTE: { valore: 0, descrizione: 'Cifre personali in contrasto con quelle del contesto: da verificare' },
  CLASSIFICAZIONE_DUBBIA: { valore: 0, descrizione: 'Il contenuto appartiene a più fasi del funnel' },
}

/** The flags only the code detects (from the texts and the duration): Claude's votes on them are ignored. */
export const FLAG_DEL_CODICE: readonly FlagPenalita[] = ['FRASE_VIETATA', 'EM_DASH', 'EMOJI', 'LUNGHEZZA_ECCESSIVA']
/** The flags Claude may raise, each with the line that caused it (NO_CTA_BOF has none: it is an absence). */
export const FLAG_DI_CLAUDE: readonly FlagPenalita[] = [
  'ACCENTI',
  'PROMESSA_IRREALISTICA',
  'PALESTRA_O_INTEGRATORI',
  'HARD_CTA_TOF',
  'NO_CTA_BOF',
  'PECTUS_SENZA_POSTURA',
  'CALCO_INGLESE',
  'INFO_DUMP',
  'GERGO',
  'CHIUSURA_RETORICA',
  'ELENCO_PUNTATO',
]
/** The remarks without effect (value 0) Claude may raise. */
export const SEGNALAZIONI_DI_CLAUDE = ['NUMERO_INCOERENTE', 'CLASSIFICAZIONE_DUBBIA'] as const
export type SegnalazioneClaude = (typeof SEGNALAZIONI_DI_CLAUDE)[number]
/** The flag that needs no line: it is the absence of something. */
export const FLAG_SENZA_RIGA: readonly FlagPenalita[] = ['NO_CTA_BOF']

/** Section 23, «Limiti»: the caps of the total. */
export const LIMITI_TOTALE = {
  /** H under 4: the total does not exceed 70 */
  hookBasso: { sotto: 4, max: 70 },
  /** ID under 3: the total does not exceed 65 */
  identificazioneBassa: { sotto: 3, max: 65 },
  /** CF with 3 or more violations: the total does not exceed 80 */
  conformitaFormale: { violazioni: 3, max: 80 },
} as const
/** Section 22 (H): a hook of more than 15 words is at most 5; one that names no problem, goal or situation of the ICP at most 6. */
export const LIMITI_HOOK = { paroleOltre: 15, maxSeLungo: 5, maxSenzaIcp: 6 } as const
/** Section 22 (CF): ten, minus two for each violation. */
export const CF_PER_VIOLAZIONE = 2
/** Section 22 (CA): a caption that is not given is a 5. */
export const CA_SENZA_CAPTION = 5

/** Section 22 (RL): the length of each type, in seconds. Over it by 30%: LUNGHEZZA_ECCESSIVA. */
export const DURATA_MAX_SECONDI: Record<TipoPunteggio, number> = { tof: 90, mof: 60, bof: 60 }
export const ECCESSO_LUNGHEZZA = 1.3

export type CodiceFascia = 'pubblicare' | 'pubblicare_dopo_ritocchi' | 'rifare_le_parti_deboli' | 'riscrivere' | 'scartare'

export type Fascia = { da: number; codice: CodiceFascia; etichetta: string; azione: string }

/** Section 24, from the best band down. */
export const FASCE: readonly Fascia[] = [
  { da: 90, codice: 'pubblicare', etichetta: 'Pubblicare', azione: 'Pronto. Eventuale micro ritocco su un solo elemento.' },
  { da: 80, codice: 'pubblicare_dopo_ritocchi', etichetta: 'Pubblicare dopo ritocchi', azione: 'Correggi i criteri sotto 7, nessuna riscrittura completa.' },
  { da: 65, codice: 'rifare_le_parti_deboli', etichetta: 'Rifare le parti deboli', azione: 'Riscrivi l’hook e i due criteri più bassi, mantieni l’idea.' },
  { da: 50, codice: 'riscrivere', etichetta: 'Riscrivere', azione: 'Mantieni il tema, ricostruisci struttura e hook.' },
  { da: 0, codice: 'scartare', etichetta: 'Scartare o ripartire', azione: 'L’idea non è allineata a fase, ICP o tono: riparti dai workbook.' },
]
export const CODICI_FASCIA = FASCE.map((f) => f.codice) as readonly CodiceFascia[]

export function fasciaDi(totale: number): Fascia {
  return FASCE.find((f) => totale >= f.da) ?? FASCE[FASCE.length - 1]
}
export function fasciaDaCodice(codice: string | null | undefined): Fascia | null {
  return FASCE.find((f) => f.codice === codice) ?? null
}

/** The range a band covers, «90-100», «0-49»: for the filters of the page. */
export function intervalloFascia(codice: CodiceFascia): { da: number; a: number } {
  const i = FASCE.findIndex((f) => f.codice === codice)
  return { da: FASCE[i].da, a: i === 0 ? 100 : FASCE[i - 1].da - 1 }
}

// ---------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------

export type EsitoCriterio = {
  id: IdCriterio
  nome: string
  peso: number
  /** the vote Claude gave */
  voto_modello: number
  /** the vote that counts, after the caps */
  voto: number
  /** voto / 10 x peso, one decimal */
  punteggio: number
  /** why the vote that counts is not Claude's, in words */
  tetto: string | null
}

export type PenalitaApplicata = { flag: FlagPenalita; valore: number }

export type EsitoCalcolo = {
  criteri: EsitoCriterio[]
  totale_grezzo: number
  penalita: PenalitaApplicata[]
  penalita_totali: number
  limiti_applicati: string[]
  totale: number
  fascia: CodiceFascia
  violazioni_formali: number
}

export type IngressoCalcolo = {
  tipo: TipoPunteggio
  /** one integer vote 0-10 per criterion of the type */
  voti: Partial<Record<IdCriterio, number>>
  /** the words of the hook as spoken */
  paroleHook: number
  /** whether the hook names a problem, a goal or a situation of the ICP */
  hookCitaIcp: boolean
  /** the flags that apply, once each (the ones that need a line already have it) */
  flag: readonly FlagPenalita[]
  /** formal violations the flags do not cover, counted by the checker */
  violazioniFormaliExtra: number
  /** no caption was given: Caption is a 5 */
  senzaCaption: boolean
}

const arrotonda1 = (n: number) => Math.round(n * 10) / 10
const interoVoto = (n: number) => Math.min(10, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)))

/**
 * Votes in, score out (sections 20-24). In order: each criterion's vote is capped
 * (hook length and ICP, the formal conformity from its violations, the CTA by the
 * flags that cap it), weighted and summed; the penalties are added; the total is
 * capped by the limits and never goes under 0; the band comes from the integer
 * total. A flag that does not apply to the type is ignored; a flag twice counts once.
 */
export function calcolaPunteggio(i: IngressoCalcolo): EsitoCalcolo {
  const flag = [...new Set(i.flag)].filter((f) => {
    const solo = PENALITA[f].soloTipi
    return !solo || solo.includes(i.tipo)
  })
  const violazioniFormali = flag.filter((f) => PENALITA[f].formale).length + Math.max(0, Math.round(i.violazioniFormaliExtra))

  const criteri: EsitoCriterio[] = PESI[i.tipo].map(({ id, nome, peso }) => {
    const modello = interoVoto(i.voti[id] ?? 0)
    let voto = modello
    let tetto: string | null = null
    const limita = (max: number, perche: string) => {
      if (voto > max) {
        voto = max
        tetto = perche
      }
    }
    if (id === 'H') {
      if (i.paroleHook > LIMITI_HOOK.paroleOltre) limita(LIMITI_HOOK.maxSeLungo, `Hook di ${i.paroleHook} parole: al massimo ${LIMITI_HOOK.maxSeLungo}`)
      if (!i.hookCitaIcp) limita(LIMITI_HOOK.maxSenzaIcp, `L’hook non cita problema, obiettivo o situazione dell’ICP: al massimo ${LIMITI_HOOK.maxSenzaIcp}`)
    }
    if (id === 'CF') {
      const calcolato = Math.max(0, 10 - CF_PER_VIOLAZIONE * violazioniFormali)
      if (calcolato !== voto) tetto = violazioniFormali === 0 ? null : `${violazioniFormali} ${violazioniFormali === 1 ? 'violazione' : 'violazioni'} formali: ${calcolato}`
      voto = calcolato
    }
    if (id === 'CA' && i.senzaCaption) {
      voto = CA_SENZA_CAPTION
      tetto = 'Caption non fornita: 5'
    }
    for (const f of flag) {
      const t = PENALITA[f].tetto
      if (t && t.criterio === id) limita(t.max, `${f}: al massimo ${t.max}`)
    }
    return { id, nome, peso, voto_modello: modello, voto, punteggio: arrotonda1((voto / 10) * peso), tetto }
  })

  const totaleGrezzo = arrotonda1(criteri.reduce((somma, c) => somma + (c.voto / 10) * c.peso, 0))
  const penalita = flag.map((f) => ({ flag: f, valore: PENALITA[f].valore })).filter((p) => p.valore !== 0)
  const penalitaTotali = penalita.reduce((somma, p) => somma + p.valore, 0)

  let totale = totaleGrezzo + penalitaTotali
  const limiti: string[] = []
  const tetta = (max: number, perche: string) => {
    if (totale > max) {
      totale = max
      limiti.push(perche)
    }
  }
  const voto = (id: IdCriterio) => criteri.find((c) => c.id === id)?.voto
  const h = voto('H')
  if (h !== undefined && h < LIMITI_TOTALE.hookBasso.sotto) tetta(LIMITI_TOTALE.hookBasso.max, `Hook sotto ${LIMITI_TOTALE.hookBasso.sotto}: il totale non supera ${LIMITI_TOTALE.hookBasso.max}`)
  const id = voto('ID')
  if (id !== undefined && id < LIMITI_TOTALE.identificazioneBassa.sotto) {
    tetta(LIMITI_TOTALE.identificazioneBassa.max, `Identificazione ICP sotto ${LIMITI_TOTALE.identificazioneBassa.sotto}: il totale non supera ${LIMITI_TOTALE.identificazioneBassa.max}`)
  }
  if (violazioniFormali >= LIMITI_TOTALE.conformitaFormale.violazioni) {
    tetta(LIMITI_TOTALE.conformitaFormale.max, `${violazioniFormali} violazioni formali: il totale non supera ${LIMITI_TOTALE.conformitaFormale.max}`)
  }
  const finale = Math.max(0, Math.round(totale))

  return {
    criteri,
    totale_grezzo: totaleGrezzo,
    penalita,
    penalita_totali: penalitaTotali,
    limiti_applicati: limiti,
    totale: finale,
    fascia: fasciaDi(finale).codice,
    violazioni_formali: violazioniFormali,
  }
}

/** The points a criterion could still give: (10 - vote) / 10 x weight. */
export function puntiRecuperabili(c: Pick<EsitoCriterio, 'voto' | 'peso'>): number {
  return arrotonda1(((10 - c.voto) / 10) * c.peso)
}

/**
 * The expected score after the redo, kept coherent (section 25: it «deve essere
 * coerente con le correzioni proposte»): never under the current one, never over
 * 100, never over what is left to gain (the points of the criteria that are not
 * at 10, plus the penalties a rewrite can take away).
 */
export function chiudiPunteggioAtteso(atteso: number, e: Pick<EsitoCalcolo, 'criteri' | 'penalita_totali' | 'totale'>): number {
  const recuperabile = e.criteri.reduce((somma, c) => somma + puntiRecuperabili(c), 0) + Math.abs(e.penalita_totali)
  const tetto = Math.min(100, Math.round(e.totale + recuperabile))
  const valore = Number.isFinite(atteso) ? Math.round(atteso) : e.totale
  return Math.max(e.totale, Math.min(tetto, valore))
}

/** The type the Reel Type of the calendar declares (Attraction, Education, Converting); the others are deduced. */
export function tipoDaReelType(reelType: string | null | undefined): TipoPunteggio | null {
  switch (reelType) {
    case 'attraction':
      return 'tof'
    case 'education':
      return 'mof'
    case 'converting':
      return 'bof'
    default:
      return null
  }
}

/** The Reel Type a scored type gives to a content born from its redo. */
export function reelTypeDelTipo(tipo: TipoPunteggio): 'attraction' | 'education' | 'converting' {
  return tipo === 'tof' ? 'attraction' : tipo === 'mof' ? 'education' : 'converting'
}
