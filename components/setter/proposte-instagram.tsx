'use client'

import {
  Check,
  ChevronLeft,
  CircleCheck,
  LoaderCircle,
  MessagesSquare,
  PencilLine,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { confermaPropostaAdmin, scartaPropostaAdmin } from '@/app/(app)/setting/proposte-actions'
import {
  DA_APPROVARE,
  EVENTO_COMMENTO_GIORNO,
  EVENTO_PROPOSTA,
  EVENTO_PROPOSTA_FINE,
  NESSUNA_RISPOSTA,
  commentoPropostaSchema,
  decisioneChiedeCommento,
  numeriDi,
  type ChiDecide,
  type CommentoProposta,
  type Decisione,
  type DettaglioEventoCommento,
  type DettaglioEventoProposta,
  type DettaglioEventoPropostaFine,
  type NumeriProposta,
  type PropostaInstagram,
  type RisposteCommento,
} from '@/app/(app)/today/proposta-instagram'
import {
  confermaPropostaInstagram,
  scartaPropostaInstagram,
  type EsitoProposta,
} from '@/app/(app)/today/proposte-actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Stepper } from '@/components/numeri/stepper'
import { DomandeObbligatorie } from '@/components/setter/commento-proposta'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { formato } from '@/lib/format'
import { etichettaGiornoIn } from '@/lib/i18n/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { COMMENTO_GIORNATA } from '@/lib/i18n/testi/commento-giornata'
import { giornoInFrase, traduciErroreSetting } from '@/lib/i18n/testi/oggi'
import { DA_APPROVARE_IN, PROPOSTE, paroleSchedaIn, vociProposta } from '@/lib/i18n/testi/proposte'
import { testoScritto } from '@/lib/setting/commento'
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
  /**
   * The answers of "Com’è andata la giornata" of a proposal's day, by proposal
   * id, where his report has some (the setter's page only, 08/10/2026): the
   * step of the comment starts from them, and is not asked when they are all there.
   */
  commenti?: Record<string, RisposteCommento>
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

/** A card as the page gave it: the proposal, the setter's numbers and the day's answers. */
type Scheda = { proposta: PropostaInstagram; suoi: NumeriProposta | null; commento: RisposteCommento }

/**
 * The cards to show: the page's proposals and, where the page read again
 * dropped one still in use (its Correggi sheet or the step of the comment
 * open: decided elsewhere meanwhile), that one too, as it was last shown, in
 * its place by day. Its last tap reaches the database, which says it is
 * decided, and the answers of the step go into his report all the same.
 */
function schedeDa(
  proposte: PropostaInstagram[],
  suoi: Record<string, NumeriProposta>,
  commenti: Record<string, RisposteCommento>,
  inUso: Readonly<Record<string, Scheda>>,
): Scheda[] {
  const elenco: Scheda[] = proposte.map((proposta) => ({
    proposta,
    suoi: suoi[proposta.id] ?? null,
    commento: commenti[proposta.id] ?? NESSUNA_RISPOSTA,
  }))
  const presenti = new Set(proposte.map((p) => p.id))
  const fuori = Object.values(inUso).filter((s) => !presenti.has(s.proposta.id))
  if (fuori.length === 0) return elenco
  // most recent first, as the page orders them (a stable sort keeps the rest as they are)
  return [...elenco, ...fuori].sort((a, b) => b.proposta.data.localeCompare(a.proposta.data))
}

/**
 * The proposals of the setter's report from the Instagram DMs (Dany,
 * 08/10/2026): one card for each day still to decide, and nothing at all when
 * there is none. "Conferma" copies the six numbers into the setter's report of
 * that day, "Correggi" changes them first; when he had already written his
 * own, the card puts them side by side and "Tieni i miei" leaves the proposal.
 * The setter decides a day from 08/10/2026 with activity only with the
 * comment of the day (08/10/2026: "deve lui sempre lasciare un commento della
 * giornata"): when his report misses it, a step asks the three answers first
 * and they go into the report with the decision. The admin is never asked.
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
  commenti = {},
  oggi,
  dataAperta,
  altre,
  errore,
  idTitoloPagina,
  totale,
}: Props) {
  const lingua = useLingua()
  const tp = PROPOSTE[lingua]
  const ta = DA_APPROVARE_IN[lingua]
  const { formatNumero } = formato(lingua)
  const [decise, setDecise] = useState<ReadonlySet<string>>(() => new Set())
  const [annuncio, setAnnuncio] = useState('')
  // where the focus goes after the next render, once the decided card is gone
  const fuoco = useRef<string | null>(null)
  // The cards in use (a sheet or the step open), as last shown: the page read
  // again behind them (the app back in the foreground, a save of the form
  // refused) never takes them away while he writes (08/10/2026)
  const [inUso, setInUso] = useState<Readonly<Record<string, Scheda>>>({})

  const visibili = schedeDa(proposte, suoi, commenti, inUso).filter((s) => !decise.has(s.proposta.id))

  const decisa = useCallback(
    (id: string, frase: string) => {
      const i = visibili.findIndex((s) => s.proposta.id === id)
      const prossima = visibili[i + 1] ?? visibili[i - 1] ?? null
      setDecise((prima) => new Set(prima).add(id))
      fuoco.current = prossima ? idTitolo(prossima.proposta.id) : idTitoloPagina
      // emptied first, so the same words twice in a row are said again
      setAnnuncio('')
      window.setTimeout(() => setAnnuncio(frase), 50)
    },
    [visibili, idTitoloPagina],
  )

  /**
   * A card the page no longer has, closed without a decision, goes with its
   * sheet: the focus to the next card (or the title), never lost with it.
   * Not counted as decided here: the page's list says what is still to decide.
   */
  const uscita = useCallback(
    (id: string) => {
      const i = visibili.findIndex((s) => s.proposta.id === id)
      const prossima = visibili[i + 1] ?? visibili[i - 1] ?? null
      fuoco.current = prossima ? idTitolo(prossima.proposta.id) : idTitoloPagina
    },
    [visibili, idTitoloPagina],
  )

  /** A card says when it is in use (with what it shows) and when it is not any more. */
  const segnaInUso = useCallback((id: string, scheda: Scheda | null) => {
    setInUso((prima) => {
      if (!scheda) {
        if (!(id in prima)) return prima
        const resto = { ...prima }
        delete resto[id]
        return resto
      }
      const ora = prima[id]
      if (ora && ora.proposta === scheda.proposta && ora.suoi === scheda.suoi && ora.commento === scheda.commento) {
        return prima
      }
      return { ...prima, [id]: scheda }
    })
  }, [])

  const presenti = new Set(proposte.map((p) => p.id))

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

  const schede = visibili.map((scheda) => (
    <SchedaProposta
      key={scheda.proposta.id}
      per={per}
      proposta={scheda.proposta}
      suoi={scheda.suoi}
      commento={scheda.commento}
      oggi={oggi}
      dataAperta={dataAperta ?? null}
      fuori={!presenti.has(scheda.proposta.id)}
      onDecisa={decisa}
      onInUso={segnaInUso}
      onUscita={uscita}
      lingua={lingua}
    />
  ))

  if (per === 'admin') {
    // the cards decided on this visit, still in the page's list until it reloads
    const giaDecise = proposte.filter((p) => decise.has(p.id)).length
    const rimaste = Math.max(0, (totale ?? proposte.length) - giaDecise)
    // nothing to decide when the page opened: no section at all
    if (!errore && proposte.length === 0 && decise.size === 0 && visibili.length === 0) return stato
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
            {rimaste > 0 ? ta.titoloConNumero(formatNumero(rimaste)) : ta.titolo}
          </h2>
          {visibili.length > 0 ? <p className="text-sm text-muted-foreground">{ta.descrizione}</p> : null}
        </div>
        {errore ? (
          <ErroreProposte testo={ta.errore} riprova={tp.riprova} />
        ) : visibili.length > 0 ? (
          <>
            {/* two columns only where a card keeps its room (about 440 px each): the
                section's own width, never the screen's, next to the sidebar */}
            <div className="grid items-start gap-3 @4xl:grid-cols-2" data-testid="proposte-instagram">
              {schede}
            </div>
            {altre ? <p className="px-1 text-xs text-muted-foreground">{ta.altre}</p> : null}
          </>
        ) : (
          <p className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground">
            <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
            {ta.finito}
          </p>
        )}
      </section>
    )
  }

  return (
    <>
      {stato}

      {errore ? <ErroreProposte testo={tp.errore} riprova={tp.riprova} margine /> : null}

      {!errore && visibili.length > 0 ? (
        <section aria-label={tp.regione} className="mb-4 space-y-3" data-testid="proposte-instagram">
          {schede}
          {altre ? <p className="px-1 text-xs text-muted-foreground">{tp.altre}</p> : null}
        </section>
      ) : null}
    </>
  )
}

function ErroreProposte({ testo, riprova, margine = false }: { testo: string; riprova: string; margine?: boolean }) {
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
        {riprova}
      </Button>
    </div>
  )
}

const INDIETRO = 'flex min-h-11 items-center gap-1 text-left text-sm text-muted-foreground'

/**
 * A decision waiting for the comment of the day: which one, with his
 * correction, and the proposal as the card showed it at the tap (its
 * calcolato_il). The decision goes with that one: a proposal recomputed while
 * the step is open, and the page read again behind it, is refused ("I numeri
 * della proposta sono cambiati"), never confirmed with numbers he has not seen.
 */
type PassoCommento = { tipo: Decisione; corretti?: NumeriProposta; calcolato_il: string }

/**
 * The answers a step opens with. Where the day changed since the step last
 * read it (an answer written in "Oggi"'s form after the step closed), the
 * day's answer as it is now wins; elsewhere what he wrote in the step stays
 * (back to the numbers, a sheet closed and opened again), and the day's fills
 * the rest.
 */
function unisciRisposte(passo: RisposteCommento, letto: RisposteCommento, ora: RisposteCommento): RisposteCommento {
  const scelta = (campo: 'lead_in_target' | 'qualita_conversazioni') =>
    ora[campo] !== letto[campo] ? ora[campo] : (passo[campo] ?? ora[campo])
  return {
    lead_in_target: scelta('lead_in_target'),
    qualita_conversazioni: scelta('qualita_conversazioni'),
    cosa_frenava:
      ora.cosa_frenava !== letto.cosa_frenava || !testoScritto(passo.cosa_frenava) ? ora.cosa_frenava : passo.cosa_frenava,
  }
}

function SchedaProposta({
  per,
  proposta,
  suoi,
  commento,
  oggi,
  dataAperta,
  fuori,
  onDecisa,
  onInUso,
  onUscita,
  lingua,
}: {
  per: ChiDecide
  proposta: PropostaInstagram
  /** The setter's own numbers of that day, when he wrote some. */
  suoi: NumeriProposta | null
  /** The answers of "Com’è andata la giornata" his report of that day has (the setter's page only). */
  commento: RisposteCommento
  oggi: string
  /** The day open in "Oggi" below (null on the admin's page). */
  dataAperta: string | null
  /**
   * The page read again no longer has this proposal (decided elsewhere): the
   * card stays only while it is in use, and goes when its sheet closes.
   */
  fuori: boolean
  onDecisa: (id: string, frase: string) => void
  /** In use (what it shows), or not any more (null). */
  onInUso: (id: string, scheda: Scheda | null) => void
  /** Not on the page's list any more and closed: it goes now. */
  onUscita: (id: string) => void
  lingua: Lingua
}) {
  const tp = PROPOSTE[lingua]
  const tc = COMMENTO_GIORNATA[lingua].obbligatorio
  const voci = vociProposta(lingua)
  const { formatNumero } = formato(lingua)
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
  // The comment of the day asked before the setter's decision (08/10/2026):
  // the decision it waits for, the answers given in the step, and whether a
  // tap with one missing has to say which
  const [passo, setPasso] = useState<PassoCommento | null>(null)
  const [risposte, setRisposte] = useState<RisposteCommento>(NESSUNA_RISPOSTA)
  const [erroriCommento, setErroriCommento] = useState(false)
  // the day's answers when the step last opened: one changed since in the form wins over the step's
  const giornoLetto = useRef<RisposteCommento>(NESSUNA_RISPOSTA)
  // the step's own place: focus goes there when it opens, never to the page behind
  const contenitorePasso = useRef<HTMLDivElement>(null)
  const passoAperto = useRef(false)
  // "Correggi": the step gave the numbers their place back ("Torna ai numeri", a recomputed proposal)
  const numeriRitornati = useRef(false)
  const moduloNumeri = useRef<HTMLFormElement>(null)
  const modulo = useRef<HTMLFormElement>(null)
  // the button that opened the step's own sheet: focus goes back to it
  const origine = useRef<HTMLElement | null>(null)
  // the step's own sheet opens on its header: the title and what it asks, then the questions
  const intestazionePasso = useRef<HTMLDivElement>(null)

  const titolo = idTitolo(proposta.id)
  const occupato = inCorso

  // In use: the Correggi sheet or the step of the comment open. The page read
  // again behind it keeps the card, as last shown, even once the proposal is
  // decided elsewhere: his last tap reaches the database, which says so, and
  // his answers of the step go into his report all the same (08/10/2026)
  const inUso = foglio || passo !== null
  useEffect(() => {
    if (inUso) onInUso(proposta.id, { proposta, suoi, commento })
  }, [inUso, proposta, suoi, commento, onInUso])
  useEffect(() => {
    if (!inUso) return
    const id = proposta.id
    return () => onInUso(id, null)
  }, [inUso, proposta.id, onInUso])
  // decided elsewhere and closed without a decision: the card goes (nothing
  // written), and the focus to the next card or the title, never lost with it
  useEffect(() => {
    if (fuori && !inUso) onUscita(proposta.id)
  }, [fuori, inUso, proposta.id, onUscita])
  const parole = paroleSchedaIn(proposta, oggi, per, lingua)
  // the cards inside the admin's section sit under its h2
  const Titolo = per === 'admin' ? 'h3' : 'h2'

  // the step replaced the sheet's numbers: focus on it, and its title is said;
  // the numbers back in its place: focus on them, never lost on the page behind
  useEffect(() => {
    if (passo && passoAperto.current) {
      passoAperto.current = false
      contenitorePasso.current?.focus()
    } else if (!passo && numeriRitornati.current) {
      numeriRitornati.current = false
      moduloNumeri.current?.focus()
    }
  }, [passo])

  /**
   * What the day holds now: "Oggi"'s form of that day answers (what is on
   * screen, saved or not), otherwise the report as the page read it.
   */
  function giornoOra(): { risposte: RisposteCommento; numeri: NumeriProposta | null } {
    const dettaglio: DettaglioEventoCommento = { data: proposta.data }
    window.dispatchEvent(new CustomEvent<DettaglioEventoCommento>(EVENTO_COMMENTO_GIORNO, { detail: dettaglio }))
    return dettaglio.attuale ?? { risposte: commento, numeri: suoi }
  }

  /** Opens the step from the day's answers now (`giorno`) and what he already wrote in it. */
  function apriPasso(prossimo: PassoCommento, giorno: RisposteCommento, conErrori: boolean) {
    setRisposte(unisciRisposte(risposte, giornoLetto.current, giorno))
    giornoLetto.current = giorno
    setErroriCommento(conErrori)
    // in "Correggi" the step takes the numbers' place in the open sheet: focus
    // on it. Its own sheet focuses its header as it opens (initialFocus)
    passoAperto.current = prossimo.tipo === 'correzione'
    setPasso(prossimo)
  }

  /**
   * A tap on a decision. The setter's own day from 08/10/2026 with activity
   * after it and without the comment complete asks the comment first: the
   * step, from the answers already there, then the decision with them. The
   * admin decides without it, and never writes it.
   */
  function scegli(tipo: Decisione, numeriCorretti?: NumeriProposta, bottone?: HTMLElement | null) {
    if (occupato) return
    if (per === 'setter') {
      const ora = giornoOra()
      // the report's numbers after the decision: Instagram's, his correction, or his own
      const dopo = tipo === 'conferma' ? numeriDi(proposta) : tipo === 'correzione' ? numeriCorretti : ora.numeri
      if (dopo && decisioneChiedeCommento(proposta.data, dopo, ora.risposte)) {
        setErrore(null)
        origine.current = bottone ?? null
        // the proposal he sees now goes with the step: the decision is on these numbers only
        apriPasso({ tipo, corretti: numeriCorretti, calcolato_il: proposta.calcolato_il }, ora.risposte, false)
        return
      }
    }
    decidi(tipo, numeriCorretti)
  }

  function chiudiPasso() {
    if (occupato) return
    setPasso(null)
    setErrore(null)
  }

  /** "Torna ai numeri": the Correggi sheet's numbers, with his corrections, and the focus on them. */
  function tornaAiNumeri() {
    if (occupato) return
    numeriRitornati.current = true
    setPasso(null)
  }

  function inviaPasso(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!passo || occupato) return
    const letto = commentoPropostaSchema.safeParse(risposte)
    if (!letto.success) {
      setErroriCommento(true)
      // the first answer still missing takes the focus (a radio group: its selectable option)
      window.setTimeout(() => {
        const primo = modulo.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
        const destinazione = primo?.getAttribute('role') === 'radiogroup' ? primo.querySelector<HTMLElement>('[tabindex="0"]') : primo
        destinazione?.focus()
      }, 0)
      return
    }
    decidi(passo.tipo, passo.corretti, letto.data, passo.calcolato_il)
  }

  /**
   * `calcolatoVisto`: the proposal as the step had it at the tap that opened
   * it; otherwise the one on the card now, at this tap.
   */
  function decidi(
    tipo: Decisione,
    numeriCorretti?: NumeriProposta,
    commentoDato?: CommentoProposta,
    calcolatoVisto?: string,
  ) {
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
    // the decision did not happen: the form is his again, and reads the day
    // again when it changed all the same (his answers of the step saved)
    const ridaiIlForm = (rileggi = false) => {
      if (per !== 'setter') return
      window.dispatchEvent(
        new CustomEvent<DettaglioEventoPropostaFine>(EVENTO_PROPOSTA_FINE, {
          detail: { data: proposta.data, rileggi },
        }),
      )
    }
    // what he saw: the confirmation is refused if the proposal changed since
    const { id } = proposta
    const calcolato_il = calcolatoVisto ?? proposta.calcolato_il
    avvia(async () => {
      const salvati = await Promise.all(attese.map((attesa) => attesa.catch(() => false as const)))
      if (salvati.includes('cambiato')) {
        // the day changed elsewhere (a decision of the admin, another device):
        // the form reads it again, and this card comes back with it
        ridaiIlForm()
        setErrore(tp.cambiatoPrima)
        return
      }
      if (salvati.includes(false)) {
        // his own report of that day did not save: nothing is decided over it.
        // From a sheet the form's Riprova is behind it, and the next tap on
        // the sheet's button saves the form first: the sheet's own words
        ridaiIlForm()
        setErrore(tipo === 'correzione' || commentoDato ? tp.salvaPrimaFoglio(etichettaInvio(tipo)) : tp.salvaPrima)
        return
      }

      let esito: EsitoProposta
      try {
        if (per === 'admin') {
          // the setter's numbers he saw: never replaced if the setter changed them meanwhile
          esito =
            tipo === 'scarto'
              ? await scartaPropostaAdmin({ id })
              : await confermaPropostaAdmin({ id, calcolato_il, valori: numeriCorretti, visti: suoi })
        } else {
          esito =
            tipo === 'scarto'
              ? await scartaPropostaInstagram({ id, commento: commentoDato })
              : await confermaPropostaInstagram({ id, calcolato_il, valori: numeriCorretti, commento: commentoDato })
        }
      } catch {
        esito = { ok: false, errore: tp.connessione }
      }
      // the fixed sentences of the actions in the page's language; the database's stay as written
      if (!esito.ok) esito = { ...esito, errore: traduciErroreSetting(esito.errore, lingua) }

      if (!esito.ok) {
        ridaiIlForm(esito.commentoSalvato === true)
        // decided elsewhere while he wrote the comment in the step: his answers
        // went into his report all the same (or the toast says they did not)
        const sulCommento =
          esito.commentoSalvato === undefined
            ? undefined
            : esito.commentoSalvato
              ? tc.passo.salvato
              : tc.passo.nonSalvato
        toast.error(esito.errore, sulCommento ? { description: sulCommento } : undefined)
        if (esito.chiusa) {
          // decided elsewhere, or gone: the card leaves with the reason said
          setFoglio(false)
          setPasso(null)
          onDecisa(proposta.id, sulCommento ? `${esito.errore} ${sulCommento}` : esito.errore)
        } else if (esito.cambiata && commentoDato) {
          // recomputed while the step was open: the new numbers first (the
          // card, or the Correggi sheet's steppers); his answers stay for the next tap
          setErrore(esito.errore)
          if (tipo === 'correzione') numeriRitornati.current = true
          setPasso(null)
        } else if (esito.serveCommento && !commentoDato) {
          // the report misses the comment after all (cleared meanwhile, another
          // device): the step asks it, from what the day holds now
          setErrore(esito.errore)
          apriPasso({ tipo, corretti: numeriCorretti, calcolato_il }, giornoOra().risposte, true)
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
              ? { label: tp.apriGiorno, onClick: () => router.push(`/today?data=${proposta.data}`) }
              : undefined,
        })
      }
      setFoglio(false)
      setPasso(null)
      onDecisa(proposta.id, frase)
    })
  }

  function apriChiudi(aperto: boolean) {
    if (occupato) return
    setFoglio(aperto)
    // every opening starts from the proposal's numbers
    setCorretti({})
    setErrore(null)
    setPasso(null)
  }

  function inviaCorrezione(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    scegli('correzione', valori)
  }

  /** The words of the decision's own button, on the card and at the end of the step. */
  function etichettaInvio(tipo: Decisione): string {
    if (tipo === 'correzione') return tp.confermaCorretti
    if (tipo === 'scarto') return parole.tieni
    return suoi ? tp.usaInstagram : tp.conferma
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

  const giorno = giornoInFrase(etichettaGiornoIn(proposta.data, oggi, lingua), lingua)

  /**
   * The step of the comment: the three answers, then the decision's own
   * button. In "Correggi" it takes the numbers' place in the same sheet, with
   * its own title and the way back; otherwise its sheet's header says it.
   */
  const passoCommento = passo ? (
    <form ref={modulo} onSubmit={inviaPasso} noValidate className="px-4">
      <div
        ref={contenitorePasso}
        tabIndex={-1}
        role={passo.tipo === 'correzione' ? 'group' : undefined}
        aria-labelledby={passo.tipo === 'correzione' ? `${idFoglio}-passo` : undefined}
        aria-describedby={passo.tipo === 'correzione' ? `${idFoglio}-passo-spiegazione` : undefined}
        className="space-y-4 outline-none"
        data-testid="passo-commento"
      >
        {passo.tipo === 'correzione' ? (
          <div className="space-y-1">
            <button type="button" className={INDIETRO} onClick={tornaAiNumeri} disabled={occupato}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              {tc.passo.indietro}
            </button>
            <h3 id={`${idFoglio}-passo`} className="font-heading text-sm font-medium">
              {tc.passo.titolo}
            </h3>
            <p id={`${idFoglio}-passo-spiegazione`} className="text-xs leading-snug text-muted-foreground">
              {tc.passo.descrizione(giorno)}
            </p>
          </div>
        ) : null}

        <DomandeObbligatorie valori={risposte} onCambia={setRisposte} mostraErrori={erroriCommento} />

        {avviso}

        <Button type="submit" className="h-11 w-full" disabled={occupato}>
          {iconaDi(passo.tipo, passo.tipo === 'scarto' ? Undo2 : Check)}
          {etichettaInvio(passo.tipo)}
        </Button>
      </div>
    </form>
  ) : null

  const correggi = (
    <Sheet open={foglio} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={<Button type="button" variant="outline" className="h-auto min-h-11 gap-1.5" disabled={occupato} />}
        aria-describedby={titolo}
      >
        <PencilLine className="size-4" aria-hidden="true" />
        {tp.correggi}
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

        {passo?.tipo === 'correzione' ? (
          passoCommento
        ) : (
          <form
            ref={moduloNumeri}
            onSubmit={inviaCorrezione}
            noValidate
            tabIndex={-1}
            className="space-y-4 px-4 outline-none"
            aria-describedby={`${idFoglio}-nota`}
          >
            <div className="divide-y divide-border rounded-xl bg-card px-3">
              {voci.map(({ campo, etichetta }) => (
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
                      : `${tp.instagram} ${formatNumero(proposta[campo])}`}
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
              {tp.confermaCorretti}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )

  // the step of "Conferma", "Usa quelli di Instagram" and "Tieni i miei": a sheet of its own
  const foglioCommento =
    per === 'setter' ? (
      <Sheet open={!!passo && passo.tipo !== 'correzione'} onOpenChange={(aperto) => (aperto ? null : chiudiPasso())}>
        <SheetContent
          side="bottom"
          initialFocus={intestazionePasso}
          finalFocus={origine}
          className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
          data-testid="foglio-commento-proposta"
        >
          <SheetHeader ref={intestazionePasso} tabIndex={-1} className="outline-none">
            <SheetTitle>{tc.passo.titolo}</SheetTitle>
            <SheetDescription>{tc.passo.descrizione(giorno)}</SheetDescription>
          </SheetHeader>
          {passo?.tipo !== 'correzione' ? passoCommento : null}
        </SheetContent>
      </Sheet>
    ) : null

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
        {voci.map(({ campo, etichetta }) => (
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
                    {tp.instagram}{' '}
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
          {tp.chatLette(proposta.chat_lette)}
          {proposta.chat_incerte > 0 ? ` · ${tp.chatIncerte(proposta.chat_incerte)}` : null}
        </p>
      </div>

      {!foglio && !passo && avviso ? <div className="mt-3">{avviso}</div> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {suoi ? (
          <>
            <Button
              type="button"
              className="col-span-2 h-11"
              disabled={occupato}
              aria-describedby={titolo}
              onClick={(e) => scegli('conferma', undefined, e.currentTarget)}
            >
              {iconaDi('conferma', Check)}
              {tp.usaInstagram}
            </Button>
            {/* "Tieni quelli di Massimiliano": a long first name goes on two lines, never out of the button */}
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 py-2 text-balance whitespace-normal"
              disabled={occupato}
              aria-describedby={titolo}
              onClick={(e) => scegli('scarto', undefined, e.currentTarget)}
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
              onClick={(e) => scegli('conferma', undefined, e.currentTarget)}
            >
              {iconaDi('conferma', Check)}
              {tp.conferma}
            </Button>
            {correggi}
          </>
        )}
      </div>

      {foglioCommento}
    </article>
  )
}
