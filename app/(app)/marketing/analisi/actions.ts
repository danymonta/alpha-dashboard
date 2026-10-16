'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { ricalcolaAbbinamenti } from '@/lib/instagram/sincronizza-contenuti'
import { contenutoDaIdea } from '@/lib/marketing/analisi/idea'
import type { AnalisiContenuto, SchedaVisiva } from '@/lib/marketing/analisi/tipi'
import { nomeDaDidascalia } from '@/lib/marketing/da-post'
import { contenutoDaRifacimento, haRifacimento, INDICE_RIFACIMENTO } from '@/lib/marketing/punteggio/rifacimento'
import type { PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'
import * as operazioni from '@/lib/marketing/operazioni'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * The taps of the Analisi page that write the calendar (1.36.0, CLAUDE.md
 * section 30): «Aggiungi al calendario» and «Crea il contenuto». Both go
 * through the one write path of the calendar (lib/marketing/operazioni.ts) with
 * the session of whoever taps, never the service role: RLS decides, and the
 * role check here only turns a refusal into words. What is written is read
 * from the analysis with the same session, never taken from the browser: the
 * browser sends only the analysis and the idea's number.
 *
 * «Collega», «Scollega» and the others of the reel panel are the actions of
 * Post di Instagram (collegaPost, annullaCollega...), the same code.
 */

const ideaSchema = z.object({ analisi_id: z.string().uuid(), indice: z.number().int().min(0).max(9) })
const analisiSchema = z.object({ analisi_id: z.string().uuid() })

export type EsitoIdea = { ok: true; id: string; nome: string } | { ok: false; errore: string }
export type EsitoDaAnalisi = { ok: true; id: string } | { ok: false; errore: string }

const NON_TROVATA = 'Questa analisi non c’è più: aggiorna la pagina.'

/** «Aggiungi al calendario»: the idea becomes a Reel Topic, with its draft and where it comes from. */
export async function aggiungiIdeaAlCalendario(input: unknown): Promise<EsitoIdea> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  const letto = ideaSchema.safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Idea non valida.' }

  const db = await createClient()
  const { data: analisi } = await db.from('marketing_analisi').select('id, stato, media_id, contenuto').eq('id', letto.data.analisi_id).maybeSingle()
  if (!analisi || analisi.stato !== 'pronta') return { ok: false, errore: NON_TROVATA }
  const idea = (analisi.contenuto as AnalisiContenuto | null)?.idee?.[letto.data.indice]
  if (!idea) return { ok: false, errore: 'Questa idea non c’è più.' }
  const { data: post } = await db.from('instagram_contenuti').select('permalink, pubblicato_il').eq('media_id', analisi.media_id).maybeSingle()
  if (!post) return { ok: false, errore: NON_TROVATA }

  const { input: contenuto, sezioni } = contenutoDaIdea(idea, {
    permalink: post.permalink,
    pubblicato_il: post.pubblicato_il,
  })
  const esito = await operazioni.creaContenuto(db, contenuto, sezioni, { analisi_id: analisi.id, idea: letto.data.indice })
  if (!esito.ok) return { ok: false, errore: esito.errore }
  revalidatePath('/marketing', 'layout')
  return { ok: true, id: esito.id, nome: idea.name }
}

/**
 * «Aggiungi al calendario» from «Come rifarlo» (1.39.0): the rewrite of a scored
 * reel becomes a Reel Topic with the rewritten script, once per analysis (the
 * idea number 9; the database refuses it twice and refuses it to an analysis
 * whose score has no rewrite).
 */
export async function aggiungiRifacimentoAlCalendario(input: unknown): Promise<EsitoIdea> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  const letto = analisiSchema.safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Analisi non valida.' }

  const db = await createClient()
  const { data: analisi } = await db.from('marketing_analisi').select('id, stato, media_id, punteggio').eq('id', letto.data.analisi_id).maybeSingle()
  const punteggio = analisi?.stato === 'pronta' ? (analisi.punteggio as unknown as PunteggioContenuto | null) : null
  if (!analisi || !punteggio) return { ok: false, errore: NON_TROVATA }
  if (!haRifacimento(punteggio)) return { ok: false, errore: 'Questo punteggio non ha un rifacimento.' }
  const { data: post } = await db.from('instagram_contenuti').select('shortcode, permalink, pubblicato_il, didascalia').eq('media_id', analisi.media_id).maybeSingle()
  if (!post) return { ok: false, errore: NON_TROVATA }
  const [collegato, lettura] = await Promise.all([
    db.from('marketing_contenuti').select('nome').eq('instagram_shortcode', post.shortcode).maybeSingle(),
    db.from('instagram_letture').select('scheda').eq('media_id', analisi.media_id).maybeSingle(),
  ])
  const nome = collegato.data?.nome || nomeDaDidascalia(post.didascalia) || 'reel'
  const formato = (lettura.data?.scheda as SchedaVisiva | null)?.classificazione?.format ?? null

  const { input: contenuto, sezioni } = contenutoDaRifacimento(punteggio, {
    nome,
    permalink: post.permalink,
    pubblicato_il: post.pubblicato_il,
    formato,
  })
  const esito = await operazioni.creaContenuto(db, contenuto, sezioni, { analisi_id: analisi.id, idea: INDICE_RIFACIMENTO })
  if (!esito.ok) return { ok: false, errore: esito.errore }
  revalidatePath('/marketing', 'layout')
  return { ok: true, id: esito.id, nome: contenuto.nome }
}

/**
 * «Crea il contenuto» from the analysis: a Posted content made from the post
 * (the same insert as Post di Instagram), with the Reel Type and the Format
 * Claude gave the reel if the card has them.
 */
export async function creaContenutoDaAnalisi(input: unknown): Promise<EsitoDaAnalisi> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  const letto = analisiSchema.safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Analisi non valida.' }

  const db = await createClient()
  const { data: analisi } = await db.from('marketing_analisi').select('media_id').eq('id', letto.data.analisi_id).maybeSingle()
  if (!analisi) return { ok: false, errore: NON_TROVATA }
  const [post, lettura] = await Promise.all([
    db.from('instagram_contenuti').select('shortcode').eq('media_id', analisi.media_id).maybeSingle(),
    db.from('instagram_letture').select('scheda').eq('media_id', analisi.media_id).maybeSingle(),
  ])
  if (!post.data) return { ok: false, errore: NON_TROVATA }
  const classificazione = (lettura.data?.scheda as SchedaVisiva | null)?.classificazione
  const esito = await operazioni.creaContenutoDaPost(
    db,
    { shortcode: post.data.shortcode },
    {
      classificazione: classificazione ? { reel_type: classificazione.reel_type, formato: classificazione.format } : undefined,
      riproponi: async () => {
        try {
          await ricalcolaAbbinamenti({ db: createAdminClient(), automatico: false })
        } catch (e) {
          console.error('[analisi] proposte non rifatte dopo un tocco:', e instanceof Error ? e.name : 'errore')
        }
      },
    },
  )
  if (!esito.ok) return { ok: false, errore: esito.errore }
  revalidatePath('/marketing', 'layout')
  return { ok: true, id: esito.id }
}

/** One redraw of the Marketing area, after a route (the request of an analysis ended). */
export async function rivalidaAnalisi(): Promise<void> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return
  revalidatePath('/marketing', 'layout')
}
