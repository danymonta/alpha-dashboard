'use client'

import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useLingua } from '@/components/i18n/lingua-provider'
import { useAnnuncia } from '@/components/insight/annunci'
import { Button } from '@/components/ui/button'
import { copiaNegliAppunti } from '@/lib/appunti'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { cn } from '@/lib/utils'

type Esito = 'riposo' | 'copiato' | 'errore'

/**
 * «Copia» and «Copia chat», as the artifact: the button says «Copiato» (or
 * «Copia non riuscita») for 1.5 seconds; the page's live region says it too.
 * No toast: a recap has a hundred messages to copy in an evening. The
 * accessible name starts with the visible word (WCAG 2.5.3) and names the
 * lead: «Copia il messaggio suggerito per @user», «Copia chat con @user».
 * The clipboard is written straight from the click (lib/appunti.ts).
 */
export function BottoneCopia({
  testo,
  etichetta,
  nome,
  className,
}: {
  testo: string
  /** the visible word at rest: «Copia» or «Copia chat» */
  etichetta?: string
  /** the accessible name at rest, starting with `etichetta` */
  nome: string
  className?: string
}) {
  const [esito, setEsito] = useState<Esito>('riposo')
  const bottone = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const annuncia = useAnnuncia()
  const COPIA = INSIGHT_RECAP[useLingua()].copia

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function copia() {
    // no await before this call: iOS keeps the gesture only in the click itself
    const promessa = copiaNegliAppunti(testo, bottone.current)
    void promessa.then((ok) => {
      setEsito(ok ? 'copiato' : 'errore')
      annuncia(ok ? COPIA.annuncioCopiato : COPIA.annuncioNonRiuscita)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setEsito('riposo'), 1500)
    })
  }

  const parola = esito === 'copiato' ? COPIA.copiato : esito === 'errore' ? COPIA.nonRiuscita : (etichetta ?? COPIA.copia)
  // the name follows the visible word, the rest of it stays (what, whose): «Copiato: chat con @user»
  const nomeAccessibile = esito === 'riposo' ? nome : `${parola}: ${nome.replace(/^(?:Copia|Copy)\s+/, '')}`

  return (
    <Button
      ref={bottone}
      type="button"
      variant="outline"
      onClick={copia}
      aria-label={nomeAccessibile}
      data-esito={esito}
      className={cn('h-11 min-w-11 shrink-0 gap-1.5 px-3', className)}
    >
      {esito === 'copiato' ? (
        <Check className="size-4 text-status-ok" aria-hidden="true" />
      ) : esito === 'errore' ? (
        <TriangleAlert className="size-4 text-rosso-testo" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {parola}
    </Button>
  )
}
