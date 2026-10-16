import type { FormatContenuto, ReelType } from '@/lib/marketing/etichette'

/**
 * The weekly brief of the Marketing area (1.37.0, CLAUDE.md section 31): what Claude writes
 * and what the app keeps in marketing_spunti.contenuto. The values of Reel Type and Format
 * are the database's (education, raw_talking_head); the labels of Notion are only what Claude
 * is shown and the page prints.
 */
export type FonteSpunto = 'contenuti' | 'dm' | 'setting' | 'call'
export type TendenzaSpunto = 'nuovo' | 'in_aumento' | 'stabile' | 'in_calo'
export type FaseSpunto = 'attrazione' | 'consapevolezza' | 'vendita'
export type DovePesa = 'dm' | 'prima_della_call' | 'in_call'

export type VoceSpunto = { testo: string; perche: string; rif: string[] }

export type IdeaSpunto = {
  modello: 'reel' | 'carousel'
  nasce_da: 'reel' | 'tema' | 'obiezione' | 'domanda'
  fase: FaseSpunto
  name: string
  reel_type: ReelType
  format: FormatContenuto | null
  gancio: string
  messaggio: string
  script: { hook: string; righe: string[]; cta: string }
  perche: string
  rif: string[]
}

export type SpuntiContenuto = {
  versione: 'spunti'
  in_breve: string
  cosa_funziona: VoceSpunto[]
  temi: { tema: string; cosa_dicono: string; fonti: FonteSpunto[]; tendenza: TendenzaSpunto; rif: string[] }[]
  obiezioni: { obiezione: string; dove_pesa: DovePesa; contenuto_che_la_scioglie: string; perche: string; rif: string[] }[]
  domande: { domanda: string; risposta_in_breve: string; rif: string[] }[]
  mantieni: VoceSpunto[]
  cambia: VoceSpunto[]
  potenzia: VoceSpunto[]
  idee: IdeaSpunto[]
  /** the sentences of the facts the brief quotes, by reference (the numbers are written by the database) */
  fatti: Record<string, string>
}

/** The counts of the sources a brief was made from: numbers and booleans only, no text, no person. */
export type FontiSpunti = {
  reel_analizzati: number
  dm: boolean
  setting: boolean
  call: boolean
  note_team: boolean
}

/** The minimum sources behind a theme, an objection or a question: one person is not a trend. */
export const SOGLIA_FONTI = 3
