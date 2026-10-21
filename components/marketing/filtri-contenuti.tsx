'use client'

import { Search, X } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'

import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useOpzioni } from '@/components/marketing/opzioni-contesto'
import {
  CAMPI,
  ETICHETTA_GRUPPO,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
  gruppoDiStatus,
} from '@/lib/marketing/etichette'
import { haFiltri, parametriDaFiltri, type FiltriContenuti as Filtri } from '@/lib/marketing/filtri'
import { cn } from '@/lib/utils'

const PERCORSO = '/marketing/contenuti'

/** The address of the list with these filters, keeping what the address keeps besides them. */
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
 * The filters of the Piano editoriale (21/10/2026), on one quiet row: the
 * search on Name, Status, Reel Type, Format and «Togli i filtri». All in the
 * URL (shareable, they survive a reload). No filter by default, as in
 * Notion. The labels of Reel Type and Format are the live ones, each with the
 * number of contents that use it. The search is a GET form: it works before
 * the page's script has loaded.
 */
export function FiltriContenuti({
  filtri,
  resto,
}: {
  filtri: Filtri
  /** What the filters keep: ?nuovo, the row just created, is not one of them. */
  resto: Record<string, string | undefined>
}) {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  const { opzioni, conteggi } = useOpzioni()

  function vai(nuovi: Filtri) {
    avvia(() => router.push(indirizzo(nuovi, resto), { scroll: false }))
  }

  return (
    <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
      <Form action={PERCORSO} scroll={false} role="search" className="relative col-span-2 min-w-0 sm:w-64">
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
          className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </Form>

      <SelectFiltro
        id="filtro-status"
        etichetta={CAMPI.stato}
        valore={filtri.stato ?? ''}
        inCorso={inCorso}
        onCambia={(v) => {
          const stato = v ? (v as NonNullable<Filtri['stato']>) : undefined
          // a group in an old address and a Status of another group never stay together
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
        onCambia={(v) => vai({ ...filtri, reel_type: v || undefined })}
      >
        <option value="">Tutti</option>
        {opzioni.reel_type.map((o) => (
          <option key={o.id} value={o.valore}>
            {o.nome} ({conteggi.reel_type[o.valore] ?? 0})
          </option>
        ))}
      </SelectFiltro>
      <SelectFiltro
        id="filtro-format"
        etichetta={CAMPI.formato}
        valore={filtri.formato ?? ''}
        inCorso={inCorso}
        onCambia={(v) => vai({ ...filtri, formato: v || undefined })}
      >
        <option value="">Tutti</option>
        {opzioni.formato.map((o) => (
          <option key={o.id} value={o.valore}>
            {o.nome} ({conteggi.formato[o.valore] ?? 0})
          </option>
        ))}
      </SelectFiltro>

      {haFiltri(filtri) ? (
        <Link
          href={indirizzo({}, resto)}
          scroll={false}
          className="col-span-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:col-span-1"
        >
          <X className="size-4" aria-hidden="true" />
          Togli i filtri
        </Link>
      ) : null}
    </div>
  )
}
