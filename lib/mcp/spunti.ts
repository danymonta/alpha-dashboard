import 'server-only'

import { ETICHETTA_FORMAT, ETICHETTA_REEL_TYPE } from '@/lib/marketing/etichette'
import type { SpuntiContenuto } from '@/lib/marketing/spunti/tipi'

import type { EsitoStrumento } from './contenuti'
import type { ContestoMcp } from './contesto'

/**
 * The weekly brief for a Claude connected with the MCP (1.37.0, CLAUDE.md sections 28 and 31): in
 * read only, for the admin, the video editor and marketing, through spunti_per_claude (the
 * person's own token, RLS and the function decide). The same text as the Spunti page: themes in
 * words, no names, no figures of people, no sources; the references (R1, D2…) are replaced by
 * the sentences of the facts they point to. Never the numbers behind a content, never what the
 * calls or the DMs said word for word, never a way to ask for new briefs.
 */
const MAX_CARATTERI = 30_000

type Voce = { testo: string; perche: string; rif?: string[] }

export async function spuntiPerClaude(input: { settimana?: string | null }, ctx: ContestoMcp): Promise<EsitoStrumento> {
  const { data, error } = await ctx.db.rpc('spunti_per_claude', input.settimana ? { p_giorno: input.settimana } : {})
  if (error) return { ok: false, messaggio: 'Gli spunti non si sono caricati: riprova tra poco.' }
  const r = data as {
    spunti?: null
    periodo_da?: string
    periodo_a?: string
    finita_il?: string
    contenuto?: SpuntiContenuto
    idee_nel_calendario?: { idea: number; name: string }[]
  } | null
  if (!r || !r.contenuto) {
    return { ok: true, dati: { spunti: null, nota: 'Non ci sono ancora spunti per questa settimana: arrivano ogni lunedì mattina.' } }
  }
  const c = r.contenuto
  const fatti = (rif: string[] | undefined) => (rif ?? []).map((x) => c.fatti[x]).filter((x): x is string => Boolean(x))
  const voce = (v: Voce) => ({ testo: v.testo, perche: v.perche, fatti: fatti(v.rif) })
  const nelCalendario = new Map((r.idee_nel_calendario ?? []).map((x) => [x.idea, x.name]))

  const dati = {
    periodo: { da: r.periodo_da, a: r.periodo_a },
    scritti_il: r.finita_il,
    in_breve: c.in_breve,
    cosa_funziona: c.cosa_funziona.map(voce),
    cosa_chiedono_i_lead: c.temi.map((t) => ({ tema: t.tema, cosa_dicono: t.cosa_dicono, da_dove: t.fonti, tendenza: t.tendenza })),
    obiezioni: c.obiezioni.map((o) => ({
      obiezione: o.obiezione,
      dove_pesa: o.dove_pesa,
      contenuto_che_la_scioglie: o.contenuto_che_la_scioglie,
      perche: o.perche,
    })),
    domande: c.domande.map((d) => ({ domanda: d.domanda, risposta_in_breve: d.risposta_in_breve })),
    mantieni: c.mantieni.map(voce),
    cambia: c.cambia.map(voce),
    potenzia: c.potenzia.map(voce),
    idee: c.idee.map((i, n) => ({
      modello: i.modello === 'carousel' ? 'Carousel Topic' : 'Reel Topic',
      name: i.name,
      reel_type: ETICHETTA_REEL_TYPE[i.reel_type],
      format: i.format ? ETICHETTA_FORMAT[i.format] : null,
      fase: i.fase,
      gancio: i.gancio,
      messaggio: i.messaggio,
      script: i.script,
      perche: i.perche,
      nel_calendario: nelCalendario.get(n) ?? null,
    })),
  }
  // whole ideas only, dropped from the end when the result is too long for Claude
  let avviso: string | undefined
  while (JSON.stringify(dati).length > MAX_CARATTERI && dati.idee.length > 0) {
    dati.idee.pop()
    avviso = 'Alcune idee non entrano in una risposta sola: sono nella pagina Spunti dell’app.'
  }
  return { ok: true, dati: { ...dati, ...(avviso ? { avviso } : {}) } }
}
