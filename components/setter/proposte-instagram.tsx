'use client'

import { Check, LoaderCircle, MessagesSquare, PencilLine, TriangleAlert, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
  EVENTO_PROPOSTA,
  EVENTO_PROPOSTA_FINE,
  PROPOSTA,
  VOCI_PROPOSTA,
  numeriDi,
  type DettaglioEventoProposta,
  type DettaglioEventoPropostaFine,
  type NumeriProposta,
  type PropostaInstagram,
} from '@/app/(app)/today/proposta-instagram'
import {
  confermaPropostaInstagram,
  scartaPropostaInstagram,
  type EsitoProposta,
} from '@/app/(app)/today/proposte-actions'
import { Stepper } from '@/components/numeri/stepper'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { formatNumero } from '@/lib/format'
import { MASSIMO_GIORNALIERO } from '@/lib/validation/report'

type Props = {
  /** The setter's proposals still to decide, most recent first (RLS: only his). */
  proposte: PropostaInstagram[]
  /** His own numbers of a proposal's day, by day, only where he wrote some. */
  tuoi: Record<string, NumeriProposta>
  oggi: string
  /** The day open in "Oggi" below. */
  dataAperta: string
  /** More proposals than the cards shown. */
  altre: boolean
  /** The proposals (or his numbers to compare them with) did not load. */
  errore: boolean
  /** Where the focus goes once the last card is decided: the page title (tabIndex -1). */
  idTitoloPagina: string
}

type Decisione = 'conferma' | 'correzione' | 'scarto'

const idTitolo = (id: string) => `proposta-${id}-titolo`

/**
 * The proposals of the setter's report from the Instagram DMs (Dany,
 * 08/10/2026), in "Oggi" only: one card for each day still to decide, never a
 * notification, a badge or a count anywhere else, and nothing at all when
 * there is none. "Conferma" copies the six numbers into his report of that
 * day, "Correggi" lets him change them first; when he had already written his
 * own, the card puts them side by side and "Tieni i miei" leaves the proposal.
 * A decided card goes, the focus moves to the next card (or to the page
 * title) and a polite status says what happened.
 */
export function ProposteInstagram({ proposte, tuoi, oggi, dataAperta, altre, errore, idTitoloPagina }: Props) {
  const [decise, setDecise] = useState<ReadonlySet<string>>(() => new Set())
  const [annuncio, setAnnuncio] = useState('')
  // where the focus goes after the next render, once the decided card is gone
  const fuoco = useRef<string | null>(null)

  const visibili = proposte.filter((p) => !decise.has(p.id))

  const decisa = useCallback(
    (id: string, frase: string) => {
      const i = visibili.findIndex((p) => p.id === id)
      const prossima = visibili[i + 1] ?? visibili[i - 1] ?? null
      setDecise((prima) => new Set(prima).add(id))
      fuoco.current = prossima ? idTitolo(prossima.id) : idTitoloPagina
      // emptied first, so the same words twice in a row are said again
      setAnnuncio('')
      window.setTimeout(() => setAnnuncio(frase), 50)
    },
    [visibili, idTitoloPagina],
  )

  // The decided card has gone and the focus with it: on to the next one. A
  // focus the person already moved elsewhere is never taken back.
  useEffect(() => {
    const destinazione = fuoco.current
    if (!destinazione) return
    fuoco.current = null
    const attivo = document.activeElement
    if (!attivo || attivo === document.body || !attivo.isConnected) {
      document.getElementById(destinazione)?.focus()
    }
  })

  return (
    <>
      <p role="status" className="sr-only" data-testid="annuncio-proposte">
        {annuncio}
      </p>

      {errore ? <ErroreProposte /> : null}

      {!errore && visibili.length > 0 ? (
        <section aria-label={PROPOSTA.regione} className="mb-4 space-y-3" data-testid="proposte-instagram">
          {visibili.map((proposta) => (
            <SchedaProposta
              key={proposta.id}
              proposta={proposta}
              tuoi={tuoi[proposta.data] ?? null}
              oggi={oggi}
              dataAperta={dataAperta}
              onDecisa={decisa}
            />
          ))}
          {altre ? <p className="px-1 text-xs text-muted-foreground">{PROPOSTA.altre}</p> : null}
        </section>
      ) : null}
    </>
  )
}

function ErroreProposte() {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
      data-testid="proposte-instagram-errore"
    >
      <p className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-status-critical" aria-hidden="true" />
        {PROPOSTA.errore}
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={inCorso}
        onClick={() => avvia(() => router.refresh())}
      >
        {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {PROPOSTA.riprova}
      </Button>
    </div>
  )
}

function SchedaProposta({
  proposta,
  tuoi,
  oggi,
  dataAperta,
  onDecisa,
}: {
  proposta: PropostaInstagram
  tuoi: NumeriProposta | null
  oggi: string
  dataAperta: string
  onDecisa: (id: string, frase: string) => void
}) {
  const router = useRouter()
  const idFoglio = useId()
  const [inCorso, avvia] = useTransition()
  const [quale, setQuale] = useState<Decisione | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [foglio, setFoglio] = useState(false)
  // Only the numbers he changed in "Correggi": every other one is the
  // proposal's as it is now, so a proposal recomputed while the sheet is open
  // (the confirmation refused with "sono cambiati") shows its new numbers in
  // the steppers too, and his changes stay
  const [corretti, setCorretti] = useState<Partial<NumeriProposta>>({})
  const valori: NumeriProposta = { ...numeriDi(proposta), ...corretti }

  const titolo = idTitolo(proposta.id)
  const occupato = inCorso

  function decidi(tipo: Decisione, corretti?: NumeriProposta) {
    if (occupato) return
    setErrore(null)
    setQuale(tipo)
    // "Oggi"'s form of this same day sends what it has not saved yet and stops
    // taking changes (listeners run right here, synchronously): the decision
    // waits for that save, so nothing of the form ever lands after it
    const attese: Promise<boolean>[] = []
    window.dispatchEvent(
      new CustomEvent<DettaglioEventoProposta>(EVENTO_PROPOSTA, { detail: { data: proposta.data, attese } }),
    )
    // the decision did not happen: the form is his again
    const ridaiIlForm = () =>
      window.dispatchEvent(
        new CustomEvent<DettaglioEventoPropostaFine>(EVENTO_PROPOSTA_FINE, { detail: { data: proposta.data } }),
      )
    // what the card shows now: the confirmation is refused if the proposal changed since
    const { id, calcolato_il } = proposta
    avvia(async () => {
      const salvati = await Promise.all(attese.map((attesa) => attesa.catch(() => false)))
      if (salvati.includes(false)) {
        // his own report of that day did not save: nothing is decided over it.
        // From the sheet the form's Riprova is behind it, and the next tap on
        // "Conferma questi numeri" saves the form first: the sheet's own words
        ridaiIlForm()
        setErrore(tipo === 'correzione' ? PROPOSTA.salvaPrimaFoglio : PROPOSTA.salvaPrima)
        return
      }

      let esito: EsitoProposta
      try {
        esito =
          tipo === 'scarto'
            ? await scartaPropostaInstagram({ id })
            : await confermaPropostaInstagram({ id, calcolato_il, valori: corretti })
      } catch {
        esito = { ok: false, errore: 'Connessione assente. Riprova.' }
      }

      if (!esito.ok) {
        ridaiIlForm()
        toast.error(esito.errore)
        if (esito.chiusa) {
          // decided elsewhere, or gone: the card leaves with the reason said
          setFoglio(false)
          onDecisa(proposta.id, esito.errore)
        } else {
          setErrore(esito.errore)
        }
        return
      }

      const frase = PROPOSTA.fatto[tipo](proposta.data, oggi)
      if (tipo === 'scarto') {
        toast.success(frase)
      } else {
        toast.success(frase, {
          description: PROPOSTA.dopo,
          action:
            proposta.data !== dataAperta
              ? { label: PROPOSTA.apriGiorno, onClick: () => router.push(`/today?data=${proposta.data}`) }
              : undefined,
        })
      }
      setFoglio(false)
      onDecisa(proposta.id, frase)
    })
  }

  function apriChiudi(aperto: boolean) {
    if (occupato) return
    setFoglio(aperto)
    // every opening starts from the proposal's numbers
    setCorretti({})
    setErrore(null)
  }

  function inviaCorrezione(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    decidi('correzione', valori)
  }

  const iconaDi = (tipo: Decisione, Icona: typeof Check) =>
    inCorso && quale === tipo ? (
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
    ) : (
      <Icona className="size-4" aria-hidden="true" />
    )

  const avviso = errore ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {errore}
    </p>
  ) : null

  const correggi = (
    <Sheet open={foglio} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={<Button type="button" variant="outline" className="h-11 gap-1.5" disabled={occupato} />}
        aria-describedby={titolo}
      >
        <PencilLine className="size-4" aria-hidden="true" />
        {PROPOSTA.correggi}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
        data-testid="foglio-correggi-proposta"
      >
        <SheetHeader>
          <SheetTitle>{PROPOSTA.titoloFoglio(proposta.data, oggi)}</SheetTitle>
          <SheetDescription>{PROPOSTA.descrizioneFoglio}</SheetDescription>
        </SheetHeader>

        <form onSubmit={inviaCorrezione} noValidate className="space-y-4 px-4" aria-describedby={`${idFoglio}-nota`}>
          <div className="divide-y divide-border rounded-xl bg-card px-3">
            {VOCI_PROPOSTA.map(({ campo, etichetta }) => (
              <div key={campo} className="pb-2">
                <Stepper
                  etichetta={etichetta}
                  valore={valori[campo]}
                  massimo={MASSIMO_GIORNALIERO}
                  onCambia={(n) => setCorretti((prima) => ({ ...prima, [campo]: n }))}
                  className="pb-0.5"
                />
                <p className="num text-xs leading-snug text-muted-foreground">
                  {tuoi
                    ? PROPOSTA.confrontoFoglio(formatNumero(proposta[campo]), formatNumero(tuoi[campo]))
                    : `${PROPOSTA.instagram} ${formatNumero(proposta[campo])}`}
                </p>
              </div>
            ))}
          </div>
          <p id={`${idFoglio}-nota`} className="text-xs text-muted-foreground">
            {PROPOSTA.dopo}
          </p>

          {avviso}

          <Button type="submit" className="h-11 w-full" disabled={occupato}>
            {iconaDi('correzione', Check)}
            {PROPOSTA.confermaCorretti}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )

  return (
    <article
      aria-labelledby={titolo}
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
      data-testid="proposta-instagram"
      data-giorno={proposta.data}
    >
      <div className="flex items-start gap-2.5">
        <MessagesSquare className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-0.5">
          <h2 id={titolo} tabIndex={-1} className="font-heading text-base font-medium outline-none">
            {PROPOSTA.titolo(proposta.data, oggi)}
          </h2>
          <p className="text-sm leading-snug text-muted-foreground">{PROPOSTA.spiegazione}</p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-border" data-testid="proposta-numeri">
        {VOCI_PROPOSTA.map(({ campo, etichetta }) => (
          <div key={campo} className="flex min-h-10 items-center justify-between gap-3 py-1.5" data-campo={campo}>
            <dt className="min-w-0 text-sm">{etichetta}</dt>
            <dd className="shrink-0 text-right text-sm">
              {tuoi ? (
                <>
                  <span className="text-muted-foreground">
                    {PROPOSTA.tu} <span className="num">{formatNumero(tuoi[campo])}</span>
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    {' · '}
                  </span>
                  <span>
                    {PROPOSTA.instagram}{' '}
                    <span className="num font-semibold">{formatNumero(proposta[campo])}</span>
                  </span>
                </>
              ) : (
                <span className="num text-base font-semibold">{formatNumero(proposta[campo])}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p>{PROPOSTA.prenotate}</p>
        <p data-testid="proposta-chat">
          {PROPOSTA.chatLette(proposta.chat_lette)}
          {proposta.chat_incerte > 0 ? ` · ${PROPOSTA.chatIncerte(proposta.chat_incerte)}` : null}
        </p>
      </div>

      {!foglio && avviso ? <div className="mt-3">{avviso}</div> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {tuoi ? (
          <>
            <Button
              type="button"
              className="col-span-2 h-11"
              disabled={occupato}
              aria-describedby={titolo}
              onClick={() => decidi('conferma')}
            >
              {iconaDi('conferma', Check)}
              {PROPOSTA.usaInstagram}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={occupato}
              aria-describedby={titolo}
              onClick={() => decidi('scarto')}
            >
              {iconaDi('scarto', Undo2)}
              {PROPOSTA.tieniMiei}
            </Button>
            {correggi}
          </>
        ) : (
          <>
            <Button
              type="button"
              className="h-11"
              disabled={occupato}
              aria-describedby={titolo}
              onClick={() => decidi('conferma')}
            >
              {iconaDi('conferma', Check)}
              {PROPOSTA.conferma}
            </Button>
            {correggi}
          </>
        )}
      </div>
    </article>
  )
}
