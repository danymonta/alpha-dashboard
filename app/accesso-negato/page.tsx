import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { buttonVariants } from '@/components/ui/button'
import { TESTI_ACCESSO_NEGATO } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Accesso',
  robots: { index: false, follow: false },
}

/**
 * Where a session without a way in lands, after /auth/uscita has signed it out (release
 * B1a): a user of no kind, or a client whose path ended. Public, no query, Italian (the
 * people who land here are clients, or someone who opened the wrong door).
 */
export default async function AccessoNegatoPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams
  const concluso = motivo === 'percorso-concluso'

  return (
    <main lang="it" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="palco-logo mx-auto w-fit">
          <LogoFuoco dimensione="compatto" decorativo />
        </div>
        <div className="space-y-3">
          <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            {concluso ? TESTI_ACCESSO_NEGATO.concluso : TESTI_ACCESSO_NEGATO.titolo}
          </h1>
        </div>
        {concluso ? null : (
          <div className="flex flex-col gap-3">
            <Link href="/entra" className={cn(buttonVariants(), 'h-11 w-full')}>
              {TESTI_ACCESSO_NEGATO.cliente}
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')}>
              {TESTI_ACCESSO_NEGATO.team}
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
