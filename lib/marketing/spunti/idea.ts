import { BOZZA_REEL } from '@/lib/marketing/etichette'
import type { IdeaSpunto } from '@/lib/marketing/spunti/tipi'
import type { ContenutoInput } from '@/lib/validation/contenuto'

/**
 * An idea of the weekly brief as a content of the calendar («Aggiungi al calendario», 1.37.0).
 * Pure: the action passes it through creaContenuto (lib/marketing/operazioni.ts), the one way the
 * calendar is written. A Reel Topic or a Carousel Topic as the idea says, Status Not started, no Post
 * Date. The message section holds the message and «Perché: …»; the rough draft is Hook, one Line a row,
 * CTA for a reel (the shape of the reel template) and one slide a row for a carousel; the comments
 * say where the idea comes from.
 */
export function contenutoDaIdeaSpunti(
  idea: IdeaSpunto,
  origine: { giorno: string },
): { input: ContenutoInput; sezioni: { messaggio: string; bozza: string; commenti: string } } {
  const righe = idea.script.righe.map((r) => r.trim()).filter((r) => r !== '')
  let bozza: string
  if (idea.modello === 'carousel') {
    bozza = [`Slide 1: ${idea.script.hook}`, ...righe.map((r, i) => `Slide ${i + 2}: ${r}`), idea.script.cta ? `Ultima slide: ${idea.script.cta}` : ''].filter(Boolean).join('\n')
  } else if (idea.script.hook.trim() === '' && righe.length === 0 && idea.script.cta.trim() === '') {
    bozza = BOZZA_REEL
  } else {
    bozza = [`Hook: ${idea.script.hook}`, ...(righe.length > 0 ? righe : ['']).map((r) => `Line: ${r}`), `CTA: ${idea.script.cta}`].join('\n')
  }
  return {
    input: {
      tipo: idea.modello,
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
      messaggio: idea.perche ? `${idea.messaggio}\n\nPerché: ${idea.perche}` : idea.messaggio,
      bozza,
      commenti: `Idea di Claude dagli spunti ${origine.giorno}.`,
    },
  }
}
