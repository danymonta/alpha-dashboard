'use client'

import { CalendarPlus, LoaderCircle, TriangleAlert, Users } from 'lucide-react'
import { useId, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { fissaFollowUp } from '@/app/(app)/calls/actions'
import { CampiSpostamento } from '@/app/(app)/calls/sposta-call'
import { useFocusSullaCall } from '@/components/call/focus-sulla-call'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { FOLLOW_UP, quandoFollowUpDa } from '@/lib/call/follow-up'
import { spostamentoPredefinito } from '@/lib/call/spostamento'
import { erroreGiornoFollowUp } from '@/lib/validation/call'

/**
 * The day and time of the follow-up call, with the shortcuts of "Sposta", and
 * whose sale a close on it is: the same lead and the same setter.
 */
export function CampiFollowUp({
  id,
  data,
  ora,
  onData,
  onOra,
  oggi,
  admin,
  setter,
  errore,
}: {
  id: string
  data: string
  ora: string
  onData: (valore: string) => void
  onOra: (valore: string) => void
  oggi: string
  admin: boolean
  /** The call's setter, by name: the sale of a close on the follow-up stays his. */
  setter: string | null
  errore?: string | null
}) {
  return (
    <>
      <CampiSpostamento
        id={id}
        legenda={FOLLOW_UP.quando}
        data={data}
        ora={ora}
        onData={onData}
        onOra={onOra}
        oggi={oggi}
        admin={admin}
        errore={errore}
      />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="follow-up-stesso-setter">
        <Users className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {setter ? FOLLOW_UP.stessoSetter(setter) : FOLLOW_UP.senzaSetter}
      </p>
    </>
  )
}

type Props = {
  callId: string
  /** The card's title (h3, tabIndex -1): the focus goes there when this button goes. */
  idTitolo: string
  nomeLead: string
  /** "Discovery · ieri alle 19:00": the first call. */
  descrizione: string
  /** Europe/Rome day and time of the first call: the follow-up comes after it. */
  giorno: string
  ora: string
  oggi: string
  admin: boolean
  setter: string | null
}

/**
 * "Fissa la call di follow-up" (Dany, 07/10/2026): on a held call that ended
 * in follow-up without its follow-up call ("Follow-up in chat"), the call's
 * closer and the admin book it later, on a day: the same new call as "Sì, call
 * fissata" in the outcome sheet (public.fissa_follow_up). Never for the setter.
 */
export function FissaFollowUp({ callId, idTitolo, nomeLead, descrizione, giorno, ora, oggi, admin, setter }: Props) {
  const id = useId()
  // the day after the call, at its time, never before tomorrow (as "Sposta")
  const iniziale = spostamentoPredefinito(giorno, ora, oggi)
  const [aperto, setAperto] = useState(false)
  const [data, setData] = useState(iniziale.data)
  const [oraScelta, setOraScelta] = useState(iniziale.ora)
  const [erroreCampo, setErroreCampo] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const riuscito = useFocusSullaCall(idTitolo)

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    // every opening starts from the day after the call, at its time
    setData(iniziale.data)
    setOraScelta(iniziale.ora)
    setErroreCampo(null)
    setErrore(null)
  }

  function invia(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErrore(null)
    const input = { call_id: callId, data, ora: oraScelta }
    const problema = erroreGiornoFollowUp(input, { giorno, ora }, admin)
    if (problema) {
      setErroreCampo(problema)
      return
    }
    avvia(async () => {
      let esito
      try {
        esito = await fissaFollowUp(input)
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(FOLLOW_UP.fatto(nomeLead), { description: quandoFollowUpDa(data, oraScelta, oggi) })
      setAperto(false)
      // «Follow-up in chat» becomes «Call di follow-up: …»: this button goes, the focus goes to the card's title
      riuscito()
    })
  }

  return (
    <Sheet open={aperto} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={FOLLOW_UP.nomeBottone(nomeLead)}
            className="h-11 shrink-0 gap-1.5 px-3"
          />
        }
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        {FOLLOW_UP.bottone}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>{FOLLOW_UP.titolo(nomeLead)}</SheetTitle>
          <SheetDescription>{descrizione}</SheetDescription>
        </SheetHeader>

        <form onSubmit={invia} noValidate className="space-y-4 px-4">
          <CampiFollowUp
            id={id}
            data={data}
            ora={oraScelta}
            onData={(valore) => {
              setData(valore)
              setErroreCampo(null)
            }}
            onOra={(valore) => {
              setOraScelta(valore)
              setErroreCampo(null)
            }}
            oggi={oggi}
            admin={admin}
            setter={setter}
            errore={erroreCampo}
          />
          <p className="text-xs text-muted-foreground">{FOLLOW_UP.descrizione}</p>

          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full" disabled={inCorso}>
            {inCorso ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarPlus className="size-4" aria-hidden="true" />
            )}
            {FOLLOW_UP.salva}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
