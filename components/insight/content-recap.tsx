import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { NelCalendario, type ContenutoCalendario } from '@/components/insight/arriva-da'
import { Pillola } from '@/components/insight/pillola'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { INSIGHT_RECAP } from '@/lib/i18n/testi/insight-recap'
import { linkPost } from '@/lib/insight/link'
import type { ContentRecap, PostRecap, TemaRecap } from '@/lib/insight/recap'
import { tendenza, tonoVerdetto, type Tendenza, type Tono } from '@/lib/insight/toni'
import { cn } from '@/lib/utils'

const ICONA_TENDENZA: Record<Tendenza, { Icona: LucideIcon; classe: string }> = {
  su: { Icona: TrendingUp, classe: 'text-status-ok' },
  giu: { Icona: TrendingDown, classe: 'text-rosso-testo' },
  stabile: { Icona: Minus, classe: 'text-muted-foreground' },
}

const ICONA_VERDETTO: Record<Tono, LucideIcon | undefined> = {
  ok: TrendingUp,
  critico: TrendingDown,
  attenzione: Minus,
  neutro: undefined,
}

type Testi = (typeof INSIGHT_RECAP)['it']
type Content = Testi['content']

function numeratore(lingua: Lingua) {
  const nd = INSIGHT_RECAP[lingua].content.nd
  const { formatNumero } = formato(lingua)
  return (v: number | null | undefined) => (v === null || v === undefined ? nd : formatNumero(v))
}

const TH = 'px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase'
const TH_NUM = `${TH} text-right`
const TD = 'px-3 py-2.5 align-top'
const TD_NUM = `${TD} num text-right`
// the post's title is a 44 px link with its text in the middle: the numbers and the verdict on its line
const TD_NUM_POST = 'px-3 pb-2.5 pt-[1.375rem] align-top num text-right'
const TD_VERDETTO_POST = 'px-3 pb-2.5 pt-5 align-top'

/**
 * «Content», as the artifact: the themes of the DMs, the published posts with
 * their numbers and their leads (plus «Call», 1.35.0), keep / change / boost,
 * what works in the DMs and the content ideas. Tables when the section is wide
 * enough for their columns, cards below (a container query on the section,
 * never the screen's width beside the sidebar; CLAUDE.md section 11). For the admin a post linked to the calendar
 * says «Nel calendario: …» under its hook.
 */
export function ContentRecapSezione({
  content,
  calendario,
  lingua = 'it',
}: {
  content: ContentRecap
  /** admin only: shortcode → calendar content */
  calendario: Record<string, ContenutoCalendario>
  lingua?: Lingua
}) {
  const t = INSIGHT_RECAP[lingua]
  const CONTENT = t.content
  const numero = numeratore(lingua)
  const contenutoDi = (p: PostRecap) => (p.shortcode ? calendario[p.shortcode] : undefined) ?? null
  return (
    <section aria-labelledby="titolo-content" className="@container grid gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="titolo-content" className="text-lg font-semibold">
          {CONTENT.titolo}
        </h2>
        <span className="num text-xs text-muted-foreground">{t.periodoContent(content.period, content.based_on)}</span>
      </div>

      {content.themes.length ? <Temi temi={content.themes} CONTENT={CONTENT} numero={numero} /> : null}
      {content.posts.length ? <Post post={content.posts} contenutoDi={contenutoDi} CONTENT={CONTENT} numero={numero} t={t} lingua={lingua} /> : null}
      {content.storie && content.storie.dm > 0 ? (
        <p className="num text-sm text-muted-foreground">{t.rigaStorie(content.storie.dm, content.storie.target)}</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Riquadro titolo={CONTENT.mantieni}>
          <Elenco voci={content.keep} niente={CONTENT.niente} />
        </Riquadro>
        <Riquadro titolo={CONTENT.cambia}>
          <Elenco voci={content.change} niente={CONTENT.niente} />
        </Riquadro>
        <Riquadro titolo={CONTENT.potenzia}>
          <Elenco voci={content.boost} niente={CONTENT.niente} />
        </Riquadro>
      </div>
      {content.setting_tips.length ? (
        <Riquadro titolo={CONTENT.neiDm}>
          <Elenco voci={content.setting_tips} niente={CONTENT.niente} />
        </Riquadro>
      ) : null}
      {content.ideas.length ? (
        <Riquadro titolo={CONTENT.idee}>
          <div className="grid">
            {content.ideas.map((idea, i) => (
              <div key={i} className="grid gap-0.5 border-t border-border py-2 first:border-t-0 first:pt-0">
                <p lang="it" className="font-semibold [overflow-wrap:anywhere]">{idea.hook}</p>
                <p lang="it" className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {[idea.format, idea.why].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </Riquadro>
      ) : null}
    </section>
  )
}

function Riquadro({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-2 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold tracking-wide uppercase">{titolo}</h3>
      {children}
    </div>
  )
}

function Elenco({ voci, niente }: { voci: readonly string[]; niente: string }) {
  if (!voci.length) return <p className="text-sm text-muted-foreground">{niente}</p>
  return (
    <ul lang="it" className="list-disc space-y-1.5 pl-5 text-sm">
      {voci.map((v, i) => (
        <li key={i} className="[overflow-wrap:anywhere]">
          {v}
        </li>
      ))}
    </ul>
  )
}

function Tendenza({ trend }: { trend: string }) {
  if (!trend) return null
  const { Icona, classe } = ICONA_TENDENZA[tendenza(trend)]
  return (
    <span className="num inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icona className={cn('size-3.5 shrink-0', classe)} aria-hidden="true" />
      {trend}
    </span>
  )
}

function Temi({
  temi,
  CONTENT,
  numero,
}: {
  temi: readonly TemaRecap[]
  CONTENT: Content
  numero: (v: number | null | undefined) => string
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card @2xl:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th scope="col" className={TH}>
                {CONTENT.tema}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.chat}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.inTarget}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.call}
              </th>
              <th scope="col" className={TH}>
                {CONTENT.cosaCiDice}
              </th>
            </tr>
          </thead>
          <tbody>
            {temi.map((t, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className={TD}>
                  <div className="grid gap-0.5">
                    <span lang="it" className="font-semibold [overflow-wrap:anywhere]">{t.theme}</span>
                    <Tendenza trend={t.trend} />
                  </div>
                </td>
                <td className={TD_NUM}>{numero(t.count)}</td>
                <td className={TD_NUM}>{numero(t.target_count)}</td>
                <td className={TD_NUM}>{numero(t.calls)}</td>
                <td lang="it" className={cn(TD, '[overflow-wrap:anywhere]')}>{t.insight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 @2xl:hidden">
        {temi.map((t, i) => (
          <li key={i} className="grid gap-1 rounded-xl border border-border bg-card p-3 text-sm">
            <span lang="it" className="font-semibold [overflow-wrap:anywhere]">{t.theme}</span>
            <Tendenza trend={t.trend} />
            <span className="num text-xs text-muted-foreground">
              {CONTENT.chat} {numero(t.count)} · {CONTENT.inTarget} {numero(t.target_count)} · {CONTENT.call} {numero(t.calls)}
            </span>
            {t.insight ? <p lang="it" className="[overflow-wrap:anywhere]">{t.insight}</p> : null}
          </li>
        ))}
      </ul>
    </>
  )
}

function Verdetto({ verdetto, nd }: { verdetto: string | null; nd: string }) {
  const tono = tonoVerdetto(verdetto)
  return (
    <Pillola tono={tono} Icona={ICONA_VERDETTO[tono]}>
      {verdetto || nd}
    </Pillola>
  )
}

function TitoloPost({
  post,
  contenuto,
  t,
  lingua,
}: {
  post: PostRecap
  contenuto: ContenutoCalendario | null
  t: Testi
  lingua: Lingua
}) {
  const link = linkPost(post.permalink, post.shortcode)
  const hook = post.hook || t.content.contenutoPredefinito
  return (
    <div className="grid min-w-0 gap-0.5">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-semibold underline decoration-border underline-offset-4 [overflow-wrap:anywhere] hover:decoration-foreground"
        >
          {hook}
          <span className="sr-only">{t.instagramNuovaScheda}</span>
        </a>
      ) : (
        <span className="inline-flex min-h-11 items-center font-semibold [overflow-wrap:anywhere]">{hook}</span>
      )}
      <span className="num text-xs text-muted-foreground">{[post.type, post.date].filter(Boolean).join(' · ')}</span>
      {post.why ? <span lang="it" className="text-[13px] [overflow-wrap:anywhere]">{post.why}</span> : null}
      {contenuto ? <NelCalendario contenuto={contenuto} lingua={lingua} /> : null}
    </div>
  )
}

function Post({
  post,
  contenutoDi,
  CONTENT,
  numero,
  t,
  lingua,
}: {
  post: readonly PostRecap[]
  contenutoDi: (p: PostRecap) => ContenutoCalendario | null
  CONTENT: Content
  numero: (v: number | null | undefined) => string
  t: Testi
  lingua: Lingua
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card @3xl:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th scope="col" className={TH}>
                {CONTENT.contenuto}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.views}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.salvati}
              </th>
              <th scope="col" className={TH_NUM}>
                <abbr title={CONTENT.condivisioni} className="no-underline">
                  {CONTENT.condivisioniBreve}
                </abbr>
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.dm}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.inTarget}
              </th>
              <th scope="col" className={TH_NUM}>
                {CONTENT.call}
              </th>
              <th scope="col" className={TH}>
                {CONTENT.verdetto}
              </th>
            </tr>
          </thead>
          <tbody>
            {post.map((p, i) => (
              <tr key={p.shortcode ?? i} className="border-b border-border last:border-b-0">
                <td className={cn(TD, 'max-w-[22rem]')}>
                  <TitoloPost post={p} contenuto={contenutoDi(p)} t={t} lingua={lingua} />
                </td>
                <td className={TD_NUM_POST}>{numero(p.views)}</td>
                <td className={TD_NUM_POST}>{numero(p.saved)}</td>
                <td className={TD_NUM_POST}>{numero(p.shares)}</td>
                <td className={TD_NUM_POST}>{numero(p.dm)}</td>
                <td className={TD_NUM_POST}>{numero(p.target)}</td>
                <td className={TD_NUM_POST}>{numero(p.call)}</td>
                <td className={TD_VERDETTO_POST}>
                  <Verdetto verdetto={p.verdict} nd={CONTENT.nd} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 @3xl:hidden">
        {post.map((p, i) => (
          <li key={p.shortcode ?? i} className="grid gap-2 rounded-xl border border-border bg-card p-3 text-sm">
            <TitoloPost post={p} contenuto={contenutoDi(p)} t={t} lingua={lingua} />
            <dl className="grid grid-cols-3 gap-2">
              {(
                [
                  [CONTENT.views, p.views],
                  [CONTENT.salvati, p.saved],
                  [CONTENT.condivisioniBreve, p.shares],
                  [CONTENT.dm, p.dm],
                  [CONTENT.inTarget, p.target],
                  [CONTENT.call, p.call],
                ] as const
              ).map(([etichetta, valore]) => (
                <div key={etichetta} className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">{etichetta}</dt>
                  <dd className="num">{numero(valore)}</dd>
                </div>
              ))}
            </dl>
            <div>
              <Verdetto verdetto={p.verdict} nd={CONTENT.nd} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
