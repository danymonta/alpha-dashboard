import { ElencoAppCollegate, ErroreSezioneAccount, type AppCollegata } from '@/components/account/elenco-app-collegate'
import { Skeleton } from '@/components/ui/skeleton'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { ACCOUNT } from '@/lib/i18n/testi/account'
import { createClient } from '@/lib/supabase/server'

/*
 * «App collegate» in Profilo › Account (Claude connected, 09/10/2026): the apps
 * the person has authorised through Supabase Auth's OAuth server, read with the
 * cookie session. Every role: who was demoted after connecting must still be
 * able to revoke. Only the person's own grants: nobody, the admin included, sees
 * who else has connected Claude (CLAUDE.md section 17). It is a GoTrue round
 * trip, so the page streams it behind its own Suspense boundary.
 */

function Intestazione({ id, lingua }: { id: string; lingua: Lingua }) {
  const APP_COLLEGATE = ACCOUNT[lingua].app
  return (
    <div className="space-y-1">
      {/* focusable from code: after «Scollega» the row goes, and the focus lands here, never on <body> */}
      <h2 id={id} tabIndex={-1} className="font-heading text-base font-semibold outline-none">
        {APP_COLLEGATE.titolo}
      </h2>
      <p className="text-sm text-muted-foreground">{APP_COLLEGATE.descrizione}</p>
    </div>
  )
}

export async function AppCollegate() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.oauth.listGrants()
  const lingua = await getLingua()
  // the OAuth server is off: there is nothing to show and nothing to revoke
  if (error?.code === 'feature_disabled') return null
  return <SezioneAppCollegate app={error || !data ? null : perData(data, lingua)} lingua={lingua} />
}

function perData(
  grants: { client: { id: string; name: string }; granted_at: string }[],
  lingua: Lingua,
): AppCollegata[] {
  const { formatData } = formato(lingua)
  return [...grants]
    .sort((a, b) => b.granted_at.localeCompare(a.granted_at))
    .map((g) => ({
      clientId: g.client.id,
      nome: g.client.name || ACCOUNT[lingua].app.senzaNome,
      collegataIl: formatData(oggiRoma(new Date(g.granted_at))),
    }))
}

const ID_TITOLO = 'titolo-app-collegate'

function SezioneAppCollegate({ app, lingua }: { app: AppCollegata[] | null; lingua: Lingua }) {
  const APP_COLLEGATE = ACCOUNT[lingua].app
  return (
    <section aria-labelledby={ID_TITOLO} className="space-y-3">
      <Intestazione id={ID_TITOLO} lingua={lingua} />
      {app ? (
        <ElencoAppCollegate app={app} idTitolo={ID_TITOLO} />
      ) : (
        <ErroreSezioneAccount titolo={APP_COLLEGATE.errore} />
      )}
    </section>
  )
}

export async function ScheletroAppCollegate() {
  const t = ACCOUNT[await getLingua()].app
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <span className="sr-only">{t.caricamento}</span>
    </div>
  )
}
