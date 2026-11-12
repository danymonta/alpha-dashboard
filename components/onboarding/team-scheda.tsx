'use client'

import { Pencil, UsersRound } from 'lucide-react'
import { useId, useState } from 'react'

import { impostaIncarichi } from '@/app/(app)/onboarding/actions'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import {
  CampiIncarichi,
  valoriIncarichi,
  type ErroriIncarichi,
  type ValoriIncarichi,
} from '@/components/onboarding/campi-incarichi'
import { Button } from '@/components/ui/button'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import type { PersonaTeam } from '@/lib/onboarding/stati'
import { INCARICHI, incarichiSchema, type Incarico } from '@/lib/validation/onboarding'

type Incaricato = { id: string | null; nome: string | null }

/**
 * Who follows the client: coach, reviewer and responsible, and the sheet that changes
 * them (onboarding_imposta_incarichi: with an active link project and tasks follow the
 * new people). Never a list by collaborator: only this client's three names.
 */
export function TeamScheda({
  clientId,
  incarichi,
  persone,
  io,
  linkAttivo,
}: {
  clientId: string
  incarichi: Record<Incarico, Incaricato>
  /** The active people of the team. */
  persone: PersonaTeam[]
  io: string
  /** With an active link the save also moves project and tasks: the toast says so. */
  linkAttivo: boolean
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua].incarichi
  const iniziali = (): ValoriIncarichi =>
    valoriIncarichi({ coach: incarichi.coach.id, revisore: incarichi.revisore.id, responsabile: incarichi.responsabile.id })
  const [aperto, setAperto] = useState(false)
  const [valori, setValori] = useState<ValoriIncarichi>(iniziali)
  const [errori, setErrori] = useState<ErroriIncarichi>({})
  const [inCorso, setInCorso] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()

  // someone in charge who is no longer active stays in his select, said so
  const nonAttivi = INCARICHI.map((i) => incarichi[i])
    .filter((p): p is { id: string; nome: string } => Boolean(p.id && p.nome))
    .filter((p) => !persone.some((a) => a.id === p.id))

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    const valido = incarichiSchema.safeParse({ client_id: clientId, ...valori })
    if (!valido.success) {
      const trovati: ErroriIncarichi = {}
      for (const issue of valido.error.issues) {
        const campo = issue.path[0]
        if (campo === 'coach' || campo === 'revisore' || campo === 'responsabile') trovati[campo] ??= issue.message
      }
      setErrori(trovati)
      return
    }
    // a person in charge who is no longer active: the database refuses her, so the field says it first
    const fuori: ErroriIncarichi = {}
    for (const incarico of INCARICHI) {
      const scelto = valori[incarico]
      const via = scelto ? nonAttivi.find((p) => p.id === scelto) : undefined
      if (via) fuori[incarico] = t.sostituisci(via.nome)
    }
    if (Object.keys(fuori).length > 0) {
      setErrori(fuori)
      requestAnimationFrame(() => {
        const primo = INCARICHI.find((i) => fuori[i])
        if (primo) document.getElementById(`${id}-incarichi-${primo}`)?.focus()
      })
      return
    }
    setErrori({})
    setInCorso(true)
    const ok = await salva(
      () => impostaIncarichi({ client_id: clientId, ...valori }),
      linkAttivo ? t.salvatoAllineato : t.salvato,
    )
    setInCorso(false)
    if (ok) setAperto(false)
  }

  return (
    <section aria-labelledby={`${id}-titolo`} className="rounded-xl bg-card p-3" data-testid="riquadro-team">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 id={`${id}-titolo`} className="flex items-center gap-1.5 text-sm font-medium">
          <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
          {t.titolo}
        </h2>
        <FoglioModifica
          aperto={aperto}
          onApertoChange={(v) => {
            setAperto(v)
            if (v) {
              setValori(iniziali())
              setErrori({})
            }
            setErrore(null)
          }}
          trigger={<Button type="button" variant="ghost" className="-mr-1.5 h-11 px-2.5" data-testid="modifica-team" />}
          contenutoTrigger={
            <>
              <Pencil className="size-4" aria-hidden="true" />
              {t.modifica}
            </>
          }
          titolo={t.modifica}
          descrizione={t.nota}
        >
          <form onSubmit={invia} noValidate className="space-y-4">
            <CampiIncarichi
              valori={valori}
              onChange={(incarico, valore) => {
                setValori((prima) => ({ ...prima, [incarico]: valore }))
                setErrori((prima) => ({ ...prima, [incarico]: undefined }))
              }}
              persone={persone}
              io={io}
              errori={errori}
              nonAttivi={nonAttivi}
              idBase={`${id}-incarichi`}
            />
            <ErroreModulo testo={errore ? traduciErroreOnboarding(errore, lingua) : null} />
            <BottoneSalva inCorso={inCorso}>{t.salva}</BottoneSalva>
          </form>
        </FoglioModifica>
      </div>
      <dl className="divide-y divide-border">
        {INCARICHI.map((incarico) => {
          const p = incarichi[incarico]
          return (
            <div key={incarico} className="flex min-h-10 items-baseline justify-between gap-3 py-2" data-incarico={incarico}>
              <dt className="shrink-0 text-sm text-muted-foreground">{t[incarico]}</dt>
              <dd className="min-w-0 text-right text-sm break-words">
                {p.nome ? p.nome : <span className="text-muted-foreground">{t.nessuno}</span>}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
