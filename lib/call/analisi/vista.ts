import type { Database } from '@/lib/supabase/database.types'

/**
 * What the pages read about the recording and the analysis of a call (1.37.0, CLAUDE.md
 * section 31): the shapes of the embedded rows of the call card (scheda-call.tsx). RLS decides
 * who gets which: the setter never has `registrazione`, `analisi` or `valutazione`, the
 * closer who did not lead the call has no `valutazione`, `spunti` is the call's setter's only.
 */
type Prestazione = Database['public']['Enums']['call_performance']

export type RegistrazioneVista = {
  stato: 'collegata' | 'non_registrata'
  recording_id: number | null
  link_verificato: string | null
  durata_secondi: number | null
}

export type ObiezioneVista = {
  categoria: string
  sintesi: string | null
  gestita?: 'si' | 'in_parte' | 'no'
  risposta?: string | null
  minuto?: string | null
  momento?: string
}

export type AnalisiVista = {
  stato: 'in_coda' | 'in_corso' | 'pronta' | 'fallita' | 'rifiutata'
  errore: string | null
  riassunto: string | null
  esito_letto: 'chiusa' | 'follow_up' | 'persa' | 'non_chiaro' | null
  in_target: 'si' | 'no' | 'da_verificare' | null
  lead: {
    segnali?: { testo: string; verso: 'in_target' | 'non_in_target' }[]
    punto_a?: string
    punto_b?: string
    pain?: string[]
    desideri?: string[]
    gia_provato?: string[]
    frasi?: string[]
  } | null
  obiezioni: ObiezioneVista[] | null
  domande: string[] | null
  convinto_da: string[] | null
  motivo_proposto: string | null
  prossimi_passi: { cosa: string; quando: string | null; chi: string }[] | null
  momenti: { minuto: string; etichetta: string }[] | null
  analizzata_il: string | null
}

export type ValutazioneVista = {
  criteri: Record<string, string>
  livello_proposto: Prestazione | null
  perche: string[]
  funzionato: string[]
  da_provare: string[]
  quota_parlato: number | null
  decisa_livello: Prestazione | null
}

export type DallaCallVista = {
  in_target: 'si' | 'no' | 'da_verificare' | null
  segnali: { testo: string; verso: 'in_target' | 'non_in_target' }[]
  sapeva: string[]
  sorprese: string[]
  obiezioni: { categoria: string; sintesi: string | null }[]
}

export const COLONNE_ANALISI =
  'stato, errore, riassunto, esito_letto, in_target, lead, obiezioni, domande, convinto_da, motivo_proposto, prossimi_passi, momenti, analizzata_il'
export const COLONNE_VALUTAZIONE = 'criteri, livello_proposto, perche, funzionato, da_provare, quota_parlato, decisa_livello'
export const COLONNE_DALLA_CALL = 'in_target, segnali, sapeva, sorprese, obiezioni'

/** `link?timestamp=<seconds>`: the minute of the recording. */
export function conMinuto(link: string, secondi: number): string {
  try {
    const u = new URL(link)
    u.searchParams.set('timestamp', String(Math.max(0, Math.floor(secondi))))
    return u.toString()
  } catch {
    return link
  }
}

export function secondiDiMinuto(minuto: string): number {
  const [m, s] = minuto.split(':').map(Number)
  return (m || 0) * 60 + (s || 0)
}

export const ETICHETTA_PERFORMANCE: Record<Prestazione, string> = {
  ottima: 'Ottima',
  buona: 'Buona',
  discreta: 'Discreta',
  media: 'Media',
  scarsa: 'Scarsa',
}
export const LIVELLI_PERFORMANCE = ['ottima', 'buona', 'discreta', 'media', 'scarsa'] as const
