'use client'

import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

type EsitoAzione = { ok: true } | { ok: false; errore: string }

/**
 * Save through a server action from an edit sheet: readable error in place,
 * short toast on success. Returns whether it worked, so the sheet can close.
 */
export function useSalvataggio() {
  const [errore, setErrore] = useState<string | null>(null)

  async function salva(azione: () => Promise<EsitoAzione>, successo: string): Promise<boolean> {
    setErrore(null)
    let esito: EsitoAzione
    try {
      esito = await azione()
    } catch {
      setErrore('Connessione assente. Riprova.')
      return false
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return false
    }
    toast.success(successo)
    return true
  }

  return { errore, setErrore, salva }
}

/** The shell every "Modifica" uses: a side sheet with a title and a short description. */
export function FoglioModifica({
  aperto,
  onApertoChange,
  trigger,
  contenutoTrigger,
  titolo,
  descrizione,
  children,
}: {
  aperto: boolean
  onApertoChange: (aperto: boolean) => void
  /** The element that opens the sheet (rendered by the Base UI trigger). */
  trigger: ReactElement
  contenutoTrigger: ReactNode
  titolo: string
  descrizione?: string
  children: ReactNode
}) {
  return (
    <Sheet open={aperto} onOpenChange={onApertoChange}>
      <SheetTrigger render={trigger}>{contenutoTrigger}</SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{titolo}</SheetTitle>
          {descrizione ? <SheetDescription>{descrizione}</SheetDescription> : null}
        </SheetHeader>
        <div className="px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function ErroreModulo({ testo }: { testo: string | null }) {
  if (!testo) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

export function BottoneSalva({ inCorso, children = 'Salva' }: { inCorso: boolean; children?: ReactNode }) {
  return (
    <Button type="submit" className="h-11 w-full" disabled={inCorso}>
      {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </Button>
  )
}

/** Native select styled like the inputs: one tap on a phone, the OS picker does the rest. */
export const CLASSE_SELECT =
  'h-11 w-full rounded-lg border border-input bg-input/30 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'
