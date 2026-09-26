'use client'

import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'

import { aggiornaStatoLead } from '@/app/(app)/leads/actions'
import { cn } from '@/lib/utils'
import {
  ETICHETTA_BREVE_STATO_LEAD,
  ETICHETTA_STATO_LEAD,
  STATI_LEAD,
  type StatoLead,
} from '@/lib/validation/lead'

/**
 * One tap moves the lead along the pipeline. The new state shows at once
 * (optimistic) and rolls back with a message if the server says no.
 */
export function StatoLeadControllo({
  leadId,
  nome,
  stato,
}: {
  leadId: string
  nome: string
  stato: StatoLead
}) {
  const [inCorso, avvia] = useTransition()
  const [mostrato, impostaMostrato] = useOptimistic(stato)

  function scegli(nuovo: StatoLead) {
    if (nuovo === mostrato) return
    avvia(async () => {
      impostaMostrato(nuovo)
      let esito
      try {
        esito = await aggiornaStatoLead({ lead_id: leadId, stato: nuovo })
      } catch {
        toast.error('Connessione assente. Riprova.')
        return
      }
      if (esito.ok) toast.success(`${nome}: ${ETICHETTA_STATO_LEAD[nuovo].toLowerCase()}`)
      else toast.error(esito.errore)
    })
  }

  return (
    <div
      role="radiogroup"
      aria-label={`Stato di ${nome}`}
      aria-busy={inCorso}
      className="grid grid-cols-4 gap-1 rounded-lg bg-input/30 p-1"
    >
      {STATI_LEAD.map((s) => {
        const attivo = s === mostrato
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={attivo}
            aria-label={ETICHETTA_STATO_LEAD[s]}
            onClick={() => scegli(s)}
            className={cn(
              'min-h-11 rounded-md px-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              attivo
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {ETICHETTA_BREVE_STATO_LEAD[s]}
          </button>
        )
      })}
    </div>
  )
}
