import type { CodiceFascia, EsitoCriterio, FlagPenalita, IdCriterio, TipoPunteggio } from '@/lib/marketing/punteggio/tabelle'

/**
 * What the app keeps of a content score (1.39.0, CLAUDE.md section 30): the
 * `punteggio` column of marketing_analisi. Everything numeric was computed by
 * the code from Claude's votes (lib/marketing/punteggio/tabelle.ts); the texts
 * went through the strict layer and the final check (verifica.ts). No name, no
 * amount, no link, no long dash.
 */

export const VERSIONE_FORMATO_PUNTEGGIO = 1

export const CATEGORIE_HOOK = ['Storytelling', 'Curiosità', 'Shock', 'Lista', 'Domanda', 'Educational', 'Mito', 'Errore', 'Autorità'] as const
export type CategoriaHook = (typeof CATEGORIE_HOOK)[number]

export type CriterioValutato = EsitoCriterio & {
  /** a literal passage of the content; null when the one Claude quoted is not in it */
  citazione: string | null
  citazione_trovata: boolean
  motivazione: string
  correzione: string
}

export type PenalitaValutata = {
  flag: FlagPenalita
  valore: number
  descrizione: string
  /** the line that caused it (empty for an absence) */
  riga: string
  da: 'codice' | 'claude'
}

export type ProblemaPrioritario = { ordine: number; criterio: IdCriterio; nome: string; problema: string; impatto_punti: number }

export type HookAlternativo = { testo: string; categoria: CategoriaHook; perche_funziona: string }

export type RifacimentoPunteggio = {
  istruzioni: string[]
  hook_alternativi: HookAlternativo[]
  script_riscritto: string
  caption_riscritta: string
  punteggio_atteso: number
}

export type PunteggioContenuto = {
  versione: typeof VERSIONE_FORMATO_PUNTEGGIO
  tipo: TipoPunteggio
  tipo_origine: 'dichiarato' | 'dedotto'
  motivo_classificazione: string
  durata_stimata_secondi: number | null
  hook: { testo: string; parole: number; cita_icp: boolean }
  totale_grezzo: number
  penalita_totali: number
  totale: number
  fascia: CodiceFascia
  limiti_applicati: string[]
  violazioni_formali: number
  /** the formal slips the flags do not cover, each with its line */
  altre_violazioni_formali: { descrizione: string; riga: string }[]
  criteri: CriterioValutato[]
  penalita: PenalitaValutata[]
  punti_di_forza: string[]
  problemi_prioritari: ProblemaPrioritario[]
  confronto_benchmark: string | null
  segnalazioni: string[]
  rifacimento: RifacimentoPunteggio
}
