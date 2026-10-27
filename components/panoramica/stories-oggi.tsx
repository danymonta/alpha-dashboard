import { ChevronRight, Lightbulb, MessageCircleWarning, MessagesSquare, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { STORIES_OGGI } from '@/lib/i18n/testi/dalle-call'
import { angoloCategoria, conteggiObiezioni, nomeCategoria } from '@/lib/marketing/dalle-call'
import { createClient } from '@/lib/supabase/server'

/**
 * «Di cosa parlare oggi» on the Panoramica (Dany, 27/10/2026: «spunti MACRO che mi devono apparire in
 * panoramica così ogni giorno apro il cell e so di cosa parlare nelle stories»). Three sources the app
 * already has, never a new call to Claude: the themes of the latest Instagram DM recap (Insight), the
 * most frequent objections of the last 14 days of calls (call_numeri_periodo, counted by SQL) with
 * their topic, and the first ideas of the latest Spunti. Admin only, like the page. A source that does
 * not answer is left out; when none does, one line says so.
 */
type Tema = { theme?: string; count?: number; insight?: string }
type IdeaBrief = { gancio?: string; name?: string; perche?: string }

const MAX = 3

export async function StoriesOggi({ lingua }: { lingua: Lingua }) {
  const t = STORIES_OGGI[lingua]
  const oggi = oggiRoma()
  const supabase = await createClient()

  const [recap, numeri, spunti] = await Promise.all([
    supabase
      .from('insight_recap')
      .select('giorno, temi:dati->content->themes')
      .eq('canale', 'instagram')
      .order('giorno', { ascending: false })
      .limit(1),
    supabase.rpc('call_numeri_periodo', { p_da: aggiungiGiorni(oggi, -13), p_a: oggi, p_per: 'totale' }),
    supabase
      .from('marketing_spunti')
      .select('idee:contenuto->idee')
      .eq('stato', 'pronta')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const temi = ((recap.data?.[0]?.temi ?? []) as Tema[])
    .filter((x) => typeof x?.theme === 'string' && x.theme.trim())
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, MAX)
  const obiezioni = conteggiObiezioni(numeri.data?.[0]?.obiezioni).slice(0, MAX)
  const idee = ((spunti.data?.[0]?.idee ?? []) as IdeaBrief[])
    .filter((x) => (x?.gancio ?? x?.name ?? '').trim())
    .slice(0, 2)
  const tuttiFalliti = Boolean(recap.error && numeri.error && spunti.error)
  const vuoto = !temi.length && !obiezioni.length && !idee.length

  return (
    <section className="rounded-xl border-l-4 border-primary bg-card p-4" aria-labelledby="titolo-stories" data-testid="stories-oggi">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="titolo-stories" className="text-sm font-medium">{t.titolo}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.descrizione}</p>
        </div>
      </div>

      {tuttiFalliti ? (
        <p className="text-sm text-muted-foreground">{t.nonCaricati}</p>
      ) : vuoto ? (
        <p className="text-sm text-muted-foreground">{t.vuoto}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {temi.length ? (
            <Colonna Icona={MessagesSquare} titolo={t.dalleChat} link={{ href: '/insight', testo: t.apriInsight }}>
              {temi.map((x) => (
                <li key={x.theme} lang="it">
                  <span className="font-medium">{x.theme}</span>
                  {x.count ? <span className="num text-muted-foreground"> · {t.temaDm(x.count)}</span> : null}
                  {x.insight ? <span className="block text-xs text-muted-foreground">{x.insight}</span> : null}
                </li>
              ))}
            </Colonna>
          ) : null}
          {obiezioni.length ? (
            <Colonna Icona={MessageCircleWarning} titolo={t.dalleCall} link={{ href: '/marketing/dalle-call', testo: t.tuttiTopic }}>
              {obiezioni.map((o) => (
                <li key={o.categoria}>
                  <span className="font-medium">{nomeCategoria(o.categoria, lingua)}</span>
                  <span className="num text-muted-foreground"> · {t.obiezioneCall(o.quante)}</span>
                  <span className="block text-xs text-muted-foreground">{angoloCategoria(o.categoria, lingua)}</span>
                </li>
              ))}
            </Colonna>
          ) : null}
          {idee.length ? (
            <Colonna Icona={Lightbulb} titolo={t.dagliSpunti} link={{ href: '/marketing/spunti', testo: t.apriSpunti }}>
              {idee.map((i, n) => (
                <li key={n} lang="it">
                  <span className="font-medium">{i.gancio || i.name}</span>
                  {i.perche ? <span className="block text-xs text-muted-foreground">{i.perche}</span> : null}
                </li>
              ))}
            </Colonna>
          ) : null}
        </div>
      )}
    </section>
  )
}

function Colonna({
  Icona,
  titolo,
  link,
  children,
}: {
  Icona: typeof Lightbulb
  titolo: string
  link: { href: string; testo: string }
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icona className="size-3.5 shrink-0" aria-hidden="true" />
        {titolo}
      </p>
      <ul className="space-y-2 text-sm break-words">{children}</ul>
      <Link href={link.href} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        {link.testo} <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

export function ScheletroStoriesOggi() {
  return <div className="h-40 animate-pulse rounded-xl bg-card" aria-hidden="true" />
}
