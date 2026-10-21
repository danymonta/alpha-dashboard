'use client'

import { Circle, CircleCheck } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { cn } from '@/lib/utils'

type Parametri = Record<string, string | undefined>

/** Same page, one search parameter changed; the default value leaves the URL. */
function conParametro(percorso: string, parametri: Parametri, nome: string, valore: string | null) {
  const cerca = new URLSearchParams()
  for (const [chiave, v] of Object.entries(parametri)) {
    if (v !== undefined && chiave !== nome) cerca.set(chiave, v)
  }
  if (valore !== null) cerca.set(nome, valore)
  const testo = cerca.toString()
  return testo ? `${percorso}?${testo}` : percorso
}

/**
 * Filter kept in the URL, so a filtered view can be shared and survives a
 * reload. Native select: one tap on a phone.
 */
export function FiltroSelect({
  id,
  etichetta,
  nome,
  valore,
  predefinito,
  opzioni,
  parametri,
}: {
  id: string
  etichetta: string
  nome: string
  valore: string
  predefinito: string
  opzioni: readonly { valore: string; etichetta: string }[]
  parametri: Parametri
}) {
  const router = useRouter()
  const percorso = usePathname()
  const [inCorso, avvia] = useTransition()

  return (
    <div className="min-w-0 flex-1 space-y-1 sm:flex-none">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {etichetta}
      </label>
      <select
        id={id}
        value={valore}
        aria-busy={inCorso}
        className={cn(CLASSE_SELECT, 'sm:w-48', inCorso && 'opacity-60')}
        onChange={(e) => {
          const nuovo = e.currentTarget.value
          avvia(() => router.push(conParametro(percorso, parametri, nome, nuovo === predefinito ? null : nuovo)))
        }}
      >
        {opzioni.map((o) => (
          <option key={o.valore} value={o.valore}>
            {o.etichetta}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * On/off filter as a 44px toggle button ("Solo i miei", "I miei task"). Off it
 * still reads as a control: full-contrast text and an empty circle; on, the
 * circle is checked and the button filled.
 */
export function FiltroInterruttore({
  nome,
  attivo,
  etichetta,
  parametri,
  className,
}: {
  nome: string
  attivo: boolean
  etichetta: string
  parametri: Parametri
  className?: string
}) {
  const router = useRouter()
  const percorso = usePathname()
  const [inCorso, avvia] = useTransition()

  return (
    <button
      type="button"
      aria-pressed={attivo}
      disabled={inCorso}
      onClick={() => avvia(() => router.push(conParametro(percorso, parametri, nome, attivo ? null : '1')))}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 self-end rounded-pillola border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
        attivo
          ? 'border-selezione bg-selezione text-selezione-foreground'
          : 'border-input bg-input/30 text-foreground hover:bg-accent',
        className,
      )}
    >
      {attivo ? (
        <CircleCheck className="size-4" aria-hidden="true" />
      ) : (
        <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
      )}
      {etichetta}
    </button>
  )
}
