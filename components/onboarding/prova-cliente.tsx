'use client'

import { FlaskConical, TriangleAlert } from 'lucide-react'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { segnaProva } from '@/app/(app)/onboarding/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Switch } from '@/components/ui/switch'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'

/**
 * «Cliente di prova» (release B1a): a switch in the box «Link». A test link works with the
 * client area closed and its days start now (onboarding_segna_prova). Optimistic: the
 * switch moves at once and goes back with the reason if the database refuses.
 */
export function ProvaCliente({ invitoId, prova }: { invitoId: string; prova: boolean }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua].cliente
  const [mostrato, imposta] = useOptimistic(prova)
  const [errore, setErrore] = useState<string | null>(null)
  const [, avvia] = useTransition()

  function cambia(valore: boolean) {
    setErrore(null)
    avvia(async () => {
      imposta(valore)
      try {
        const esito = await segnaProva({ invito_id: invitoId, prova: valore })
        if (!esito.ok) {
          setErrore(traduciErroreOnboarding(esito.errore, lingua))
          return
        }
        toast.success(valore ? t.provaAttivo : t.provaTolto)
      } catch {
        setErrore(ONBOARDING[lingua].connessione)
      }
    })
  }

  return (
    <div className="space-y-1.5 border-t border-border pt-3" data-testid="cliente-prova">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="size-4 text-muted-foreground" aria-hidden="true" />
          {t.provaTitolo}
        </span>
        <Switch id={id} checked={mostrato} onCheckedChange={(v) => cambia(v === true)} aria-describedby={`${id}-aiuto`} />
      </label>
      <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
        {t.provaAiuto}
      </p>
      {errore ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
    </div>
  )
}
