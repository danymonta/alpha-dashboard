'use client'

import { LoaderCircle, Trash2, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { anteprimaEliminazione } from '@/app/actions/eliminazione'
import { useTesti } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { eliminazioneBloccata, frasiAnteprima, type TipoEliminazione } from '@/lib/eliminazione'
import { SHELL } from '@/lib/i18n/testi/shell'
import { cn } from '@/lib/utils'

type EsitoAzione = { ok: true } | { ok: false; errore: string }

type Props = {
  /** What is deleted, as it reads in the question: "la vendita di Luca Rossi". */
  cosa: string
  /** Toast after deleting: "Vendita eliminata". */
  fatto: string
  azione: () => Promise<EsitoAzione>
  /** Counts of what goes with it, read from the database when the question opens. */
  anteprima?: { tipo: TipoEliminazione; id: string }
  /** Fixed consequences, when there is nothing to count. */
  conseguenze?: string[]
  /**
   * Where to go afterwards (the record's own page is gone). Otherwise the page
   * stays: the action's revalidatePath already brought it back redrawn.
   */
  dopo?: string
  /** Instead of `dopo`: called after the toast (the content panel closes itself). */
  onFatto?: () => void
  /** "foglio": a full-width button at the bottom of an edit sheet; "icona": a 44px trash icon in a row. */
  variante?: 'foglio' | 'icona'
  etichetta?: string
  disabilitato?: boolean
  /** Known in advance (e.g. a department with projects): the question explains, the button stays off. */
  bloccata?: boolean
}

/**
 * The one way to delete in the app (admin): a red button, then a question that
 * says what goes with it. Nothing is deleted on the first tap.
 */
export function Elimina({
  cosa,
  fatto,
  azione,
  anteprima,
  conseguenze = [],
  dopo,
  onFatto,
  variante = 'foglio',
  etichetta: etichettaData,
  disabilitato = false,
  bloccata: bloccataNota = false,
}: Props) {
  const router = useRouter()
  const shell = useTesti(SHELL)
  const t = shell.elimina
  const etichetta = etichettaData ?? t.etichetta
  const [aperto, setAperto] = useState(false)
  const [frasi, setFrasi] = useState<string[] | null>(anteprima ? null : conseguenze)
  const [bloccata, setBloccata] = useState(bloccataNota)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function apri() {
    setAperto(true)
    setErrore(null)
    // the consequences as they are now: the same button may stay mounted while
    // they change (the content panel: a post linked or unlinked, the next content)
    if (!anteprima) {
      setFrasi(conseguenze)
      return
    }
    setFrasi(null)
    void anteprimaEliminazione(anteprima.tipo, anteprima.id).then((esito) => {
      if (!esito.ok) {
        setFrasi(conseguenze)
        setErrore(esito.errore)
        return
      }
      setFrasi([...frasiAnteprima(anteprima.tipo, esito.dati), ...conseguenze])
      setBloccata(eliminazioneBloccata(anteprima.tipo, esito.dati))
    })
  }

  function conferma() {
    setErrore(null)
    avvia(async () => {
      let esito: EsitoAzione
      try {
        esito = await azione()
      } catch {
        setErrore(shell.connessione)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(fatto)
      setAperto(false)
      // every delete action calls revalidatePath: its answer already carries the
      // redrawn page, a router.refresh() would render it a second time (spec 1.33.0 A4)
      if (onFatto) onFatto()
      else if (dopo) router.push(dopo)
    })
  }

  return (
    <>
      {variante === 'icona' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-muted-foreground hover:text-status-critical"
          aria-label={`${etichetta} ${cosa}`}
          disabled={disabilitato}
          onClick={apri}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full text-status-critical hover:bg-status-critical/10 hover:text-status-critical"
          disabled={disabilitato}
          onClick={apri}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {etichetta}
        </Button>
      )}

      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.domanda(cosa)}</DialogTitle>
            <DialogDescription>{t.irreversibile}</DialogDescription>
          </DialogHeader>

          {frasi === null ? (
            <div className="space-y-2" aria-label={t.controllo}>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : frasi.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {frasi.map((f) => (
                <li key={f} className="flex gap-2">
                  <TriangleAlert
                    className={cn('mt-0.5 size-4 shrink-0', bloccata ? 'text-status-critical' : 'text-status-warning')}
                    aria-hidden="true"
                  />
                  {f}
                </li>
              ))}
            </ul>
          ) : null}

          {errore ? (
            <p role="alert" className="text-sm text-status-critical">
              {errore}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setAperto(false)}>
              {shell.annulla}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={inCorso || frasi === null || bloccata}
              onClick={conferma}
            >
              {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              {t.etichetta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
