import {
  BookOpen,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Download,
  FolderKanban,
  History,
  KeyRound,
  LayoutList,
  Lock,
  MessagesSquare,
  Package,
  Percent,
  Rocket,
  TriangleAlert,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { VoceNovita } from '@/components/changelog/voce-novita'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { IMPOSTAZIONI } from '@/lib/i18n/testi/impostazioni'
import { leggiStatoImpostazioni, type StatoImpostazioni } from '@/lib/impostazioni/stato'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Testi = (typeof IMPOSTAZIONI)['it']
type Tono = 'ok' | 'attenzione' | 'neutro'
type Stato = { testo: string; tono: Tono } | null

type Voce = {
  href: string
  chiave: keyof Testi['sezioni']
  Icona: LucideIcon
  /** A short state next to the item, from the page's reads; null when there is nothing to say. */
  stato?: (s: StatoImpostazioni, t: Testi['stato']) => Stato
}

/**
 * The settings by what Dany wants to do (1.87.0, Dany 25/11/2026: «organizzale meglio, devono
 * essere super chiare e semplici da gestire… a sezioni»): the client journey first (what he works
 * on now), then the people and what is sold, the outside apps, the projects, the data. Every item
 * says in one line what it changes, and a state where one helps. The addresses are the same.
 */
const GRUPPI: { gruppo: keyof Testi['gruppi']; voci: Voce[] }[] = [
  {
    gruppo: 'percorso',
    voci: [
      {
        href: '/settings/onboarding',
        chiave: 'onboarding',
        Icona: Rocket,
        stato: (s, t) =>
          s.areaAperta === null ? null : s.areaAperta ? { testo: t.aperta, tono: 'ok' } : { testo: t.chiusa, tono: 'neutro' },
      },
      {
        href: '/settings/onboarding/contenuti',
        chiave: 'contenuti',
        Icona: LayoutList,
        stato: (s, t) =>
          s.contenutiDaCompletare ? { testo: t.daCompletare(s.contenutiDaCompletare), tono: 'attenzione' } : null,
      },
      { href: '/settings/onboarding/questionario', chiave: 'questionario', Icona: ClipboardList },
      { href: '/settings/onboarding/aula', chiave: 'aula', Icona: BookOpen },
    ],
  },
  {
    gruppo: 'team',
    voci: [
      { href: '/settings/team', chiave: 'team', Icona: Users },
      { href: '/settings/products', chiave: 'products', Icona: Package },
      { href: '/settings/commissions', chiave: 'commissions', Icona: Percent },
    ],
  },
  {
    gruppo: 'collegamenti',
    voci: [
      {
        href: '/settings/chiavi',
        chiave: 'chiavi',
        Icona: KeyRound,
        stato: (s, t) =>
          s.collegamentiDaSistemare > 0 ? { testo: t.problemi(s.collegamentiDaSistemare), tono: 'attenzione' } : null,
      },
      { href: '/settings/instagram', chiave: 'instagram', Icona: MessagesSquare },
      { href: '/settings/fathom', chiave: 'fathom', Icona: Video },
    ],
  },
  {
    gruppo: 'progetti',
    voci: [{ href: '/settings/progetti', chiave: 'progetti', Icona: FolderKanban }],
  },
  {
    gruppo: 'dati',
    voci: [
      { href: '/settings/export', chiave: 'export', Icona: Download },
      { href: '/settings/audit', chiave: 'audit', Icona: History },
    ],
  },
]

/** The id stays the Italian one: links and tests do not change with the language. */
function idGruppo(gruppo: keyof Testi['gruppi']): string {
  return `gruppo-${IMPOSTAZIONI.it.gruppi[gruppo].toLowerCase().replaceAll(' ', '-')}`
}

function Pillola({ testo, tono }: { testo: string; tono: Tono }) {
  const Icona = tono === 'ok' ? CircleCheck : tono === 'attenzione' ? TriangleAlert : Lock
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tono === 'ok' && 'bg-status-ok/12 text-status-ok',
        tono === 'attenzione' && 'bg-status-warning/14 text-status-warning',
        tono === 'neutro' && 'bg-muted text-muted-foreground',
      )}
    >
      <Icona className="size-3" aria-hidden="true" />
      {testo}
    </span>
  )
}

export default async function ImpostazioniPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = IMPOSTAZIONI[lingua]
  const supabase = await createClient()
  const stato = await leggiStatoImpostazioni(supabase, lingua)

  return (
    <div className="max-w-5xl space-y-6">
      <IntestazionePagina titolo={t.titolo} descrizione={t.descrizione} />

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        {/* the index of the sections, from a laptop up: one tap to the right group */}
        <nav aria-label={t.titolo} className="hidden lg:block">
          <ul className="sticky top-[calc(var(--altezza-topbar,3.5rem)+1rem)] space-y-0.5">
            {GRUPPI.map(({ gruppo }) => (
              <li key={gruppo}>
                <a
                  href={`#${idGruppo(gruppo)}`}
                  className="flex min-h-10 items-center rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {t.gruppi[gruppo]}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-8">
          {stato.daSistemare.length > 0 ? (
            <section
              aria-labelledby="da-sistemare"
              data-testid="da-sistemare"
              className="rounded-xl border border-status-warning/40 bg-status-warning/8 p-4"
            >
              <h2 id="da-sistemare" className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4 text-status-warning" aria-hidden="true" />
                {t.stato.daSistemare}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t.stato.daSistemareAiuto}</p>
              <ul className="mt-3 divide-y divide-border/60">
                {stato.daSistemare.map(({ testo, href }) => (
                  <li key={testo}>
                    <Link
                      href={href}
                      className="flex min-h-11 items-center gap-3 py-2 text-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">{testo}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {GRUPPI.map(({ gruppo, voci }) => {
            const id = idGruppo(gruppo)
            return (
              <section key={gruppo} aria-labelledby={id} className="scroll-mt-24 space-y-2">
                <div>
                  <h2 id={id} className="font-heading text-base font-semibold">
                    {t.gruppi[gruppo]}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t.gruppiAiuto[gruppo]}</p>
                </div>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
                  {voci.map(({ href, chiave, Icona, stato: leggi }) => {
                    const [nome, descrizione] = t.sezioni[chiave]
                    const s = leggi?.(stato, t.stato) ?? null
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          data-testid={`voce-${chiave}`}
                          className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                            <Icona className="size-4.5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium">{nome}</span>
                              {s ? <Pillola testo={s.testo} tono={s.tono} /> : null}
                            </span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">{descrizione}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}

          {/* the app itself: which version is live and what changed (CLAUDE.md section 23) */}
          <section aria-label={t.stato.app}>
            <VoceNovita testId="voce-changelog" descrizione={t.changelog} />
          </section>
        </div>
      </div>
    </div>
  )
}
