'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'

import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { CONTATTI } from '@/lib/i18n/testi/contatti'

/** «Copia il riepilogo» (1.76.0): the numbers of the period as plain text, to send to whoever needs them. */
export function CopiaRiepilogo({ testo }: { testo: string }) {
  const t = CONTATTI[useLingua()]
  async function copia() {
    try {
      await navigator.clipboard.writeText(testo)
      toast.success(t.copiato)
    } catch {
      toast.error(t.nonCopiato)
    }
  }
  return (
    <Button type="button" variant="ghost" className="h-11" onClick={copia}>
      <Copy className="size-4" aria-hidden="true" />
      {t.copia}
    </Button>
  )
}
