'use client'

import { LoaderCircle, PlugZap, Unplug } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { scollegaApp } from '@/app/(app)/account/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ACCOUNT } from '@/lib/i18n/testi/account'

export type AppCollegata = {
  clientId: string
  nome: string
  /** dd/MM/yyyy, the day of the consent in Europe/Rome. */
  collegataIl: string
}

/**
 * The person's own connected apps, each with «Scollega». idTitolo: the
 * section's heading, where the focus goes when a disconnected row leaves.
 */
export function ElencoAppCollegate({ app, idTitolo }: { app: AppCollegata[]; idTitolo: string }) {
  const APP_COLLEGATE = ACCOUNT[useLingua()].app
  if (app.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
        <PlugZap className="size-4 shrink-0" aria-hidden="true" />
        {APP_COLLEGATE.vuoto}
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-xl bg-card">
      {app.map((a) => (
        <RigaApp key={a.clientId} app={a} idTitolo={idTitolo} />
      ))}
    </ul>
  )
}

function RigaApp({ app, idTitolo }: { app: AppCollegata; idTitolo: string }) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const scollegata = useRef(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const APP_COLLEGATE = ACCOUNT[useLingua()].app

  function conferma() {
    setErrore(null)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof scollegaApp>>
      try {
        esito = await scollegaApp({ clientId: app.clientId })
      } catch {
        setErrore(APP_COLLEGATE.connessione)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(APP_COLLEGATE.scollegata(app.nome))
      scollegata.current = true
      setAperto(false)
      router.refresh()
    })
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0 py-1.5">
        <p className="truncate text-sm font-medium">{app.nome}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{APP_COLLEGATE.collegataIl(app.collegataIl)}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 shrink-0"
        aria-label={`${APP_COLLEGATE.scollega} ${app.nome}`}
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <Unplug className="size-4" aria-hidden="true" />
        {APP_COLLEGATE.scollega}
      </Button>

      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent
          showCloseButton={false}
          // the row and its button go with the refresh: the focus moves to the section's heading
          finalFocus={() => (scollegata.current ? document.getElementById(idTitolo) : true)}
        >
          <DialogHeader>
            <DialogTitle>{APP_COLLEGATE.domanda(app.nome)}</DialogTitle>
            <DialogDescription>{APP_COLLEGATE.conseguenza}</DialogDescription>
          </DialogHeader>
          {errore ? (
            <p role="alert" className="text-sm text-status-critical">
              {errore}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setAperto(false)}>
              {APP_COLLEGATE.annulla}
            </Button>
            <Button type="button" variant="destructive" className="h-11" disabled={inCorso} onClick={conferma}>
              {inCorso ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Unplug className="size-4" aria-hidden="true" />
              )}
              {APP_COLLEGATE.scollega}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/** A section of Profilo › Account that did not load: the sentence and «Riprova». */
export function ErroreSezioneAccount({ titolo }: { titolo: string }) {
  const router = useRouter()
  const t = ACCOUNT[useLingua()].app
  return (
    <StatoErrore
      titolo={titolo}
      descrizione={t.erroreDescrizione}
      riprova={() => router.refresh()}
    />
  )
}
