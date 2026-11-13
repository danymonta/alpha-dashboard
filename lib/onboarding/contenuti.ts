import 'server-only'

import { revalidatePath } from 'next/cache'

import { negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import { ERRORI_BLOCCO, bloccoSchema, eliminaBloccoSchema } from '@/lib/validation/percorso'

/**
 * The minimal CMS of the client's contents (contenuti_blocchi, release B1a): the admin
 * writes the blocks with her own session under RLS (no function), never the service role.
 * The client receives them only from percorso_cliente(), the published ones of an unlocked
 * step. Not in Alfire, not in Claude.
 */
export type EsitoBlocco = { ok: true; id: string } | { ok: false; errore: string; campi?: Record<string, string> }
export type Esito = { ok: true } | { ok: false; errore: string }

function aggiorna() {
  revalidatePath('/settings/onboarding', 'layout')
  revalidatePath('/percorso', 'layout')
}

export async function salvaBlocco(ctx: Contesto, input: unknown): Promise<EsitoBlocco> {
  const parsed = bloccoSchema.safeParse(input)
  if (!parsed.success) {
    const campi: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0]
      if (typeof campo === 'string') campi[campo] ??= issue.message
    }
    return { ok: false, errore: parsed.error.issues[0]?.message ?? ERRORI_BLOCCO.nonValidi, campi }
  }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_BLOCCO.soloAdmin)
  if (negato) return { ok: false, errore: negato }

  const { id, ...valori } = parsed.data
  const scrittura = id
    ? ctx.db.from('contenuti_blocchi').update(valori).eq('id', id).select('id').maybeSingle()
    : ctx.db.from('contenuti_blocchi').insert(valori).select('id').maybeSingle()
  const { data, error } = await scrittura
  if (error || !data) {
    if (error) console.error('[contenuti] blocco non salvato:', error.code)
    return { ok: false, errore: ERRORI_BLOCCO.nonSalvato }
  }
  aggiorna()
  return { ok: true, id: data.id }
}

export async function eliminaBlocco(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = eliminaBloccoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_BLOCCO.nonValidi }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_BLOCCO.soloAdmin)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('contenuti_blocchi').delete().eq('id', parsed.data.id).select('id')
  if (error || !data || data.length === 0) {
    if (error) console.error('[contenuti] blocco non eliminato:', error.code)
    return { ok: false, errore: ERRORI_BLOCCO.nonEliminato }
  }
  aggiorna()
  return { ok: true }
}
