import 'server-only'

import { COLONNE_REEL, type RigaReel } from '@/lib/marketing/analisi/elenco'
import type { AnalisiContenuto, FontiAnalisi, SchedaVisiva } from '@/lib/marketing/analisi/tipi'
import { INDICE_RIFACIMENTO } from '@/lib/marketing/punteggio/rifacimento'
import type { PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/**
 * The detail of a reel for its panel (1.36.0, CLAUDE.md section 30), read with
 * the session of whoever asks (RLS: the Marketing area), never the service
 * role: the same reader for the page with ?reel and for the panel's GET. A
 * read that fails throws; a reel that is not there (or that RLS hides) is null.
 */

export type AnalisiLetta = {
  id: string
  stato: 'in_coda' | 'in_corso' | 'pronta' | 'fallita'
  motivo: string
  verdetto: string | null
  eta_ore: number | null
  eta_confronto: number | null
  finita_il: string | null
  errore: string | null
  contenuto: AnalisiContenuto | null
  fonti: FontiAnalisi | null
  numeri: Record<string, unknown> | null
}

export type LetturaLetta = {
  stato: string
  richiesta: string
  video: string | null
  trascrizione_esito: string | null
  trascrizione: string | null
  segmenti: { da: number; a: number; testo: string }[] | null
  scheda: SchedaVisiva | null
  fotogrammi: number | null
  visione_esito: string | null
  fonte_visione: string | null
  versione_prompt_visione: string | null
  errore: string | null
}

/** The score of the last ready analysis that has one (1.39.0). */
export type PunteggioLetto = {
  analisi_id: string
  finita_il: string | null
  eta_ore: number | null
  versione_guida: string | null
  punteggio: PunteggioContenuto
  /** the content born from its rewrite, when «Aggiungi al calendario» was tapped */
  rifacimento_nel_calendario: { contenuto_id: string; nome: string } | null
}

export type ContenutoCalendario = { id: string; nome: string; reel_type: string | null; formato: string | null; stato: string }

export type DettaglioReel = {
  reel: RigaReel
  /** the latest ready analysis, or null */
  analisi: AnalisiLetta | null
  /** the latest one if it is open or failed after the ready one (the panel says «in corso» / «non riuscita») */
  ultima: AnalisiLetta | null
  /** the score of the last ready analysis that has one; null: not scored (the page says «Non valutato») */
  punteggio: PunteggioLetto | null
  lettura: LetturaLetta | null
  /** the calendar content linked to the reel */
  contenuto: ContenutoCalendario | null
  /** the ideas of the ready analysis already in the calendar: index → the content */
  idee: { indice: number; contenuto_id: string; nome: string }[]
  /** Claude's proposal for the content, when still valid */
  propostaClaude: { contenuto: ContenutoCalendario; sicurezza: string; perche: string } | null
  /** the run's proposals for the post (v_marketing_proposte) */
  proposte: { contenuto_id: string; nome: string; motivi: string[]; punteggio: number }[]
}

const COLONNE_ANALISI = 'id, stato, motivo, verdetto, eta_ore, eta_confronto, finita_il, errore, contenuto, fonti, numeri'

function comeAnalisi(r: Record<string, unknown> | null): AnalisiLetta | null {
  return r ? (r as unknown as AnalisiLetta) : null
}

export async function leggiDettaglioReel(db: Db, mediaId: string): Promise<DettaglioReel | null> {
  if (!/^[0-9]{1,30}$/.test(mediaId)) return null
  const { data: riga, error } = await db.from('v_analisi_reel').select(COLONNE_REEL).eq('media_id', mediaId).maybeSingle()
  if (error) throw new Error(`reel non letto (${error.code ?? 'errore'})`)
  if (!riga) return null
  const reel = riga as unknown as RigaReel

  const [pronta, ultime, lettura, contenuto, proposte, scorePronta] = await Promise.all([
    db.from('marketing_analisi').select(COLONNE_ANALISI).eq('media_id', mediaId).eq('stato', 'pronta').order('finita_il', { ascending: false }).limit(1).maybeSingle(),
    db.from('marketing_analisi').select(COLONNE_ANALISI).eq('media_id', mediaId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db
      .from('instagram_letture')
      .select('stato, richiesta, video, trascrizione_esito, trascrizione, segmenti, scheda, fotogrammi, visione_esito, fonte_visione, versione_prompt_visione, errore')
      .eq('media_id', mediaId)
      .maybeSingle(),
    reel.contenuto_id
      ? db.from('marketing_contenuti').select('id, nome, reel_type, formato, stato').eq('id', reel.contenuto_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reel.shortcode
      ? db.from('v_marketing_proposte').select('contenuto_id, nome, motivi, punteggio').eq('shortcode', reel.shortcode).order('punteggio', { ascending: false }).limit(3)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('marketing_analisi')
      .select('id, finita_il, eta_ore, punteggio, versione_guida')
      .eq('media_id', mediaId)
      .eq('stato', 'pronta')
      .not('punteggio', 'is', null)
      .order('finita_il', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  for (const r of [pronta, ultime, lettura, contenuto, proposte, scorePronta]) if (r.error) throw new Error(`dettaglio non letto (${r.error.code ?? 'errore'})`)

  const analisi = comeAnalisi(pronta.data as Record<string, unknown> | null)
  const ultima = ultime.data && ultime.data.id !== analisi?.id ? comeAnalisi(ultime.data as Record<string, unknown>) : null

  let idee: DettaglioReel['idee'] = []
  if (analisi) {
    const { data, error: erroreIdee } = await db
      .from('marketing_contenuti')
      .select('id, nome, da_idea')
      .eq('da_analisi', analisi.id)
      .not('da_idea', 'is', null)
    if (erroreIdee) throw new Error(`idee non lette (${erroreIdee.code ?? 'errore'})`)
    idee = (data ?? []).map((c) => ({ indice: c.da_idea as number, contenuto_id: c.id, nome: c.nome }))
  }

  // the score, and the content its rewrite became
  let punteggio: DettaglioReel['punteggio'] = null
  const sp = scorePronta.data
  if (sp?.punteggio) {
    const { data: nato, error: erroreNato } = await db
      .from('marketing_contenuti')
      .select('id, nome')
      .eq('da_analisi', sp.id)
      .eq('da_idea', INDICE_RIFACIMENTO)
      .maybeSingle()
    if (erroreNato) throw new Error(`rifacimento non letto (${erroreNato.code ?? 'errore'})`)
    punteggio = {
      analisi_id: sp.id,
      finita_il: sp.finita_il,
      eta_ore: sp.eta_ore,
      versione_guida: sp.versione_guida,
      punteggio: sp.punteggio as unknown as PunteggioContenuto,
      rifacimento_nel_calendario: nato ? { contenuto_id: nato.id, nome: nato.nome } : null,
    }
  }

  // Claude's proposal counts only while it is still valid (D28): a content without URL, not Canceled,
  // the pair not refused, the post neither linked, excluded nor gone
  let propostaClaude: DettaglioReel['propostaClaude'] = null
  const collegamento = analisi?.contenuto?.collegamento
  if (collegamento && !reel.contenuto_id && reel.stato_collegamento !== 'escluso' && !reel.eliminato && reel.shortcode) {
    const [candidato, rifiuto] = await Promise.all([
      db.from('marketing_contenuti').select('id, nome, reel_type, formato, stato, url').eq('id', collegamento.contenuto_id).maybeSingle(),
      db.from('marketing_abbinamenti_rifiutati').select('contenuto_id').eq('shortcode', reel.shortcode).eq('contenuto_id', collegamento.contenuto_id).maybeSingle(),
    ])
    const c = candidato.data
    if (!candidato.error && !rifiuto.error && c && c.url === null && c.stato !== 'canceled' && !rifiuto.data) {
      propostaClaude = {
        contenuto: { id: c.id, nome: c.nome, reel_type: c.reel_type, formato: c.formato, stato: c.stato },
        sicurezza: collegamento.sicurezza,
        perche: collegamento.perche,
      }
    }
  }

  return {
    reel,
    analisi,
    punteggio,
    ultima: ultima && (ultima.stato === 'in_coda' || ultima.stato === 'in_corso' || ultima.stato === 'fallita') ? ultima : null,
    lettura: (lettura.data as unknown as LetturaLetta | null) ?? null,
    contenuto: contenuto.data
      ? { id: contenuto.data.id, nome: contenuto.data.nome, reel_type: contenuto.data.reel_type, formato: contenuto.data.formato, stato: contenuto.data.stato }
      : null,
    idee,
    propostaClaude,
    proposte: (proposte.data ?? []).flatMap((p) =>
      p.contenuto_id && p.nome ? [{ contenuto_id: p.contenuto_id, nome: p.nome, motivi: p.motivi ?? [], punteggio: p.punteggio ?? 0 }] : [],
    ),
  }
}
