import { CalendarClock, CircleCheck, CircleDashed, CircleDot, Eye, ListChecks, Timer, UserX } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { BarraAvanzamento, InRitardo } from '@/components/pm/stato-progetto'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { PROGETTI } from '@/lib/i18n/testi/progetti'
import { elencoNomi, isUuid, nomiAssegnatari } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { formatDurata } from '@/lib/tempo'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type RigaTask = {
  id: string | null
  titolo: string | null
  scadenza: string | null
  assegnatari: string[] | null
}

/**
 * "Panoramica": the project at a glance, like a Zoho project dashboard.
 * Counts and time come from SQL (pm_panoramica_progetto, v_pm_tasklist);
 * this page only lays them out. Details and changes live in "Attività".
 */
export default async function PanoramicaProgettoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // the layout already says "not found": nothing to add here
  if (!isUuid(id)) return null
  const supabase = await createClient()
  const oggi = oggiRoma()
  const lingua = await getLingua()
  const t = PROGETTI[lingua].panoramica
  const { formatData } = formato(lingua)

  const [progetto, numeri, liste, ritardi, prossime, membri] = await Promise.all([
    supabase.from('v_pm_progetti').select('id, data_fine, task_totali, task_completati, avanzamento').eq('id', id).maybeSingle(),
    supabase.rpc('pm_panoramica_progetto', { p_progetto: id }).single(),
    supabase
      .from('v_pm_tasklist')
      .select('id, nome, data_inizio, data_fine, task_totali, task_completati, task_in_ritardo, avanzamento')
      .eq('progetto_id', id)
      .order('ordine')
      .order('created_at'),
    supabase
      .from('v_pm_task')
      .select('id, titolo, scadenza, assegnatari')
      .eq('progetto_id', id)
      .eq('in_ritardo', true)
      .order('scadenza')
      .limit(6),
    supabase
      .from('v_pm_task')
      .select('id, titolo, scadenza, assegnatari')
      .eq('progetto_id', id)
      .neq('stato', 'completato')
      .gte('scadenza', oggi)
      .lte('scadenza', aggiungiGiorni(oggi, 14))
      .order('scadenza')
      .limit(6),
    supabase.from('pm_membri').select('profilo:profiles!pm_membri_profile_id_fkey(id, nome)').eq('progetto_id', id),
  ])
  if (progetto.error || numeri.error || liste.error || ritardi.error || prossime.error || membri.error) {
    throw new Error(t.errore)
  }
  if (!progetto.data) return null

  const p = progetto.data
  const n = numeri.data
  const nomi = new Map((membri.data ?? []).flatMap((m) => (m.profilo ? [[m.profilo.id, m.profilo.nome] as const] : [])))
  const attivita = `/progetti/${id}/attivita`

  if ((p.task_totali ?? 0) === 0) {
    return (
      <StatoVuoto
        Icona={ListChecks}
        titolo={t.vuoto}
        descrizione={t.vuotoDescrizione}
        azione={<LinkBottone href={attivita}>{t.vaiAttivita}</LinkBottone>}
      />
    )
  }

  const giorniAllaFine = p.data_fine ? giorniTra(oggi, p.data_fine) : null
  const stati = [
    { etichetta: t.statiTask.da_fare, valore: n.da_fare, Icona: CircleDashed },
    { etichetta: t.statiTask.in_corso, valore: n.in_corso, Icona: CircleDot },
    { etichetta: t.statiTask.in_revisione, valore: n.in_revisione, Icona: Eye },
    { etichetta: t.statiTask.completato, valore: n.completati, Icona: CircleCheck },
  ]
  const massimo = Math.max(1, ...stati.map((s) => s.valore))

  return (
    <div className="space-y-5" data-testid="panoramica-progetto">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tessera etichetta={t.avanzamento}>
          <span className="num text-2xl font-semibold">{Math.round((p.avanzamento ?? 0) * 100)}%</span>
          <span className="num block text-xs text-muted-foreground">
            {t.taskDi(p.task_completati, p.task_totali)}
          </span>
        </Tessera>
        <Tessera etichetta={t.inRitardo}>
          <span className={cn('num text-2xl font-semibold', n.in_ritardo > 0 && 'text-status-warning')}>{n.in_ritardo}</span>
          <span className="block text-xs text-muted-foreground">
            {n.in_ritardo > 0 ? <InRitardo testo={t.oltreScadenza} /> : t.nessunoOltre}
          </span>
        </Tessera>
        <Tessera etichetta={t.tempoSpeso}>
          <span className="num text-2xl font-semibold">{formatDurata(n.minuti_totali)}</span>
          <span className="num block text-xs text-muted-foreground">{t.ultimi7(formatDurata(n.minuti_ultimi_7_giorni))}</span>
        </Tessera>
        <Tessera etichetta={t.fine}>
          <span className="num text-2xl font-semibold">{p.data_fine ? formatData(p.data_fine) : '–'}</span>
          <span className="block text-xs text-muted-foreground">
            {giorniAllaFine === null
              ? t.senzaFine
              : giorniAllaFine < 0
                ? t.finitoDa(-giorniAllaFine)
                : giorniAllaFine === 0
                  ? t.oggi
                  : t.tra(giorniAllaFine)}
          </span>
        </Tessera>
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Sezione id="sezione-task-per-stato" titolo={t.perStato}>
          <ul className="space-y-2.5">
            {stati.map(({ etichetta, valore, Icona }) => (
              <li key={etichetta} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icona className="size-4 shrink-0" aria-hidden="true" />
                  {etichetta}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${(valore / massimo) * 100}%` }} />
                </span>
                <span className="num text-right font-medium">{valore}</span>
              </li>
            ))}
          </ul>
          {n.senza_assegnatario > 0 ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <UserX className="size-3.5" aria-hidden="true" />
              {t.senzaAssegnatario(n.senza_assegnatario)}
            </p>
          ) : null}
        </Sezione>

        <Sezione id="sezione-tappe" titolo={t.tappe}>
          {(liste.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.nessunaLista}</p>
          ) : (
            <ul className="space-y-3">
              {(liste.data ?? []).map((l) => (
                <li key={l.id} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-medium">{l.nome}</span>
                    {l.data_inizio || l.data_fine ? (
                      <span className="num text-xs text-muted-foreground">
                        {formatData(l.data_inizio)} → {formatData(l.data_fine)}
                      </span>
                    ) : null}
                  </div>
                  <BarraAvanzamento
                    completati={l.task_completati ?? 0}
                    totali={l.task_totali ?? 0}
                    avanzamento={l.avanzamento}
                    inRitardo={l.task_in_ritardo ?? 0}
                    lingua={lingua}
                  />
                </li>
              ))}
            </ul>
          )}
        </Sezione>

        <Sezione id="sezione-prossime-scadenze-14-giorni" titolo={t.prossime} Icona={CalendarClock}>
          <ElencoTask righe={prossime.data ?? []} nomi={nomi} vuoto={t.nienteInScadenza} oggi={oggi} lingua={lingua} />
        </Sezione>

        <Sezione id="sezione-in-ritardo" titolo={t.inRitardo} Icona={Timer}>
          <ElencoTask righe={ritardi.data ?? []} nomi={nomi} vuoto={t.nessunRitardo} oggi={oggi} ritardo lingua={lingua} />
        </Sezione>
      </div>

      <p>
        <Link href={attivita} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
          {t.tutte}
        </Link>
      </p>
    </div>
  )
}

function giorniTra(da: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000)
}

function Tessera({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4">
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="mt-1 space-y-0.5">{children}</dd>
    </div>
  )
}

function Sezione({
  id,
  titolo,
  Icona,
  children,
}: {
  /** Fixed, so the heading's id does not change with the language */
  id: string
  titolo: string
  Icona?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-card p-4">
      <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-medium">
        {Icona ? <Icona className="size-4 text-muted-foreground" /> : null}
        {titolo}
      </h2>
      {children}
    </section>
  )
}

function ElencoTask({
  righe,
  nomi,
  vuoto,
  oggi,
  ritardo = false,
  lingua,
}: {
  righe: RigaTask[]
  nomi: Map<string, string>
  vuoto: string
  oggi: string
  ritardo?: boolean
  lingua: Lingua
}) {
  const t = PROGETTI[lingua].panoramica
  const { formatData } = formato(lingua)
  if (righe.length === 0) return <p className="text-sm text-muted-foreground">{vuoto}</p>
  return (
    <ul className="divide-y divide-border">
      {righe.map((r) => (
        <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate">{r.titolo}</span>
            <span className="block text-xs text-muted-foreground">
              {(r.assegnatari ?? []).length > 0
                ? elencoNomi(nomiAssegnatari(r.assegnatari, nomi)) || t.assegnato
                : t.senzaAssegnato}
            </span>
          </span>
          <span className={cn('num shrink-0 text-xs', ritardo ? 'text-status-warning' : 'text-muted-foreground')}>
            {r.scadenza === oggi ? t.oggi : formatData(r.scadenza)}
          </span>
        </li>
      ))}
    </ul>
  )
}
