'use client'

import { CalendarRange, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition, type FormEvent } from 'react'

import { BottoneSalva, FoglioModifica } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aggiungiGiorni } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIO_TEMPO } from '@/lib/i18n/testi/tempo'
import { lunediDi, type PeriodoTempo } from '@/lib/tempo'
import { cn } from '@/lib/utils'

const FRECCIA =
  'flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground'

/**
 * "21–27/09/2026", "29/09–05/10/2026", "29/12/2025–04/01/2026": the year once when it can.
 * In English "21–27 Sep 2026", "29 Sep–05 Oct 2026", "29 Dec 2025–04 Jan 2026".
 */
function etichettaBreve(da: string, a: string, lingua: Lingua): string {
  const { formatData } = formato(lingua)
  if (da === a) return formatData(da)
  const [annoDa, meseDa, giornoDa] = da.split('-')
  const [annoA, meseA, giornoA] = a.split('-')
  if (lingua === 'en') {
    if (annoDa !== annoA) return `${formatData(da)}–${formatData(a)}`
    const senzaAnno = (iso: string) => formatData(iso).slice(0, -5)
    if (meseDa === meseA) return `${giornoDa}–${formatData(a)}`
    return `${senzaAnno(da)}–${formatData(a)}`
  }
  if (annoDa === annoA && meseDa === meseA) return `${giornoDa}–${giornoA}/${meseA}/${annoA}`
  if (annoDa === annoA) return `${giornoDa}/${meseDa}–${giornoA}/${meseA}/${annoA}`
  return `${formatData(da)}–${formatData(a)}`
}

type Scelta = { chiave: string; etichetta: string; href: string; attiva: boolean }

/**
 * The quick choices, as the same URL parameters the page already reads:
 * no parameter (this week), ?settimana= (any day of a week), ?da=&a= (a range).
 */
function scelteRapide(percorso: string, periodo: PeriodoTempo, oggi: string, lingua: Lingua): Scelta[] {
  const parole = MIO_TEMPO[lingua]
  const settimanaScorsa = aggiungiGiorni(lunediDi(oggi), -7)
  const primoDelMese = `${oggi.slice(0, 8)}01`
  const fineMeseScorso = aggiungiGiorni(primoDelMese, -1)
  const primoMeseScorso = `${fineMeseScorso.slice(0, 8)}01`
  const intervallo = (da: string, a: string) => periodo.tipo === 'libero' && periodo.da === da && periodo.a === a
  return [
    {
      chiave: 'settimana',
      etichetta: parole.periodo.questaSettimana,
      href: percorso,
      attiva: periodo.tipo === 'settimana' && periodo.corrente,
    },
    {
      chiave: 'settimana-scorsa',
      etichetta: parole.periodo.settimanaScorsa,
      href: `${percorso}?settimana=${settimanaScorsa}`,
      attiva: periodo.tipo === 'settimana' && periodo.da === settimanaScorsa,
    },
    {
      chiave: 'mese',
      etichetta: parole.navigazione.questoMese,
      href: `${percorso}?da=${primoDelMese}&a=${oggi}`,
      attiva: intervallo(primoDelMese, oggi),
    },
    {
      chiave: 'mese-scorso',
      etichetta: parole.navigazione.meseScorso,
      href: `${percorso}?da=${primoMeseScorso}&a=${fineMeseScorso}`,
      attiva: intervallo(primoMeseScorso, fineMeseScorso),
    },
  ]
}

/**
 * Week arrows (never into the future) around a "Periodo" button, the same
 * shape as the Economics selector: the sheet has quick choices and a free
 * range. Everything stays in the URL. In the page's language (1.53.0); a
 * project's Tempo tab passes none and stays Italian.
 */
export function NavigazionePeriodo({
  percorso,
  periodo,
  oggi,
  lingua = 'it',
}: {
  percorso: string
  periodo: PeriodoTempo
  oggi: string
  lingua?: Lingua
}) {
  const t = MIO_TEMPO[lingua].navigazione
  const settimana = periodo.tipo === 'settimana'
  return (
    // -ml-3: the chevron glyph (not its 44px hit area) lines up with the content edge
    <nav aria-label={t.aria} className="-ml-3 flex items-center gap-1">
      {settimana && periodo.precedente ? (
        <Link href={`${percorso}?settimana=${periodo.precedente}`} aria-label={t.precedente} className={FRECCIA}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${FRECCIA} opacity-30 hover:bg-transparent`}>
          <ChevronLeft className="size-5" />
        </span>
      )}

      <FoglioPeriodo percorso={percorso} periodo={periodo} oggi={oggi} lingua={lingua} />

      {settimana && periodo.successivo ? (
        <Link href={`${percorso}?settimana=${periodo.successivo}`} aria-label={t.successiva} className={FRECCIA}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${FRECCIA} opacity-30 hover:bg-transparent`}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  )
}

function FoglioPeriodo({
  percorso,
  periodo,
  oggi,
  lingua,
}: {
  percorso: string
  periodo: PeriodoTempo
  oggi: string
  lingua: Lingua
}) {
  const t = MIO_TEMPO[lingua].navigazione
  const id = useId()
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [inCorso, avvia] = useTransition()
  const fineMassima = periodo.a > oggi ? oggi : periodo.a
  const [da, setDa] = useState(periodo.da)
  const [a, setA] = useState(fineMassima)
  const scelte = scelteRapide(percorso, periodo, oggi, lingua)
  const personalizzato = !scelte.some((s) => s.attiva)
  const etichetta = etichettaBreve(periodo.da, periodo.a, lingua)

  function invia(evento: FormEvent) {
    evento.preventDefault()
    // the sheet closes once the new period has rendered
    avvia(() => {
      router.push(`${percorso}?da=${da}&a=${a}`)
      setAperto(false)
    })
  }

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        // the page may have moved to another period since the last opening
        if (v) {
          setDa(periodo.da)
          setA(fineMassima)
        }
      }}
      trigger={
        <Button
          type="button"
          variant="outline"
          aria-label={t.bottone(periodo.titolo, periodo.etichetta)}
          data-testid="etichetta-periodo-tempo"
          className="h-11 min-w-36 shrink gap-2 px-3"
        />
      }
      contenutoTrigger={
        <>
          <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="num min-w-0 truncate">{etichetta}</span>
        </>
      }
      titolo={t.titolo}
      descrizione={t.descrizione}
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-sm">
          <dt className="text-muted-foreground">{t.inUso}</dt>
          <dd className="font-medium">{periodo.titolo}</dd>
          <dt className="text-muted-foreground">{t.giorni}</dt>
          <dd className="num">{periodo.etichetta}</dd>
        </dl>

        <section aria-labelledby={`${id}-rapide`} className="space-y-2">
          <h3 id={`${id}-rapide`} className="text-sm font-medium">
            {t.rapide}
          </h3>
          <ul className="grid grid-cols-2 gap-2">
            {scelte.map((s) => (
              <li key={s.chiave}>
                <Link
                  href={s.href}
                  aria-current={s.attiva ? 'true' : undefined}
                  onClick={() => setAperto(false)}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-center text-sm leading-tight transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    s.attiva ? 'border-selezione bg-selezione text-selezione-foreground' : 'border-input bg-input/30 hover:bg-accent',
                  )}
                >
                  {s.attiva ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                  {s.etichetta}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={invia} className="space-y-3" aria-labelledby={`${id}-personalizzato`}>
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${id}-personalizzato`} className="text-sm font-medium">
              {t.intervallo}
            </h3>
            {personalizzato ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden="true" />
                {t.inUso}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-da`}>{t.dal}</Label>
              <Input
                id={`${id}-da`}
                type="date"
                required
                max={oggi}
                value={da}
                onChange={(e) => setDa(e.target.value)}
                className="num h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-a`}>{t.al}</Label>
              <Input
                id={`${id}-a`}
                type="date"
                required
                min={da || undefined}
                max={oggi}
                value={a}
                onChange={(e) => setA(e.target.value)}
                className="num h-11"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t.massimo}</p>
          <BottoneSalva inCorso={inCorso}>{t.mostra}</BottoneSalva>
        </form>
      </div>
    </FoglioModifica>
  )
}
