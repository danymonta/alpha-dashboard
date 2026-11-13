'use client'

import { Eye, FlaskConical, KeyRound, LinkIcon, LogOut, RotateCcw, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId, useState } from 'react'

import { useTesti } from '@/components/i18n/lingua-provider'
import { CODICE_PROVA, INDIRIZZI_PROVA, useProva } from '@/components/percorso/prova/prova-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { PROVA } from '@/lib/i18n/testi/prova'
import { aspettaUnVideo, azioneTeamDovuta, metePossibili, type Meta } from '@/lib/percorso/prova'
import { codiceLeggibile } from '@/lib/validation/registrazione-cliente'
import { cn } from '@/lib/utils'

/**
 * The bar of «Prova del percorso» (1.82.0): what the test is, the one action of the team the
 * client waits for now, the video to mark as seen, «Vai allo step», the link of the client,
 * «Ricomincia» and «Esci dalla prova». Sober and still, the team's words in the admin's
 * language; under it the client's area as it is.
 */
export function BarraProva() {
  const t = useTesti(PROVA)
  const id = useId()
  const pathname = usePathname()
  const { dati, stato, fase, codiceInviato, team, segnaVideo, vai, ricomincia } = useProva()
  const [meta, setMeta] = useState<Meta>('')
  const [conferma, setConferma] = useState(false)
  const azione = azioneTeamDovuta(stato)
  const video = aspettaUnVideo(dati, stato)
  const mete = metePossibili(dati)
  const sulLink = pathname === INDIRIZZI_PROVA.link

  return (
    <div
      role="region"
      aria-label={t.barra}
      className="relative z-40 border-b border-border bg-background sm:sticky sm:top-0"
      data-testid="barra-prova"
    >
      <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
            <span>{t.avviso}</span>
          </p>
          <Link
            href="/onboarding"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 shrink-0 gap-2')}
            data-testid="esci-prova"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t.esci}
          </Link>
        </div>

        {sulLink && fase === 'registrazione' && codiceInviato ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm" data-testid="codice-prova">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="num">{t.codice(codiceLeggibile(CODICE_PROVA))}</span>
          </p>
        ) : null}

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex min-w-0 items-start gap-2 text-sm">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="font-medium">{t.ilTeam}:</span> {azione ? t.spiegazioni[azione] : t.nienteDalTeam}
            </span>
          </p>
          {azione ? (
            <Button type="button" className="h-11 shrink-0" onClick={() => team(azione)} data-testid="azione-team">
              {t.azioni[azione]}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {video && !sulLink ? (
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={segnaVideo} data-testid="segna-video">
              <Eye className="size-4" aria-hidden="true" />
              {t.segnaVideo}
            </Button>
          ) : null}
          <form
            className="flex min-w-0 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!meta) return
              vai(meta)
              setMeta('')
            }}
          >
            <label htmlFor={`${id}-meta`} className="sr-only">
              {t.vaiAllo}
            </label>
            <select
              id={`${id}-meta`}
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              data-testid="vai-allo-step"
            >
              <option value="">{t.vaiAllo}</option>
              {mete.map((m) => (
                <option key={m.chiave} value={m.chiave}>
                  {m.chiave === 'lancio' ? t.lancio : m.titolo}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" className="h-11" aria-disabled={!meta || undefined}>
              {t.vai}
            </Button>
          </form>
          {sulLink ? (
            <Link href={INDIRIZZI_PROVA.percorso} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 gap-2')}>
              {t.tornaPercorso}
            </Link>
          ) : (
            <Link
              href={INDIRIZZI_PROVA.link}
              className={cn(buttonVariants({ variant: 'outline' }), 'h-11 gap-2')}
              data-testid="vedi-link"
            >
              <LinkIcon className="size-4" aria-hidden="true" />
              {t.link}
            </Link>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-11 gap-2 text-muted-foreground"
            onClick={() => {
              if (!conferma) {
                setConferma(true)
                return
              }
              setConferma(false)
              ricomincia()
            }}
            onBlur={() => setConferma(false)}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {conferma ? t.ricominciaConferma : t.ricomincia}
          </Button>
        </div>
      </div>
    </div>
  )
}
