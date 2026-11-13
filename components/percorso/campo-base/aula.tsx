'use client'

import {
  BookOpen,
  Brain,
  Camera,
  ChevronLeft,
  CircleCheck,
  Dumbbell,
  ExternalLink,
  FileText,
  Flame,
  KeyRound,
  Link2,
  LoaderCircle,
  Lock,
  Map,
  PlayCircle,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Utensils,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { useBackendPercorso } from '@/components/percorso/backend-percorso'
import { VaiA, usePosizione } from '@/components/percorso/campo-base/navigazione'
import { MarkdownCliente } from '@/components/percorso/markdown-cliente'
import { PlayerYoutube } from '@/components/percorso/player-youtube'
import { Button } from '@/components/ui/button'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import {
  chiusoPerche,
  percentualeModulo,
  prossimaLezione,
  type IconaModulo,
  type LezioneAula,
  type ModuloAula,
} from '@/lib/percorso/campo-base'
import { TESTI_CAMPO as T } from '@/lib/percorso/testi-campo'
import { cn } from '@/lib/utils'

export const ICONA: Record<IconaModulo, LucideIcon> = {
  libro: BookOpen,
  mappa: Map,
  carrello: ShoppingCart,
  forchetta: Utensils,
  telefono: Smartphone,
  video: Video,
  fotocamera: Camera,
  cervello: Brain,
  manubrio: Dumbbell,
  fiamma: Flame,
  stella: Star,
  chiave: KeyRound,
}

const ICONA_LEZIONE = { video: PlayCircle, testo: BookOpen, pdf: FileText, link: Link2 } as const

/** The bar of a module's progress: a number in words too, never the colour alone. */
export function BarraModulo({ modulo, className }: { modulo: ModuloAula; className?: string }) {
  const p = percentualeModulo(modulo)
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
        aria-label={T.progressoModulo(modulo.completate, modulo.totali)}
        className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', p >= 100 ? 'bg-status-ok' : 'bg-primary')}
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="num w-10 shrink-0 text-right text-sm font-semibold">{T.completato(p)}</span>
    </div>
  )
}

/** The cover of a module: its image, or its icon on the brand's gradient. */
export function CopertinaModulo({ modulo, grande = false }: { modulo: ModuloAula; grande?: boolean }) {
  const Icona = ICONA[modulo.icona]
  return (
    <div
      className={cn(
        'relative flex aspect-[16/9] items-center justify-center overflow-hidden',
        grande ? 'rounded-2xl' : 'rounded-t-2xl',
        'bg-[radial-gradient(120%_100%_at_50%_0%,var(--brand-fire-deep)_0%,var(--brand-palco)_70%)]',
      )}
    >
      {modulo.copertinaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a public cover of the bucket, never through the optimiser
        <img src={modulo.copertinaUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <span className="glow-oro flex size-16 items-center justify-center rounded-2xl bg-gold text-[var(--brand-palco)] shadow-lg sm:size-20">
            <Icona className="size-8 sm:size-10" aria-hidden="true" />
          </span>
          <span className="font-heading text-lg leading-tight font-bold tracking-tight text-[var(--brand-fire-core)] uppercase sm:text-xl">
            {modulo.titolo}
          </span>
        </div>
      )}
    </div>
  )
}

function etichettaChiuso(perche: ReturnType<typeof chiusoPerche>): string {
  return perche === 'prossimamente' ? T.prossimamente : perche === 'bloccato' ? T.bloccato : T.dopoLancio
}

/** The grid of the modules, as the Aula of Skool: cover, title, two lines, the progress bar. */
export function GrigliaAula({ aula }: { aula: readonly ModuloAula[] }) {
  if (aula.length === 0) {
    return (
      <p className="vetro rounded-2xl p-6 text-center text-muted-foreground" data-testid="aula-vuota">
        {T.aulaVuota}
      </p>
    )
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2" data-testid="aula-moduli">
      {aula.map((m, i) => {
        const perche = chiusoPerche(m)
        const contenuto = (
          <>
            <div className="relative">
              <CopertinaModulo modulo={m} />
              {perche ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-t-2xl bg-background/70 backdrop-blur-[2px]">
                  <Lock className="size-7 text-foreground" aria-hidden="true" />
                  <span className="text-sm font-semibold">{etichettaChiuso(perche)}</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="space-y-1">
                <h3 className="font-heading text-lg leading-snug font-semibold tracking-tight">{m.titolo}</h3>
                {m.descrizione ? <p className="line-clamp-2 text-sm text-muted-foreground">{m.descrizione}</p> : null}
              </div>
              <BarraModulo modulo={m} className="mt-auto" />
            </div>
          </>
        )
        return (
          <li
            key={m.id}
            className="campo-entra"
            style={{ '--ritardo-campo': `${Math.min(i, 8) * 50}ms` } as React.CSSProperties}
            data-testid="modulo-aula"
            data-modulo={m.id}
          >
            {perche ? (
              <div
                className="vetro flex h-full flex-col overflow-hidden rounded-2xl opacity-80"
                aria-label={T.moduloChiuso(m.titolo, etichettaChiuso(perche))}
                role="group"
              >
                {contenuto}
              </div>
            ) : (
              <VaiA
                a={{ scheda: 'aula', modulo: m.id }}
                etichetta={T.apriModulo(m.titolo)}
                className="vetro group flex h-full flex-col overflow-hidden rounded-2xl text-left transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {contenuto}
              </VaiA>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** One module open: its lessons and the lesson chosen (the next one to do by default). */
export function ModuloAperto({
  modulo,
  nome,
  anteprima,
}: {
  modulo: ModuloAula
  nome: string
  anteprima: boolean
}) {
  const { posizione } = usePosizione()
  const lezione = modulo.lezioni.find((l) => l.id === posizione.lezione) ?? prossimaLezione(modulo)
  const indice = lezione ? modulo.lezioni.findIndex((l) => l.id === lezione.id) : -1
  const dopo = indice >= 0 ? modulo.lezioni[indice + 1] : undefined

  return (
    <div className="space-y-5" data-testid="modulo-aperto">
      <VaiA
        a={{ scheda: 'aula', modulo: null }}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {T.tornaAula}
      </VaiA>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <section className="vetro space-y-4 rounded-2xl p-4" aria-labelledby="titolo-modulo">
          <div className="space-y-2">
            <h2 id="titolo-modulo" className="font-heading text-xl font-semibold tracking-tight">
              {modulo.titolo}
            </h2>
            {modulo.descrizione ? <p className="text-sm text-muted-foreground">{modulo.descrizione}</p> : null}
            <BarraModulo modulo={modulo} />
          </div>
          {modulo.lezioni.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T.nessunaLezione}</p>
          ) : (
            <ol className="space-y-1" aria-label={T.lezioni}>
              {modulo.lezioni.map((l, i) => {
                const Icona = l.completataIl ? CircleCheck : ICONA_LEZIONE[l.tipo]
                const corrente = l.id === lezione?.id
                return (
                  <li key={l.id}>
                    <VaiA
                      a={{ scheda: 'aula', modulo: modulo.id, lezione: l.id }}
                      corrente={corrente}
                      testId="lezione-elenco"
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                        corrente ? 'bg-selezione font-medium' : 'hover:bg-accent',
                      )}
                    >
                      <span className="num w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                      <Icona
                        className={cn('size-4 shrink-0', l.completataIl ? 'text-status-ok' : 'text-muted-foreground')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 break-words">{l.titolo}</span>
                      {l.completataIl ? <span className="sr-only">{T.lezioneFatta}</span> : null}
                    </VaiA>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {lezione ? (
          <Lezione
            key={lezione.id}
            lezione={lezione}
            nome={nome}
            anteprima={anteprima}
            dopo={dopo ? { modulo: modulo.id, lezione: dopo.id } : null}
          />
        ) : null}
      </div>
    </div>
  )
}

function Lezione({
  lezione,
  nome,
  anteprima,
  dopo,
}: {
  lezione: LezioneAula
  nome: string
  anteprima: boolean
  dopo: { modulo: string; lezione: string } | null
}) {
  const backend = useBackendPercorso()
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  const [fatta, setFatta] = useState<string | null>(lezione.completataIl)
  const Icona = ICONA_LEZIONE[lezione.tipo]

  function completa() {
    avvia(async () => {
      try {
        const esito = await backend.completaLezione({ lezione: lezione.id })
        if (!esito.ok) {
          toast.error(esito.errore)
          return
        }
        setFatta(esito.completataIl ?? new Date().toISOString())
        toast.success(T.lezioneCompletata)
      } catch {
        toast.error(T.errore)
      }
    })
  }

  return (
    <article className="vetro space-y-5 rounded-2xl p-5 sm:p-6" aria-labelledby="titolo-lezione" data-testid="lezione">
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Icona className="size-3.5" aria-hidden="true" />
          {T.tipoLezione[lezione.tipo]}
          {lezione.obbligatoria ? <span>· {T.lezioneObbligatoria}</span> : null}
        </p>
        <h3 id="titolo-lezione" className="font-heading text-2xl font-semibold tracking-tight">
          {lezione.titolo}
        </h3>
      </div>

      {lezione.tipo === 'video' && lezione.youtubeId ? (
        <div className="space-y-2">
          <PlayerYoutube
            lezioneId={lezione.id}
            youtubeId={lezione.youtubeId}
            titolo={lezione.titolo}
            percentualeIniziale={lezione.percentuale}
            vistoIniziale={Boolean(lezione.completataIl)}
            registra={!anteprima}
            onVisto={() => {
              setFatta(new Date().toISOString())
              router.refresh()
            }}
          />
          {!fatta ? <p className="text-sm text-muted-foreground">{T.videoAl90}</p> : null}
        </div>
      ) : null}

      {lezione.corpo ? <MarkdownCliente testo={lezione.corpo} nome={nome} /> : null}

      {(lezione.tipo === 'pdf' || lezione.tipo === 'link') && lezione.url ? (
        <a
          href={lezione.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          {lezione.tipo === 'pdf' ? T.apriPdf : T.apriLink}
          <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {fatta ? (
          <p className="flex items-center gap-2 text-sm font-medium text-status-ok" data-testid="lezione-fatta">
            <CircleCheck className="size-4" aria-hidden="true" />
            {T.completataIl(formatData(oggiRoma(new Date(fatta))))}
          </p>
        ) : lezione.tipo !== 'video' && !anteprima ? (
          <Button type="button" className="h-11 gap-2" onClick={completa} disabled={inCorso} data-testid="segna-completata">
            {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
            {T.segnaCompletata}
          </Button>
        ) : (
          <span />
        )}
        {dopo ? (
          <VaiA
            a={{ scheda: 'aula', modulo: dopo.modulo, lezione: dopo.lezione }}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent"
          >
            {T.lezioneSuccessiva}
          </VaiA>
        ) : null}
      </div>
    </article>
  )
}
