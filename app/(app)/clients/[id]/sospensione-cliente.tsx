'use client'

import { CirclePause, CirclePlay, Info, LoaderCircle, Pencil } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { riattivaCliente, sospendiCliente } from '@/app/(app)/clients/actions'
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
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato } from '@/lib/format'
import { CLIENTI } from '@/lib/i18n/testi/clienti'
import { MOTIVO_SOSPENSIONE_MAX, sospensioneClienteSchema } from '@/lib/validation/sospensione'

/** What putting a client on hold does, before the confirmation. */
const COSA_CAMBIA = [
  'Risulta «Sospeso» in Clienti, in una scheda a parte: esce da «In scadenza» e dai rinnovi da chiamare, e non partono i promemoria del suo percorso.',
  'Il percorso e le rate restano come sono: le date non si spostano e gli incassi continuano a contare.',
  'Con «Riattiva» torna con lo stato che dicono le date; se compra di nuovo o lo chiudi con «Non rinnova», la sospensione finisce da sola.',
]

type Sospensione = { sospeso_il: string; motivo: string | null }

/**
 * "Sospendi" (Dany, 21/10/2026): the admin puts a client on hold from a day
 * (today by default) with an optional reason. Opened on a suspended client
 * (the pencil), it changes the day or the reason.
 */
export function Sospendi({
  clientId,
  cliente,
  oggi,
  sospensione = null,
}: {
  clientId: string
  cliente: string
  oggi: string
  sospensione?: Sospensione | null
}) {
  const id = useId()
  const [aperto, setAperto] = useState(false)
  const [giorno, setGiorno] = useState(sospensione?.sospeso_il ?? oggi)
  const [motivo, setMotivo] = useState(sospensione?.motivo ?? '')
  const [errori, setErrori] = useState<{ giorno?: string; motivo?: string }>({})
  const [inCorso, setInCorso] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()

  async function conferma(evento: React.FormEvent) {
    evento.preventDefault()
    const dati = { client_id: clientId, sospeso_il: giorno, motivo }
    const verifica = sospensioneClienteSchema.safeParse(dati)
    if (!verifica.success) {
      const campo = (nome: string) => verifica.error.issues.find((i) => i.path[0] === nome)?.message
      setErrori({ giorno: campo('sospeso_il'), motivo: campo('motivo') })
      return
    }
    setErrori({})
    setInCorso(true)
    const fatto = await salva(() => sospendiCliente(dati), sospensione ? 'Sospensione aggiornata' : 'Cliente sospeso')
    setInCorso(false)
    if (fatto) setAperto(false)
  }

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        // always on what is saved
        setGiorno(sospensione?.sospeso_il ?? oggi)
        setMotivo(sospensione?.motivo ?? '')
        setErrori({})
        setErrore(null)
      }}
      trigger={
        sospensione ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground"
            aria-label="Modifica giorno e motivo della sospensione"
            data-testid="modifica-sospensione"
          />
        ) : (
          <Button type="button" variant="outline" className="h-11" data-testid="sospendi" />
        )
      }
      contenutoTrigger={
        sospensione ? (
          <Pencil className="size-4" aria-hidden="true" />
        ) : (
          <>
            <CirclePause className="size-4" aria-hidden="true" />
            Sospendi
          </>
        )
      }
      titolo="Sospendi"
      descrizione={
        sospensione
          ? `${cliente} è sospeso: correggi il giorno o il motivo.`
          : `${cliente} va in pausa: lo sospendi e lo trovi nella scheda «Sospesi» di Clienti.`
      }
    >
      <form onSubmit={conferma} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-giorno`}>Sospeso dal</Label>
          <Input
            id={`${id}-giorno`}
            type="date"
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
            Di solito oggi; mai nel futuro.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-motivo`}>
            Perché lo sospendi <span className="font-normal text-muted-foreground">(facoltativo)</span>
          </Label>
          <Textarea
            id={`${id}-motivo`}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.currentTarget.value)
              setErrori((x) => ({ ...x, motivo: undefined }))
            }}
            maxLength={MOTIVO_SOSPENSIONE_MAX}
            rows={3}
            placeholder="Es. viaggio di lavoro, riprende tra due settimane"
            aria-invalid={errori.motivo ? true : undefined}
            aria-describedby={errori.motivo ? `${id}-motivo-errore` : `${id}-motivo-conta`}
            className="max-h-40"
          />
          <ErroreCampo id={`${id}-motivo-errore`} messaggio={errori.motivo} />
          <p id={`${id}-motivo-conta`} className="num text-right text-xs text-muted-foreground">
            {motivo.length}/{MOTIVO_SOSPENSIONE_MAX}
          </p>
        </div>

        {sospensione ? null : (
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
        <BottoneSalva inCorso={inCorso}>{sospensione ? 'Salva' : 'Sospendi il cliente'}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/**
 * "Riattiva": the hold goes and the status comes back from the sale dates.
 * A question first: the day and the reason of the hold are lost.
 */
export function RiattivaCliente({ clientId, cliente }: { clientId: string; cliente: string }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function conferma() {
    setErrore(null)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof riattivaCliente>>
      try {
        esito = await riattivaCliente({ client_id: clientId })
      } catch {
        setErrore('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success('Cliente riattivato')
      setAperto(false)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 shrink-0"
        aria-label={`Riattiva ${cliente}`}
        data-testid="riattiva"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <CirclePlay className="size-4" aria-hidden="true" />
        Riattiva
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Riattivare {cliente}?</DialogTitle>
            <DialogDescription>
              Torna con lo stato che dicono le date del suo percorso (di nuovo in «In scadenza» se ci rientra, con i
              promemoria ancora dovuti). Il giorno e il motivo della sospensione si tolgono; percorso, rate e incassi
              restano come sono.
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
            <Button type="button" className="h-11" disabled={inCorso} data-testid="conferma-riattiva" onClick={conferma}>
              {inCorso ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CirclePlay className="size-4" aria-hidden="true" />
              )}
              Riattiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** On a suspended client's sheet: since when, why, and the ways back. */
export function SospensioneCliente({
  clientId,
  cliente,
  oggi,
  sospensione,
  solaLettura = false,
}: {
  clientId: string
  cliente: string
  oggi: string
  sospensione: Sospensione
  /** The business coach reads it and never changes it (22/10/2026). */
  solaLettura?: boolean
}) {
  const lingua = useLingua()
  const t = CLIENTI[lingua]
  const { formatData } = formato(lingua)
  return (
    <section
      aria-label={t.sospensione}
      data-testid="sospensione-cliente"
      className="flex items-start gap-3 rounded-xl bg-card py-2 pr-1.5 pl-3"
    >
      <CirclePause className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 py-1.5">
        <p className="text-sm font-medium">
          {t.sospesoDalRiga} <span className="num">{formatData(sospensione.sospeso_il)}</span>
          {sospensione.motivo ? <span className="font-normal text-muted-foreground"> · {sospensione.motivo}</span> : null}
        </p>
        {sospensione.motivo ? null : <p className="mt-0.5 text-xs text-muted-foreground">{t.nessunMotivo}</p>}
      </div>
      {solaLettura ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <Sospendi clientId={clientId} cliente={cliente} oggi={oggi} sospensione={sospensione} />
          <RiattivaCliente clientId={clientId} cliente={cliente} />
        </div>
      )}
    </section>
  )
}
