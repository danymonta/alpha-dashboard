'use client'

import { Archive, ArchiveRestore, Info, LoaderCircle, Pencil } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { chiudiCliente, riapriCliente } from '@/app/(app)/clients/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatData } from '@/lib/format'
import { chiusuraClienteSchema, MOTIVO_CHIUSURA_MAX } from '@/lib/validation/chiusura'

/** What closing a client does, before the confirmation. */
const COSA_CAMBIA = [
  'Risulta «Chiuso» in Clienti, anche se il percorso è ancora in corso: il coach continua fino alla fine.',
  'Esce da «In scadenza» e «Da recuperare» e non ti arrivano più i promemoria del suo percorso: in Rinnovi lo trovi sotto «Non rinnovano».',
  'Vendite, rate e incassi restano come sono. Se compra di nuovo torna da solo tra i clienti; puoi anche riaprirlo tu.',
]

type Chiusura = { chiuso_il: string; motivo: string | null }

/**
 * "Non rinnova" (Dany, 04/10/2026): the admin closes a client who does not
 * renew, from a day (today by default) and with an optional reason. Opened on
 * a closed client (the pencil), it changes the day or the reason.
 */
export function NonRinnova({
  clientId,
  cliente,
  oggi,
  minimo,
  chiusura = null,
}: {
  clientId: string
  cliente: string
  oggi: string
  /** The day the client's latest path was signed: the closure starts from there. */
  minimo: string | null
  chiusura?: Chiusura | null
}) {
  const id = useId()
  const [aperto, setAperto] = useState(false)
  const [giorno, setGiorno] = useState(chiusura?.chiuso_il ?? oggi)
  const [motivo, setMotivo] = useState(chiusura?.motivo ?? '')
  const [errori, setErrori] = useState<{ giorno?: string; motivo?: string }>({})
  const [inCorso, setInCorso] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()

  async function conferma(evento: React.FormEvent) {
    evento.preventDefault()
    const dati = { client_id: clientId, chiuso_il: giorno, motivo }
    const verifica = chiusuraClienteSchema.safeParse(dati)
    if (!verifica.success) {
      const campo = (nome: string) => verifica.error.issues.find((i) => i.path[0] === nome)?.message
      setErrori({ giorno: campo('chiuso_il'), motivo: campo('motivo') })
      return
    }
    setErrori({})
    setInCorso(true)
    const fatto = await salva(() => chiudiCliente(dati), chiusura ? 'Chiusura aggiornata' : 'Cliente chiuso')
    setInCorso(false)
    if (fatto) setAperto(false)
  }

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        // always on what is saved
        setGiorno(chiusura?.chiuso_il ?? oggi)
        setMotivo(chiusura?.motivo ?? '')
        setErrori({})
        setErrore(null)
      }}
      trigger={
        chiusura ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground"
            aria-label="Modifica giorno e motivo della chiusura"
          />
        ) : (
          <Button type="button" variant="outline" className="h-11" data-testid="non-rinnova" />
        )
      }
      contenutoTrigger={
        chiusura ? (
          <Pencil className="size-4" aria-hidden="true" />
        ) : (
          <>
            <Archive className="size-4" aria-hidden="true" />
            Non rinnova
          </>
        )
      }
      titolo="Non rinnova"
      descrizione={
        chiusura
          ? `${cliente} è chiuso: correggi il giorno o il motivo.`
          : `${cliente} non rinnova: lo chiudi e va tra i clienti chiusi, in una categoria a parte.`
      }
    >
      <form onSubmit={conferma} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-giorno`}>Chiuso dal</Label>
          <Input
            id={`${id}-giorno`}
            type="date"
            min={minimo && minimo <= oggi ? minimo : undefined}
            max={oggi}
            value={giorno}
            onChange={(e) => {
              setGiorno(e.target.value)
              setErrori((x) => ({ ...x, giorno: undefined }))
            }}
            aria-invalid={errori.giorno ? true : undefined}
            aria-describedby={errori.giorno ? `${id}-giorno-errore` : `${id}-giorno-aiuto`}
            className="num h-11 [color-scheme:dark]"
          />
          <ErroreCampo id={`${id}-giorno-errore`} messaggio={errori.giorno} />
          <p id={`${id}-giorno-aiuto`} className="text-xs text-muted-foreground">
            Di solito oggi; mai nel futuro
            {minimo ? (
              <>
                {' '}
                né prima del <span className="num">{formatData(minimo)}</span>, quando ha firmato l’ultimo percorso
              </>
            ) : null}
            .
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-motivo`}>
            Perché non rinnova <span className="font-normal text-muted-foreground">(facoltativo)</span>
          </Label>
          <Textarea
            id={`${id}-motivo`}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.currentTarget.value)
              setErrori((x) => ({ ...x, motivo: undefined }))
            }}
            maxLength={MOTIVO_CHIUSURA_MAX}
            rows={3}
            placeholder="Es. ha raggiunto l’obiettivo, si allena da solo"
            aria-invalid={errori.motivo ? true : undefined}
            aria-describedby={errori.motivo ? `${id}-motivo-errore` : `${id}-motivo-conta`}
            className="max-h-40"
          />
          <ErroreCampo id={`${id}-motivo-errore`} messaggio={errori.motivo} />
          <p id={`${id}-motivo-conta`} className="num text-right text-xs text-muted-foreground">
            {motivo.length}/{MOTIVO_CHIUSURA_MAX}
          </p>
        </div>

        {chiusura ? null : (
          <ul className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm" aria-label="Cosa cambia">
            {COSA_CAMBIA.map((frase) => (
              <li key={frase} className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {frase}
              </li>
            ))}
          </ul>
        )}

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={inCorso}>{chiusura ? 'Salva' : 'Chiudi il cliente'}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/**
 * "Riapri": the closure goes and the status comes back from the sale dates.
 * A question first: the day and the reason of the closure are lost.
 */
export function RiapriCliente({ clientId, cliente }: { clientId: string; cliente: string }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function conferma() {
    setErrore(null)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof riapriCliente>>
      try {
        esito = await riapriCliente({ client_id: clientId })
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success('Cliente riaperto')
      setAperto(false)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 shrink-0"
        aria-label={`Riapri ${cliente}`}
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <ArchiveRestore className="size-4" aria-hidden="true" />
        Riapri
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Riaprire {cliente}?</DialogTitle>
            <DialogDescription>
              Torna con lo stato che dicono le date del suo percorso: di nuovo in «In scadenza» o «Da recuperare» se ci
              rientra, con i promemoria del percorso ancora dovuti. Il giorno e il motivo della chiusura si tolgono.
            </DialogDescription>
          </DialogHeader>
          {errore ? (
            <p role="alert" className="text-sm text-status-critical">
              {errore}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setAperto(false)}>
              Annulla
            </Button>
            <Button type="button" className="h-11" disabled={inCorso} onClick={conferma}>
              {inCorso ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArchiveRestore className="size-4" aria-hidden="true" />
              )}
              Riapri
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** On a closed client's sheet: since when, why, and the two ways back. */
export function ChiusuraCliente({
  clientId,
  cliente,
  oggi,
  minimo,
  chiusura,
}: {
  clientId: string
  cliente: string
  oggi: string
  minimo: string | null
  chiusura: Chiusura
}) {
  return (
    <section
      aria-label="Chiusura del cliente"
      data-testid="chiusura-cliente"
      className="flex flex-wrap items-start gap-3 rounded-xl bg-card py-2 pr-1.5 pl-3"
    >
      <Archive className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-40 py-1.5">
        <p className="text-sm font-medium">
          Non rinnova · chiuso il <span className="num">{formatData(chiusura.chiuso_il)}</span>
        </p>
        {chiusura.motivo ? (
          <p className="mt-0.5 text-sm break-words whitespace-pre-line text-muted-foreground">{chiusura.motivo}</p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Nessun motivo scritto</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NonRinnova clientId={clientId} cliente={cliente} oggi={oggi} minimo={minimo} chiusura={chiusura} />
        <RiapriCliente clientId={clientId} cliente={cliente} />
      </div>
    </section>
  )
}
