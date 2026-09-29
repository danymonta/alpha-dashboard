import { CalendarClock, CircleCheck, CircleDashed, CircleDot, Eye, ListChecks, Timer, UserX } from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { BarraAvanzamento, InRitardo } from '@/components/pm/stato-progetto'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
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
    throw new Error('Impossibile caricare la panoramica del progetto')
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
        titolo="Nessun task ancora"
        descrizione="Quando il progetto ha liste e task, qui trovi avanzamento, scadenze e tempo speso."
        azione={<LinkBottone href={attivita}>Vai alle attività</LinkBottone>}
      />
    )
  }

  const giorniAllaFine = p.data_fine ? giorniTra(oggi, p.data_fine) : null
  const stati = [
    { etichetta: 'Da fare', valore: n.da_fare, Icona: CircleDashed },
    { etichetta: 'In corso', valore: n.in_corso, Icona: CircleDot },
    { etichetta: 'In revisione', valore: n.in_revisione, Icona: Eye },
    { etichetta: 'Fatti', valore: n.completati, Icona: CircleCheck },
  ]
  const massimo = Math.max(1, ...stati.map((s) => s.valore))

  return (
    <div className="space-y-5" data-testid="panoramica-progetto">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tessera etichetta="Avanzamento">
          <span className="num text-2xl font-semibold">{Math.round((p.avanzamento ?? 0) * 100)}%</span>
          <span className="num block text-xs text-muted-foreground">
            {p.task_completati} di {p.task_totali} task
          </span>
        </Tessera>
        <Tessera etichetta="In ritardo">
          <span className={cn('num text-2xl font-semibold', n.in_ritardo > 0 && 'text-status-warning')}>{n.in_ritardo}</span>
          <span className="block text-xs text-muted-foreground">
            {n.in_ritardo > 0 ? <InRitardo testo="task oltre la scadenza" /> : 'nessun task oltre la scadenza'}
          </span>
        </Tessera>
        <Tessera etichetta="Tempo speso">
          <span className="num text-2xl font-semibold">{formatDurata(n.minuti_totali)}</span>
          <span className="num block text-xs text-muted-foreground">{formatDurata(n.minuti_ultimi_7_giorni)} negli ultimi 7 giorni</span>
        </Tessera>
        <Tessera etichetta="Fine">
          <span className="num text-2xl font-semibold">{p.data_fine ? formatData(p.data_fine) : '–'}</span>
          <span className="block text-xs text-muted-foreground">
            {giorniAllaFine === null
              ? 'senza data di fine'
              : giorniAllaFine < 0
                ? `finito da ${-giorniAllaFine} ${-giorniAllaFine === 1 ? 'giorno' : 'giorni'}`
                : giorniAllaFine === 0
                  ? 'oggi'
                  : `tra ${giorniAllaFine} ${giorniAllaFine === 1 ? 'giorno' : 'giorni'}`}
          </span>
        </Tessera>
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Sezione titolo="Task per stato">
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
              {n.senza_assegnatario === 1 ? '1 task aperto senza assegnatario' : `${n.senza_assegnatario} task aperti senza assegnatario`}
            </p>
          ) : null}
        </Sezione>

        <Sezione titolo="Tappe">
          {(liste.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna lista: i task sono tutti insieme.</p>
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
                  />
                </li>
              ))}
            </ul>
          )}
        </Sezione>

        <Sezione titolo="Prossime scadenze · 14 giorni" Icona={CalendarClock}>
          <ElencoTask righe={prossime.data ?? []} nomi={nomi} vuoto="Niente in scadenza nelle prossime due settimane." oggi={oggi} />
        </Sezione>

        <Sezione titolo="In ritardo" Icona={Timer}>
          <ElencoTask righe={ritardi.data ?? []} nomi={nomi} vuoto="Nessun task in ritardo." oggi={oggi} ritardo />
        </Sezione>
      </div>

      <p>
        <Link href={attivita} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
          Tutte le attività del progetto
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
  titolo,
  Icona,
  children,
}: {
  titolo: string
  Icona?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const id = `sezione-${titolo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
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
}: {
  righe: RigaTask[]
  nomi: Map<string, string>
  vuoto: string
  oggi: string
  ritardo?: boolean
}) {
  if (righe.length === 0) return <p className="text-sm text-muted-foreground">{vuoto}</p>
  return (
    <ul className="divide-y divide-border">
      {righe.map((t) => (
        <li key={t.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate">{t.titolo}</span>
            <span className="block text-xs text-muted-foreground">
              {(t.assegnatari ?? []).length > 0
                ? elencoNomi(nomiAssegnatari(t.assegnatari, nomi)) || 'Assegnato'
                : 'Senza assegnatario'}
            </span>
          </span>
          <span className={cn('num shrink-0 text-xs', ritardo ? 'text-status-warning' : 'text-muted-foreground')}>
            {t.scadenza === oggi ? 'oggi' : formatData(t.scadenza)}
          </span>
        </li>
      ))}
    </ul>
  )
}
