import 'server-only'

import { COLONNE_ELENCO, type ContenutoElenco } from '@/lib/marketing/elenco'
import { ORDINE_GRUPPI, type GruppoStatus } from '@/lib/marketing/etichette'
import { filtriDelGruppo, patternRicerca, statiFiltrati, type FiltriContenuti } from '@/lib/marketing/filtri'
import type { Db } from '@/lib/marketing/operazioni'
import { isUuid } from '@/lib/progetti'
import type { Database } from '@/lib/supabase/database.types'

/**
 * How the content calendar is read (MCP release, 09/10/2026): the pages of
 * /marketing/contenuti and Claude's tools read the same way, with the
 * caller's client (cookie session or OAuth token), so RLS decides which
 * contents come back. Lists read the properties only (COLONNE_ELENCO, rows
 * of type ContenutoElenco); a content's page reads its sections too.
 *
 * A read that fails throws LetturaNonRiuscita, with the PostgREST code for
 * the logs and never its message: the pages show their error state, the MCP
 * tools their generic sentence.
 */

/** The filters of the page, plus a range of Post Date (both inclusive) or the contents without one. */
export type FiltriElenco = FiltriContenuti & { da?: string; a?: string; senzaData?: boolean }

/** The table and Claude's list: the latest Post Date first, those without one last. The calendar: day by day. */
export type OrdineElenco = 'recenti' | 'giorni'

/** The counts of the group chips: every content with the filters, and each Status group. */
export type ConteggiPerGruppo = Record<'tutti' | GruppoStatus, number>

type RigaContenuto = Database['public']['Tables']['marketing_contenuti']['Row']

/** A content with its sections, as its page reads it. */
export type RigaCompleta = ContenutoElenco &
  Pick<RigaContenuto, 'messaggio' | 'bozza' | 'commenti' | 'finale' | 'notion_page_id'>

export const COLONNE_CONTENUTO = `${COLONNE_ELENCO}, messaggio, bozza, commenti, finale, notion_page_id` as const

export class LetturaNonRiuscita extends Error {
  constructor(
    messaggio: string,
    /** the PostgREST or SQL code, for the logs (class or code only) */
    readonly codice?: string,
  ) {
    super(messaggio)
    this.name = 'LetturaNonRiuscita'
  }
}

/** The contents with these filters. The same columns for counts and rows. */
export function contenutiFiltrati(db: Db, f: FiltriElenco, { head = false }: { head?: boolean } = {}) {
  let query = db.from('marketing_contenuti').select(COLONNE_ELENCO, { count: 'exact', head })
  const stati = statiFiltrati(f)
  if (stati) query = query.in('stato', stati)
  if (f.reel_type) query = query.eq('reel_type', f.reel_type)
  if (f.formato) query = query.eq('formato', f.formato)
  if (f.tipo) query = query.eq('tipo', f.tipo)
  if (f.q) query = query.regexIMatch('nome', patternRicerca(f.q))
  if (f.senzaData) query = query.is('post_date', null)
  if (f.da) query = query.gte('post_date', f.da)
  if (f.a) query = query.lte('post_date', f.a)
  return query
}

/** At most `limite` contents with these filters, and how many there are in all. */
export async function leggiElenco(
  db: Db,
  f: FiltriElenco,
  limite: number,
  ordine: OrdineElenco = 'recenti',
): Promise<{ righe: ContenutoElenco[]; totale: number }> {
  const base = contenutiFiltrati(db, f)
  const ordinata =
    ordine === 'recenti'
      ? base
          .order('post_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .order('id')
      : base.order('post_date').order('created_at').order('id')
  const { data, count, error } = await ordinata.limit(limite)
  if (error) throw new LetturaNonRiuscita('Impossibile caricare i contenuti', error.code)
  return { righe: data ?? [], totale: count ?? 0 }
}

/**
 * The number on each group chip: the filters its link opens (a Status of
 * another group dropped, filtriDelGruppo), so a tap on a chip opens as many
 * contents as it says. "tutti" is the chip without a group.
 */
export async function contaPerGruppo(db: Db, f: FiltriElenco): Promise<ConteggiPerGruppo> {
  const gruppi = [null, ...ORDINE_GRUPPI] as const
  // filtriDelGruppo leaves out the keys it drops (the group of "tutti", a Status of another group):
  // its result is the whole filter, plus the dates it does not know about
  const date = { da: f.da, a: f.a, senzaData: f.senzaData }
  const letti = await Promise.all(
    gruppi.map((g) => contenutiFiltrati(db, { ...filtriDelGruppo(f, g), ...date }, { head: true })),
  )
  const sbagliato = letti.find((l) => l.error)?.error
  if (sbagliato) throw new LetturaNonRiuscita('Impossibile caricare i contenuti', sbagliato.code)
  const [tutti, to_do, in_progress, complete] = letti.map((l) => l.count ?? 0)
  return { tutti, to_do, in_progress, complete }
}

/** One content with its sections; null for an id that is not one, a deleted content or one RLS hides. */
export async function leggiContenuto(db: Db, id: string): Promise<RigaCompleta | null> {
  if (!isUuid(id)) return null
  const { data, error } = await db.from('marketing_contenuti').select(COLONNE_CONTENUTO).eq('id', id).maybeSingle()
  if (error) throw new LetturaNonRiuscita('Impossibile caricare il contenuto', error.code)
  return data
}

/**
 * One content's properties only, without the sections: what Claude's tools
 * read back after a write, so the version they hand over always comes with the
 * values it covers. Null as leggiContenuto.
 */
export async function leggiProprietaContenuto(db: Db, id: string): Promise<ContenutoElenco | null> {
  if (!isUuid(id)) return null
  const { data, error } = await db.from('marketing_contenuti').select(COLONNE_ELENCO).eq('id', id).maybeSingle()
  if (error) throw new LetturaNonRiuscita('Impossibile caricare il contenuto', error.code)
  return data
}
