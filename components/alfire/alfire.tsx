'use client'

import dynamic from 'next/dynamic'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { Fiamma } from '@/components/alfire/fiamma'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { AppRole } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

/** Per-viewer convenience (not data): read answers aloud. */
export const CHIAVE_LEGGI = 'alfire-leggi-risposte'

type ContestoAlfire = {
  apri: () => void
  /** Intent on the flame (mouse, focus, finger): the chat starts downloading. */
  prepara: () => void
}
const Contesto = createContext<ContestoAlfire | null>(null)

export function useAlfire(): ContestoAlfire {
  const c = useContext(Contesto)
  if (!c) throw new Error('useAlfire fuori da AlfireProvider')
  return c
}

/** Open or closed, for the sheet of the skeleton while the chat downloads. */
const ContestoFoglio = createContext<{ aperto: boolean; setAperto: (v: boolean) => void } | null>(null)

// Never imported statically: `ai`, `@ai-sdk/*` and the markdown stay out of the first load.
const PannelloAlfire = dynamic(() => import('@/components/alfire/pannello-alfire'), {
  ssr: false,
  loading: ScheletroAlfire,
})

/**
 * Alfire, the team's AI assistant: one panel for the whole shell, opened from
 * the flame in the header. The chat (pannello-alfire.tsx) arrives when the
 * browser is idle, at the first intent on the flame or at the first tap, and then
 * stays mounted while the app is open: the conversation lives there.
 */
export function AlfireProvider({
  configurata,
  ruolo,
  nome,
  children,
}: {
  configurata: boolean
  ruolo: AppRole
  nome: string
  children: ReactNode
}) {
  const [aperto, setAperto] = useState(false)
  // once true, the chat is mounted for good
  const [voluto, setVoluto] = useState(false)
  const valore = useMemo<ContestoAlfire>(
    () => ({
      apri: () => {
        setVoluto(true)
        setAperto(true)
      },
      prepara: () => setVoluto(true),
    }),
    [],
  )
  const foglio = useMemo(() => ({ aperto, setAperto }), [aperto])

  // the page first, then the chat when the browser has nothing else to do
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setVoluto(true), { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(() => setVoluto(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Contesto.Provider value={valore}>
      {children}
      {voluto ? (
        <ContestoFoglio.Provider value={foglio}>
          <PannelloAlfire aperto={aperto} setAperto={setAperto} configurata={configurata} ruolo={ruolo} nome={nome} />
        </ContestoFoglio.Provider>
      ) : null}
    </Contesto.Provider>
  )
}

/**
 * While the chat downloads: the same sheet, open at the first tap, with the head
 * of the panel and a few lines. The chat takes its place as soon as it is there.
 */
function ScheletroAlfire() {
  const foglio = useContext(ContestoFoglio)
  if (!foglio) return null
  return (
    <Sheet open={foglio.aperto} onOpenChange={foglio.setAperto}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        data-testid="alfire-in-arrivo"
      >
        <div className="flex h-full min-h-0 flex-col" aria-busy="true">
          <SheetHeader className="flex-row items-center gap-3 border-b border-border pr-14">
            <Fiamma className="size-8" accesa />
            <div className="min-w-0 flex-1">
              <SheetTitle>Alfire</SheetTitle>
              <SheetDescription>Arrivo…</SheetDescription>
            </div>
          </SheetHeader>
          <div className="flex-1 space-y-3 px-4 py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-5/6" />
          </div>
          <div className="border-t border-border p-3">
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** The flame button: header on desktop, top bar on mobile. */
export function BottoneAlfire({ conEtichetta = false }: { conEtichetta?: boolean }) {
  const { apri, prepara } = useAlfire()
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={apri}
      // a hand on the way: the chat downloads before the tap
      onPointerEnter={prepara}
      onFocus={prepara}
      onTouchStart={prepara}
      aria-label="Chatta con Alfire"
      className={cn('group h-11 gap-2', conEtichetta ? 'px-3' : 'w-11 px-0')}
      data-testid="apri-alfire"
      data-tour="alfire"
    >
      <Fiamma className="size-6" />
      {conEtichetta ? <span className="text-sm font-medium">Chatta con Alfire</span> : null}
    </Button>
  )
}
