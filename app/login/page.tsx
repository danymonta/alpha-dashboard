import { TriangleAlert } from 'lucide-react'

import { accediConGoogle } from '@/app/login/actions'
import { DevLoginForm } from '@/app/login/dev-login-form'
import { GoogleButton } from '@/app/login/google-button'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { isDevLoginEnabled } from '@/lib/auth/dev-login'

const MESSAGGI: Record<string, string> = {
  'accesso-negato':
    'Questo indirizzo non è stato invitato. Chiedi a Dany di aggiungerti al team.',
  google: 'Non è stato possibile aprire l’accesso con Google. Riprova.',
  callback: 'Accesso non riuscito. Riprova.',
  disattivato: 'Account disattivato. Contatta l’amministratore.',
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
          <h1 className="mt-8 font-heading text-2xl font-semibold tracking-tight">
            Alpha Economics
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Accesso riservato al team, solo su invito.
          </p>
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

          {devLogin ? (
            <section className="space-y-4 rounded-xl border border-dashed border-border bg-card/60 p-4">
              <p className="text-xs text-muted-foreground">
                Ambiente locale: accesso rapido con gli utenti di prova.
              </p>
              <DevLoginForm />
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
