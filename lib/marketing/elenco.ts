/**
 * What a list of contents reads (the table, the calendar, the counts): the
 * properties only, never the four sections, which can hold up to 4 × 30,000
 * characters a row. The detail page reads them.
 */
import type { Database } from '@/lib/supabase/database.types'

export const COLONNE_ELENCO =
  'id, tipo, nome, reel_type, formato, inspiration, stato, post_date, audio, url, view_count, created_at, updated_at'

type RigaContenuto = Database['public']['Tables']['marketing_contenuti']['Row']

/** One row of a list, as COLONNE_ELENCO reads it. */
export type ContenutoElenco = Pick<
  RigaContenuto,
  | 'id'
  | 'tipo'
  | 'nome'
  | 'reel_type'
  | 'formato'
  | 'inspiration'
  | 'stato'
  | 'post_date'
  | 'audio'
  | 'url'
  | 'view_count'
  | 'created_at'
  | 'updated_at'
>

/** The table shows the most recent ones by Post Date; over this, the page says so. */
export const LIMITE_TABELLA = 300
