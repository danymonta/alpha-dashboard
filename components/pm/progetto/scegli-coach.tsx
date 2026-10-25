'use client'

import { Check, LoaderCircle, UserRoundCheck, UserRoundPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { scegliCoach } from '@/app/(app)/progetti/[id]/actions'
import { ErroreModulo, FoglioModifica } from '@/components/form/foglio-modifica'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { SenzaCoach } from '@/components/pm/stato-progetto'
import { StatoErrore } from '@/components/stati/stato-errore'
import { Button } from '@/components/ui/button'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { FOGLI_PROGETTO } from '@/lib/i18n/testi/progetto-fogli'
import { cn } from '@/lib/utils'

export type PersonaCoach = { id: string; nome: string; ruolo: string; coach: boolean }

/**
 * "Coach del cliente" (02/10/2026): who manages a client's project picks the
 * coach with one tap. The database makes him a member and gives him the
 * client's tasks still free and the previous coach's; the tasks of a role (the
 * meal plan) go to that role when someone has it, and tasks other people work
 * on stay theirs. The sheet says so before the tap.
 */
export function ScegliCoach({
  progettoId,
  cliente,
  coach,
  persone,
  daRuolo,
  elencoNonCaricato = false,
}: {
  progettoId: string
  cliente: string
  coach: { id: string; nome: string } | null
  /** Active people: coaches first. */
  persone: readonly PersonaCoach[]
  /** What the tasks of a role do: "«Programmazione alimentare…» va a Nina (Nutrizione)". */
  daRuolo: readonly string[]
  /** The team or the tasks could not be read: never "nobody in the team". */
  elencoNonCaricato?: boolean
}) {
  const t = useTesti(FOGLI_PROGETTO)
  const lingua = useLingua()
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [inCorso, setInCorso] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  async function scegli(persona: PersonaCoach) {
    setErrore(null)
    setInCorso(persona.id)
    let esito
    try {
      esito = await scegliCoach({ progetto_id: progettoId, profile_id: persona.id })
    } catch {
      esito = { ok: false as const, errore: 'Connessione assente. Riprova.' }
    }
    setInCorso(null)
    if (!esito.ok) {
      setErrore(traduciErroreProgetti(esito.errore, lingua) ?? null)
      return
    }
    toast.success(t.coachDi(persona.nome, cliente))
    setAperto(false)
  }

  const coachDelTeam = persone.filter((p) => p.coach)
  const altri = persone.filter((p) => !p.coach)

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) setErrore(null)
      }}
      trigger={<Button type="button" variant={coach ? 'ghost' : 'default'} className="h-11" />}
      contenutoTrigger={
        coach ? (
          t.cambiaCoach
        ) : (
          <>
            <UserRoundPlus className="size-4" aria-hidden="true" />
            {t.scegliCoach}
          </>
        )
      }
      titolo={coach ? t.cambiaIlCoach : t.scegliCoach}
      descrizione={coach ? t.nuovoCoachDescrizione(cliente, coach.nome) : t.coachDescrizione(cliente)}
    >
      {elencoNonCaricato ? (
        <StatoErrore
          titolo={t.elencoNonCaricato}
          descrizione={t.elencoNonCaricatoDescrizione}
          riprova={() => router.refresh()}
        />
      ) : (
        <div className="space-y-5">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {daRuolo.map((riga) => (
              <li key={riga}>{riga}</li>
            ))}
            <li>{t.restanoAltri}</li>
            {coach ? <li>{t.lasciaTask(coach.nome)}</li> : null}
          </ul>

          <Elenco titolo={t.coach} persone={coachDelTeam} coach={coach} inCorso={inCorso} onScegli={scegli} />
          <Elenco titolo={t.altrePersone} persone={altri} coach={coach} inCorso={inCorso} onScegli={scegli} />
          {persone.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.nessunaPersona}</p>
          ) : null}
          <ErroreModulo testo={errore} />
        </div>
      )}
    </FoglioModifica>
  )
}

function Elenco({
  titolo,
  persone,
  coach,
  inCorso,
  onScegli,
}: {
  titolo: string
  persone: readonly PersonaCoach[]
  coach: { id: string } | null
  inCorso: string | null
  onScegli: (p: PersonaCoach) => void
}) {
  const t = useTesti(FOGLI_PROGETTO)
  if (persone.length === 0) return null
  return (
    <section className="space-y-2" aria-label={titolo}>
      <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</h3>
      <ul className="divide-y divide-border rounded-xl bg-card">
        {persone.map((p) => {
          const attuale = coach?.id === p.id
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={attuale || inCorso !== null}
                onClick={() => onScegli(p)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                  'hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  'disabled:cursor-default disabled:hover:bg-transparent',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nome}</span>
                  <span className="block text-xs text-muted-foreground">{p.ruolo}</span>
                </span>
                {inCorso === p.id ? (
                  <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                ) : attuale ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Check className="size-3.5" aria-hidden="true" />
                    {t.coachAttuale}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The coach line of a client's project: who it is, or that it has none yet. */
export function CoachDelCliente({
  coach,
  testi = { coach: 'Coach:', senza: 'Senza coach' },
}: {
  coach: { nome: string } | null
  /** The page's words (1.53.0). */
  testi?: { coach: string; senza: string }
}) {
  if (!coach) return <SenzaCoach className="text-sm" testo={testi.senza} />
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <UserRoundCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{testi.coach}</span> {coach.nome}
    </span>
  )
}
