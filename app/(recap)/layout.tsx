import { ArrowLeft, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'

import { esci } from '@/app/auth/actions'
import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { BottoneLingua } from '@/components/i18n/bottone-lingua'
import { LinkBottone } from '@/components/link-bottone'
import { BottoneTema } from '@/components/tema/bottone-tema'
import { Button } from '@/components/ui/button'
import { RUOLI_RECAP } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { RECAP } from '@/lib/i18n/testi/recap'

/**
 * The sales recap's own frame (1.58.0, Dany, 23/10/2026: «una versione per Max dove lui ha
 * semplicemente una pagina»). Outside the app shell: no sidebar, bottom bar, Alfire, bell,
 * timer, tutorial or intro. The top bar keeps the logo, the language flag, the theme and
 * «Esci». The admin opens it too (to see what the business coach sees) and gets the way
 * back to the app; every other role goes to its own landing page.
 */
export default async function RecapLayout({ children }: { children: ReactNode }) {
  const profilo = await requireRuolo(RUOLI_RECAP)
  const t = RECAP[await getLingua()]

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="palco-logo palco-logo-piccolo">
              <LogoFuoco dimensione="mini" />
            </div>
            <p className="truncate font-heading text-sm font-semibold max-[26.9rem]:sr-only">{t.marchio}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {profilo.ruolo === 'admin' ? (
              <LinkBottone href="/" variant="ghost" className="px-2 text-muted-foreground" aria-label={t.tornaAllApp}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span className="max-md:sr-only">{t.tornaAllApp}</span>
              </LinkBottone>
            ) : null}
            <BottoneTema />
            <BottoneLingua />
            <form action={esci}>
              <Button type="submit" variant="ghost" className="h-11 gap-1.5 px-3 text-muted-foreground" data-testid="esci">
                <LogOut className="size-4" aria-hidden="true" />
                {t.esci}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="contenuto" className="mx-auto max-w-6xl px-4 pt-5 pb-10 md:px-6">
        {children}
      </main>
    </div>
  )
}
