import { Compass } from 'lucide-react'

import { esci } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { ETICHETTA_RUOLO } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'

export default async function NessunaAreaPage() {
  const profilo = await getProfilo()

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Compass className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="font-heading text-xl font-semibold">
            Nessuna area disponibile per il tuo ruolo
          </h1>
          <p className="text-sm text-muted-foreground">
            {/* unreachable today: every role has the Projects area (since 28/09/2026) */}
            {profilo
              ? `Il tuo ruolo è ${ETICHETTA_RUOLO[profilo.ruolo]} e non ha ancora un’area: chiedi all’amministratore.`
              : 'Il tuo ruolo non ha ancora un’area: chiedi all’amministratore.'}
          </p>
        </div>
        <form action={esci}>
          <Button type="submit" variant="outline" className="h-11 w-full">
            Esci
          </Button>
        </form>
      </div>
    </main>
  )
}
