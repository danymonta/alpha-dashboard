import type { FormatContenuto, ReelType } from '@/lib/marketing/etichette'

/**
 * The contract of the reel analysis (1.36.0, CLAUDE.md section 30): what Claude
 * writes in its two passes and what the app keeps. Shared by the prompts, the
 * strict layer, the steps and the page. The values of Reel Type and Format are
 * the database's (education, raw_talking_head); the labels of Notion are only
 * what Claude is shown and the page prints.
 */

export type Livello = 'forte' | 'medio' | 'debole'
export type Priorita = 'alta' | 'media' | 'bassa'
export type Sicurezza = 'alta' | 'media' | 'bassa'

/** The visual card of a reel (first pass: frames and speech, no numbers). */
export type SchedaVisiva = {
  sintesi_visiva: string
  gancio: {
    livello: Livello
    cosa_si_vede: string
    parole: string | null
    testo_a_schermo: string | null
    perche: string
    alternativa: string
  }
  sequenza: { da: number; a: number; cosa_si_vede: string; testo_a_schermo: string | null }[]
  ritmo: { livello: Livello; osservazione: string; calo: { secondo: number | null; cosa: string } | null }
  testo_a_schermo: { leggibile: 'si' | 'in_parte' | 'no' | 'assente'; sopra_il_volto: boolean | null; osservazione: string }
  cta: { presente: boolean; testo: string | null; secondo: number | null; osservazione: string; proposta: string }
  produzione: { luce: 'buona' | 'media' | 'scarsa'; audio: 'chiaro' | 'coperto' | 'assente'; inquadratura: string; osservazione: string }
  ambiente: string[]
  icp: {
    aderenza: 'alta' | 'media' | 'bassa'
    leve_usate: string[]
    leve_mancanti: string[]
    frase_del_cliente: string | null
    rischio: string | null
  }
  script: { segue: 'si' | 'in_parte' | 'no'; differenze: string } | null
  classificazione: { reel_type: ReelType | null; format: FormatContenuto | null }
}

export type IdeaTipo = 'seguito' | 'rifacimento' | 'nuovo'

/** An idea ready for the calendar. */
export type IdeaContenuto = {
  tipo: IdeaTipo
  name: string
  reel_type: ReelType
  format: FormatContenuto | null
  gancio: string
  messaggio: string
  script: { hook: string; righe: string[]; cta: string }
  perche: string
}

/** The analysis of a reel (second pass: text only, with the numbers and the leads). */
export type AnalisiContenuto = {
  perche_verdetto: string
  sintesi: string
  cosa_ha_funzionato: string[]
  da_migliorare: { cosa: string; come: string; priorita: Priorita }[]
  dai_lead: string | null
  /** the calendar content Claude thinks this reel is (checked: a content without a URL, not Canceled) */
  collegamento: { contenuto_id: string; sicurezza: Sicurezza; perche: string } | null
  idee: IdeaContenuto[]
}

/** How many ideas, and of which kind, for a verdict (D13). */
export type IdeeDaProporre = { quante: number; tipo: IdeaTipo | 'rifacimento_o_nuovo' }

/** The counts of the sources an analysis was made from (no text, no person). */
export type FontiAnalisi = {
  fotogrammi: number
  video: 'si' | 'copertina' | 'no'
  trascrizione: 'si' | 'no' | 'senza_parlato'
  lead: 'si' | 'no'
  note_team: boolean
}

/** The tokens of one request (Anthropic's usage, every attempt of a fallback included). */
export type UsoToken = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
}

export const USO_ZERO: UsoToken = {
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
}

export type RispostaClaude<T> =
  | { ok: true; dati: T; uso: UsoToken; fallback: boolean; request_id: string | null; modello: string }
  | { ok: false; codice: CodiceErroreClaude; uso: UsoToken }

export type CodiceErroreClaude =
  | 'tempo'
  | 'autenticazione'
  | 'rifiuto'
  | 'max_tokens'
  | 'richiesta'
  | 'json'
  | 'schema'
  | 'rete'
  | 'limite'
