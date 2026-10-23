import type { SupabaseClient } from '@supabase/supabase-js'

import { RUOLI_MCP, type AppRole, type LivelloPm } from '@/lib/auth/roles'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The roles Claude acts with (the SQL mcp_ruolo()): since 22/10/2026 every
 * role, with an active account (Claude a 360 gradi, phase 1), except the
 * business coach since 1.58.0 (RUOLI_MCP): he sees only the sales recap. What
 * each one reaches is the person's own permissions in the app.
 */
export type RuoloMcp = AppRole

export function isRuoloMcp(valore: unknown): valore is RuoloMcp {
  return typeof valore === 'string' && (RUOLI_MCP as readonly string[]).includes(valore)
}

const LIVELLI: readonly string[] = ['admin', 'manager', 'employee']

export function isLivelloPm(valore: unknown): valore is LivelloPm {
  return typeof valore === 'string' && LIVELLI.includes(valore)
}

/**
 * What a tool works with: the Supabase client that carries the person's own
 * OAuth token (PostgREST runs as that person, RLS decides; never the service
 * role), the role and the project level mcp_chi_sono() answered, the person's
 * id (the token's sub: the projects core writes created_by with it, and "my"
 * tasks and time are filtered by it), and the OAuth session id (only for the
 * in-memory rate limit, hashed, never logged).
 */
export type ContestoMcp = {
  db: SupabaseClient<Database>
  ruolo: RuoloMcp
  livello: LivelloPm
  persona: string
  sessione: string
}
