'use client'

import { useId } from 'react'

import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Label } from '@/components/ui/label'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import type { PersonaTeam } from '@/lib/onboarding/stati'
import { INCARICHI, type Incarico } from '@/lib/validation/onboarding'

export type ValoriIncarichi = Record<Incarico, string>
export type ErroriIncarichi = Partial<Record<Incarico, string>>

/** The three people as the selects hold them: '' is nobody. */
export function valoriIncarichi(da: { coach: string | null; revisore: string | null; responsabile: string | null }): ValoriIncarichi {
  return { coach: da.coach ?? '', revisore: da.revisore ?? '', responsabile: da.responsabile ?? '' }
}

/**
 * Coach, reviewer and responsible: three native selects (one tap on a phone, the picker
 * of the system) among the active people of the team. Shared by the wizard's screen
 * «Team», by the card of a client in onboarding and by Impostazioni › Onboarding. Whoever
 * uses it owns the values and the errors: an error sits under its own field.
 */
export function CampiIncarichi({
  valori,
  onChange,
  persone,
  io,
  errori = {},
  responsabileObbligatorio = true,
  nonAttivi = [],
  idBase,
}: {
  valori: ValoriIncarichi
  onChange: (incarico: Incarico, valore: string) => void
  persone: readonly PersonaTeam[]
  /** Who is using the page: his name reads «Nome (tu)». */
  io: string
  errori?: ErroriIncarichi
  /** The wizard and the card want a responsible; the settings may leave it empty. */
  responsabileObbligatorio?: boolean
  /** People still in charge who are no longer active: shown, so the select says who is there now. */
  nonAttivi?: readonly PersonaTeam[]
  /** A predictable base for the ids of the selects (`${idBase}-coach`…), to bring the focus to one. */
  idBase?: string
}) {
  const generato = useId()
  const id = idBase ?? generato
  const lingua = useLingua()
  const t = ONBOARDING[lingua].incarichi
  const aiuto: Record<Incarico, string> = {
    coach: t.coachAiuto,
    revisore: t.revisoreAiuto,
    responsabile: t.responsabileAiuto,
  }

  return (
    <div className="space-y-4">
      {INCARICHI.map((incarico) => {
        const obbligatorio = incarico === 'responsabile' && responsabileObbligatorio
        const errore = traduciErroreOnboarding(errori[incarico], lingua)
        const fuori = nonAttivi.filter((p) => p.id === valori[incarico] && !persone.some((a) => a.id === p.id))
        return (
          <div key={incarico} className="space-y-1.5">
            <Label htmlFor={`${id}-${incarico}`}>
              {t[incarico]}
              {obbligatorio ? <span className="font-normal text-muted-foreground"> {t.obbligatorio}</span> : null}
            </Label>
            <select
              id={`${id}-${incarico}`}
              name={incarico}
              value={valori[incarico]}
              onChange={(e) => onChange(incarico, e.target.value)}
              className={CLASSE_SELECT}
              aria-required={obbligatorio || undefined}
              aria-invalid={errore ? true : undefined}
              aria-describedby={errore ? `${id}-${incarico}-errore` : `${id}-${incarico}-aiuto`}
            >
              <option value="">{obbligatorio ? t.scegli : t.nessuno}</option>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === io ? t.io(p.nome) : p.nome}
                </option>
              ))}
              {fuori.map((p) => (
                <option key={p.id} value={p.id}>
                  {t.nonAttivo(p.nome)}
                </option>
              ))}
            </select>
            <ErroreCampo id={`${id}-${incarico}-errore`} messaggio={errore} />
            <p id={`${id}-${incarico}-aiuto`} className="text-xs text-muted-foreground">
              {aiuto[incarico]}
            </p>
          </div>
        )
      })}
    </div>
  )
}
