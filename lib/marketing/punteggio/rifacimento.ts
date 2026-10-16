import { formatData } from '@/lib/format'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import { reelTypeDelTipo } from '@/lib/marketing/punteggio/tabelle'
import type { PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'
import type { ContenutoInput } from '@/lib/validation/contenuto'

/**
 * The rewrite of a scored reel as a content of the calendar («Aggiungi al
 * calendario» from «Come rifarlo», 1.39.0). Pure: the action passes it through
 * creaContenuto (lib/marketing/operazioni.ts), the one way the calendar is
 * written. The origin is the analysis the score belongs to and the idea number
 * 9, once per analysis (the trigger of the calendar knows the number; the
 * other ideas of an analysis are 0 to 3).
 *
 * Reel Topic, Status Not started, no Post Date, the Reel Type of the funnel
 * phase the reel was scored as. The message section holds the instructions of
 * the redo; the rough draft the rewritten script; the comments the three
 * alternative hooks, the caption, the expected score and where it comes from.
 */

/** The number of the redo among the ideas of an analysis (the trigger accepts it only if the score has a rewrite). */
export const INDICE_RIFACIMENTO = 9

export function haRifacimento(p: Pick<PunteggioContenuto, 'rifacimento'> | null | undefined): boolean {
  return Boolean(p?.rifacimento?.script_riscritto?.trim())
}

export function contenutoDaRifacimento(
  p: PunteggioContenuto,
  origine: { nome: string; permalink: string; pubblicato_il: string | null; formato?: ContenutoInput['formato'] },
): { input: ContenutoInput; sezioni: { messaggio: string; bozza: string; commenti: string } } {
  const r = p.rifacimento
  const giorno = origine.pubblicato_il ? giornoRoma(origine.pubblicato_il) : null
  const quando = giorno ? ` del ${formatData(giorno)}` : ''
  const nome = `Rifacimento: ${origine.nome}`.slice(0, 300)
  const istruzioni = r.istruzioni.length > 0 ? `\n\n${r.istruzioni.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : ''
  const hook = r.hook_alternativi.map((h) => `- ${h.testo} (${h.categoria})`).join('\n')
  return {
    input: {
      tipo: 'reel',
      nome,
      reel_type: reelTypeDelTipo(p.tipo),
      formato: origine.formato ?? null,
      stato: 'not_started',
      post_date: null,
      url: null,
      inspiration: null,
      audio: null,
      view_count: null,
    },
    sezioni: {
      messaggio: `Rifacimento del reel${quando}, punteggio ${p.totale} su 100.${istruzioni}`,
      bozza: r.script_riscritto,
      commenti: [
        r.caption_riscritta ? `Caption: ${r.caption_riscritta}` : '',
        hook ? `Hook alternativi:\n${hook}` : '',
        `Punteggio atteso dopo il rifacimento: ${r.punteggio_atteso}.`,
        `Dal punteggio di Claude sul reel${quando}: ${origine.permalink}`,
      ]
        .filter((x) => x !== '')
        .join('\n\n'),
    },
  }
}
