import type { ReactNode } from 'react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { TemaCliente } from '@/components/percorso/tema-cliente'

/**
 * The top of the client's area as the client has it (app/(cliente)/layout.tsx): the logo and the
 * theme. «Esci» is the bar's «Esci dalla prova».
 */
export function CorniceCliente({ children }: { children: ReactNode }) {
  return (
    <div lang="it" className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-3">
        <div className="palco-logo palco-logo-piccolo">
          <LogoFuoco dimensione="mini" decorativo />
        </div>
        <TemaCliente />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12">{children}</main>
    </div>
  )
}
