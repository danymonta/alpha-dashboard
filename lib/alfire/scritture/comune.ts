import 'server-only'

import { tool, type Tool } from 'ai'
import { z } from 'zod'

import { anteprimaEliminazione } from '@/app/actions/eliminazione'
import { azioniConsentite, AZIONI } from '@/lib/alfire/permessi'
import type { Anteprima } from '@/lib/alfire/riassunto'
import { errore, isErrore, type Errore, type Risolutori, type Supabase } from '@/lib/alfire/risolvi'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { isDataISO } from '@/lib/date'
import { frasiAnteprima, type TipoEliminazione } from '@/lib/eliminazione'

/**
 * One Alfire tool: what the model sees and runs, the schema it validates with
 * (the confirmation card's preview parses the same input again) and, for a
 * write, the preview read from the database before the user taps "Conferma".
 */
export type Definizione = {
  strumento: Tool
  schema: z.ZodTypeAny
  anteprima?: (input: unknown) => Promise<Anteprima>
}

export function definizione<S extends z.ZodTypeAny>(d: {
  description: string
  inputSchema: S
  execute: (input: z.infer<S>) => Promise<unknown>
  anteprima?: (input: z.infer<S>) => Promise<Anteprima>
}): Definizione {
  const date = campiData(d.inputSchema)
  const anteprima_ = d.anteprima
  return {
    strumento: tool({
      description: d.description,
      inputSchema: d.inputSchema,
      execute: async (input: z.infer<S>) => dataSbagliata(input, date) ?? conFormato(await d.execute(input)),
    } as never) as Tool,
    schema: d.inputSchema,
    anteprima: anteprima_
      ? (async (input: z.infer<S>) => dataSbagliata(input, date) ?? conFormato(await anteprima_(input))) as Definizione['anteprima']
      : undefined,
  }
}

/** The top-level fields the model writes as AAAA-MM-GG (`data`, `dataISO`): their description says so first. */
function campiData(schema: z.ZodTypeAny): string[] {
  if (!(schema instanceof z.ZodObject)) return []
  return Object.entries(schema.shape as Record<string, z.ZodTypeAny>)
    .filter(([, campo]) => campo.description?.startsWith('AAAA-MM-GG'))
    .map(([nome]) => nome)
}

/**
 * A date written another way ("02/10/2026", "venerdì") gets the format back
 * before anything is looked up or written (03/10/2026): a lookup by that day
 * would fail as "non riesco a leggere", a write as "Data non valida".
 */
function dataSbagliata(input: unknown, campi: readonly string[]): Errore | null {
  const valori = (input ?? {}) as Record<string, unknown>
  return campi.some((c) => typeof valori[c] === 'string' && valori[c].trim() !== '' && !isDataISO(valori[c].trim()))
    ? erroreData()
    : null
}

/** A form's "Data non valida" (a date inside a list, as the instalments of a sale) says the format too, to the model. */
function conFormato<T>(esito: T): T | Errore {
  return isErrore(esito) && esito.errore.startsWith('Data non valida') ? erroreData() : esito
}

export type Contesto = {
  supabase: Supabase
  profilo: Profilo
  livelloPm: LivelloPm
  r: Risolutori
}

/** The action enum of a tool, only with what this person may do (permessi.AZIONI). */
export function enumAzioni(ctx: Contesto, nome: keyof typeof AZIONI) {
  const azioni = azioniConsentite(nome, ctx.profilo.ruolo, ctx.livelloPm)
  // a tool without actions for this person is filtered out before the model sees it
  return z.enum((azioni.length > 0 ? azioni : ['nessuna']) as [string, ...string[]])
}

export const data = z.string().describe('AAAA-MM-GG')

/**
 * A date field with its own words. Zod's describe() replaces a description, so
 * `data.optional().describe('Default oggi')` once told the model nothing about
 * the format, and it wrote "28/09/2026" (03/10/2026): the format always comes first.
 */
export function dataISO(descrizione: string) {
  return z.string().describe(`AAAA-MM-GG. ${descrizione}`)
}

/** What a read or a write answers to a date in another format: never a silent default period. */
export const DATE_ISO = 'Date in formato AAAA-MM-GG (es. 2026-09-28): riprova così.'

/** The same on the card, for the person: the format is the model's business. */
export const DATA_DA_RISCRIVERE = 'La data non è scritta nel formato che serve: la riscrivo e riprovo.'

export function erroreData(): Errore {
  return errore(DATA_DA_RISCRIVERE, DATE_ISO)
}

/**
 * Whose data a "mine" read returns (mio_tempo, miei_numeri, miei_task), first
 * in the result. The model must never hand them out as someone else's: asked
 * about Loris's time, Alfire once answered with Dany's own two hours (Dany's
 * chat of 30/09/2026).
 */
export function datiDi(profilo: Pick<Profilo, 'nome'>) {
  return {
    persona: profilo.nome,
    di_chi: `Questi sono i dati di ${profilo.nome}, cioè di chi sta chattando: mai di un’altra persona.`,
  }
}

/** The end of a "mine" read's description: the caller's data only. */
export const SOLO_DI_CHI_CHATTA = 'Solo di chi chatta: mai per un’altra persona.'

/** Titles and lines of a preview that knows the row. */
export function anteprima(titolo: string | undefined, righe: (string | null | false | undefined)[], sostituisceDettagli = true): Anteprima {
  return { ...(titolo ? { titolo } : {}), righe: righe.filter((r): r is string => Boolean(r)), sostituisceDettagli }
}

/**
 * A deletion's card: what it takes with it, counted by public.anteprima_eliminazione
 * (the app's own question). When the count fails the card is incomplete, and the
 * red button waits: a deletion never goes without its consequences on screen.
 */
export async function anteprimaConConseguenze(
  titolo: string,
  tipo: TipoEliminazione,
  id: string,
  altre: readonly string[] = [],
): Promise<Anteprima> {
  const esito = await anteprimaEliminazione(tipo, id)
  if (!esito.ok) {
    return { titolo, righe: ['Non riesco a contare cosa si porta dietro: annulla e riprova tra poco.'], sostituisceDettagli: true, incompleta: true }
  }
  return anteprima(titolo, [...frasiAnteprima(tipo, esito.dati), ...altre])
}

/** Joins the current notes with a line to add at the bottom. */
export function unisciNote(attuali: string | null | undefined, nuove: string | undefined, aggiungi: string | undefined): string | null {
  const base = nuove ?? attuali ?? null
  return aggiungi ? [base, aggiungi].filter(Boolean).join('\n') : base
}
