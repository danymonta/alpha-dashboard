import type { Metadata } from 'next'
import Link from 'next/link'

import { AccessoCliente } from '@/components/percorso/accesso-cliente'
import { CorniceAccesso } from '@/components/percorso/cornice-accesso'
import { TESTI_ENTRA as T } from '@/lib/percorso/testi'

export const metadata: Metadata = {
  title: T.titolo,
  robots: { index: false, follow: false },
}

/**
 * The return of a client already registered (release B1a): the email, then an 8 digit
 * code, as the team's AccessoCodice but with no link in the email. The proxy sends who is
 * already in to /percorso. Italian only.
 */
export default function EntraPage() {
  return (
    <CorniceAccesso titolo={T.titolo}>
      <p className="text-sm text-muted-foreground">{T.sotto}</p>
      <AccessoCliente modo="entra" />
      <p className="text-center text-sm">
        <Link href="/login" className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {T.team}
        </Link>
      </p>
    </CorniceAccesso>
  )
}
