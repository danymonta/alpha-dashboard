'use client'

import { ListPlus, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import type { ContenutoScelta } from '@/components/marketing/instagram/tipi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { giorniTra, tipiCompatibili, type TipoPost } from '@/lib/marketing/abbinamento'
import { ETICHETTA_MODELLO, ETICHETTA_STATUS } from '@/lib/marketing/etichette'
import { etichettaCollega, giornoPost } from '@/lib/marketing/parole-post'
import { formatData } from '@/lib/format'

/** At most this many rows at once: the search finds the others. */
const MOSTRATI_MAX = 50

/** Lower case, no accents: «perché» finds «Perche». */
function normalizza(testo: string): string {
  return testo.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * «Scegli un contenuto» (1.33.0): any content of the calendar still without a
 * post, for a post the run could not place. Searched by Name; the compatible
 * ones first (a Reel Topic for a reel), then by how close the Post Date is to
 * the day of the post. Each with «Collega» (or «Collega e segna Posted»).
 */
export function ScegliContenuto({
  post,
  contenuti,
  disabilitato,
  onCollega,
}: {
  post: { shortcode: string; giorno: string; tipo: TipoPost }
  contenuti: readonly ContenutoScelta[]
  disabilitato?: boolean
  onCollega: (contenuto: ContenutoScelta) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [cerca, setCerca] = useState('')
  const idCerca = useId()

  const ordinati = useMemo(() => {
    const distanza = (c: ContenutoScelta) => (c.post_date ? giorniTra(post.giorno, c.post_date) : Number.POSITIVE_INFINITY)
    return [...contenuti].sort((a, b) => {
      const ca = tipiCompatibili(post.tipo, a.tipo) ? 0 : 1
      const cb = tipiCompatibili(post.tipo, b.tipo) ? 0 : 1
      if (ca !== cb) return ca - cb
      const da = distanza(a)
      const db = distanza(b)
      if (da !== db) return da - db
      return a.nome.localeCompare(b.nome, 'it')
    })
  }, [contenuti, post.giorno, post.tipo])

  const parole = normalizza(cerca)
  const trovati = parole ? ordinati.filter((c) => normalizza(c.nome).includes(parole)) : ordinati
  const mostrati = trovati.slice(0, MOSTRATI_MAX)

  return (
    <Sheet
      open={aperto}
      onOpenChange={(v) => {
        setAperto(v)
        if (!v) setCerca('')
      }}
    >
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={disabilitato}
            aria-label={`Scegli un contenuto per il post del ${giornoPost(post.giorno)}`}
          />
        }
      >
        <ListPlus className="size-4" aria-hidden="true" />
        Scegli un contenuto
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Scegli un contenuto</SheetTitle>
          <SheetDescription>
            Per il post del {giornoPost(post.giorno)}: i contenuti del calendario ancora senza post, i più vicini per data in
            cima.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <div className="space-y-1.5">
            <label htmlFor={idCerca} className="text-sm font-medium">
              Cerca per Name
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={idCerca}
                type="search"
                value={cerca}
                onChange={(e) => setCerca(e.currentTarget.value)}
                autoComplete="off"
                className="h-11 pl-9"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground" role="status">
            {trovati.length === 0
              ? 'Nessun contenuto senza post con questo nome.'
              : trovati.length > MOSTRATI_MAX
                ? `${MOSTRATI_MAX} di ${trovati.length}: scrivi il nome per trovare gli altri.`
                : trovati.length === 1
                  ? '1 contenuto'
                  : `${trovati.length} contenuti`}
          </p>
          <ul className="divide-y divide-border rounded-xl bg-card">
            {mostrati.map((c) => {
              const etichetta = etichettaCollega(c.stato)
              return (
                <li key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{c.nome}</p>
                    <p className="num text-xs text-muted-foreground">
                      {ETICHETTA_MODELLO[c.tipo]} · {c.post_date ? `Post Date ${formatData(c.post_date)}` : 'Senza Post Date'} ·{' '}
                      {ETICHETTA_STATUS[c.stato]}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="h-11 shrink-0"
                    aria-label={`${etichetta} a «${c.nome}»`}
                    onClick={() => {
                      setAperto(false)
                      onCollega(c)
                    }}
                  >
                    {etichetta}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  )
}
