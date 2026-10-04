'use client'

import { CircleCheck, ListChecks } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { completaTask } from '@/app/(app)/progetti/[id]/actions'
import { LinkBottone } from '@/components/link-bottone'
import { RigaCompletato } from '@/components/pm/miei-task/riga-completato'
import { RigaMioTask } from '@/components/pm/miei-task/riga-mio-task'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import {
  COMPLETATI_RECENTI,
  completatiDaMostrare,
  gruppoDi,
  raggruppa,
  righeAperte,
  scordaRiaperti,
  titoloGruppo,
  type MioTask,
  type MioTaskCompletato,
  type Tocco,
} from '@/lib/miei-task'

type Props = {
  aperti: MioTask[]
  /** The most recent completed tasks, or all of them with `tutti`. */
  completati: MioTaskCompletato[]
  /** How many completed tasks I have: counted by the database. */
  totaleCompletati: number
  tutti: boolean
  /** Today in Europe/Rome, from the server. */
  oggi: string
}

/** Sonner draws its buttons 24px high: Annulla gets the 44px target. */
const AZIONE_TOAST = 'h-11! px-4! text-sm!'

const TITOLO_GRUPPO = 'mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase'

async function salva(id: string, completato: boolean) {
  try {
    return await completaTask({ id, completato })
  } catch {
    return { ok: false as const, errore: 'Connessione assente. Riprova.' }
  }
}

/**
 * The page's list: my open tasks by due date, then "Completati". A task
 * ticked here stays in its place, struck through, until I leave the page;
 * "Riapri" sends a completed one back to its group. Every change is said to
 * screen readers in a polite live region, and the focus stays on the task.
 */
export function ElencoMieiTask({ aperti, completati, totaleCompletati, tutti, oggi }: Props) {
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
    setAnnuncio(`${task.titolo}: completato. Resta qui spuntato, poi lo trovi in Completati.`)
    const esito = await salva(task.id, true)
    if (!esito.ok) {
      tocca(task.id, null, 'completato')
      if (eUltima(task.id, mossa)) setAnnuncio(`${task.titolo}: non completato.`)
      toast.error(esito.errore)
      return
    }
    // unticked while the server answered: no "Fatto", the reopening speaks
    if (!eUltima(task.id, mossa)) return
    toast.success('Fatto', {
      description: task.titolo,
      duration: 6000,
      action: { label: 'Annulla', onClick: () => void riapriQui(task, true) },
      classNames: { actionButton: AZIONE_TOAST },
    })
  }

  /** Annulla, or the checkbox unticked: the task reopens where it is. */
  async function riapriQui(task: MioTask, dalToast: boolean) {
    // the toast goes away: the focus goes back to the task
    if (dalToast) focusSu.current = task.id
    const mossa = nuovaMossa(task.id)
    tocca(task.id, { task, stato: 'riapertura' })
    const esito = await salva(task.id, false)
    if (!esito.ok) {
      tocca(task.id, { task, stato: 'completato' }, 'riapertura')
      if (eUltima(task.id, mossa)) setAnnuncio(`${task.titolo}: non riaperto.`)
      toast.error(esito.errore)
      return
    }
    tocca(task.id, { task, stato: 'riaperto' }, 'riapertura')
    // ticked again while the server answered: that tick has the last word
    if (!eUltima(task.id, mossa)) return
    setAnnuncio(`${task.titolo}: riaperto.`)
    toast.success('Task riaperto', { description: task.titolo })
  }

  /** "Riapri" in Completati: back to its group, with the focus on it. */
  async function riapriCompletato(task: MioTaskCompletato) {
    focusSu.current = task.id
    const esito = await salva(task.id, false)
    if (!esito.ok) {
      focusSu.current = null
      setAnnuncio(`${task.titolo}: non riaperto.`)
      toast.error(esito.errore)
      return
    }
    setAnnuncio(`${task.titolo}: riaperto, torna in ${titoloGruppo(gruppoDi(task.scadenza, oggi))}.`)
    toast.success('Task riaperto', { description: task.titolo })
  }

  const righe = righeAperte(aperti, tocchi)
  const gruppi = raggruppa(righe, oggi)
  const visibili = completatiDaMostrare(completati, righe)

  if (righe.length === 0 && totaleCompletati === 0) {
    return (
      <StatoVuoto
        Icona={ListChecks}
        titolo="Nessun task assegnato a te"
        descrizione="Quando qualcuno ti assegna un task in un progetto, lo trovi qui con la sua scadenza."
        azione={<LinkBottone href="/progetti">Vai ai progetti</LinkBottone>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <p role="status" className="sr-only" data-testid="annuncio-miei-task">
        {annuncio}
      </p>

      {righe.length === 0 ? (
        <StatoVuoto
          Icona={CircleCheck}
          titolo="Niente da fare"
          descrizione="Hai chiuso tutti i task assegnati a te: li trovi qui sotto, in Completati."
          azione={
            <LinkBottone href="/progetti" variant="outline">
              Vai ai progetti
            </LinkBottone>
          }
        />
      ) : (
        gruppi.map((g) => (
          <section key={g.chiave} aria-labelledby={`gruppo-${g.chiave}`} data-testid={`gruppo-${g.chiave}`}>
            <h2 id={`gruppo-${g.chiave}`} className={TITOLO_GRUPPO}>
              {g.titolo} <span className="num">({g.daFare})</span>
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

      <section aria-labelledby="gruppo-completati" data-testid="gruppo-completati" className="pt-2">
        <h2 id="gruppo-completati" className={TITOLO_GRUPPO}>
          Completati <span className="num">({totaleCompletati})</span>
        </h2>
        {visibili.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl bg-card">
            {visibili.map((t) => (
              <RigaCompletato key={t.id} task={t} oggi={oggi} onRiapri={() => riapriCompletato(t)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {totaleCompletati === 0
              ? 'Nessun task completato. Quando ne spunti uno, lo ritrovi qui con il giorno in cui l’hai chiuso.'
              : 'Quello che hai appena spuntato resta qui sopra: lo ritrovi qui quando torni sulla pagina.'}
          </p>
        )}
        {!tutti && totaleCompletati > completati.length ? (
          <LinkBottone href="/task?completati=tutti" scroll={false} variant="outline" className="mt-3 w-full">
            {/* one span: the button's flex gap would split "(42)" */}
            <span>
              Mostra tutti (<span className="num">{totaleCompletati}</span>)
            </span>
          </LinkBottone>
        ) : null}
        {tutti && totaleCompletati > completati.length ? (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Si vedono i <span className="num">{completati.length}</span> più recenti.
          </p>
        ) : null}
        {tutti && totaleCompletati > COMPLETATI_RECENTI ? (
          <LinkBottone href="/task" scroll={false} variant="outline" className="mt-3 w-full">
            Mostra solo i più recenti
          </LinkBottone>
        ) : null}
      </section>
    </div>
  )
}
