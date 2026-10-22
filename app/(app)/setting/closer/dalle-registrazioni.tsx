import { Video } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { LinkNav } from '@/components/shell/link-nav'
import { LIVELLI_PERFORMANCE } from '@/lib/call/analisi/vista'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { CLOSER } from '@/lib/i18n/testi/closer'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { hrefAnalisiReel } from '@/lib/marketing/analisi/pannello'
import type { Periodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

/**
 * «Dalle call registrate» (1.37.0, CLAUDE.md section 31) in the Closer page, for the admin and the
 * closer (the setter reads the page without it): show rate, close rate, how many calls are
 * recorded, how long, the lead in target, the objections that come back and the performance
 * confirmed, by period, by the source of the lead or by the post he comes from. Every number comes
 * from SQL (call_numeri_periodo). Coverage, length and performance only on the calls of whoever
 * looks (they value who leads the call): with «Tutti i closer» or another closer they are not
 * there, and a line says so. The euros only for the admin.
 */
export type Per = 'totale' | 'fonte' | 'contenuto'

type Riga = {
  gruppo: string | null
  etichetta: string
  media_id: string | null
  call: number
  svolte: number
  no_show: number
  show_rate: number | null
  qualificate: number
  chiuse: number
  close_rate: number | null
  registrate: number | null
  copertura: number | null
  durata_media_min: number | null
  analizzate: number
  in_target_si: number
  in_target_no: number
  quota_in_target: number | null
  obiezioni: { categoria: string; quante: number }[]
  performance: Record<string, number> | null
  vendite_nuove: number | null
  revenue_nuovi: number | null
  cash_nuovi: number | null
}

export function leggiPer(valore: string | string[] | undefined): Per {
  const v = Array.isArray(valore) ? valore[0] : valore
  return v === 'fonte' || v === 'contenuto' ? v : 'totale'
}

const SCHEDE: readonly Per[] = ['totale', 'fonte', 'contenuto']

/** An objection's category in the page's language (an unknown key stays as it is). */
function categoria(lingua: Lingua, chiave: string): string {
  return (CLOSER[lingua].registrate.categorie as Record<string, string>)[chiave] ?? chiave
}

const FONTI_EN: Record<string, string> = {
  dm_inbound: 'Instagram inbound DM',
  dm_outbound: 'Instagram outbound DM',
  referral: 'Referral',
  organico: 'Organic',
  ads: 'Ads',
}

/**
 * The group's name, written by SQL in Italian (call_numeri_periodo): in English the source by its
 * key, the post's «Reel del 03/10 · Name» as «Reel of 03/10 · Name» (the Name is the team's).
 */
function nomeGruppo(r: Pick<Riga, 'gruppo' | 'etichetta'>, per: Per, lingua: Lingua): string {
  if (lingua === 'it') return r.etichetta
  if (per === 'totale') return 'All calls'
  if (per === 'fonte') return FONTI_EN[r.gruppo ?? ''] ?? 'Other'
  if (r.etichetta === 'Contenuto non riconosciuto') return 'Content not recognised'
  return r.etichetta.replace(/^(Reel|Post) del /, '$1 of ')
}

const hrefPer = (per: Per, parametri: Record<string, string | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(parametri)) if (v) q.set(k, v)
  if (per !== 'totale') q.set('per', per)
  return `/setting/closer?${q.toString()}`
}

const Numero = ({ etichetta: e, valore, nota, testId }: { etichetta: string; valore: string; nota?: string; testId?: string }) => (
  <div className="min-w-0 rounded-xl bg-card p-3" data-testid={testId}>
    <dt className="text-xs text-muted-foreground">{e}</dt>
    <dd className="num text-xl font-semibold">{valore}</dd>
    {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
  </div>
)

export async function DalleRegistrazioni({
  periodo,
  closer,
  per,
  admin,
  proprie,
  parametri,
}: {
  periodo: Periodo
  closer: string | undefined
  per: Per
  admin: boolean
  /** The rows are the calls of whoever looks: closer always, the admin on himself. */
  proprie: boolean
  parametri: Record<string, string | undefined>
}) {
  const lingua = await getLingua()
  const t = CLOSER[lingua].registrate
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('call_numeri_periodo', {
    p_da: periodo.da,
    p_a: periodo.a,
    p_per: per,
    ...(closer ? { p_closer: closer } : {}),
  })

  return (
    <section className="space-y-3" aria-labelledby="dalle-registrazioni" data-testid="dalle-registrazioni">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="dalle-registrazioni" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.titolo}
        </h2>
        <nav aria-label={t.aria}>
          <ul className="flex gap-1">
            {SCHEDE.map((s) => (
              <li key={s}>
                <LinkNav
                  href={hrefPer(s, parametri)}
                  aria-current={per === s ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-lg px-3 text-sm',
                    per === s ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.schede[s]}
                </LinkNav>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm">
          <span>{t.errore}</span>
          <LinkBottone href={hrefPer(per, parametri)} variant="outline">
            {t.riprova}
          </LinkBottone>
        </div>
      ) : (
        <Contenuto
          righe={(data ?? []) as unknown as Riga[]}
          per={per}
          admin={admin}
          proprie={proprie}
          periodoFrase={periodo.frase}
          lingua={lingua}
        />
      )}
    </section>
  )
}

function Contenuto({
  righe,
  per,
  admin,
  proprie,
  periodoFrase,
  lingua,
}: {
  righe: Riga[]
  per: Per
  admin: boolean
  proprie: boolean
  periodoFrase: string
  lingua: Lingua
}) {
  const t = CLOSER[lingua].registrate
  const { formatNumero, formatPercentuale } = formato(lingua)
  if (righe.length === 0) {
    return (
      <StatoVuoto
        Icona={Video}
        titolo={t.vuoto}
        descrizione={t.vuotoDescrizione(periodoFrase)}
        azione={
          <LinkBottone href="/calls" variant="outline">
            {t.vaiCall}
          </LinkBottone>
        }
      />
    )
  }

  const totale = righe.reduce(
    (acc, r) => ({
      svolte: acc.svolte + r.svolte,
      chiuse: acc.chiuse + r.chiuse,
      si: acc.si + r.in_target_si,
      no: acc.no + r.in_target_no,
      registrate: acc.registrate + (r.registrate ?? 0),
    }),
    { svolte: 0, chiuse: 0, si: 0, no: 0, registrate: 0 },
  )
  const obiezioni = new Map<string, number>()
  for (const r of righe) for (const o of r.obiezioni) obiezioni.set(o.categoria, (obiezioni.get(o.categoria) ?? 0) + o.quante)
  const prime = [...obiezioni.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const performance: Record<string, number> = {}
  for (const r of righe) for (const [k, n] of Object.entries(r.performance ?? {})) performance[k] = (performance[k] ?? 0) + Number(n)
  const durate = righe.filter((r) => r.durata_media_min !== null && (r.registrate ?? 0) > 0)
  const durataMedia = durate.length
    ? durate.reduce((a, r) => a + (r.durata_media_min ?? 0) * (r.registrate ?? 0), 0) / durate.reduce((a, r) => a + (r.registrate ?? 0), 0)
    : null

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {proprie ? (
          <Numero
            etichetta={t.callRegistrate}
            valore={t.suSvolte(formatNumero(totale.registrate), formatNumero(totale.svolte))}
            nota={totale.svolte > 0 ? t.delleSvolte(formatPercentuale(totale.registrate / totale.svolte)) : undefined}
            testId="reg-registrate"
          />
        ) : null}
        {proprie ? (
          <Numero
            etichetta={t.durata}
            valore={durataMedia === null ? '-' : t.minuti(formatNumero(Math.round(durataMedia)))}
            testId="reg-durata"
          />
        ) : null}
        <Numero etichetta={t.closeRate} valore={formatPercentuale(totale.svolte > 0 ? totale.chiuse / totale.svolte : null)} testId="reg-close-rate" />
        <Numero
          etichetta={t.inTarget}
          valore={formatPercentuale(totale.si + totale.no > 0 ? totale.si / (totale.si + totale.no) : null)}
          nota={t.inTargetNota}
          testId="reg-in-target"
        />
      </dl>

      {proprie ? (
        <div className="rounded-xl bg-card p-4" data-testid="reg-performance">
          <h3 className="text-sm font-medium">{t.performance}</h3>
          <ul className="mt-2 grid grid-cols-5 gap-2 text-center">
            {LIVELLI_PERFORMANCE.map((l) => (
              <li key={l} className="min-w-0">
                <p className="num text-lg font-semibold">{formatNumero(performance[l] ?? 0)}</p>
                <p className="truncate text-xs text-muted-foreground">{ETICHETTE[lingua].performance[l]}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t.senzaPerformance(formatNumero(performance.senza ?? 0))}
          </p>
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground" data-testid="reg-solo-tue">
          {t.soloTue}
        </p>
      )}

      <div className="rounded-xl bg-card p-4" data-testid="reg-obiezioni">
        <h3 className="text-sm font-medium">{t.obiezioni}</h3>
        {prime.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t.nessunaObiezione(periodoFrase.replace(/^(a|in) /, ''))}</p>
        ) : (
          <ol className="mt-2 space-y-1">
            {prime.map(([chiave, quante]) => (
              <li key={chiave} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{categoria(lingua, chiave)}</span>
                <span className="num text-muted-foreground">{formatNumero(quante)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {per !== 'totale' ? <Raggruppate righe={righe} per={per} admin={admin} lingua={lingua} /> : null}
    </div>
  )
}

function Raggruppate({ righe, per, admin, lingua }: { righe: Riga[]; per: Per; admin: boolean; lingua: Lingua }) {
  const t = CLOSER[lingua].registrate
  const { formatEuro, formatNumero, formatPercentuale } = formato(lingua)
  return (
    <div data-testid="reg-gruppi">
      <ul className="space-y-2 md:hidden">
        {righe.map((r) => (
          <li key={r.gruppo ?? 'tutte'} className="rounded-xl bg-card p-3 text-sm">
            <p className="font-medium break-words">{nomeGruppo(r, per, lingua)}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                [t.call, formatNumero(r.call)],
                [t.showRate, formatPercentuale(r.show_rate)],
                [t.chiuse, formatNumero(r.chiuse)],
                [t.closeRate, formatPercentuale(r.close_rate)],
                [t.inTarget, formatPercentuale(r.quota_in_target)],
                ...(admin
                  ? [
                      [t.cashNuovi, formatEuro(r.cash_nuovi ?? 0)],
                      [t.revenueNuovi, formatEuro(r.revenue_nuovi ?? 0)],
                    ]
                  : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
            {r.obiezioni[0] ? (
              <p className="mt-1 text-xs text-muted-foreground">{t.primaObiezioneDi(categoria(lingua, r.obiezioni[0].categoria))}</p>
            ) : null}
            {per === 'contenuto' && admin && r.media_id ? (
              <LinkBottone href={hrefAnalisiReel(r.media_id)} variant="outline" className="mt-2 w-full">
                {t.apriPubblicati}
              </LinkBottone>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{per === 'fonte' ? t.captionFonte : t.captionContenuto}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2.5 text-left font-normal">{per === 'fonte' ? t.fonte : t.contenuto}</th>
              {[t.call, t.svolte, t.showRate, t.chiuse, t.closeRate, t.inTarget, t.primaObiezione].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 text-right font-normal">{h}</th>
              ))}
              {admin ? [t.cashNuovi, t.revenueNuovi].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-right font-normal">{h}</th>) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {righe.map((r) => (
              <tr key={r.gruppo ?? 'tutte'}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {nomeGruppo(r, per, lingua)}
                  {per === 'contenuto' && admin && r.media_id ? (
                    <LinkBottone href={hrefAnalisiReel(r.media_id)} variant="ghost" className="ml-2 h-8 px-2 text-xs">
                      {t.apriPubblicati}
                    </LinkBottone>
                  ) : null}
                </th>
                <td className="num px-3 py-2 text-right">{formatNumero(r.call)}</td>
                <td className="num px-3 py-2 text-right">{formatNumero(r.svolte)}</td>
                <td className="num px-3 py-2 text-right">{formatPercentuale(r.show_rate)}</td>
                <td className="num px-3 py-2 text-right">{formatNumero(r.chiuse)}</td>
                <td className="num px-3 py-2 text-right">{formatPercentuale(r.close_rate)}</td>
                <td className="num px-3 py-2 text-right">{formatPercentuale(r.quota_in_target)}</td>
                <td className="px-3 py-2 text-right">{r.obiezioni[0] ? categoria(lingua, r.obiezioni[0].categoria) : '-'}</td>
                {admin ? (
                  <>
                    <td className="num px-3 py-2 text-right">{formatEuro(r.cash_nuovi ?? 0)}</td>
                    <td className="num px-3 py-2 text-right">{formatEuro(r.revenue_nuovi ?? 0)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {per === 'contenuto' && righe.some((r) => r.gruppo === 'non_riconosciuto') ? (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          {t.nonRiconosciuto}
        </p>
      ) : null}
    </div>
  )
}
