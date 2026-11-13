import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { LogOut, PauseCircle } from 'lucide-react'

import { esciCliente } from '@/app/auth/actions'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { TemaCliente } from '@/components/percorso/tema-cliente'
import { Button } from '@/components/ui/button'
import { requireCliente } from '@/lib/auth/cliente'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'

export const metadata: Metadata = {
  title: T.titolo,
  robots: { index: false, follow: false },
}

/**
 * The client's area (release B1a): no shell, no Alfire, no bell, no timer, no tutorial, no
 * flag; on top the logo, the theme and «Esci». Italian only. requireCliente decides who
 * stays (a person of the team goes to her page, a closed account out); a suspended account
 * is one page only, drawn here.
 */
export default async function LayoutCliente({ children }: { children: ReactNode }) {
  const cliente = await requireCliente()

  return (
    <div lang="it" className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-3">
        <div className="palco-logo palco-logo-piccolo">
          <LogoFuoco dimensione="mini" decorativo />
        </div>
        <div className="flex items-center gap-1">
          <TemaCliente />
          {/* suspended: the card's «Esci» is the one way out, never twice on the screen */}
          {cliente.stato !== 'sospeso' ? (
            <form action={esciCliente}>
              <Button type="submit" variant="ghost" className="h-11 gap-2 text-muted-foreground hover:text-foreground">
                <LogOut className="size-4" aria-hidden="true" />
                {T.esci}
              </Button>
            </form>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12">
        {cliente.stato === 'sospeso' ? (
          <section
            aria-labelledby="titolo-sospeso"
            className="vetro mt-12 space-y-5 rounded-[20px] p-6 text-center sm:p-10"
            data-testid="accesso-sospeso"
          >
            <PauseCircle className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{T.sospesoTitolo}</p>
              <h1 id="titolo-sospeso" className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
                {T.sospeso}
              </h1>
            </div>
            <form action={esciCliente}>
              <Button type="submit" size="lg" className="h-12 min-w-48 gap-2">
                <LogOut className="size-4" aria-hidden="true" />
                {T.esci}
              </Button>
            </form>
          </section>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
