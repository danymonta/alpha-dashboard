'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { negaSeNon } from '@/lib/auth/azioni'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { formatData } from '@/lib/format'
import { contenutoDaIdeaSpunti } from '@/lib/marketing/spunti/idea'
import type { SpuntiContenuto } from '@/lib/marketing/spunti/tipi'
import * as operazioni from '@/lib/marketing/operazioni'
import { createClient } from '@/lib/supabase/server'

/**
 * «Aggiungi al calendario» of an idea of the weekly brief (1.37.0, CLAUDE.md section 31): the
 * idea becomes a content of the calendar through the one write path (lib/marketing/operazioni.ts),
 * with the session of whoever taps, never the service role: RLS decides, the role check only turns a
 * refusal into words. What is written is read from the brief with the same session, never taken from
 * the browser: the browser sends only the brief and the idea's number.
 */
const ideaSchema = z.object({ spunti_id: z.string().uuid(), indice: z.number().int().min(0).max(11) })

export type EsitoIdeaSpunti = { ok: true; id: string; nome: string } | { ok: false; errore: string }

export async function aggiungiIdeaSpuntiAlCalendario(input: unknown): Promise<EsitoIdeaSpunti> {
  const negato = await negaSeNon(RUOLI_MARKETING, operazioni.SOLO_MARKETING)
  if (negato) return { ok: false, errore: negato }
  const letto = ideaSchema.safeParse(input)
  if (!letto.success) return { ok: false, errore: 'Idea non valida.' }

  const db = await createClient()
  const { data: brief } = await db.from('marketing_spunti').select('id, stato, contenuto, finita_il').eq('id', letto.data.spunti_id).maybeSingle()
  if (!brief || brief.stato !== 'pronta') return { ok: false, errore: 'Questi spunti non ci sono più: aggiorna la pagina.' }
  const idea = (brief.contenuto as SpuntiContenuto | null)?.idee?.[letto.data.indice]
  if (!idea) return { ok: false, errore: 'Questa idea non c’è più.' }

  const { input: contenuto, sezioni } = contenutoDaIdeaSpunti(idea, { giorno: formatData(brief.finita_il ?? new Date().toISOString()) })
  const esito = await operazioni.creaContenuto(db, contenuto, sezioni, { spunti_id: brief.id, idea: letto.data.indice })
  if (!esito.ok) return { ok: false, errore: esito.errore }
  revalidatePath('/marketing', 'layout')
  return { ok: true, id: esito.id, nome: idea.name }
}
