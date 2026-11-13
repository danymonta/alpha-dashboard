'use client'

import { LoaderCircle, Lock, LockOpen, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { apriAreaClienti, chiudiAreaClienti, type EsitoArea } from '@/app/(app)/onboarding/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ONBOARDING, ONBOARDING_TEAM, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { problemiApertura, traduciProblemi } from '@/lib/onboarding/area'

/**
 * «Area clienti» (Impostazioni › Onboarding, release B2): open or closed, and the button that
 * changes it, after a question and a second tap. Opening goes through
 * onboarding_apri_ai_clienti, which refuses while something is missing (the list in words,
 * here); never a direct write of the column (a trigger refuses it).
 */
export function AreaClienti({
  aperto,
  manca = [],
}: {
  aperto: boolean
  /** What is missing before opening (the database's words), read by the page: said on the card, before any tap. */
  manca?: readonly string[]
}) {
  const lingua = useLingua()
  const t = ONBOARDING_TEAM[lingua].area
  const mancaQui = aperto ? [] : traduciProblemi(manca, lingua)
  const pronta = mancaQui.length === 0
  const [dialogo, setDialogo] = useState(false)
  const [sicuro, setSicuro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [problemi, setProblemi] = useState<string[] | null>(null)
  const [inCorso, avvia] = useTransition()
  const Icona = aperto ? LockOpen : Lock

  function chiudiDialogo() {
    setDialogo(false)
    setSicuro(false)
  }

  function avanti() {
    if (!sicuro) {
      setSicuro(true)
      return
    }
    setErrore(null)
    setProblemi(null)
    avvia(async () => {
      let esito: EsitoArea
      try {
        esito = aperto ? await chiudiAreaClienti() : await apriAreaClienti()
      } catch {
        setErrore(ONBOARDING[lingua].connessione)
        return
      }
      if (!esito.ok) {
        const lista = problemiApertura(esito.errore, lingua)
        if (lista) setProblemi(lista)
        else setErrore(traduciErroreOnboarding(esito.errore, lingua))
        setSicuro(false)
        return
      }
      toast.success(esito.aperto ? t.fattoAperta : t.fattoChiusa)
      chiudiDialogo()
    })
  }

  return (
    <section aria-labelledby="area-clienti-titolo" className="space-y-3 rounded-xl bg-card p-3" data-testid="area-clienti">
      <div className="flex items-center justify-between gap-3">
        <h2 id="area-clienti-titolo" className="text-sm font-medium">
          {t.titolo}
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 text-sm ${aperto ? 'text-status-ok' : 'text-muted-foreground'}`}
          data-stato={aperto ? 'aperta' : 'chiusa'}
        >
          <Icona className="size-4 shrink-0" aria-hidden="true" />
          {aperto ? t.aperta : t.chiusa}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{aperto ? t.apertaAiuto : t.chiusaAiuto}</p>
      {mancaQui.length > 0 ? (
        <div id="area-clienti-manca" className="space-y-1.5 text-sm text-status-warning" data-testid="area-manca">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t.problemiTitolo}
          </p>
          <ul className="list-disc space-y-0.5 pl-10">
            {mancaQui.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button
        type="button"
        variant={aperto || !pronta ? 'outline' : 'default'}
        className="h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
        data-testid={aperto ? 'chiudi-area' : 'apri-area'}
        aria-disabled={!pronta || undefined}
        aria-describedby={!pronta ? 'area-clienti-manca' : undefined}
        onClick={() => {
          // something missing: the list above says what, there is nothing to ask yet
          if (!pronta) return
          setErrore(null)
          setProblemi(null)
          setSicuro(false)
          setDialogo(true)
        }}
      >
        {aperto ? <Lock className="size-4" aria-hidden="true" /> : <LockOpen className="size-4" aria-hidden="true" />}
        {aperto ? t.chiudi : t.apri}
      </Button>

      <Dialog open={dialogo} onOpenChange={(v) => !inCorso && (v ? setDialogo(true) : chiudiDialogo())}>
        <DialogContent showCloseButton={false} data-testid="area-clienti-foglio">
          <DialogHeader>
            <DialogTitle>{aperto ? t.chiudiTitolo : t.apriTitolo}</DialogTitle>
            <DialogDescription>{aperto ? t.chiudiTesto : t.apriTesto}</DialogDescription>
          </DialogHeader>
          {problemi ? (
            <div role="alert" className="space-y-1.5 text-sm text-status-critical" data-testid="area-problemi">
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t.problemiTitolo}
              </p>
              <ul className="list-disc space-y-0.5 pl-10">
                {problemi.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          {sicuro ? (
            <p role="status" className="flex items-start gap-2 text-sm text-status-warning" data-testid="seconda-conferma">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {aperto ? t.chiudiSecondaConferma : t.apriSecondaConferma}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiudiDialogo}>
              {ONBOARDING[lingua].annulla}
            </Button>
            <Button
              type="button"
              variant={aperto && sicuro ? 'destructive' : 'default'}
              className="h-11"
              disabled={inCorso}
              data-testid="area-clienti-si"
              onClick={avanti}
            >
              {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {sicuro ? (aperto ? t.chiudi : t.apri) : t.avanti}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
