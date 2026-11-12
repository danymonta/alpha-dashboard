'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'

/**
 * «Copia link» and «Copia il messaggio»: the text goes to the clipboard on the tap, the
 * button says so for two seconds and a toast confirms. If the browser refuses (no
 * permission, an old WebView) the toast says to copy it by hand: the text is on the page.
 */
export function Copia({
  testo,
  etichetta,
  fatto,
  variante = 'outline',
  testId,
}: {
  testo: string
  etichetta: string
  /** The toast: «Link copiato», «Messaggio copiato». */
  fatto: string
  variante?: 'default' | 'outline'
  testId?: string
}) {
  const t = ONBOARDING[useLingua()].link
  const [copiato, setCopiato] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo)
    } catch {
      toast.error(t.nonCopiato)
      return
    }
    toast.success(fatto)
    setCopiato(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiato(false), 2000)
  }

  return (
    <Button type="button" variant={variante} className="h-11" onClick={copia} data-testid={testId}>
      {copiato ? (
        <Check className="wizard-spunta size-4 text-status-ok" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {etichetta}
    </Button>
  )
}
