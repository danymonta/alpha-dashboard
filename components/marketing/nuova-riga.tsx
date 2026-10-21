'use client'

import { Plus } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { creaContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { Button } from '@/components/ui/button'
import { PARAMETRO_CONTENUTO } from '@/lib/marketing/pannello'

/** The Name a new row is born with: the database wants one, the person replaces it at once. */
export const NOME_NUOVA_RIGA = 'Senza titolo'

/** The address parameter that pins the row just created at the top of the table. */
export const PARAMETRO_NUOVA = 'nuovo'

/**
 * The row just created, whose Name editor opens by itself (once, in the copy
 * on screen): a module variable, not state, because the table and the cards
 * are both in the page and the one that is hidden must not take it.
 */
let daAprire: string | null = null

export function segnaDaAprire(id: string) {
  daAprire = id
}

/** True once for the row «Nuovo» just created. */
export function consumaDaAprire(id: string): boolean {
  if (daAprire !== id) return false
  daAprire = null
  return true
}

/**
 * «Nuovo» (Dany, 21/10/2026, like Notion's): an empty row, at once, with the
 * cursor in its Name. The content is born as a Reel Topic, Not started, with
 * the placeholder Name; the page pins it at the top (?nuovo=<id>) because a
 * row without a Post Date would sit at the bottom of the table, and its Name
 * editor opens. The rest of the row is edited in its cells.
 */
export function NuovaRiga({ variante = 'primario' }: { variante?: 'primario' | 'outline' }) {
  const router = useRouter()
  const parametri = useSearchParams()
  const [inCorso, setInCorso] = useState(false)

  async function crea() {
    if (inCorso) return
    setInCorso(true)
    try {
      const esito = await creaContenuto({ tipo: 'reel', nome: NOME_NUOVA_RIGA, stato: 'not_started' })
      if (!esito.ok) {
        toast.error(esito.errore)
        return
      }
      segnaDaAprire(esito.id)
      // the filters stay; the panel, if open, closes (the new row is the one to write)
      const cerca = new URLSearchParams(parametri.toString())
      cerca.delete(PARAMETRO_CONTENUTO)
      cerca.set(PARAMETRO_NUOVA, esito.id)
      router.replace(`/marketing/contenuti?${cerca.toString()}`, { scroll: false })
      toast.success('Riga creata: scrivi il nome')
    } catch {
      toast.error('Connessione assente. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variante === 'outline' ? 'outline' : 'default'}
      className="h-11"
      aria-busy={inCorso || undefined}
      disabled={inCorso}
      onClick={() => void crea()}
    >
      <Plus className="size-4" aria-hidden="true" />
      Nuovo
    </Button>
  )
}
