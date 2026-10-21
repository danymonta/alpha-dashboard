import { TriangleAlert } from 'lucide-react'

import { accediConGoogle } from '@/app/login/actions'
import { AccessoCodice } from '@/app/login/accesso-codice'
import { DevLoginForm } from '@/app/login/dev-login-form'
import { GoogleButton } from '@/app/login/google-button'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { PAROLE_ACCESSO } from '@/lib/auth/accesso'
import { isDevLoginEnabled } from '@/lib/auth/dev-login'
import { NOME_APP } from '@/lib/brand/nome'

const MESSAGGI: Record<string, string> = {
  'accesso-negato':
    'Questo indirizzo non è stato invitato. Chiedi a Dany di aggiungerti al team.',
  google: 'Non è stato possibile aprire l’accesso con Google. Riprova.',
  callback: 'Accesso non riuscito. Riprova.',
  disattivato: PAROLE_ACCESSO.disattivato,
  // the link in the sign-in email, used or expired
  'link-scaduto': PAROLE_ACCESSO.linkScaduto,
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; errore?: string }>
}) {
  const { da = '/', errore } = await searchParams
  const messaggio = errore ? (MESSAGGI[errore] ?? MESSAGGI.callback) : null
  const devLogin = isDevLoginEnabled()

  return (
    // overflow-x-clip: the fire and the embers spill past the logo box on
    // purpose, never past the viewport (no horizontal scroll at 390px).
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-x-clip px-4 py-10 md:py-14">
      <div className="w-full max-w-sm">
        <header className="flex flex-col items-center text-center">
          <p className="sr-only">Percorso Alpha</p>
          <LogoFuoco dimensione="hero" decorativo preload />
          <h1 className="mt-8 font-heading text-2xl font-semibold tracking-tight">{NOME_APP}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Il gestionale di Percorso Alpha: vendite, incassi, setting, provvigioni e progetti del team in un solo
            posto, con Alfire, l’AI sui tuoi numeri.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Accesso riservato al team, solo su invito.</p>
        </header>

        <div className="mt-8 space-y-6">
          {messaggio ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {messaggio}
            </p>
          ) : null}

          <form action={accediConGoogle}>
            <input type="hidden" name="da" value={da} />
            <GoogleButton />
          </form>

          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <h2 className="text-center text-xs font-medium text-muted-foreground">{PAROLE_ACCESSO.titolo}</h2>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <AccessoCodice da={da} />
          </section>

          {devLogin ? (
            <section className="space-y-4 rounded-xl border border-dashed border-border bg-card/60 p-4">
              <p className="text-xs text-muted-foreground">
                Ambiente locale: accesso rapido con gli utenti di prova.
              </p>
              <DevLoginForm da={da} />
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
