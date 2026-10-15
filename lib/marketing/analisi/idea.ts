import type { IdeaContenuto } from '@/lib/marketing/analisi/tipi'
import { BOZZA_REEL } from '@/lib/marketing/etichette'
import { formatData } from '@/lib/format'
import type { ContenutoInput } from '@/lib/validation/contenuto'

/**
 * An idea of Claude as a content of the calendar («Aggiungi al calendario»,
 * 1.36.0). Pure: the action passes it through creaContenuto (lib/marketing/
 * operazioni.ts), the one way the calendar is written.
 *
 * Reel Topic, Status Not started, no Post Date. The message section holds the
 * message and «Perché: …»; the rough draft is Hook, one Line a row, CTA (the
 * shape of the reel template); the comments say where the idea comes from,
 * with the reel's link.
 */

const bozzaDa = (idea: IdeaContenuto): string => {
  const righe = idea.script.righe.map((r) => r.trim()).filter((r) => r !== '')
  if (idea.script.hook.trim() === '' && righe.length === 0 && idea.script.cta.trim() === '') return BOZZA_REEL
  const parti = [`Hook: ${idea.script.hook}`, ...(righe.length > 0 ? righe : ['']).map((r) => `Line: ${r}`), `CTA: ${idea.script.cta}`]
  return parti.join('\n')
}

export function contenutoDaIdea(
  idea: IdeaContenuto,
  origine: { permalink: string; giorno: string | null },
): { input: ContenutoInput; sezioni: { messaggio: string; bozza: string; commenti: string } } {
  const messaggio = idea.perche ? `${idea.messaggio}\n\nPerché: ${idea.perche}` : idea.messaggio
  const quando = origine.giorno ? ` del ${formatData(origine.giorno)}` : ''
  return {
    input: {
      tipo: 'reel',
      nome: idea.name,
      reel_type: idea.reel_type,
      formato: idea.format,
      stato: 'not_started',
      post_date: null,
      url: null,
      inspiration: null,
      audio: null,
      view_count: null,
    },
    sezioni: {
      messaggio,
      bozza: bozzaDa(idea),
      commenti: `Idea di Claude dall'analisi del reel${quando}: ${origine.permalink}`,
    },
  }
}
