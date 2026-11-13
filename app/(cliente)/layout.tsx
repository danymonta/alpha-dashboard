import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { esciCliente } from '@/app/auth/actions'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { Button } from '@/components/ui/button'
import { requireCliente } from '@/lib/auth/cliente'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'

export const metadata: Metadata = {
  title: T.titolo,
  robots: { index: false, follow: false },
}

/**
 * The client's area (release B1a): no shell, no Alfire, no bell, no timer, no tutorial; the
 * logo and «Esci». Italian only. requireCliente decides who stays (a person of the team goes
 * to her page, a closed account out); a suspended account is one page only.
 * The timeline and the panel of the steps are drawn by the pages (the interface of B1a).
 */
export default async function LayoutCliente({ children }: { children: ReactNode }) {
  const cliente = await requireCliente()

  return (
    <div lang="it" className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="palco-logo">
          <LogoFuoco dimensione="mini" decorativo />
        </div>
        <form action={esciCliente}>
          <Button type="submit" variant="ghost" className="h-11">
            {T.esci}
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10">
        {cliente.stato === 'sospeso' ? (
          <section aria-labelledby="titolo-sospeso" className="mt-10 rounded-xl border border-border bg-card p-6 text-center">
            <h1 id="titolo-sospeso" className="font-heading text-lg font-semibold">
              {T.sospeso}
            </h1>
          </section>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
