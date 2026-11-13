import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

import { CorniceAccesso, RigaStato } from '@/components/percorso/cornice-accesso'
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
 * people who land here are clients, or someone who opened the wrong door). The same frame
 * as the client's other doors (/join, /entra): the glass card, the glow, the theme.
 */
export default async function AccessoNegatoPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams
  const concluso = motivo === 'percorso-concluso'

  if (concluso) {
    return (
      <CorniceAccesso titolo={TESTI_ACCESSO_NEGATO.concluso}>
        <RigaStato icona={<ShieldAlert className="size-4" aria-hidden="true" />}>{TESTI_ACCESSO_NEGATO.conclusoSotto}</RigaStato>
      </CorniceAccesso>
    )
  }

  return (
    <CorniceAccesso titolo={TESTI_ACCESSO_NEGATO.titolo}>
      <div className="flex flex-col gap-3">
        <Link href="/entra" data-slot="button" className={cn(buttonVariants(), 'h-11 w-full')}>
          {TESTI_ACCESSO_NEGATO.cliente}
        </Link>
        <Link href="/login" data-slot="button" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')}>
          {TESTI_ACCESSO_NEGATO.team}
        </Link>
      </div>
    </CorniceAccesso>
  )
}
