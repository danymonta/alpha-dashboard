import type { ReactNode } from 'react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { TemaCliente } from '@/components/percorso/tema-cliente'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'

/**
 * The frame of the client's doors (release B1a): the personal link, the registration,
 * /entra. The brand's entrance: the logo on its stage with a still glow behind it, one
 * card of liquid glass (frosted outside Chromium); no animation, no external resource,
 * no query from the browser: these pages live under the Content-Security-Policy with a
 * nonce (lib/auth/proxy-regole.ts). Italian only (lang="it").
 */
export function CorniceAccesso({ titolo, sotto, children }: { titolo?: string; sotto?: string; children: ReactNode }) {
  return (
    <main lang="it" className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-clip px-4 py-10">
      <div className="absolute top-2 right-2">
        <TemaCliente />
      </div>
      <div className="w-full max-w-sm space-y-8">
        <div className="relative flex justify-center">
          {/* the still light behind the logo: the glow tokens, never an animation */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--glow-primario),transparent_68%)]"
          />
          <div className="palco-logo palco-logo-piccolo relative">
            <LogoFuoco dimensione="compatto" decorativo />
          </div>
        </div>
        <VetroLiquido
          as="section"
          raggio={22}
          sfocatura={4}
          piega={0.6}
          aria-labelledby="titolo-accesso"
          className="space-y-5 rounded-[22px] p-5 sm:p-6"
        >
          {/* without a title the children draw the heading (h1#titolo-accesso): the registration, one per step */}
          {titolo ? (
            <div className="space-y-2">
              <h1 id="titolo-accesso" className="font-heading text-2xl font-semibold tracking-tight">
                {titolo}
              </h1>
              {sotto ? <p className="text-sm text-muted-foreground">{sotto}</p> : null}
            </div>
          ) : null}
          {children}
        </VetroLiquido>
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
