import { CollegaClaude, type ClientClaude } from '@/components/account/collega-claude'
import { ErroreSezioneAccount } from '@/components/account/elenco-app-collegate'
import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { ACCOUNT } from '@/lib/i18n/testi/account'
import { indirizziMcp } from '@/lib/mcp/indirizzi'
import { createClient } from '@/lib/supabase/server'

/*
 * «Collega Claude» (admin, video editor, marketing; 09/10/2026). The client ids
 * come from public.mcp_client(): the public OAuth clients registered by hand in
 * Supabase, found by their redirect URI (claude.ai, or Claude Code's loopback
 * port), never by name. The function answers only who may connect Claude.
 */
export async function SezioneCollegaClaude({ admin }: { admin: boolean }) {
  const supabase = await createClient()
  const t = ACCOUNT[await getLingua()].claude
  const { data, error } = await supabase.rpc('mcp_client')
  if (error) return <ErroreSezioneAccount titolo={t.errore} />

  // more than one per kind (a client registered twice): the oldest, as the function orders them
  const primo = (tipo: string): ClientClaude | null => {
    const riga = (data ?? []).find((r) => r.tipo === tipo)
    return riga ? { clientId: riga.client_id, nome: riga.nome } : null
  }

  return (
    <CollegaClaude
      urlMcp={indirizziMcp().risorsa}
      claude={primo('claude')}
      claudeCode={primo('claude_code')}
      admin={admin}
    />
  )
}

export async function ScheletroCollegaClaude() {
  const t = ACCOUNT[await getLingua()].claude
  return (
    <div className="space-y-4 rounded-xl bg-card p-4 sm:p-5" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
      <span className="sr-only">{t.caricamento}</span>
    </div>
  )
}
