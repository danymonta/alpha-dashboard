'use client'

import { CircleAlert } from 'lucide-react'
import { useId } from 'react'

import type { RisposteCommento } from '@/app/(app)/today/proposta-instagram'
import { ScalaCommento } from '@/components/setter/scala-commento'
import { Textarea } from '@/components/ui/textarea'
import {
  COMMENTO_OBBLIGATORIO,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  risposteMancanti,
} from '@/lib/setting/commento'

const COSA_FRENAVA = TESTI_COMMENTO[0]

type Props = {
  valori: RisposteCommento
  onCambia: (valori: RisposteCommento) => void
  /** After a tap on the decision with an answer missing: each one says so. */
  mostraErrori: boolean
}

/**
 * The step of the Instagram card before the setter's decision (Dany,
 * 08/10/2026: "che sia lui o Instagram poi a caricare deve lui sempre
 * lasciare un commento della giornata"): the three required answers of
 * "Com’è andata la giornata", with the same words and the same one-tap scales
 * as "Oggi", starting from what his report of that day already has. The
 * other two questions stay in "Oggi", optional.
 */
export function DomandeObbligatorie({ valori, onCambia, mostraErrori }: Props) {
  const id = useId()
  const mancanti = new Set(mostraErrori ? risposteMancanti(valori) : [])
  const erroreTesto = mancanti.has('cosa_frenava') ? COMMENTO_OBBLIGATORIO.errore.cosa_frenava : null

  return (
    <div className="space-y-4 rounded-xl bg-card p-3" data-testid="commento-proposta">
      {SCALE_COMMENTO.map((scala) => (
        <ScalaCommento
          key={scala.campo}
          scala={scala}
          valore={valori[scala.campo]}
          onCambia={(v) => onCambia({ ...valori, [scala.campo]: v })}
          obbligatoria
          errore={mancanti.has(scala.campo) ? COMMENTO_OBBLIGATORIO.errore[scala.campo] : null}
        />
      ))}
      <div className="space-y-1.5">
        <label htmlFor={`${id}-cosa-frenava`} className="block text-sm font-medium">
          {COSA_FRENAVA.domanda}{' '}
          <span className="font-normal text-muted-foreground">({COMMENTO_OBBLIGATORIO.obbligatoria})</span>
        </label>
        <Textarea
          id={`${id}-cosa-frenava`}
          value={valori.cosa_frenava ?? ''}
          onChange={(e) => onCambia({ ...valori, cosa_frenava: e.currentTarget.value })}
          placeholder={COSA_FRENAVA.placeholder}
          maxLength={COSA_FRENAVA.massimo}
          rows={2}
          aria-required
          aria-invalid={erroreTesto ? true : undefined}
          aria-describedby={erroreTesto ? `${id}-cosa-frenava-errore` : undefined}
        />
        {erroreTesto ? (
          <p
            id={`${id}-cosa-frenava-errore`}
            className="flex items-start gap-1.5 text-xs text-status-critical"
            data-testid="errore-cosa_frenava"
          >
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {erroreTesto}
          </p>
        ) : null}
      </div>
    </div>
  )
}
