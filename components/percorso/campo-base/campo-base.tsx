'use client'

import { BookOpen, CalendarDays, Home, Route, ScrollText, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { GrigliaAula, ModuloAperto } from '@/components/percorso/campo-base/aula'
import { PosizioneDaIndirizzo, PosizioneLocale, VaiA, usePosizione } from '@/components/percorso/campo-base/navigazione'
import { SchedaCall, SchedaCommunity, SchedaHome, SchedaRegole } from '@/components/percorso/campo-base/schede'
import { VistaPercorso } from '@/components/percorso/vista-percorso'
import { SCHEDE_CAMPO, nomeDiBattesimo, schedaIniziale, type CampoBase, type SchedaCampo } from '@/lib/percorso/campo-base'
import type { Percorso } from '@/lib/percorso/letture'
import { TESTI_CAMPO as T } from '@/lib/percorso/testi-campo'
import { cn } from '@/lib/utils'

const ICONE: Record<SchedaCampo, LucideIcon> = {
  percorso: Route,
  home: Home,
  aula: BookOpen,
  call: CalendarDays,
  regole: ScrollText,
  community: Users,
}

/**
 * The client's home base (1.83.0, CLAUDE.md section 34): the cover «La tua dashboard» and one panel
 * with tabs, as the Notion dashboard and the Aula of Skool Dany showed. Percorso is the path of
 * the onboarding as before (VistaPercorso); Home, Aula, Le mie call, Regole and Community read
 * campo_base_cliente(). During the onboarding the client lands on Percorso, after the launch on Home.
 *
 * `anteprima`: the coach's «Come lo vede il cliente» and the admin's CMS. No tab Percorso without a
 * path, the place in the component's memory, nothing recorded.
 */
export function CampoBaseCliente({
  percorso,
  campo,
  anteprima = false,
}: {
  percorso: Percorso | null
  campo: CampoBase
  anteprima?: boolean
}) {
  const lanciato = percorso?.lanciato ?? campo.lanciato
  const schede = SCHEDE_CAMPO.filter((s) => s !== 'percorso' || percorso !== null)
  if (anteprima) {
    return (
      <PosizioneLocale iniziale={percorso ? schedaIniziale(lanciato) : 'home'}>
        <Corpo percorso={percorso} campo={campo} schede={schede} anteprima />
      </PosizioneLocale>
    )
  }
  return (
    <PosizioneDaIndirizzo lanciato={lanciato}>
      <Corpo percorso={percorso} campo={campo} schede={schede} anteprima={false} />
    </PosizioneDaIndirizzo>
  )
}

function Corpo({
  percorso,
  campo,
  schede,
  anteprima,
}: {
  percorso: Percorso | null
  campo: CampoBase
  schede: readonly SchedaCampo[]
  anteprima: boolean
}) {
  const { posizione } = usePosizione()
  const scheda = schede.includes(posizione.scheda) ? posizione.scheda : (schede[0] ?? 'home')
  const nome = nomeDiBattesimo(campo.nome || percorso?.nome || '')
  const titolo = useRef<HTMLHeadingElement>(null)
  const primo = useRef(true)

  // a new tab: the focus on its title (never on <body>), not on the first draw
  useEffect(() => {
    if (primo.current) {
      primo.current = false
      return
    }
    titolo.current?.focus({ preventScroll: true })
  }, [scheda])

  const modulo = scheda === 'aula' && posizione.modulo ? campo.aula.find((m) => m.id === posizione.modulo) : undefined

  return (
    <div className="space-y-6 pt-4 sm:space-y-8 sm:pt-6" data-testid="campo-base" data-scheda={scheda}>
      <Copertina nome={nome} />

      <nav aria-label={T.sezioni} className="vetro -mx-1 overflow-hidden rounded-2xl p-1" data-testid="schede-campo">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {schede.map((s) => {
            const Icona = ICONE[s]
            const attiva = s === scheda
            return (
              <li key={s} className="shrink-0">
                <VaiA
                  a={{ scheda: s, modulo: null, lezione: null }}
                  corrente={attiva}
                  testId={`tab-${s}`}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm transition-colors',
                    attiva ? 'glow-primario bg-selezione font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icona className="size-4" aria-hidden="true" />
                  {T.schede[s]}
                </VaiA>
              </li>
            )
          })}
        </ul>
      </nav>

      {scheda === 'percorso' && percorso ? (
        <VistaPercorso percorso={percorso} />
      ) : (
        <div className="space-y-5" key={scheda}>
          {scheda !== 'percorso' && !modulo ? (
            <header className="space-y-1.5">
              <h1 ref={titolo} tabIndex={-1} className="font-heading text-2xl font-semibold tracking-tight outline-none sm:text-3xl">
                {T.titoli[scheda]}
              </h1>
              <p className="text-muted-foreground">{T.sottotitoli[scheda]}</p>
            </header>
          ) : (
            <h1 ref={titolo} tabIndex={-1} className="sr-only">
              {T.titoli.aula}
            </h1>
          )}
          {scheda === 'home' ? <SchedaHome campo={campo} /> : null}
          {scheda === 'aula' ? (
            modulo && modulo.aperto ? (
              <ModuloAperto modulo={modulo} nome={nome} anteprima={anteprima} />
            ) : (
              <GrigliaAula aula={campo.aula} />
            )
          ) : null}
          {scheda === 'call' ? <SchedaCall campo={campo} /> : null}
          {scheda === 'regole' ? <SchedaRegole campo={campo} /> : null}
          {scheda === 'community' ? <SchedaCommunity campo={campo} /> : null}
        </div>
      )}
    </div>
  )
}

/** The cover «La tua dashboard», as the Notion page: a brand moment, still (no animation near numbers). */
function Copertina({ nome }: { nome: string }) {
  return (
    <div
      className="campo-entra relative overflow-hidden rounded-3xl bg-[radial-gradient(90%_140%_at_50%_120%,var(--brand-fire-deep)_0%,var(--brand-palco)_65%)] px-6 py-8 text-center sm:py-12"
      data-testid="copertina-campo"
    >
      <div aria-hidden="true" className="campo-brace pointer-events-none absolute inset-x-0 -bottom-16 mx-auto h-40 w-3/4 rounded-full bg-[var(--brand-fire-ember)] opacity-25 blur-3xl" />
      <p className="relative font-heading leading-none font-black tracking-tight uppercase">
        <span className="glow-oro block text-3xl text-gold sm:text-5xl">{T.copertinaSopra}</span>
        <span className="block text-4xl text-[var(--brand-fire-core)] sm:text-6xl">{T.copertinaSotto}</span>
      </p>
      {nome ? <p className="relative mt-3 text-sm font-medium tracking-wide text-[var(--brand-fire-core)]/80 uppercase">{nome}</p> : null}
    </div>
  )
}
