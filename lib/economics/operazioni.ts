import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { messaggioErrore, negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import { isDataISO } from '@/lib/date'
import { costoSchema, modificaCostoSchema } from '@/lib/validation/anagrafiche'
import { obiettiviSchema } from '@/lib/validation/obiettivi'
import { modificaPagamentoProvvigioneSchema, pagamentoProvvigioneSchema } from '@/lib/validation/provvigione'
import { chiudiRegolaSchema, modificaRegolaSchema, regolaSchema } from '@/lib/validation/team'

/**
 * The only way costs, commission payouts, commission rules and the month's
 * goals are written (Claude a 360 gradi, phase 4, 23/10/2026): from the app
 * (the server actions of /expenses, /commissions, /settings/commissions and the
 * Panoramica's goals, with the cookie session of whoever taps, and Alfire,
 * which calls those actions) and from Claude (the MCP tools, with the OAuth
 * token of whoever connected it). Same Zod schemas, same SQL, same messages;
 * the client is always the caller's, never the service role, so RLS and the
 * functions in SQL decide what actually happens (the admin only). Every write
 * revalidates the pages it touches, so a change from Claude shows in the app
 * too. Deleting a cost, a payout or a rule, and removing the goals, stay in the
 * actions: never from Claude. No function here is new in the database: the
 * code runs the same with or without 20261031090000.
 */

export type { Contesto } from '@/lib/call/operazioni'

export type Esito = { ok: true } | { ok: false; errore: string }
export type EsitoCreato = { ok: true; id?: string } | { ok: false; errore: string }
export type EsitoCopia = { ok: true; copiati: number } | { ok: false; errore: string }

const primo = (parsed: { error: z.ZodError }) => parsed.error.issues[0]?.message ?? 'Dati non validi.'

async function soloAdmin(ctx: Contesto): Promise<string | null> {
  return negaPer(await ctx.chi(), ['admin'])
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------
function aggiornaCosti() {
  revalidatePath('/expenses')
  revalidatePath('/')
}

export async function aggiungiCosto(ctx: Contesto, input: unknown): Promise<EsitoCreato> {
  const parsed = costoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('expenses').insert(parsed.data).select('id').maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Costo non salvato. Riprova.') }

  aggiornaCosti()
  return { ok: true, id: data?.id }
}

export async function modificaCosto(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = modificaCostoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const { data, error } = await ctx.db.from('expenses').update(campi).eq('id', id).select('id').maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Costo non aggiornato. Riprova.') }
  if (!data) return { ok: false, errore: 'Costo non trovato.' }

  aggiornaCosti()
  return { ok: true }
}

export async function copiaRicorrenti(ctx: Contesto, input: unknown): Promise<EsitoCopia> {
  const parsed = z.object({ mese: z.string().refine(isDataISO) }).safeParse(input)
  if (!parsed.success) return { ok: false, errore: 'Mese non valido.' }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('copia_costi_ricorrenti', { p_mese: parsed.data.mese })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Copia non riuscita. Riprova.') }

  aggiornaCosti()
  return { ok: true, copiati: data ?? 0 }
}

// ---------------------------------------------------------------------------
// Commission payouts
// ---------------------------------------------------------------------------
function aggiornaPagamenti() {
  revalidatePath('/commissions')
  revalidatePath('/my-numbers')
  revalidatePath('/')
}

export async function registraPagamentoProvvigione(ctx: Contesto, input: unknown): Promise<EsitoCreato> {
  const parsed = pagamentoProvvigioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.from('commission_payouts').insert(parsed.data).select('id').maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Pagamento non registrato. Riprova.') }

  aggiornaPagamenti()
  return { ok: true, id: data?.id }
}

export async function modificaPagamentoProvvigione(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = modificaPagamentoProvvigioneSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { id, ...campi } = parsed.data
  const { data, error } = await ctx.db
    .from('commission_payouts')
    .update({ ...campi, metodo: campi.metodo ?? null })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Pagamento non aggiornato. Riprova.') }
  if (!data) return { ok: false, errore: 'Pagamento non trovato.' }

  aggiornaPagamenti()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Commission rules
// ---------------------------------------------------------------------------
function aggiornaRegole() {
  revalidatePath('/settings/commissions')
  revalidatePath('/commissions')
  revalidatePath('/my-numbers')
  revalidatePath('/')
}

/** Points to a fraction (7 -> 0.07): the one and only conversion, for a new rule and a corrected one. */
export function frazione(punti: number): number {
  return Math.round(punti * 100) / 10000
}

/** A new rule starts on a date and closes the one in force: history never changes. */
export async function nuovaRegola(ctx: Contesto, input: unknown): Promise<EsitoCreato> {
  const parsed = regolaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { data, error } = await ctx.db.rpc('nuova_regola_provvigione', {
    p_profile_id: parsed.data.profile_id,
    p_percentuale: frazione(parsed.data.percentuale),
    p_applica_a: parsed.data.applica_a,
    p_valida_dal: parsed.data.valida_dal,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non salvata. Riprova.') }

  aggiornaRegole()
  return { ok: true, id: data ?? undefined }
}

export async function chiudiRegola(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = chiudiRegolaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { error } = await ctx.db.rpc('chiudi_regola_provvigione', {
    p_rule_id: parsed.data.rule_id,
    p_valida_al: parsed.data.valida_al,
  })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non chiusa. Riprova.') }

  aggiornaRegole()
  return { ok: true }
}

/** Correct a rule in place. The overlap guard in the database keeps one rule per day. */
export async function modificaRegola(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = modificaRegolaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const v = parsed.data
  const { data, error } = await ctx.db
    .from('commission_rules')
    .update({
      percentuale: frazione(v.percentuale),
      applica_a: v.applica_a,
      valida_dal: v.valida_dal,
      valida_al: v.valida_al,
    })
    .eq('id', v.id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, errore: messaggioErrore(error, 'Regola non aggiornata. Riprova.') }
  if (!data) return { ok: false, errore: 'Regola non trovata.' }

  aggiornaRegole()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The month's goals
// ---------------------------------------------------------------------------
/**
 * Targets of the month (admin). Both empty: the targets are removed, from the
 * app only (Claude's tool refuses it before reaching here, and the database
 * refuses a delete from an OAuth token anyway).
 */
export async function salvaObiettivi(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = obiettiviSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: primo(parsed) }
  const negato = await soloAdmin(ctx)
  if (negato) return { ok: false, errore: negato }

  const { mese, cash, nuovi_clienti } = parsed.data
  const { error } =
    cash === null && nuovi_clienti === null
      ? await ctx.db.from('obiettivi_mese').delete().eq('mese', mese)
      : await ctx.db.from('obiettivi_mese').upsert({ mese, cash, nuovi_clienti }, { onConflict: 'mese' })
  if (error) return { ok: false, errore: messaggioErrore(error, 'Obiettivi non salvati. Riprova.') }

  revalidatePath('/')
  return { ok: true }
}
