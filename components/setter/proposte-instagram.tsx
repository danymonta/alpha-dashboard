'use client'

import { Check, CircleCheck, LoaderCircle, MessagesSquare, PencilLine, TriangleAlert, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { confermaPropostaAdmin, scartaPropostaAdmin } from '@/app/(app)/setting/proposte-actions'
import {
  DA_APPROVARE,
  EVENTO_PROPOSTA,
  EVENTO_PROPOSTA_FINE,
  PROPOSTA,
  VOCI_PROPOSTA,
  numeriDi,
  paroleScheda,
  type ChiDecide,
  type Decisione,
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
import { cn } from '@/lib/utils'
import { MASSIMO_GIORNALIERO } from '@/lib/validation/report'

type Props = {
  /**
   * Who decides here: the setter on his own days ("Oggi", the default), the
   * admin on every setter's (the "Setter" page, 08/10/2026).
   */
  per?: ChiDecide
  /** The proposals still to decide, most recent first (RLS: the setter's own; every setter's for the admin). */
  proposte: PropostaInstagram[]
  /** The setter's own numbers of a proposal's day, by proposal id, only where he wrote some. */
  suoi: Record<string, NumeriProposta>
  oggi: string
  /** The day open in "Oggi" below (the setter's page only). */
  dataAperta?: string
  /** More proposals than the cards shown. */
  altre: boolean
  /** The proposals (or the setter's numbers to compare them with) did not load. */
  errore: boolean
  /**
   * Where the focus goes once the last card is decided (tabIndex -1): the page
   * title in "Oggi"; on the admin's page, the section's own title, rendered here.
   */
  idTitoloPagina: string
  /** The admin's section: how many days to decide in all (the cards stop at PROPOSTE_MAX). */
  totale?: number
}

const idTitolo = (id: string) => `proposta-${id}-titolo`

/**
 * The proposals of the setter's report from the Instagram DMs (Dany,
 * 08/10/2026): one card for each day still to decide, and nothing at all when
 * there is none. "Conferma" copies the six numbers into the setter's report of
 * that day, "Correggi" changes them first; when he had already written his
 * own, the card puts them side by side and "Tieni i miei" leaves the proposal.
 * In "Oggi" the setter decides his own days; on the "Setter" page the admin
 * decides every setter's, in the section «Tracciamento da approvare», with the
 * setter's name on each card (the first decision wins, his or the setter's).
 * A decided card goes, the focus moves to the next card (or to the title) and
 * a polite status says what happened.
 */
export function ProposteInstagram({
  per = 'setter',
  proposte,
  suoi,
  oggi,
  dataAperta,
  altre,
  errore,
  idTitoloPagina,
  totale,
}: Props) {
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

  const stato = (
    <p role="status" className="sr-only" data-testid="annuncio-proposte">
      {annuncio}
    </p>
  )

  const schede = visibili.map((proposta) => (
    <SchedaProposta
      key={proposta.id}
      per={per}
      proposta={proposta}
      suoi={suoi[proposta.id] ?? null}
      oggi={oggi}
      dataAperta={dataAperta ?? null}
      onDecisa={decisa}
    />
  ))

  if (per === 'admin') {
    // the cards decided on this visit, still in the page's list until it reloads
    const giaDecise = proposte.filter((p) => decise.has(p.id)).length
    const rimaste = Math.max(0, (totale ?? proposte.length) - giaDecise)
    // nothing to decide when the page opened: no section at all
    if (!errore && proposte.length === 0 && decise.size === 0) return stato
    return (
      <section
        id={DA_APPROVARE.ancora}
        aria-labelledby={idTitoloPagina}
        className="@container scroll-mt-20 space-y-2"
        data-testid="da-approvare"
      >
        {stato}
        <div className="px-1">
          <h2
            id={idTitoloPagina}
            tabIndex={-1}
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase outline-none"
          >
            {rimaste > 0 ? `${DA_APPROVARE.titolo} (${formatNumero(rimaste)})` : DA_APPROVARE.titolo}
          </h2>
          {visibili.length > 0 ? <p className="text-sm text-muted-foreground">{DA_APPROVARE.descrizione}</p> : null}
        </div>
        {errore ? (
          <ErroreProposte testo={DA_APPROVARE.errore} />
        ) : visibili.length > 0 ? (
          <>
            {/* two columns only where a card keeps its room (about 440 px each): the
                section's own width, never the screen's, next to the sidebar */}
            <div className="grid items-start gap-3 @4xl:grid-cols-2" data-testid="proposte-instagram">
              {schede}
            </div>
            {altre ? <p className="px-1 text-xs text-muted-foreground">{DA_APPROVARE.altre}</p> : null}
          </>
        ) : (
          <p className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground">
            <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
            {DA_APPROVARE.finito}
          </p>
        )}
      </section>
    )
  }

  return (
    <>
      {stato}

      {errore ? <ErroreProposte testo={PROPOSTA.errore} margine /> : null}

      {!errore && visibili.length > 0 ? (
        <section aria-label={PROPOSTA.regione} className="mb-4 space-y-3" data-testid="proposte-instagram">
          {schede}
          {altre ? <p className="px-1 text-xs text-muted-foreground">{PROPOSTA.altre}</p> : null}
        </section>
      ) : null}
    </>
  )
}

function ErroreProposte({ testo, margine = false }: { testo: string; margine?: boolean }) {
  const router = useRouter()
  const [inCorso, avvia] = useTransition()
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm',
        margine && 'mb-4',
      )}
      data-testid="proposte-instagram-errore"
    >
      <p className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-status-critical" aria-hidden="true" />
        {testo}
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
  per,
  proposta,
  suoi,
  oggi,
  dataAperta,
  onDecisa,
}: {
  per: ChiDecide
  proposta: PropostaInstagram
  /** The setter's own numbers of that day, when he wrote some. */
  suoi: NumeriProposta | null
  oggi: string
  /** The day open in "Oggi" below (null on the admin's page). */
  dataAperta: string | null
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
  const parole = paroleScheda(proposta, oggi, per)
  // the cards inside the admin's section sit under its h2
  const Titolo = per === 'admin' ? 'h3' : 'h2'

  function decidi(tipo: Decisione, corretti?: NumeriProposta) {
    if (occupato) return
    setErrore(null)
    setQuale(tipo)
    // "Oggi"'s form of this same day sends what it has not saved yet and stops
    // taking changes (listeners run right here, synchronously): the decision
    // waits for that save, so nothing of the form ever lands after it. The
    // admin's page has no form of that day: nothing to wait for
    const attese: Promise<boolean | 'cambiato'>[] = []
    if (per === 'setter') {
      window.dispatchEvent(
        new CustomEvent<DettaglioEventoProposta>(EVENTO_PROPOSTA, { detail: { data: proposta.data, attese } }),
      )
    }
    // the decision did not happen: the form is his again
    const ridaiIlForm = () => {
      if (per !== 'setter') return
      window.dispatchEvent(
        new CustomEvent<DettaglioEventoPropostaFine>(EVENTO_PROPOSTA_FINE, { detail: { data: proposta.data } }),
      )
    }
    // what the card shows now: the confirmation is refused if the proposal changed since
    const { id, calcolato_il } = proposta
    avvia(async () => {
      const salvati = await Promise.all(attese.map((attesa) => attesa.catch(() => false as const)))
      if (salvati.includes('cambiato')) {
        // the day changed elsewhere (a decision of the admin, another device):
        // the form reads it again, and this card comes back with it
        ridaiIlForm()
        setErrore(PROPOSTA.cambiatoPrima)
        return
      }
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
        if (per === 'admin') {
          // the setter's numbers he saw: never replaced if the setter changed them meanwhile
          esito =
            tipo === 'scarto'
              ? await scartaPropostaAdmin({ id })
              : await confermaPropostaAdmin({ id, calcolato_il, valori: corretti, visti: suoi })
        } else {
          esito =
            tipo === 'scarto'
              ? await scartaPropostaInstagram({ id })
              : await confermaPropostaInstagram({ id, calcolato_il, valori: corretti })
        }
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

      const frase = parole.fatto[tipo]
      if (tipo === 'scarto' && !parole.dopoLoScarto) {
        toast.success(frase)
      } else {
        toast.success(frase, {
          description: parole.dopo,
          // the setter's other day opens in "Oggi"; the admin has no "Oggi"
          action:
            per === 'setter' && tipo !== 'scarto' && proposta.data !== dataAperta
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
        render={<Button type="button" variant="outline" className="h-auto min-h-11 gap-1.5" disabled={occupato} />}
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
          <SheetTitle>{parole.titoloFoglio}</SheetTitle>
          <SheetDescription>{parole.descrizioneFoglio}</SheetDescription>
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
                  {suoi
                    ? parole.confrontoFoglio(formatNumero(proposta[campo]), formatNumero(suoi[campo]))
                    : `${PROPOSTA.instagram} ${formatNumero(proposta[campo])}`}
                </p>
              </div>
            ))}
          </div>
          <p id={`${idFoglio}-nota`} className="text-xs text-muted-foreground">
            {parole.dopo}
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
      data-proposta={proposta.id}
    >
      <div className="flex items-start gap-2.5">
        <MessagesSquare className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-0.5">
          <Titolo id={titolo} tabIndex={-1} className="font-heading text-base font-medium outline-none">
            {parole.titolo}
          </Titolo>
          <p className="text-sm leading-snug text-muted-foreground">{parole.spiegazione}</p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-border" data-testid="proposta-numeri">
        {VOCI_PROPOSTA.map(({ campo, etichetta }) => (
          <div key={campo} className="flex min-h-10 items-center justify-between gap-3 py-1.5" data-campo={campo}>
            {/* a narrow card: the label goes on two lines, and the two numbers one under the other */}
            <dt className="min-w-0 text-sm break-words hyphens-auto">{etichetta}</dt>
            <dd className="min-w-0 text-right text-sm">
              {suoi ? (
                <>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {parole.suoi} <span className="num">{formatNumero(suoi[campo])}</span>
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    {' · '}
                  </span>
                  <span className="whitespace-nowrap">
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
        <p>{parole.prenotate}</p>
        <p data-testid="proposta-chat">
          {PROPOSTA.chatLette(proposta.chat_lette)}
          {proposta.chat_incerte > 0 ? ` · ${PROPOSTA.chatIncerte(proposta.chat_incerte)}` : null}
        </p>
      </div>

      {!foglio && avviso ? <div className="mt-3">{avviso}</div> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {suoi ? (
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
            {/* "Tieni quelli di Massimiliano": a long first name goes on two lines, never out of the button */}
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 py-2 text-balance whitespace-normal"
              disabled={occupato}
              aria-describedby={titolo}
              onClick={() => decidi('scarto')}
            >
              {iconaDi('scarto', Undo2)}
              {parole.tieni}
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
