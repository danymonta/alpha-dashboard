'use client'

import { CircleCheck, ListChecks } from 'lucide-react'
import { startTransition, useEffect, useOptimistic, useRef, useState } from 'react'
import { toast } from 'sonner'

import { completaTask } from '@/app/(app)/progetti/[id]/actions'
import { aggiornaTaskRapido } from '@/app/(app)/task/actions'
import { useFormato, useLingua } from '@/components/i18n/lingua-provider'
import { BachecaMieiTask, type Ritocco } from '@/components/pm/miei-task/bacheca-miei-task'
import type { ProgettoMio } from '@/components/pm/miei-task/nuovo-mio-task'
import { LinkBottone } from '@/components/link-bottone'
import { RigaCompletato } from '@/components/pm/miei-task/riga-completato'
import { RigaMioTask } from '@/components/pm/miei-task/riga-mio-task'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import {
  COMPLETATI_RECENTI,
  colonneBacheca,
  completatiDaMostrare,
  gruppoDi,
  raggruppa,
  righeAperte,
  scordaRiaperti,
  type MioTask,
  type ChiaveGruppo,
  type MioTaskCompletato,
  type Tocco,
  type VistaTask,
} from '@/lib/miei-task'
import type { Lingua } from '@/lib/i18n/lingua'
import { BACHECA_TASK, MIEI_TASK, traduciErroreTask } from '@/lib/i18n/testi/task'

type Props = {
  aperti: MioTask[]
  /** The most recent completed tasks, or all of them with `tutti`. */
  completati: MioTaskCompletato[]
  /** How many completed tasks I have: counted by the database. */
  totaleCompletati: number
  tutti: boolean
  /** Today in Europe/Rome, from the server. */
  oggi: string
  /** Board (1.75.0, the default) or the list of groups. */
  vista?: VistaTask
  /** The projects I am a member of, for «Aggiungi un task» on the board. */
  progetti?: ProgettoMio[]
}

/** Sonner draws its buttons 24px high: Annulla gets the 44px target. */
const AZIONE_TOAST = 'h-11! px-4! text-sm!'

const TITOLO_GRUPPO = 'mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase'

async function salva(id: string, completato: boolean, lingua: Lingua) {
  const t = MIEI_TASK[lingua]
  try {
    const esito = await completaTask({ id, completato })
    return esito.ok ? esito : { ok: false as const, errore: traduciErroreTask(esito.errore, lingua) }
  } catch {
    return { ok: false as const, errore: t.connessione }
  }
}

/**
 * The page's list: my open tasks by due date, then "Completati". A task
 * ticked here stays in its place, struck through, until I leave the page;
 * "Riapri" sends a completed one back to its group. Every change is said to
 * screen readers in a polite live region, and the focus stays on the task.
 */
export function ElencoMieiTask({ aperti, completati, totaleCompletati, tutti, oggi, vista = 'elenco', progetti = [] }: Props) {
  const lingua = useLingua()
  const t = MIEI_TASK[lingua]
  const tb = BACHECA_TASK[lingua]
  const { formatData } = useFormato()
  // a card moved or retagged on the board: shown at once, the server's answer redraws the page
  const [ritocchi, ritoccaSubito] = useOptimistic<ReadonlyMap<string, Ritocco>, { id: string; ritocco: Ritocco }>(
    new Map(),
    (prima, { id, ritocco }) => new Map(prima).set(id, { ...prima.get(id), ...ritocco }),
  )
  const [tocchi, setTocchi] = useState<ReadonlyMap<string, Tocco>>(() => new Map())
  const [annuncio, setAnnuncio] = useState('')
  // the task whose checkbox takes the focus as soon as it is on the page
  const focusSu = useRef<string | null>(null)
  // the last move on each task: a late answer to an older one says nothing
  const ultimaMossa = useRef(new Map<string, number>())
  const mosse = useRef(0)

  // a new list from the server has the reopenings in it: a task closed again
  // elsewhere then goes to Completati instead of staying here, open and stale
  const [apertiVisti, setApertiVisti] = useState(aperti)
  if (apertiVisti !== aperti) {
    setApertiVisti(aperti)
    setTocchi(scordaRiaperti)
  }

  useEffect(() => {
    const id = focusSu.current
    if (!id) return
    const casella = document.querySelector<HTMLElement>(`[data-mio-task="${id}"] [data-slot="checkbox"]`)
    if (!casella) return
    casella.focus()
    focusSu.current = null
  })

  /** Sets (or clears) what I did to a task; `se` only when it is still in that state. */
  function tocca(id: string, tocco: Tocco | null, se?: Tocco['stato']) {
    setTocchi((prima) => {
      if (se && prima.get(id)?.stato !== se) return prima
      const dopo = new Map(prima)
      if (tocco) dopo.set(id, tocco)
      else dopo.delete(id)
      return dopo
    })
  }

  function nuovaMossa(id: string): number {
    mosse.current += 1
    ultimaMossa.current.set(id, mosse.current)
    return mosse.current
  }

  const eUltima = (id: string, mossa: number) => ultimaMossa.current.get(id) === mossa

  async function completa(task: MioTask) {
    const mossa = nuovaMossa(task.id)
    tocca(task.id, { task, stato: 'completato' })
    setAnnuncio(t.annunci.completato(task.titolo))
    const esito = await salva(task.id, true, lingua)
    if (!esito.ok) {
      tocca(task.id, null, 'completato')
      if (eUltima(task.id, mossa)) setAnnuncio(t.annunci.nonCompletato(task.titolo))
      toast.error(esito.errore)
      return
    }
    // unticked while the server answered: no "Fatto", the reopening speaks
    if (!eUltima(task.id, mossa)) return
    toast.success(t.fatto, {
      description: task.titolo,
      duration: 6000,
      action: { label: t.annulla, onClick: () => void riapriQui(task, true) },
      classNames: { actionButton: AZIONE_TOAST },
    })
  }

  /** Annulla, or the checkbox unticked: the task reopens where it is. */
  async function riapriQui(task: MioTask, dalToast: boolean) {
    // the toast goes away: the focus goes back to the task
    if (dalToast) focusSu.current = task.id
    const mossa = nuovaMossa(task.id)
    tocca(task.id, { task, stato: 'riapertura' })
    const esito = await salva(task.id, false, lingua)
    if (!esito.ok) {
      tocca(task.id, { task, stato: 'completato' }, 'riapertura')
      if (eUltima(task.id, mossa)) setAnnuncio(t.annunci.nonRiaperto(task.titolo))
      toast.error(esito.errore)
      return
    }
    tocca(task.id, { task, stato: 'riaperto' }, 'riapertura')
    // ticked again while the server answered: that tick has the last word
    if (!eUltima(task.id, mossa)) return
    setAnnuncio(t.annunci.riaperto(task.titolo))
    toast.success(t.taskRiaperto, { description: task.titolo })
  }

  /** "Riapri" in Completati: back to its group, with the focus on it. */
  async function riapriCompletato(task: MioTaskCompletato) {
    focusSu.current = task.id
    const esito = await salva(task.id, false, lingua)
    if (!esito.ok) {
      focusSu.current = null
      setAnnuncio(t.annunci.nonRiaperto(task.titolo))
      toast.error(esito.errore)
      return
    }
    setAnnuncio(t.annunci.riapertoIn(task.titolo, t.gruppi[gruppoDi(task.scadenza, oggi)]))
    toast.success(t.taskRiaperto, { description: task.titolo })
  }

  /** A card dragged to a column, or retagged from its menu. */
  function ritocca(task: MioTask, ritocco: Ritocco, colonna: ChiaveGruppo | null) {
    startTransition(async () => {
      ritoccaSubito({ id: task.id, ritocco })
      let esito: Awaited<ReturnType<typeof aggiornaTaskRapido>>
      try {
        esito = await aggiornaTaskRapido({ id: task.id, ...ritocco })
      } catch {
        toast.error(t.connessione)
        return
      }
      if (!esito.ok) {
        toast.error(traduciErroreTask(esito.errore, lingua))
        return
      }
      if (ritocco.priorita) {
        toast.success(tb.prioritaCambiata(tb.priorita[ritocco.priorita]), { description: task.titolo })
        return
      }
      const scadenza = ritocco.scadenza ?? null
      const dove = colonna ?? gruppoDi(scadenza, oggi)
      setAnnuncio(tb.annunci.spostato(task.titolo, t.gruppi[dove]))
      toast.success(scadenza ? tb.scadenzaIl(formatData(scadenza)) : tb.scadenzaTolta, {
        description: `${task.titolo} · ${t.gruppi[dove]}`,
      })
    })
  }

  const apertiRitoccati = ritocchi.size
    ? aperti.map((task) => {
        const r = ritocchi.get(task.id)
        return r ? { ...task, ...r } : task
      })
    : aperti
  const righe = righeAperte(apertiRitoccati, tocchi)
  const gruppi = raggruppa(righe, oggi)
  const visibili = completatiDaMostrare(completati, righe)

  if (righe.length === 0 && totaleCompletati === 0 && (vista !== 'bacheca' || progetti.length === 0)) {
    return (
      <StatoVuoto
        Icona={ListChecks}
        titolo={t.vuoto}
        descrizione={t.vuotoDescrizione}
        azione={<LinkBottone href="/progetti">{t.vaiProgetti}</LinkBottone>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <p role="status" className="sr-only" data-testid="annuncio-miei-task">
        {annuncio}
      </p>

      {vista === 'bacheca' ? (
        <BachecaMieiTask
          colonne={colonneBacheca(righe, oggi)}
          oggi={oggi}
          progetti={progetti}
          onCompleta={(task) => void completa(task)}
          onRiapri={(task) => void riapriQui(task, false)}
          onRitocca={ritocca}
          onAggiunto={(titolo, colonna) => setAnnuncio(tb.annunci.aggiunto(titolo, t.gruppi[colonna]))}
        />
      ) : righe.length === 0 ? (
        <StatoVuoto
          Icona={CircleCheck}
          titolo={t.nienteDaFare}
          descrizione={t.nienteDaFareDescrizione}
          azione={
            <LinkBottone href="/progetti" variant="outline">
              {t.vaiProgetti}
            </LinkBottone>
          }
        />
      ) : (
        gruppi.map((g) => (
          <section key={g.chiave} aria-labelledby={`gruppo-${g.chiave}`} data-testid={`gruppo-${g.chiave}`}>
            <h2 id={`gruppo-${g.chiave}`} className={TITOLO_GRUPPO}>
              {t.gruppi[g.chiave]} <span className="num">({g.daFare})</span>
            </h2>
            <ul className="divide-y divide-border rounded-xl bg-card">
              {g.righe.map((r) => (
                <RigaMioTask
                  key={r.task.id}
                  task={r.task}
                  completatoAdesso={r.completatoAdesso}
                  onCompleta={() => void completa(r.task)}
                  onRiapri={() => void riapriQui(r.task, false)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <section aria-labelledby="gruppo-completati" data-testid="gruppo-completati" className="max-w-3xl pt-2">
        <h2 id="gruppo-completati" className={TITOLO_GRUPPO}>
          {t.completati} <span className="num">({totaleCompletati})</span>
        </h2>
        {visibili.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl bg-card">
            {visibili.map((t) => (
              <RigaCompletato key={t.id} task={t} oggi={oggi} onRiapri={() => riapriCompletato(t)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {totaleCompletati === 0 ? t.nessunCompletato : t.appenaSpuntato}
          </p>
        )}
        {!tutti && totaleCompletati > completati.length ? (
          <LinkBottone href="/task?completati=tutti" scroll={false} variant="outline" className="mt-3 w-full">
            {/* one span: the button's flex gap would split "(42)" */}
            <span>
              {t.mostraTutti} (<span className="num">{totaleCompletati}</span>)
            </span>
          </LinkBottone>
        ) : null}
        {tutti && totaleCompletati > completati.length ? (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            {t.recenti.prima}
            <span className="num">{completati.length}</span>
            {t.recenti.dopo}
          </p>
        ) : null}
        {tutti && totaleCompletati > COMPLETATI_RECENTI ? (
          <LinkBottone href="/task" scroll={false} variant="outline" className="mt-3 w-full">
            {t.soloRecenti}
          </LinkBottone>
        ) : null}
      </section>
    </div>
  )
}
