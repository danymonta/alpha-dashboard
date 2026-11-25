import 'server-only'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import type { RigaDomanda } from '@/lib/percorso/questionario'
import type { Json } from '@/lib/supabase/database.types'
import {
  attivaDomandaSchema,
  chiaveNuova,
  domandaSchema,
  ERRORI_DOMANDE,
  spostaDomandaSchema,
  valoreNuovo,
} from '@/lib/validation/domande'

/**
 * The questions of the questionnaire written by the admin (1.88.0, Impostazioni › Questionario):
 * her own session under RLS (onboarding_domande, policies of the admin), never the service role.
 * The database keeps what never changes (key, kind, column of the sheet: the trigger
 * onboarding_domande_guardia); a question is never deleted, «Togli» hides it. Not in Alfire, not
 * in Claude.
 */

export type EsitoDomanda = { ok: true; chiave: string } | { ok: false; errore: string; campi?: Record<string, string> }
export type Esito = { ok: true } | { ok: false; errore: string }

function aggiorna() {
  revalidatePath('/settings', 'layout')
  revalidatePath('/percorso', 'layout')
  revalidatePath('/onboarding', 'layout')
}

function erroreDb(messaggio: string | undefined): string {
  if (messaggio === ERRORI_DOMANDE.tipo || messaggio === ERRORI_DOMANDE.numeriche) return messaggio
  return ERRORI_DOMANDE.nonSalvata
}

/** The options as the table keeps them: an option already there keeps its value, a new one gets one from its words. */
function opzioniDa(
  input: { valore?: string | null; etichetta: string; dettaglio?: string | null }[],
  prima: RigaDomanda['opzioni'],
): { valore: string; etichetta: string; dettaglio?: string }[] {
  const esistenti = new Set(
    Array.isArray(prima) ? prima.flatMap((o) => (o && typeof o === 'object' && 'valore' in o ? [String(o.valore)] : [])) : [],
  )
  const usati = new Set<string>(input.flatMap((o) => (o.valore && esistenti.has(o.valore) ? [o.valore] : [])))
  return input.map((o) => {
    const valore = o.valore && esistenti.has(o.valore) ? o.valore : valoreNuovo(o.etichetta, usati)
    usati.add(valore)
    return { valore, etichetta: o.etichetta.trim(), ...(o.dettaglio ? { dettaglio: o.dettaglio } : {}) }
  })
}

export async function salvaDomanda(ctx: Contesto, input: unknown): Promise<EsitoDomanda> {
  const parsed = domandaSchema.safeParse(input)
  if (!parsed.success) {
    const campi: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0]
      if (typeof campo === 'string') campi[campo] ??= issue.message
    }
    return { ok: false, errore: parsed.error.issues[0]?.message ?? ERRORI_DOMANDE.nonValidi, campi }
  }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_DOMANDE.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  const v = parsed.data

  if (v.chiave) {
    const { data: prima, error: erroreLettura } = await ctx.db.from('onboarding_domande').select('*').eq('chiave', v.chiave).maybeSingle()
    if (erroreLettura || !prima) return { ok: false, errore: ERRORI_DOMANDE.nonTrovata }
    const conOpzioni = prima.tipo === 'scelta' || prima.tipo === 'scelte' || prima.tipo === 'abitudini'
    if (conOpzioni && (v.opzioni ?? []).length === 0) return { ok: false, errore: ERRORI_DOMANDE.opzioni, campi: { opzioni: ERRORI_DOMANDE.opzioni } }
    const allegatoPrima = prima.allegato as { campo?: string } | null
    // the files keep their field: a question of the form keeps the one of its files, a new one its key
    const allegato =
      prima.tipo === 'file' || v.file
        ? v.file
          ? { campo: allegatoPrima?.campo ?? prima.chiave, etichetta: v.file.etichetta, ...(v.file.aiuto ? { aiuto: v.file.aiuto } : {}) }
          : prima.allegato
        : null
    const valori = {
      testo: v.testo,
      aiuto: v.aiuto ?? null,
      sezione: v.sezione,
      obbligatoria: v.obbligatoria,
      lungo: prima.tipo === 'testo' ? v.lungo : false,
      opzioni: conOpzioni ? (opzioniDa(v.opzioni ?? [], prima.opzioni) as unknown as Json) : null,
      altro: prima.tipo === 'abitudini' ? (v.altro ?? prima.altro) : null,
      allegato: allegato as Json,
      // a question moved to another part goes at its end
      ...(prima.sezione !== v.sezione ? { ordine: await ultimoOrdine(ctx) } : {}),
    }
    const { error } = await ctx.db.from('onboarding_domande').update(valori).eq('chiave', v.chiave)
    if (error) {
      console.error('[domande] domanda non salvata:', error.code)
      return { ok: false, errore: erroreDb(error.message) }
    }
    aggiorna()
    return { ok: true, chiave: v.chiave }
  }

  const tipo = v.tipo!
  const chiave = chiaveNuova(v.testo, randomBytes(3).toString('hex'))
  const conOpzioni = tipo === 'scelta' || tipo === 'scelte'
  const { error } = await ctx.db.from('onboarding_domande').insert({
    chiave,
    tipo,
    testo: v.testo,
    aiuto: v.aiuto ?? null,
    sezione: v.sezione,
    ordine: await ultimoOrdine(ctx),
    obbligatoria: v.obbligatoria,
    lungo: tipo === 'testo' ? v.lungo : false,
    opzioni: conOpzioni ? (opzioniDa(v.opzioni ?? [], null) as unknown as Json) : null,
    allegato: v.file
      ? ({ campo: chiave, etichetta: v.file.etichetta, ...(v.file.aiuto ? { aiuto: v.file.aiuto } : {}) } as Json)
      : null,
  })
  if (error) {
    console.error('[domande] domanda non creata:', error.code)
    return { ok: false, errore: erroreDb(error.message) }
  }
  aggiorna()
  return { ok: true, chiave }
}

/** The order after every question: a new question (or one moved to another part) goes at the end of its part. */
async function ultimoOrdine(ctx: Contesto): Promise<number> {
  const { data } = await ctx.db.from('onboarding_domande').select('ordine').order('ordine', { ascending: false }).limit(1)
  return (data?.[0]?.ordine ?? 0) + 1
}

/** One place up or down inside its part, among the questions in use: the two swap their order. */
export async function spostaDomanda(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = spostaDomandaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_DOMANDE.nonValidi }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_DOMANDE.soloAdmin)
  if (negato) return { ok: false, errore: negato }

  const { data: righe, error } = await ctx.db
    .from('onboarding_domande')
    .select('chiave, sezione, ordine, attiva')
    .order('sezione')
    .order('ordine')
  if (error || !righe) return { ok: false, errore: ERRORI_DOMANDE.spostamento }
  const questa = righe.find((r) => r.chiave === parsed.data.chiave)
  if (!questa) return { ok: false, errore: ERRORI_DOMANDE.nonTrovata }
  const vicine = righe.filter((r) => r.sezione === questa.sezione && r.attiva)
  const i = vicine.findIndex((r) => r.chiave === questa.chiave)
  const altra = vicine[parsed.data.verso === 'su' ? i - 1 : i + 1]
  if (!altra) return { ok: true }

  // two updates: the order is not unique, so the swap never stops halfway on a constraint
  const a = await ctx.db.from('onboarding_domande').update({ ordine: altra.ordine }).eq('chiave', questa.chiave)
  const b = a.error ? a : await ctx.db.from('onboarding_domande').update({ ordine: questa.ordine }).eq('chiave', altra.chiave)
  if (a.error || b.error) {
    console.error('[domande] domanda non spostata:', (a.error ?? b.error)?.code)
    return { ok: false, errore: ERRORI_DOMANDE.spostamento }
  }
  aggiorna()
  return { ok: true }
}

/** «Togli» and «Rimetti»: a question taken away disappears for the clients who are filling in; the answers sent stay. */
export async function cambiaAttivaDomanda(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = attivaDomandaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_DOMANDE.nonValidi }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_DOMANDE.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  const valori = parsed.data.attiva
    ? { attiva: true, ordine: await ultimoOrdine(ctx) }
    : { attiva: false }
  const { data, error } = await ctx.db.from('onboarding_domande').update(valori).eq('chiave', parsed.data.chiave).select('chiave')
  if (error || !data || data.length === 0) {
    if (error) console.error('[domande] domanda non cambiata:', error.code)
    return { ok: false, errore: ERRORI_DOMANDE.stato }
  }
  aggiorna()
  return { ok: true }
}
