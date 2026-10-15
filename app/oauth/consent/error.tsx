'use client'

import { StatoErrore } from '@/components/stati/stato-errore'

/**
 * Supabase did not answer (network, 5xx): «Riprova» reads the request again.
 * After a first-consent render the card comes back; after an auto-approval the
 * page says the request was already used.
 */
export default function Error({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="flex min-h-dvh justify-center px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md">
        <StatoErrore
          titolo="Non riesco ad aprire il collegamento"
          descrizione="Alpha Management non riesce a leggere la richiesta di Claude adesso. Riprova fra un momento."
          riprova={retry}
        />
      </div>
    </main>
  )
}
