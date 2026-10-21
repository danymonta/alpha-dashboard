/**
 * What a list of contents reads (the table, the calendar, the counts): the
 * properties only, never the four sections, which can hold up to 4 × 30,000
 * characters a row. The detail page reads them.
 */
import type { Database } from '@/lib/supabase/database.types'

export const COLONNE_ELENCO =
  'id, tipo, nome, reel_type, formato, inspiration, stato, post_date, audio, url, view_count, view_count_da_instagram, created_at, updated_at'

type RigaContenuto = Database['public']['Tables']['marketing_contenuti']['Row']

/**
 * One row of a list, as COLONNE_ELENCO reads it. `view_count_da_instagram` (25/10/2026): the View Count is the views of
 * the linked post of Instagram, it updates itself and is read only; absent or false: written by hand.
 */
export type ContenutoElenco = Partial<Pick<RigaContenuto, 'view_count_da_instagram'>> & Pick<
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
