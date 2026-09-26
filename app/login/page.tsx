import { TriangleAlert } from 'lucide-react'

import { accediConGoogle } from '@/app/login/actions'
import { DevLoginForm } from '@/app/login/dev-login-form'
import { GoogleButton } from '@/app/login/google-button'
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
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Percorso Alpha
          </p>
          <h1 className="font-heading text-2xl font-semibold">Alpha Economics</h1>
          <p className="text-sm text-muted-foreground">
            Accesso riservato al team, solo su invito.
          </p>
        </header>

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
          <section className="space-y-4 border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              Ambiente locale: accesso rapido con gli utenti di prova.
            </p>
            <DevLoginForm />
          </section>
        ) : null}
      </div>
    </main>
  )
}
