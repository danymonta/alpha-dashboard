'use client'

import { ArrowLeft, ChevronDown, CircleCheck, LoaderCircle, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { daiConsenso } from '@/app/(cliente)/percorso/actions'
import { versioneInParole } from '@/components/percorso/passi'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { CONSENSI_IN_VIGORE } from '@/lib/percorso/consensi'
import type { ConsensoCliente } from '@/lib/percorso/letture'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'

function Consenso({ consenso }: { consenso: ConsensoCliente }) {
  // the text of the page is shown (and accepted) only when it is the version the database has in force
  const locale = consenso.tipo === 'salute' ? CONSENSI_IN_VIGORE.salute : null
  const testo = locale && locale.versione === consenso.versioneInVigore ? locale : null
  const inVigore = consenso.versione === consenso.versioneInVigore && consenso.datoIl
  const [spunta, setSpunta] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function accetta() {
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await daiConsenso({ tipo: consenso.tipo, versione: consenso.versioneInVigore })
        if (!esito.ok) setErrore(esito.errore)
        else toast.success(T.consensoSalvato)
      } catch {
        setErrore(T.errore)
      }
    })
  }

  return (
    <li className="space-y-4 rounded-2xl bg-card p-5" data-consenso={consenso.tipo}>
      <div className="flex items-start gap-3">
        {inVigore ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-status-ok" aria-hidden="true" />
        ) : (
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden="true" />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="font-medium">{locale?.titolo ?? consenso.tipo}</h2>
          <p className="num text-sm text-muted-foreground">
            {T.consensoVersione(versioneInParole(consenso.versione ?? consenso.versioneInVigore))}
            {consenso.datoIl ? null : ` · ${T.consensoMancante}`}
          </p>
        </div>
      </div>

      {testo ? (
        <details className="group rounded-xl border border-border bg-muted/30 open:pb-1" open={!inVigore}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium">
            {T.leggiTesto}
            <ChevronDown
              className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <p className="px-4 pb-3 text-sm leading-relaxed text-foreground/90">{testo.testo}</p>
        </details>
      ) : null}

      {!testo ? (
        <p role="status" className="text-sm text-status-warning">
          {T.consensoInAggiornamento}
        </p>
      ) : inVigore ? (
        <p className="flex items-center gap-1.5 text-sm text-status-ok">
          <CircleCheck className="size-4" aria-hidden="true" />
          {T.consensoDatoIl(formatData(oggiRoma(new Date(consenso.datoIl!))))}
        </p>
      ) : (
        <div className="space-y-3">
          {consenso.versione ? <p className="text-sm text-status-warning">{T.consensoCambiato}</p> : null}
          <label
            htmlFor={`consenso-${consenso.tipo}`}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3',
              spunta ? 'border-primary/60 bg-primary/10' : 'border-border',
            )}
          >
            <Checkbox id={`consenso-${consenso.tipo}`} checked={spunta} onCheckedChange={(v) => setSpunta(v === true)} className="size-5" />
            <span className="font-medium">{T.consensoAccetto}</span>
          </label>
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <Button type="button" className="glow-primario h-11" disabled={!spunta || inCorso} onClick={accetta}>
            {inCorso ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {T.consensoAccettaDiNuovo}
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * «I tuoi consensi» (release B1a): kind, version and day of each consent, its whole text,
 * and how to withdraw it (the admin records the withdrawal, B1b: no button here). A text
 * changed since the client accepted it asks again (consenso_dai).
 */
export function ConsensiCliente({ consensi, emailTitolare }: { consensi: readonly ConsensoCliente[]; emailTitolare: string }) {
  return (
    <div className="space-y-6 pt-4 sm:pt-8">
      <Link href="/percorso" className={cn(buttonVariants({ variant: 'ghost' }), '-ml-3 h-11 gap-2 text-muted-foreground')}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {T.tornaPercorso}
      </Link>
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{T.consensiTitolo}</h1>
        <p className="text-muted-foreground">{T.consensiSotto}</p>
      </header>
      <ul className="space-y-4">
        {consensi.map((c) => (
          <Consenso key={c.tipo} consenso={c} />
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{T.revocaConsenso(emailTitolare)}</p>
    </div>
  )
}
