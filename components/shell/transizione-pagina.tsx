import { ViewTransition, type ReactNode } from 'react'

/**
 * The fade between pages (1.33.0, Dany: "il quanto più smooth possibile in
 * qualsiasi click e transizione"). One switch: false and nothing animates.
 */
export const TRANSIZIONE_PAGINE = true

/**
 * Around the content of the shell only (sidebar, bars and Alfire stay still).
 * Opacity only, 150 ms in all (app/globals.css, `.pagina`), and only for the
 * navigations of the links that carry the type (LinkNav, LinkRiga:
 * transitionTypes ['nav']): refreshes, saves, the overview's realtime, Suspense
 * reveals and Back carry no type and never animate. A layout never sees enter
 * and exit, only update (node_modules/next/dist/docs/01-app/02-guides/view-transitions.md).
 * "Riduci movimento" turns it off with every other animation.
 */
export function TransizionePagina({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" update={TRANSIZIONE_PAGINE ? { nav: 'pagina', default: 'none' } : 'none'}>
      {children}
    </ViewTransition>
  )
}
