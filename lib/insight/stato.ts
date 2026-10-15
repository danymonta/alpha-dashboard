import { z } from 'zod'

/**
 * The JSON of public.insight_stato() (1.35.0), read by the page (the
 * «Aggiorna dati» line, the setter's meta line, the polling every 15 s while a
 * run is in progress) and by Impostazioni › Instagram e Messenger (the block
 * «Insight ultime 24h»). The function answers the admin and every active
 * setter, with two shapes:
 *
 *   { attivo, ora: 'HH:MM:SS', esecuzione: null | { stato, passo, creata_il,
 *     finita_il, blocchi_fatti, blocchi_totali } }                    every one
 *   + ultimo_tick_il, manuali_oggi, and in esecuzione: giorno, motivo,
 *     errore, avvisi, costo_usd, the token counters, chat_instagram,
 *     chat_messenger, chat_attribuite                                  admin only
 *
 * Never whether ANTHROPIC_API_KEY is set (D23: the page asks
 * insightConfigurato() on the server, for the admin only). The setter's
 * schema strips every admin key it might meet. Both parse tolerantly: the
 * polling never breaks the page on a value it does not know (null).
 */

const testoONull = z.string().nullable().catch(null)
const numeroONull = z.number().finite().nullable().catch(null)

/** SQL `time` ('19:00:00') or 'HH:MM' → 'HH:MM'. */
const oraSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/)
  .transform((v) => v.slice(0, 5))
  .catch('19:00')

const esecuzioneBase = {
  stato: z.enum(['in_coda', 'in_corso', 'pronta', 'fallita']),
  passo: z.enum(['lettura', 'analisi', 'unione']).catch('lettura'),
  /** ISO */
  creata_il: z.string(),
  finita_il: testoONull,
  blocchi_fatti: numeroONull,
  blocchi_totali: numeroONull,
}

const esecuzioneAdmin = {
  ...esecuzioneBase,
  /** 'YYYY-MM-DD' */
  giorno: testoONull,
  motivo: z.enum(['pianificata', 'manuale']).nullable().catch(null),
  /** a fixed Italian sentence (FRASI_INSIGHT), never a model's or an exception's text */
  errore: testoONull,
  avvisi: z.array(z.string()).catch([]),
  /** computed in SQL (insight_costo_usd, D19) */
  costo_usd: numeroONull,
  token_input: numeroONull,
  token_cache_scritti: numeroONull,
  token_cache_letti: numeroONull,
  token_output: numeroONull,
  chat_instagram: numeroONull,
  chat_messenger: numeroONull,
  chat_attribuite: numeroONull,
}

export const statoInsightSchema = z.object({
  attivo: z.boolean().catch(false),
  ora: oraSchema,
  esecuzione: z.object(esecuzioneBase).nullable().catch(null),
})

export const statoInsightAdminSchema = z.object({
  attivo: z.boolean().catch(false),
  ora: oraSchema,
  esecuzione: z.object(esecuzioneAdmin).nullable().catch(null),
  /** ISO: the last tick of pg_cron */
  ultimo_tick_il: testoONull,
  /** manual runs today (Rome): at most 8 */
  manuali_oggi: z.number().int().nonnegative().catch(0),
})

export type StatoInsight = z.output<typeof statoInsightSchema>
export type StatoInsightAdmin = z.output<typeof statoInsightAdminSchema>
export type EsecuzioneInsight = NonNullable<StatoInsight['esecuzione']>
export type EsecuzioneInsightAdmin = NonNullable<StatoInsightAdmin['esecuzione']>

/** The setter's reading of rpc('insight_stato'); null when the answer is not even an object. */
export function leggiStatoInsight(dati: unknown): StatoInsight | null {
  const letto = statoInsightSchema.safeParse(dati)
  return letto.success ? letto.data : null
}

/** The admin's reading of rpc('insight_stato'). */
export function leggiStatoInsightAdmin(dati: unknown): StatoInsightAdmin | null {
  const letto = statoInsightAdminSchema.safeParse(dati)
  return letto.success ? letto.data : null
}

/** A run still queued or working: the page polls and «Aggiorna dati» waits. */
export function esecuzioneInCorso(stato: Pick<StatoInsight, 'esecuzione'> | null): boolean {
  return stato?.esecuzione?.stato === 'in_coda' || stato?.esecuzione?.stato === 'in_corso'
}

/** pg_cron ticks every 5 minutes: silent for this long while the automation is on, it is dead. */
export const MINUTI_PIANIFICATORE_FERMO = 15

/** «Il pianificatore non risponde dalle …» (page) and the warning in the settings, the same rule. */
export function pianificatoreFermo(stato: Pick<StatoInsightAdmin, 'attivo' | 'ultimo_tick_il'> | null, adesso: Date = new Date()): boolean {
  if (!stato?.attivo) return false
  const ultimo = stato.ultimo_tick_il ? Date.parse(stato.ultimo_tick_il) : Number.NaN
  if (!Number.isFinite(ultimo)) return true
  return adesso.getTime() - ultimo > MINUTI_PIANIFICATORE_FERMO * 60_000
}

/**
 * The warning a run adds once when the token cannot read the statistics
 * (D28): the settings show it from the last run's avvisi. The orchestration
 * writes it from here (lib/insight/frasi.ts), never a copy.
 */
export const AVVISO_STATISTICHE =
  'Statistiche dei contenuti non disponibili: aggiungi il permesso instagram_business_manage_insights all’app Meta e incolla di nuovo il token in Impostazioni › Instagram e Messenger.'

export function haAvvisoStatistiche(stato: Pick<StatoInsightAdmin, 'esecuzione'> | null): boolean {
  return stato?.esecuzione?.avvisi.includes(AVVISO_STATISTICHE) ?? false
}
