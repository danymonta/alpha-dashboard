import 'server-only'

import { tool, type Tool } from 'ai'
import { z } from 'zod'

import { anteprimaEliminazione } from '@/app/actions/eliminazione'
import { azioniConsentite, AZIONI } from '@/lib/alfire/permessi'
import type { Anteprima } from '@/lib/alfire/riassunto'
import type { Risolutori, Supabase } from '@/lib/alfire/risolvi'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
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
  return {
    strumento: tool({
      description: d.description,
      inputSchema: d.inputSchema,
      execute: (input: z.infer<S>) => d.execute(input),
    } as never) as Tool,
    schema: d.inputSchema,
    anteprima: d.anteprima as Definizione['anteprima'],
  }
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
