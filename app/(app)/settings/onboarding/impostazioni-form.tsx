'use client'

import { useId, useState } from 'react'

import { salvaImpostazioni } from '@/app/(app)/onboarding/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, useSalvataggio } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { CampiIncarichi, type ErroriIncarichi, type ValoriIncarichi } from '@/components/onboarding/campi-incarichi'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ONBOARDING, ONBOARDING_TEAM, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import type { ImpostazioniOnboarding } from '@/lib/onboarding/letture'
import type { PersonaTeam } from '@/lib/onboarding/stati'
import { LIMITI_ONBOARDING, impostazioniOnboardingSchema, type Incarico } from '@/lib/validation/onboarding'

const CAMPO_DI: Record<string, Incarico> = {
  coach_predefinito_id: 'coach',
  revisore_predefinito_id: 'revisore',
  responsabile_predefinito_id: 'responsabile',
}

/** The settings of the onboarding: one form, one «Salva», the errors under their fields. */
export function ImpostazioniOnboardingForm({
  impostazioni,
  persone,
  io,
}: {
  impostazioni: ImpostazioniOnboarding
  /** The active people of the team. */
  persone: PersonaTeam[]
  io: string
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua].impostazioni
  const tb = ONBOARDING_TEAM[lingua].impostazioni
  const tr = (testo: string | undefined) => traduciErroreOnboarding(testo, lingua)
  // a person no longer active is proposed to nobody: the select starts empty
  const attiva = (persona: string | null) => (persona && persone.some((p) => p.id === persona) ? persona : '')
  const [incarichi, setIncarichi] = useState<ValoriIncarichi>({
    coach: attiva(impostazioni.coach_predefinito_id),
    revisore: attiva(impostazioni.revisore_predefinito_id),
    responsabile: attiva(impostazioni.responsabile_predefinito_id),
  })
  const [link, setLink] = useState(impostazioni.link_community ?? '')
  const [giorni, setGiorni] = useState(String(impostazioni.giorni_validita_link))
  const [prenotazione, setPrenotazione] = useState(impostazioni.link_prenotazione ?? '')
  const [avvisa, setAvvisa] = useState(impostazioni.avvisa_cliente_email)
  const [errorePrenotazione, setErrorePrenotazione] = useState<string | undefined>()
  const [erroriIncarichi, setErroriIncarichi] = useState<ErroriIncarichi>({})
  const [erroreLink, setErroreLink] = useState<string | undefined>()
  const [erroreGiorni, setErroreGiorni] = useState<string | undefined>()
  const [inCorso, setInCorso] = useState(false)
  const { errore, salva } = useSalvataggio()

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      coach_predefinito_id: incarichi.coach,
      revisore_predefinito_id: incarichi.revisore,
      responsabile_predefinito_id: incarichi.responsabile,
      link_community: link,
      link_prenotazione: prenotazione,
      avvisa_cliente_email: avvisa,
      giorni_validita_link: giorni,
    }
    const valido = impostazioniOnboardingSchema.safeParse(input)
    if (!valido.success) {
      const persone_: ErroriIncarichi = {}
      let diLink: string | undefined
      let diGiorni: string | undefined
      let diPrenotazione: string | undefined
      for (const issue of valido.error.issues) {
        const campo = String(issue.path[0] ?? '')
        if (campo in CAMPO_DI) persone_[CAMPO_DI[campo]] ??= issue.message
        else if (campo === 'link_community') diLink ??= issue.message
        else if (campo === 'giorni_validita_link') diGiorni ??= issue.message
        else if (campo === 'link_prenotazione') diPrenotazione ??= issue.message
      }
      setErrorePrenotazione(diPrenotazione)
      setErroriIncarichi(persone_)
      setErroreLink(diLink)
      setErroreGiorni(diGiorni)
      return
    }
    setErroriIncarichi({})
    setErroreLink(undefined)
    setErroreGiorni(undefined)
    setErrorePrenotazione(undefined)
    setInCorso(true)
    await salva(() => salvaImpostazioni(input), t.salvato)
    setInCorso(false)
  }

  return (
    <form onSubmit={invia} noValidate className="space-y-8" data-testid="impostazioni-onboarding">
      <section aria-labelledby={`${id}-predefiniti`} className="space-y-4">
        <div className="space-y-1 px-1">
          <h2 id={`${id}-predefiniti`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.predefiniti}
          </h2>
          <p className="text-sm text-muted-foreground">{t.predefinitiAiuto}</p>
        </div>
        <CampiIncarichi
          valori={incarichi}
          onChange={(incarico, valore) => {
            setIncarichi((prima) => ({ ...prima, [incarico]: valore }))
            setErroriIncarichi((prima) => ({ ...prima, [incarico]: undefined }))
          }}
          persone={persone}
          io={io}
          errori={erroriIncarichi}
          responsabileObbligatorio={false}
        />
      </section>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-community`}>{t.linkCommunity}</Label>
          <Input
            id={`${id}-community`}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className="h-11"
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setErroreLink(undefined)
            }}
            aria-invalid={erroreLink ? true : undefined}
            aria-describedby={erroreLink ? `${id}-community-errore` : `${id}-community-aiuto`}
          />
          <ErroreCampo id={`${id}-community-errore`} messaggio={tr(erroreLink)} />
          <p id={`${id}-community-aiuto`} className="text-xs text-muted-foreground">
            {t.linkCommunityAiuto}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-prenotazione`}>{tb.linkPrenotazione}</Label>
          <Input
            id={`${id}-prenotazione`}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className="h-11"
            value={prenotazione}
            onChange={(e) => {
              setPrenotazione(e.target.value)
              setErrorePrenotazione(undefined)
            }}
            aria-invalid={errorePrenotazione ? true : undefined}
            aria-describedby={errorePrenotazione ? `${id}-prenotazione-errore` : `${id}-prenotazione-aiuto`}
            data-testid="link-prenotazione"
          />
          <ErroreCampo id={`${id}-prenotazione-errore`} messaggio={tr(errorePrenotazione)} />
          <p id={`${id}-prenotazione-aiuto`} className="text-xs text-muted-foreground">
            {tb.linkPrenotazioneAiuto}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-giorni`}>{t.giorni}</Label>
          <Input
            id={`${id}-giorni`}
            type="number"
            inputMode="numeric"
            min={LIMITI_ONBOARDING.giorniLinkMinimo}
            max={LIMITI_ONBOARDING.giorniLinkMassimo}
            step={1}
            className="num h-11 max-w-32"
            value={giorni}
            onChange={(e) => {
              setGiorni(e.target.value)
              setErroreGiorni(undefined)
            }}
            aria-invalid={erroreGiorni ? true : undefined}
            aria-describedby={erroreGiorni ? `${id}-giorni-errore` : `${id}-giorni-aiuto`}
          />
          <ErroreCampo id={`${id}-giorni-errore`} messaggio={tr(erroreGiorni)} />
          <p id={`${id}-giorni-aiuto`} className="text-xs text-muted-foreground">
            {t.giorniAiuto}
          </p>
        </div>
      </section>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-card p-3" data-testid="avvisa-email">
        <input
          type="checkbox"
          checked={avvisa}
          onChange={(e) => setAvvisa(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
          aria-describedby={`${id}-avvisa-aiuto`}
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{tb.avvisaEmail}</span>
          <span id={`${id}-avvisa-aiuto`} className="block text-xs text-muted-foreground">
            {tb.avvisaEmailAiuto}
          </span>
        </span>
      </label>

      <ErroreModulo testo={errore ? traduciErroreOnboarding(errore, lingua) : null} />
      <BottoneSalva inCorso={inCorso}>{t.salva}</BottoneSalva>
    </form>
  )
}
