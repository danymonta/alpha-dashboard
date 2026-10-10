import type { SupabaseClient } from '@supabase/supabase-js'

import { RUOLI_MCP } from '@/lib/auth/roles'
import type { Database } from '@/lib/supabase/database.types'

/** The roles Claude acts with (the SQL mcp_ruolo()): the active admin, video editor and marketing. */
export type RuoloMcp = 'admin' | 'editor' | 'marketing'

export function isRuoloMcp(valore: unknown): valore is RuoloMcp {
  return typeof valore === 'string' && (RUOLI_MCP as readonly string[]).includes(valore)
}

/**
 * What a tool works with: the Supabase client that carries the person's own
 * OAuth token (PostgREST runs as that person, RLS decides; never the service
 * role), the role mcp_chi_sono() answered, and the OAuth session id (only for
 * the in-memory rate limit, hashed, never logged).
 */
export type ContestoMcp = {
  db: SupabaseClient<Database>
  ruolo: RuoloMcp
  sessione: string
}
