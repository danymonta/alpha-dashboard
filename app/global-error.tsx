'use client'

import './globals.css'

/**
 * The last net (release B1a): an error of the root layout itself. It replaces the whole
 * document, without the providers (theme, language): the global styles of the dark theme
 * (the app's default, no class), plain Italian words and one button.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="it">
      <body className="grid min-h-dvh place-items-center bg-background px-4 text-foreground antialiased">
        <title>Qualcosa non ha funzionato</title>
        <main role="alert" className="max-w-sm space-y-4 text-center">
          <p className="text-sm font-medium">Qualcosa non ha funzionato.</p>
          <p className="text-sm text-muted-foreground">Non riusciamo a caricare la pagina. Riprova tra poco.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="h-11 rounded-md border border-border bg-card px-5 text-sm font-medium hover:bg-muted"
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  )
}
