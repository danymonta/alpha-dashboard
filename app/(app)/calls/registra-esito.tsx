'use client'

import {
  Ban,
  CalendarClock,
  ChevronLeft,
  CircleCheck,
  CircleX,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { registraEsito } from '@/app/(app)/calls/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ETICHETTA_ESITO, type EsitoCallInput, type SceltaEsito } from '@/lib/validation/esito'

type Props = {
  callId: string
  nomeLead: string
  descrizione: string
  giaRegistrata: boolean
  /** A call still to come can only be cancelled or moved, not closed. */
  futura: boolean
}

const SOLO_FUTURE: SceltaEsito[] = ['cancellata', 'riprogrammata']

const SCELTE: { esito: SceltaEsito; Icona: LucideIcon }[] = [
  { esito: 'chiusa', Icona: CircleCheck },
  { esito: 'follow_up', Icona: RotateCw },
  { esito: 'persa', Icona: CircleX },
  { esito: 'no_show', Icona: UserX },
  { esito: 'cancellata', Icona: Ban },
  { esito: 'riprogrammata', Icona: CalendarClock },
]

/**
 * Outcome in at most three taps: open (1), pick (2), and only for follow-up
 * or lost, say whether the lead was qualified (3). Closed jumps to the sale.
 */
export function RegistraEsito({ callId, nomeLead, descrizione, giaRegistrata, futura }: Props) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [inAttesaQualifica, setInAttesaQualifica] = useState<'follow_up' | 'persa' | null>(null)
  const [obiezione, setObiezione] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    if (!valore) {
      setInAttesaQualifica(null)
      setObiezione('')
      setErrore(null)
    }
  }

  function salva(input: EsitoCallInput) {
    setErrore(null)
    avvia(async () => {
      let esito
      try {
        esito = await registraEsito(input)
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(`${nomeLead}: ${ETICHETTA_ESITO[input.esito].toLowerCase()}`, {
        description: esito.vaiA ? 'Ora registra la vendita.' : undefined,
      })
      apriChiudi(false)
      if (esito.vaiA) router.push(esito.vaiA)
    })
  }

  function scegli(esito: SceltaEsito) {
    if (esito === 'follow_up' || esito === 'persa') {
      setInAttesaQualifica(esito)
      return
    }
    salva({ call_id: callId, esito })
  }

  return (
    <Sheet open={aperto} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant={giaRegistrata ? 'ghost' : futura ? 'outline' : 'default'}
            className="h-11 shrink-0"
          />
        }
      >
        {giaRegistrata ? 'Cambia esito' : futura ? 'Annulla o sposta' : 'Registra esito'}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-lg rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>{nomeLead}</SheetTitle>
          <SheetDescription>{descrizione}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          {inAttesaQualifica === null ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {SCELTE.filter(({ esito }) => !futura || SOLO_FUTURE.includes(esito)).map(({ esito, Icona }) => (
                  <Button
                    key={esito}
                    type="button"
                    variant={esito === 'chiusa' ? 'default' : 'outline'}
                    className="h-14 justify-start gap-2 px-3 text-sm"
                    disabled={inCorso}
                    onClick={() => scegli(esito)}
                  >
                    <Icona className="size-4" aria-hidden="true" />
                    {ETICHETTA_ESITO[esito]}
                  </Button>
                ))}
              </div>
              {giaRegistrata ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-muted-foreground"
                  disabled={inCorso}
                  onClick={() => salva({ call_id: callId, esito: 'programmata' })}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Annulla l’esito, torna da fare
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
                onClick={() => setInAttesaQualifica(null)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {ETICHETTA_ESITO[inAttesaQualifica]}: cambia esito
              </button>

              <div className="space-y-1.5">
                <Label htmlFor={`obiezione-${callId}`}>
                  Obiezione principale{' '}
                  <span className="font-normal text-muted-foreground">(facoltativa)</span>
                </Label>
                <Input
                  id={`obiezione-${callId}`}
                  value={obiezione}
                  onChange={(e) => setObiezione(e.currentTarget.value)}
                  maxLength={200}
                  placeholder="prezzo, tempo, ci devo pensare…"
                  className="h-11"
                />
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Era qualificata?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { etichetta: 'Sì', valore: true },
                    { etichetta: 'No', valore: false },
                  ].map(({ etichetta, valore }) => (
                    <Button
                      key={etichetta}
                      type="button"
                      variant="outline"
                      className="h-14"
                      disabled={inCorso}
                      onClick={() =>
                        salva({
                          call_id: callId,
                          esito: inAttesaQualifica,
                          qualificata: valore,
                          obiezione,
                        })
                      }
                    >
                      {etichetta}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {inCorso ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Salvataggio…
            </p>
          ) : null}

          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
