'use client'

import { Archive, ArchiveRestore, Info, LoaderCircle, Pencil, Undo2, UserMinus } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { archiviaCliente, chiudiCliente, riapriCliente, togliDallArchivio } from '@/app/(app)/clients/actions'
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

type Chiusura = { chiuso_il: string; motivo: string | null; archiviato_il: string | null }

/** Sonner draws its buttons 24px high: Annulla gets the 44px target. */
const AZIONE_TOAST = 'h-11! px-4! text-sm!'

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
            // archived: the closure never comes after the archiving day
            max={chiusura?.archiviato_il ?? oggi}
            value={giorno}
            onChange={(e) => {
              setGiorno(e.target.value)
              setErrori((x) => ({ ...x, giorno: undefined }))
            }}
            aria-invalid={errori.giorno ? true : undefined}
            aria-describedby={errori.giorno ? `${id}-giorno-errore` : `${id}-giorno-aiuto`}
            className="num h-11"
          />
          <ErroreCampo id={`${id}-giorno-errore`} messaggio={errori.giorno} />
          <p id={`${id}-giorno-aiuto`} className="text-xs text-muted-foreground">
            Di solito oggi; mai nel futuro
            {chiusura?.archiviato_il ? (
              <>
                {' '}
                né dopo il <span className="num">{formatData(chiusura.archiviato_il)}</span>, quando l’hai archiviato
              </>
            ) : null}
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
              rientra, con i promemoria del percorso ancora dovuti. Il giorno e il motivo della chiusura si tolgono, e
              l’archivio se l’avevi archiviato.
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

async function chiama<T>(azione: () => Promise<T>): Promise<T | { ok: false; errore: string }> {
  try {
    return await azione()
  } catch {
    return { ok: false as const, errore: 'Connessione assente. Riprova.' }
  }
}

/**
 * "Togli dall'archivio", from the button or from the toast's Annulla: back to
 * "Chiuso". `soloSeVersione`: the toast undoes only the archive its tap wrote
 * (the closure's version archiviaCliente returned), never one written again
 * elsewhere, even the same day.
 */
async function togli(clientId: string, cliente: string, soloSeVersione?: string) {
  const esito = await chiama(() => togliDallArchivio({ client_id: clientId, solo_se_versione: soloSeVersione }))
  if (!esito.ok) {
    toast.error(esito.errore)
    return
  }
  toast.success('Tolto dall’archivio', { description: `${cliente} è di nuovo tra i clienti chiusi.` })
}

/** "Archivia come ex cliente": from today; one archived meanwhile keeps his day, without "Annulla". */
async function archivia(clientId: string, cliente: string) {
  const esito = await chiama(() => archiviaCliente({ client_id: clientId }))
  if (!esito.ok) {
    toast.error(esito.errore)
    return
  }
  if (esito.gia) {
    toast.info('Era già archiviato', {
      description: `${cliente} è tra gli ex clienti dal ${formatData(esito.archiviato_il)}.`,
    })
    return
  }
  const versione = esito.versione
  toast.success('Archiviato come ex cliente', {
    description: `${cliente} è tra gli ex clienti: lo trovi in Clienti, filtro «Ex cliente».`,
    duration: 6000,
    action: { label: 'Annulla', onClick: () => void togli(clientId, cliente, versione) },
    classNames: { actionButton: AZIONE_TOAST },
  })
}

/** Remembers, before the tap, where the focus goes if the archived row leaves the list. */
type RicordaFocus = (bottone: HTMLElement, cliente: string) => void
const FocusDopoArchivio = createContext<RicordaFocus | null>(null)

/** How long after the tap a row that leaves the list still moves the focus. */
const ATTESA_FOCUS_MS = 15_000

/**
 * A list whose rows leave it once archived ("Non rinnovano" in Rinnovi): the
 * row goes and its button with it, and the focus would fall to the page.
 * From the tap on "Archivia", the section is watched: when that button leaves
 * the page and the focus with it, the focus moves to the next row's
 * "Archivia", else to the link to the archived clients
 * (`data-focus-archivio="archiviati"`), else to the section's heading
 * (`data-focus-archivio="titolo"`, tabIndex -1), and a polite status says
 * where. A focus the person already moved elsewhere is never taken back.
 */
export function SezioneArchiviabile({ children, ...props }: React.ComponentProps<'section'>) {
  const sezione = useRef<HTMLElement>(null)
  const osservatore = useRef<MutationObserver | null>(null)
  const scadenza = useRef<number | undefined>(undefined)
  const [annuncio, setAnnuncio] = useState('')

  const smetti = useCallback(() => {
    osservatore.current?.disconnect()
    osservatore.current = null
    window.clearTimeout(scadenza.current)
  }, [])
  useEffect(() => smetti, [smetti])

  const sposta = useCallback((prossima: Element | null, cliente: string) => {
    const attivo = document.activeElement
    if (attivo && attivo !== document.body) return
    const radice = sezione.current
    const bottone = prossima?.isConnected ? prossima.querySelector<HTMLElement>('[data-archivia]') : null
    const archiviati = radice?.querySelector<HTMLElement>('[data-focus-archivio="archiviati"]') ?? null
    const titolo = radice?.querySelector<HTMLElement>('[data-focus-archivio="titolo"]') ?? null
    const [destinazione, dove] = bottone
      ? [bottone, `ora sei su «Archivia» di ${prossima?.getAttribute('aria-label') ?? 'quello dopo'}`]
      : archiviati
        ? [archiviati, 'ora sei sul link agli archiviati']
        : [titolo, 'ora sei sul titolo della sezione']
    if (!destinazione) return
    destinazione.focus()
    const testo = `${cliente} non è più in «Non rinnovano»: ${dove}.`
    // emptied first, so the same words twice in a row are said again
    setAnnuncio('')
    window.setTimeout(() => setAnnuncio(testo), 50)
  }, [])

  const ricorda = useCallback<RicordaFocus>(
    (bottone, cliente) => {
      smetti()
      const radice = sezione.current
      if (!radice) return
      const prossima = bottone.closest('li')?.nextElementSibling ?? null
      // the refreshed list replaces the rows: the tapped one gone, the focus with it
      const o = new MutationObserver(() => {
        if (bottone.isConnected) return
        smetti()
        sposta(prossima, cliente)
      })
      o.observe(radice, { childList: true, subtree: true })
      osservatore.current = o
      scadenza.current = window.setTimeout(smetti, ATTESA_FOCUS_MS)
    },
    [smetti, sposta],
  )

  return (
    <section {...props} ref={sezione}>
      <p role="status" className="sr-only" data-testid="annuncio-archivio">
        {annuncio}
      </p>
      <FocusDopoArchivio.Provider value={ricorda}>{children}</FocusDopoArchivio.Provider>
    </section>
  )
}

/**
 * "Archivia come ex cliente" (Dany, 05/10/2026) and, once archived, "Togli
 * dall'archivio": one button that stays the same element and changes words
 * and action, so the focus stays on it. A closed client who does not buy
 * again goes into the archive, Ex cliente in Clienti, out of "Non rinnovano".
 * One tap: nothing is lost, the toast undoes it and "Togli dall'archivio" too.
 * `breve`: "Archivia" on a narrow row, the full words in the accessible name.
 */
export function BottoneArchivio({
  clientId,
  cliente,
  archiviato,
  breve = false,
}: {
  clientId: string
  cliente: string
  archiviato: boolean
  breve?: boolean
}) {
  const [inCorso, avvia] = useTransition()
  // in a list the archived row leaves (Rinnovi): where the focus goes then
  const ricordaFocus = useContext(FocusDopoArchivio)
  const Icona = archiviato ? Undo2 : UserMinus
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 shrink-0"
      // never disabled while the server answers: the focus stays on it
      aria-disabled={inCorso || undefined}
      aria-label={breve && !archiviato ? `Archivia ${cliente} come ex cliente` : undefined}
      data-testid={archiviato ? 'togli-archivio' : 'archivia-cliente'}
      data-archivia={archiviato ? undefined : ''}
      onClick={(evento) => {
        if (inCorso) return
        if (!archiviato) ricordaFocus?.(evento.currentTarget, cliente)
        avvia(() => (archiviato ? togli(clientId, cliente) : archivia(clientId, cliente)))
      }}
    >
      {inCorso ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icona className="size-4" aria-hidden="true" />
      )}
      {archiviato ? 'Togli dall’archivio' : breve ? 'Archivia' : 'Archivia come ex cliente'}
    </Button>
  )
}

/**
 * On a closed client's sheet: since when, why, archived or not, and the ways
 * back: "Togli dall'archivio" to "Chiuso", "Riapri" to the state the dates say.
 */
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
  const archiviato = chiusura.archiviato_il
  return (
    <section
      aria-label="Chiusura del cliente"
      data-testid="chiusura-cliente"
      className="rounded-xl bg-card py-2 pr-1.5 pl-3"
    >
      <div className="flex items-start gap-3">
        {archiviato ? (
          <UserMinus className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Archive className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1 py-1.5">
          {archiviato ? (
            <p className="text-sm font-medium" data-testid="archivio-cliente">
              Ex cliente · archiviato il <span className="num">{formatData(archiviato)}</span>
            </p>
          ) : null}
          <p className={archiviato ? 'mt-0.5 text-sm text-muted-foreground' : 'text-sm font-medium'}>
            Non rinnova · chiuso il <span className="num">{formatData(chiusura.chiuso_il)}</span>
          </p>
          {chiusura.motivo ? (
            <p className="mt-0.5 text-sm break-words whitespace-pre-line text-muted-foreground">{chiusura.motivo}</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">Nessun motivo scritto</p>
          )}
        </div>
        <NonRinnova clientId={clientId} cliente={cliente} oggi={oggi} minimo={minimo} chiusura={chiusura} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1 pb-0.5 pl-7">
        <BottoneArchivio clientId={clientId} cliente={cliente} archiviato={archiviato !== null} />
        <RiapriCliente clientId={clientId} cliente={cliente} />
      </div>
    </section>
  )
}
