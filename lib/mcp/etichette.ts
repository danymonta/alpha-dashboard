import { createHash } from 'node:crypto'

import type { ContenutoElenco } from '@/lib/marketing/elenco'
import {
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_FORMAT,
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
} from '@/lib/marketing/etichette'

import { indirizziMcp } from './indirizzi'

/**
 * Claude speaks Notion (Dany, 09/10/2026: «gli dico come riempire tutta la
 * parte di content»): the tools take and return the exact labels of
 * "📸 Instagram Posts DANYMONTA" («To be edited», «Reel Topic», «Show&Tell»).
 * The labels live in lib/marketing/etichette.ts only; this module maps them to
 * the database values and back, so renaming a label renames it here too.
 */

/** The labels of a map, in its order, as the non-empty tuple z.enum wants. */
export function etichetteDi<T extends string>(mappa: Record<T, string>): [string, ...string[]] {
  return Object.values<string>(mappa) as [string, ...string[]]
}

export const ETICHETTE = {
  modello: etichetteDi(ETICHETTA_MODELLO),
  reel_type: etichetteDi(ETICHETTA_REEL_TYPE),
  format: etichetteDi(ETICHETTA_FORMAT),
  status: etichetteDi(ETICHETTA_STATUS),
  gruppo: ORDINE_GRUPPI.map((g) => ETICHETTA_GRUPPO[g]) as [string, ...string[]],
} as const

/**
 * The value of an exact label. The input schemas only let exact labels in, so
 * an unknown one is a bug of this server, never Claude's guess to accept.
 */
export function valoreDa<T extends string>(mappa: Record<T, string>, etichetta: string): T {
  const voce = (Object.entries(mappa) as [T, string][]).find(([, e]) => e === etichetta)
  if (!voce) throw new Error('etichetta sconosciuta')
  return voce[0]
}

export function etichettaDi<T extends string>(mappa: Record<T, string>, valore: T | null): string | null {
  return valore === null ? null : mappa[valore]
}

/** «Attraction, Education, Converting, RADIO, Workshop»: a label list for the descriptions. */
export function elencoEtichette(etichette: readonly string[]): string {
  return etichette.join(', ')
}

/** «To-do (Canceled, Not started), In progress (…), Complete (Posted)», Notion's groups in order. */
export const TESTO_GRUPPI = ORDINE_GRUPPI.map(
  (g) => `${ETICHETTA_GRUPPO[g]} (${GRUPPI_STATUS[g].map((s) => ETICHETTA_STATUS[s]).join(', ')})`,
).join(', ')

/**
 * The version Claude copies back to modifica_contenuto: the first 16 hex of
 * sha256 of updated_at exactly as PostgREST returned it. Opaque on purpose: a
 * model copies an opaque code as it is, while it might "tidy" a timestamp
 * (drop the microseconds, change the offset) and then loop on «cambiato». The
 * real updated_at never leaves the server: the tools read the row again and
 * compare.
 */
export function versioneOpaca(updatedAt: string): string {
  return createHash('sha256').update(updatedAt, 'utf8').digest('hex').slice(0, 16)
}

/** The link to the content in the app. */
export function linkContenuto(id: string): string {
  return `${indirizziMcp().origineApp}/marketing/contenuti/${id}`
}

/** The Notion page a content was imported from (its id without dashes, as Notion writes it). */
export function linkNotion(notionPageId: string): string {
  return `https://www.notion.so/${notionPageId.replaceAll('-', '')}`
}

export type RigaPerClaude = ReturnType<typeof rigaPerClaude>

/**
 * A content as every tool returns it: the Notion properties under their Notion
 * names, the model of the page, the opaque version and the link to the app.
 * Never who created or changed it, never when (CLAUDE.md section 17).
 */
export function rigaPerClaude(riga: Omit<ContenutoElenco, 'created_at'>) {
  return {
    id: riga.id,
    [CAMPI.nome]: riga.nome,
    [CAMPO_MODELLO]: ETICHETTA_MODELLO[riga.tipo],
    [CAMPI.reel_type]: etichettaDi(ETICHETTA_REEL_TYPE, riga.reel_type),
    [CAMPI.formato]: etichettaDi(ETICHETTA_FORMAT, riga.formato),
    [CAMPI.stato]: ETICHETTA_STATUS[riga.stato],
    [CAMPI.post_date]: riga.post_date,
    [CAMPI.inspiration]: riga.inspiration,
    [CAMPI.audio]: riga.audio,
    [CAMPI.url]: riga.url,
    [CAMPI.view_count]: riga.view_count,
    versione: versioneOpaca(riga.updated_at),
    link: linkContenuto(riga.id),
  }
}
