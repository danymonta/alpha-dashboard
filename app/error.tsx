'use client'

import { StatoErrore } from '@/components/stati/stato-errore'

/**
 * The error of the layouts under the root (release B1a): requireProfilo in (app)/layout and
 * requireCliente in (cliente)/layout throw when the database does not answer, and the
 * error.tsx of those segments sits under their layout, so it never sees it. Here the person
 * reads the same human words with «Riprova» (retry re-fetches the layout), never Next's page.
 */
export default function Error({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
      <div className="w-full">
        <StatoErrore riprova={retry} />
      </div>
    </main>
  )
}
