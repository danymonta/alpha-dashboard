import { createHash } from 'node:crypto'

import type { ContenutoElenco } from '@/lib/marketing/elenco'
import {
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
} from '@/lib/marketing/etichette'
import { opzioneDaNomeOValore, type CampoOpzione, type NomiOpzioni, type Opzione, type Opzioni } from '@/lib/marketing/opzioni'

import { indirizziMcp } from './indirizzi'

/**
 * Claude speaks Notion (Dany, 09/10/2026: «gli dico come riempire tutta la
 * parte di content»): the tools take and return the exact labels of
 * "📸 Instagram Posts DANYMONTA" («To be edited», «Reel Topic», «Show&Tell»).
 * The labels live in lib/marketing/etichette.ts only; this module maps them to
 * the database values and back, so renaming a label renames it here too.
 *
 * Reel Type and Format are the exception (21/10/2026): they are the labels
 * people create and colour in the app (marketing_opzioni), so they are read
 * from the database for every call and Claude names one that exists, by name
 * or code; a name that is not there is an error that lists the valid ones,
 * and Claude never creates a label.
 */

/** The labels of a map, in its order, as the non-empty tuple z.enum wants. */
export function etichetteDi<T extends string>(mappa: Record<T, string>): [string, ...string[]] {
  return Object.values<string>(mappa) as [string, ...string[]]
}

export const ETICHETTE = {
  modello: etichetteDi(ETICHETTA_MODELLO),
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

/** A Reel Type or Format that is not one of the labels of the app: the message says which ones are. */
export class EtichettaSconosciuta extends Error {
  constructor(messaggio: string) {
    super(messaggio)
    this.name = 'EtichettaSconosciuta'
  }
}

const NOME_CAMPO: Record<CampoOpzione, string> = { reel_type: CAMPI.reel_type, formato: CAMPI.formato }

/**
 * The slug of the label Claude named (its name as the app shows it, without
 * case, or its code), or an EtichettaSconosciuta that lists the valid ones.
 * Never creates one: new labels are made by a person in the Piano editoriale.
 */
export function risolviEtichetta(campo: CampoOpzione, testo: string, opzioni: Opzioni): string {
  const trovata: Opzione | null = opzioneDaNomeOValore(opzioni[campo], testo)
  if (trovata) return trovata.valore
  const valide = opzioni[campo].map((o) => o.nome)
  throw new EtichettaSconosciuta(
    `${NOME_CAMPO[campo]} «${testo}» non esiste. ${
      valide.length > 0 ? `Etichette valide: ${elencoEtichette(valide)}.` : 'Non ci sono etichette.'
    } Le etichette nuove le crea la persona nell’app, nel Piano editoriale: da qui non se ne creano.`,
  )
}

/** The name of a label by slug as Claude reads it (the slug itself if the label is gone). */
export function nomeEtichetta(nomi: NomiOpzioni, campo: CampoOpzione, valore: string | null): string | null {
  return valore === null ? null : (nomi[campo][valore] ?? valore)
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
export function rigaPerClaude(riga: Omit<ContenutoElenco, 'created_at'>, nomi: NomiOpzioni) {
  return {
    id: riga.id,
    [CAMPI.nome]: riga.nome,
    [CAMPO_MODELLO]: ETICHETTA_MODELLO[riga.tipo],
    [CAMPI.reel_type]: nomeEtichetta(nomi, 'reel_type', riga.reel_type),
    [CAMPI.formato]: nomeEtichetta(nomi, 'formato', riga.formato),
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
