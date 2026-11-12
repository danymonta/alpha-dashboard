import { TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { accediConGoogle } from '@/app/login/actions'
import { AccessoCodice } from '@/app/login/accesso-codice'
import { DevLoginForm } from '@/app/login/dev-login-form'
import { GoogleButton } from '@/app/login/google-button'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { SfondoBraci } from '@/components/brand/sfondo-braci'
import { BottoneLingua } from '@/components/i18n/bottone-lingua'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import { isDevLoginEnabled } from '@/lib/auth/dev-login'
import { NOME_APP } from '@/lib/brand/nome'
import { getLingua } from '@/lib/i18n/server'
import { ACCESSO } from '@/lib/i18n/testi/accesso'


export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string; errore?: string }>
}) {
  const { da = '/', errore } = await searchParams
  const t = ACCESSO[await getLingua()]
  const MESSAGGI: Record<string, string> = {
    'accesso-negato': t.accessoNegato,
    google: t.google,
    callback: t.callback,
    disattivato: t.parole.disattivato,
    // the link in the sign-in email, used or expired
    'link-scaduto': t.parole.linkScaduto,
  }
  const messaggio = errore ? (MESSAGGI[errore] ?? MESSAGGI.callback) : null
  const devLogin = isDevLoginEnabled()

  return (
    // overflow-x-clip: the fire and the embers spill past the logo box on
    // purpose, never past the viewport (no horizontal scroll at 390px).
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-clip px-4 py-10 md:py-14">
      {/* three.js embers (1.72.0): loaded after the first paint, never with «Riduci movimento» */}
      <SfondoBraci />
      {/* the language before signing in (1.53.0): the same flag as the top bar */}
      <div className="absolute top-2 right-2">
        <BottoneLingua />
      </div>
      <div className="w-full max-w-sm">
        <header className="flex flex-col items-center text-center">
          <p className="sr-only">Percorso Alpha</p>
          {/* on the light theme the logo stands on its dark stage (globals.css, .palco-logo) */}
          <div className="palco-logo palco-logo-ampio">
            <LogoFuoco dimensione="hero" decorativo preload />
          </div>
          <h1 className="mt-8 font-heading text-2xl font-semibold tracking-tight">{NOME_APP}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.descrizione}</p>
          <p className="mt-3 text-xs text-muted-foreground">{t.riservato}</p>
        </header>

        {/* the sign-in on liquid glass over the embers (frosted glass outside Chromium) */}
        <VetroLiquido as="div" raggio={22} sfocatura={4} piega={0.6} className="mt-8 space-y-6 rounded-[22px] p-5 sm:p-6">
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
              <h2 className="text-center text-xs font-medium text-muted-foreground">{t.parole.titolo}</h2>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <AccessoCodice da={da} />
          </section>

          {devLogin ? (
            <section className="space-y-4 rounded-xl border border-dashed border-border bg-card/60 p-4">
              <p className="text-xs text-muted-foreground">{t.ambienteLocale}</p>
              <DevLoginForm da={da} />
            </section>
          ) : null}
        </VetroLiquido>

        {/* the clients of the path (1.78.0) have their own door, with a code and no Google */}
        <p className="mt-6 text-center text-sm">
          <Link href="/entra" className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground">
            {t.cliente}
          </Link>
        </p>
      </div>
    </main>
  )
}
