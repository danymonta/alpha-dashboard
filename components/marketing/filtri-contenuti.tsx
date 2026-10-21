'use client'

import { Search, X } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import {
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_FORMAT,
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
  gruppoDiStatus,
  type GruppoStatus,
} from '@/lib/marketing/etichette'
import {
  filtriDelGruppo,
  haFiltri,
  parametriDaFiltri,
  type FiltriContenuti as Filtri,
} from '@/lib/marketing/filtri'
import { cn } from '@/lib/utils'

const PERCORSO = '/marketing/contenuti'

export type ConteggiGruppi = Record<'tutti' | GruppoStatus, number>

/** The address of the list with these filters, keeping the view the address says and the month. */
function indirizzo(filtri: Filtri, resto: Record<string, string | undefined>) {
  const cerca = new URLSearchParams()
  for (const [chiave, v] of Object.entries({ ...parametriDaFiltri(filtri), ...resto })) {
    if (v) cerca.set(chiave, v)
  }
  const testo = cerca.toString()
  return testo ? `${PERCORSO}?${testo}` : PERCORSO
}

function SelectFiltro({
  id,
  etichetta,
  valore,
  inCorso,
  onCambia,
  children,
}: {
  id: string
  etichetta: string
  valore: string
  inCorso: boolean
  onCambia: (valore: string) => void
  children: ReactNode
}) {
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {etichetta}
      </label>
      <select
        id={id}
        value={valore}
        aria-busy={inCorso}
        className={cn(CLASSE_SELECT, 'sm:w-40', inCorso && 'opacity-60')}
        onChange={(e) => onCambia(e.currentTarget.value)}
      >
        {children}
      </select>
    </div>
  )
}

/**
 * The filters of the content calendar, all in the URL (shareable, they survive a
 * reload, and both views keep them). No filter by default, as in Notion. The
 * Status groups are links with their count; a group and a Status that does not
 * belong to it never stay together. The search is a GET form: it works before
 * the page's script has loaded.
 */
export function FiltriContenuti({
  filtri,
  conteggi,
  resto,
}: {
  filtri: Filtri
  conteggi: ConteggiGruppi
  /** What the filters keep: ?vista (only when the address has it) and ?mese. */
  resto: Record<string, string | undefined>
}) {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()

  function vai(nuovi: Filtri) {
    avvia(() => router.push(indirizzo(nuovi, resto), { scroll: false }))
  }

  function chip(gruppo: GruppoStatus | null, etichetta: string, n: number) {
    // a Status outside the chosen group would leave an empty list: it goes (the count does the same)
    const attivo = (filtri.gruppo ?? null) === gruppo
    return (
      <Link
        key={gruppo ?? 'tutti'}
        href={indirizzo(filtriDelGruppo(filtri, gruppo), resto)}
        scroll={false}
        aria-current={attivo ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-11 items-center gap-1 rounded-pillola border px-2.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          attivo
            ? 'border-selezione bg-selezione text-selezione-foreground'
            : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {etichetta}
        <span className="num text-xs opacity-80">{n}</span>
      </Link>
    )
  }

  return (
    <div className="space-y-3">
      <nav aria-label="Gruppi di Status" className="flex flex-wrap gap-1.5">
        {chip(null, 'Tutti', conteggi.tutti)}
        {ORDINE_GRUPPI.map((g) => chip(g, ETICHETTA_GRUPPO[g], conteggi[g]))}
      </nav>

      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
        <SelectFiltro
          id="filtro-status"
          etichetta={CAMPI.stato}
          valore={filtri.stato ?? ''}
          inCorso={inCorso}
          onCambia={(v) => {
            const stato = v ? (v as NonNullable<Filtri['stato']>) : undefined
            // the group chip and a Status of another group never stay together
            const gruppo = stato && filtri.gruppo && gruppoDiStatus(stato) !== filtri.gruppo ? undefined : filtri.gruppo
            vai({ ...filtri, stato, gruppo })
          }}
        >
          <option value="">Tutti</option>
          {ORDINE_GRUPPI.map((g) => (
            <optgroup key={g} label={ETICHETTA_GRUPPO[g]}>
              {GRUPPI_STATUS[g].map((s) => (
                <option key={s} value={s}>
                  {ETICHETTA_STATUS[s]}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectFiltro>
        <SelectFiltro
          id="filtro-reel-type"
          etichetta={CAMPI.reel_type}
          valore={filtri.reel_type ?? ''}
          inCorso={inCorso}
          onCambia={(v) => vai({ ...filtri, reel_type: (v || undefined) as Filtri['reel_type'] })}
        >
          <option value="">Tutti</option>
          {Object.entries(ETICHETTA_REEL_TYPE).map(([valore, etichetta]) => (
            <option key={valore} value={valore}>
              {etichetta}
            </option>
          ))}
        </SelectFiltro>
        <SelectFiltro
          id="filtro-format"
          etichetta={CAMPI.formato}
          valore={filtri.formato ?? ''}
          inCorso={inCorso}
          onCambia={(v) => vai({ ...filtri, formato: (v || undefined) as Filtri['formato'] })}
        >
          <option value="">Tutti</option>
          {Object.entries(ETICHETTA_FORMAT).map(([valore, etichetta]) => (
            <option key={valore} value={valore}>
              {etichetta}
            </option>
          ))}
        </SelectFiltro>
        <SelectFiltro
          id="filtro-modello"
          etichetta={CAMPO_MODELLO}
          valore={filtri.tipo ?? ''}
          inCorso={inCorso}
          onCambia={(v) => vai({ ...filtri, tipo: (v || undefined) as Filtri['tipo'] })}
        >
          <option value="">Tutti</option>
          {Object.entries(ETICHETTA_MODELLO).map(([valore, etichetta]) => (
            <option key={valore} value={valore}>
              {etichetta}
            </option>
          ))}
        </SelectFiltro>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Form action={PERCORSO} scroll={false} role="search" className="relative w-full sm:max-w-sm">
          {Object.entries({ ...parametriDaFiltri({ ...filtri, q: undefined }), ...resto }).map(([chiave, v]) =>
            v ? <input key={chiave} type="hidden" name={chiave} value={v} /> : null,
          )}
          <label htmlFor="cerca-contenuto" className="sr-only">
            Cerca per Name
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="cerca-contenuto"
            type="search"
            name="q"
            // a new search from elsewhere (Togli i filtri) shows in the field
            key={filtri.q ?? ''}
            defaultValue={filtri.q ?? ''}
            placeholder="Cerca per Name"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={100}
            className="h-11 w-full rounded-pillola border border-input bg-input/30 pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
        </Form>
        {haFiltri(filtri) ? (
          <Link
            href={indirizzo({}, resto)}
            scroll={false}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
            Togli i filtri
          </Link>
        ) : null}
      </div>
    </div>
  )
}
