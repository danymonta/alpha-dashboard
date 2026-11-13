import type { ReactNode } from 'react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'

/**
 * The frame of the client's doors (release B1a): the personal link, the registration,
 * /entra. Centred, the logo on its stage, one card; Italian only (lang="it"). No external
 * resource, no query from the browser: these pages live under the Content-Security-Policy
 * with a nonce (lib/auth/proxy-regole.ts).
 */
export function CorniceAccesso({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <main lang="it" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="palco-logo mx-auto w-fit">
          <LogoFuoco dimensione="compatto" decorativo />
        </div>
        <section aria-labelledby="titolo-accesso" className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          <h1 id="titolo-accesso" className="font-heading text-xl font-semibold tracking-tight">
            {titolo}
          </h1>
          {children}
        </section>
      </div>
    </main>
  )
}

/** The neutral line of a door that does not open (expired, revoked, waiting): icon and words. */
export function RigaStato({ icona, children }: { icona: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icona}</span>
      <span>{children}</span>
    </p>
  )
}
