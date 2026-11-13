'use client'

import { ArrowLeft, ArrowRight, Check, CircleCheck, CloudOff, LoaderCircle, Send, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { AllegatiDomanda } from '@/components/percorso/allegati-questionario'
import { useBackendPercorso } from '@/components/percorso/backend-percorso'
import { BloccoDomanda, CampoDomanda, idCampo, idTitoloDomanda } from '@/components/percorso/campi-questionario'
import { formatOra } from '@/lib/date'
import type { AllegatoCliente } from '@/lib/percorso/allegati'
import { DOMANDE, INTRO_QUESTIONARIO, SCHERMATE, type Domanda } from '@/lib/percorso/questionario'
import { TESTI_QUESTIONARIO as T, TESTI_PERCORSO } from '@/lib/percorso/testi'
import { OBBLIGATORIE, risposteMancanti, soloValide, type NumeroSchermata, type Risposte } from '@/lib/validation/questionario'
import { cn } from '@/lib/utils'

/** A save one second after the last change (and at every move between questions). */
const ATTESA_SALVATAGGIO_MS = 1000
/** The beat between the tap on a single choice and the next question: long enough to see it chosen. */
const PAUSA_SCELTA_MS = 380

/** Where the client is: -1 the introduction, 0..N-1 a question, N the recap before the sending. */
const INTRO = -1
const N = DOMANDE.length
const FINE = N

type StatoSalvataggio =
  | { tipo: 'pronto' }
  | { tipo: 'salvo' }
  | { tipo: 'salvato'; ora: string }
  | { tipo: 'cambiato' }
  | { tipo: 'errore'; testo: string }

/** The error that says an answer is missing, by the kind of question. */
function erroreMancante(d: Domanda): string {
  switch (d.tipo) {
    case 'email':
      return T.errori.email
    case 'data':
      return T.errori.data
    case 'altezza_peso':
      return T.errori.altezzaPeso
    case 'massimali':
      return T.errori.massimali
    case 'scelta':
    case 'abitudini':
      return T.errori.scelta
    case 'testo':
      return T.errori.testo
  }
}

const nessunaIscrizione = () => () => undefined

/** The number of every question, as in the form. */
const NUMERI = new Map(DOMANDE.map((d, i) => [d.chiave as string, i + 1]))
const INDICE = new Map(DOMANDE.map((d, i) => [d.chiave as string, i]))

/** The place in an address: ?domanda=<key|intro|fine|number>, or the old ?schermata=1..4 (its first question). */
function passoDaParametri(params: URLSearchParams): number | null {
  const d = params.get('domanda')
  if (d === 'intro') return INTRO
  if (d === 'fine') return FINE
  if (d) {
    const i = INDICE.get(d)
    if (i !== undefined) return i
    const n = Number(d)
    if (Number.isInteger(n) && n >= 1 && n <= N) return n - 1
  }
  const s = Number(params.get('schermata'))
  if (s >= 1 && s <= 4) return DOMANDE.findIndex((x) => x.schermata === s)
  return null
}

/** The first required question without an answer, or the recap when everything is there. */
function primaDaRispondere(risposte: Risposte): number {
  const prima = risposteMancanti(soloValide(risposte as Record<string, unknown>))[0]
  return prima ? (INDICE.get(prima) ?? FINE) : FINE
}

function chiaveNellUrl(pos: number): string {
  return pos === INTRO ? 'intro' : pos >= N ? 'fine' : DOMANDE[pos]!.chiave
}

function schermataDelPasso(pos: number): NumeroSchermata {
  return pos < 0 ? 1 : pos >= N ? 4 : DOMANDE[pos]!.schermata
}

const TIPI_CON_CAMPO_DI_TESTO = new Set(['testo', 'email', 'data', 'altezza_peso', 'massimali'])

/** A single choice that goes on by itself: not when files go with it (the meal plan asks for its upload). */
function avanzaDaSola(d: Domanda, valore: unknown): boolean {
  if (d.tipo !== 'scelta') return false
  if (!d.allegato) return true
  return Boolean(d.allegato.quando) && String(valore) !== d.allegato.quando
}

const tastoTesto = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && !['radio', 'checkbox', 'button', 'submit', 'file'].includes(el.type))

const siTocca = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * The questionnaire of the onboarding (release B1b, one question at a time since 1.82.0): Dany's
 * Google form shown like a conversation, each question alone on its screen. An introduction
 * first (only when nothing was ever saved), then «7 di 26», a progress bar, the question big,
 * its line of help, the field and one primary action, «OK» (Invio goes on, Maiusc + Invio is a
 * new line in a long answer; a single choice goes on by itself after a beat; letters and
 * numbers pick the options). A required answer missing says so under the field and the focus
 * stays. At the end a recap of the missing answers (a tap goes to it, then back to the recap)
 * and «Invia il questionario». The screens change with CSS only, sliding up (down going back),
 * and not at all with reduced motion. The saving is the one of the four screens: by itself one
 * second after the last change and at every move, only over the version read («Salvato alle
 * 18:42»); another device that saved meanwhile reloads the answers. The place is in the address
 * (?domanda=), so «Indietro» of the browser goes to the question before; ?schermata=n still opens
 * the first question of that part. The part saved with the answers is the one of the question.
 */
export function Questionario({
  risposteIniziali,
  versioneIniziale,
  allegatiIniziali,
}: {
  risposteIniziali: Risposte
  versioneIniziale: number
  allegatiIniziali: readonly AllegatoCliente[]
}) {
  const router = useRouter()
  const { salvaQuestionario, inviaQuestionario, indirizzi } = useBackendPercorso()
  const pathname = usePathname()
  const parametri = useSearchParams()

  const [pos, setPos] = useState<number>(
    () => passoDaParametri(new URLSearchParams(parametri.toString())) ?? (versioneIniziale === 0 ? INTRO : primaDaRispondere(risposteIniziali)),
  )
  const [direzione, setDirezione] = useState<'avanti' | 'indietro'>('avanti')
  const [risposte, setRisposte] = useState<Risposte>(risposteIniziali)
  const [allegati, setAllegati] = useState<readonly AllegatoCliente[]>(allegatiIniziali)
  // a new key when the answers come from another device: the fields read their values again
  const [chiaveForm, setChiaveForm] = useState(0)
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>({ tipo: 'pronto' })
  const [mancanti, setMancanti] = useState<ReadonlySet<string>>(new Set())
  const [formato, setFormato] = useState<Record<string, string | null>>({})
  const [avviso, setAvviso] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  // the page answers to the fingers only once React holds the fields (tests wait on it)
  const pronto = useSyncExternalStore(
    nessunaIscrizione,
    () => true,
    () => false,
  )

  const posRef = useRef(pos)
  const risposteRef = useRef(risposte)
  const formatoRef = useRef<Record<string, string | null>>({})
  const versione = useRef(versioneIniziale)
  const schermataRef = useRef(schermataDelPasso(pos))
  const daSalvare = useRef(false)
  const catena = useRef<Promise<boolean>>(Promise.resolve(true))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerAvanza = useRef<ReturnType<typeof setTimeout> | null>(null)
  // coming back to the recap after a question reached from it
  const tornaAFine = useRef(false)

  useEffect(() => {
    risposteRef.current = risposte
  }, [risposte])

  /** One save, never two at once: they go in a line, each over the version the one before left. */
  const salvaOra = useCallback(async (): Promise<boolean> => {
    if (!daSalvare.current) return true
    daSalvare.current = false
    setSalvataggio({ tipo: 'salvo' })
    let esito: Awaited<ReturnType<typeof salvaQuestionario>>
    try {
      const dati = new FormData()
      dati.append(
        'dati',
        JSON.stringify({
          risposte: soloValide(risposteRef.current as Record<string, unknown>),
          schermata: schermataRef.current,
          versione: versione.current,
        }),
      )
      esito = await salvaQuestionario(dati)
    } catch {
      daSalvare.current = true
      setSalvataggio({ tipo: 'errore', testo: T.nonSalvato })
      return false
    }
    if (!esito.ok) {
      if (esito.accesso) {
        toast.error(esito.errore)
        router.refresh()
        return false
      }
      if (esito.errore === T.giaInviato) {
        router.replace(indirizzi.percorso)
        return false
      }
      daSalvare.current = true
      setSalvataggio({ tipo: 'errore', testo: esito.errore })
      return false
    }
    versione.current = esito.versione
    if (esito.esito === 'cambiato') {
      // another device saved meanwhile: its answers, as they are now
      risposteRef.current = esito.risposte
      setRisposte(esito.risposte)
      formatoRef.current = {}
      setFormato({})
      setChiaveForm((k) => k + 1)
      toast.info(T.cambiato)
      setSalvataggio({ tipo: 'cambiato' })
      return false
    }
    // «Salvato» only when nothing else waits: a change made during the save is saved next
    if (!daSalvare.current) setSalvataggio({ tipo: 'salvato', ora: formatOra(new Date()) })
    return true
  }, [indirizzi.percorso, router, salvaQuestionario])

  const salva = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    catena.current = catena.current.then(salvaOra, salvaOra)
    return catena.current
  }, [salvaOra])

  const programma = useCallback(() => {
    daSalvare.current = true
    // never «Salvato» on the screen while a change waits for its save
    setSalvataggio((prima) => (prima.tipo === 'errore' ? prima : { tipo: 'salvo' }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void salva(), ATTESA_SALVATAGGIO_MS)
  }, [salva])

  // the part in the save too: the answers keep where the client was
  const schermata = schermataDelPasso(pos)
  useEffect(() => {
    if (schermataRef.current === schermata) return
    schermataRef.current = schermata
    daSalvare.current = true
    void salva()
  }, [schermata, salva])

  // leaving the page or the app: what waits goes now
  useEffect(() => {
    const nascosta = () => {
      if (document.visibilityState === 'hidden' && daSalvare.current) void salva()
    }
    const uscita = (e: BeforeUnloadEvent) => {
      if (daSalvare.current) {
        void salva()
        e.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', nascosta)
    window.addEventListener('beforeunload', uscita)
    return () => {
      document.removeEventListener('visibilitychange', nascosta)
      window.removeEventListener('beforeunload', uscita)
      if (timer.current) clearTimeout(timer.current)
      if (timerAvanza.current) clearTimeout(timerAvanza.current)
    }
  }, [salva])

  function cambia(chiave: keyof Risposte, valore: unknown) {
    setRisposte((prima) => {
      const dopo = { ...prima, [chiave]: valore } as Risposte
      risposteRef.current = dopo
      return dopo
    })
    if (mancanti.has(chiave) && !risposteMancanti({ [chiave]: valore } as Risposte).includes(chiave)) {
      setMancanti((prima) => {
        const dopo = new Set(prima)
        dopo.delete(chiave)
        return dopo
      })
    }
    programma()
  }

  function impostaFormato(chiave: string, errore: string | null) {
    if ((formatoRef.current[chiave] ?? null) === errore) return
    formatoRef.current = { ...formatoRef.current, [chiave]: errore }
    setFormato(formatoRef.current)
  }

  /** A move to another place: in the address (a step for the browser's Back too) and on the screen. */
  function vai(nuovo: number) {
    if (timerAvanza.current) {
      clearTimeout(timerAvanza.current)
      timerAvanza.current = null
    }
    const prima = posRef.current
    if (nuovo === prima) return
    // an error of the format of the question left behind goes with it: the field starts again from the saved answer
    const lasciata = DOMANDE[prima]
    if (lasciata && formatoRef.current[lasciata.chiave]) impostaFormato(lasciata.chiave, null)
    if (nuovo === FINE || nuovo === INTRO) tornaAFine.current = false
    setAvviso(null)
    setDirezione(nuovo > prima ? 'avanti' : 'indietro')
    posRef.current = nuovo
    setPos(nuovo)
    window.history.pushState(null, '', `${pathname}?domanda=${chiaveNellUrl(nuovo)}`)
    // what waits is saved at every move
    if (daSalvare.current) void salva()
  }

  // the address always says where the client is: Back and Forward land on a place, not on a bare address
  useEffect(() => {
    window.history.replaceState(null, '', `${pathname}?domanda=${chiaveNellUrl(posRef.current)}`)
    const indietroDelBrowser = () => {
      const p = passoDaParametri(new URLSearchParams(window.location.search))
      if (p === null || p === posRef.current) return
      setDirezione(p > posRef.current ? 'avanti' : 'indietro')
      posRef.current = p
      setPos(p)
    }
    window.addEventListener('popstate', indietroDelBrowser)
    return () => window.removeEventListener('popstate', indietroDelBrowser)
  }, [pathname])

  // where the focus goes at every move: the field of a written answer (on a screen with a
  // keyboard), else the heading, which the readers announce; the page back to its top
  const primaVolta = useRef(true)
  useEffect(() => {
    posRef.current = pos
    const iniziale = primaVolta.current
    primaVolta.current = false
    const d = DOMANDE[pos]
    if (!iniziale) window.scrollTo({ top: 0 })
    if (d && TIPI_CON_CAMPO_DI_TESTO.has(d.tipo) && !siTocca()) {
      document.getElementById(idCampo(d.chiave))?.focus({ preventScroll: true })
      return
    }
    if (iniziale) return
    const titolo = d ? document.getElementById(idTitoloDomanda(d.chiave)) : document.getElementById('titolo-passo')
    titolo?.focus({ preventScroll: true })
  }, [pos])

  function focalizzaCampo(chiave: string) {
    const campo = document.getElementById(idCampo(chiave))
    if (campo && !campo.hasAttribute('disabled')) campo.focus({ preventScroll: true })
    else document.getElementById(idTitoloDomanda(chiave))?.focus({ preventScroll: true })
  }

  /** «OK»: the answer must hold (a required one is there, a field is not left with a wrong format), then the next question. */
  function avanti() {
    const p = posRef.current
    if (p === INTRO) {
      vai(versione.current === 0 ? 0 : primaDaRispondere(risposteRef.current))
      return
    }
    const d = DOMANDE[p]
    if (!d) return
    // a field still being typed says what is wrong with it before we look
    const attivo = document.activeElement
    if (tastoTesto(attivo)) (attivo as HTMLElement).blur()
    const obbligatoria = OBBLIGATORIE.some(([chiave]) => chiave === d.chiave)
    const manca = obbligatoria && risposteMancanti({ [d.chiave]: risposteRef.current[d.chiave] } as Risposte).includes(d.chiave)
    if (formatoRef.current[d.chiave] || manca) {
      setMancanti((prima) => new Set(prima).add(d.chiave))
      focalizzaCampo(d.chiave)
      return
    }
    void salva()
    vai(tornaAFine.current ? FINE : p + 1)
  }

  function indietro() {
    const p = posRef.current
    if (p <= 0) return
    vai(tornaAFine.current ? FINE : p - 1)
  }

  /** From the recap (or the server's answer) to a missing answer. */
  function vaiAMancante(chiave: string) {
    const i = INDICE.get(chiave)
    if (i === undefined) return
    tornaAFine.current = true
    vai(i)
  }

  function programmaAvanzo(chiave: string) {
    if (timerAvanza.current) clearTimeout(timerAvanza.current)
    timerAvanza.current = setTimeout(() => {
      timerAvanza.current = null
      if (DOMANDE[posRef.current]?.chiave === chiave) azioni.current.avanti()
    }, PAUSA_SCELTA_MS)
  }

  function scegli(d: Domanda, valore: unknown) {
    cambia(d.chiave, valore)
    if (avanzaDaSola(d, valore)) programmaAvanzo(d.chiave)
  }

  // the latest closures for the keys, which are listened to once
  const azioni = useRef({ avanti, scegli, cambia })
  useEffect(() => {
    azioni.current = { avanti, scegli, cambia }
  })

  // the keyboard: Invio goes on (Maiusc + Invio is a new line), letters and numbers pick the options
  useEffect(() => {
    function tasto(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
      const p = posRef.current
      const el = e.target instanceof HTMLElement ? e.target : null
      const tag = el?.tagName

      if (e.key === 'Enter') {
        if (e.shiftKey || e.repeat) return
        // buttons and links do their own thing with Invio; the recap is made of them
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || p === FINE) return
        // on a phone Invio in a long answer is a new line: «OK» is the button
        if (tag === 'TEXTAREA' && siTocca()) return
        e.preventDefault()
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          // in a question with more fields, Invio goes to the next one first
          const campi = Array.from(
            el.closest('[data-domanda]')?.querySelectorAll<HTMLElement>(
              'input:not([type=radio]):not([type=checkbox]):not([type=file]):not(:disabled), textarea:not(:disabled)',
            ) ?? [],
          )
          const i = campi.indexOf(el)
          if (i >= 0 && i < campi.length - 1) {
            campi[i + 1]?.focus()
            return
          }
        }
        azioni.current.avanti()
        return
      }

      // a letter or a number picks an option, never while writing
      if (e.shiftKey || e.key.length !== 1 || tastoTesto(el)) return
      const d = DOMANDE[p]
      if (!d || (d.tipo !== 'scelta' && d.tipo !== 'abitudini')) return
      const k = e.key.toLowerCase()
      const i = d.tipo === 'scelta' && d.numerica ? Number(k) - 1 : /^[a-z]$/.test(k) ? k.charCodeAt(0) - 97 : -1
      const opzione = Number.isInteger(i) && i >= 0 ? d.opzioni[i] : undefined
      if (!opzione) return
      e.preventDefault()
      if (d.tipo === 'scelta') {
        azioni.current.scegli(d, d.numerica ? Number(opzione.valore) : opzione.valore)
        return
      }
      const attuali = new Set(risposteRef.current.cattive_abitudini?.scelte ?? [])
      if (attuali.has(opzione.valore as never)) attuali.delete(opzione.valore as never)
      else attuali.add(opzione.valore as never)
      const scelte = Array.from(attuali) as NonNullable<Risposte['cattive_abitudini']>['scelte']
      const altro = risposteRef.current.cattive_abitudini?.altro ?? ''
      azioni.current.cambia('cattive_abitudini', (scelte?.length ?? 0) === 0 && altro === '' ? null : { scelte, altro })
      // the checkboxes show it by themselves: the fields read the answers
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [])

  async function invia() {
    if (invio) return
    setAvviso(null)
    // a missing answer, or a field that still shows a value that does not hold (an email being corrected):
    // both stop the sending, in the order of the form
    const conFormato = Object.keys(formatoRef.current).filter((k) => formatoRef.current[k])
    const locali = [...new Set([...risposteMancanti(soloValide(risposteRef.current as Record<string, unknown>)), ...conFormato])].sort(
      (a, b) => (NUMERI.get(a) ?? 0) - (NUMERI.get(b) ?? 0),
    )
    if (locali.length > 0) {
      mostraMancanti(locali)
      return
    }
    setInvio(true)
    try {
      daSalvare.current = true
      const salvato = await salva()
      if (!salvato) {
        setAvviso(T.nonSalvato)
        return
      }
      const esito = await inviaQuestionario({ versione: versione.current })
      if (!esito.ok) {
        if (esito.mancanti && esito.mancanti.length > 0) mostraMancanti(esito.mancanti)
        else setAvviso(esito.errore)
        return
      }
      if (esito.esito === 'cambiato') {
        versione.current = esito.versione
        risposteRef.current = esito.risposte
        setRisposte(esito.risposte)
        setChiaveForm((k) => k + 1)
        toast.info(T.cambiato)
        return
      }
      toast.success(T.inviato)
      router.push(indirizzi.percorso)
    } catch {
      setAvviso(T.nonSalvato)
    } finally {
      setInvio(false)
    }
  }

  /** Something is missing (here or on the server): the errors on the questions, and the first one opens. */
  function mostraMancanti(chiavi: readonly string[]) {
    setMancanti(new Set(chiavi))
    const prima = chiavi.map((k) => INDICE.get(k)).find((i): i is number => i !== undefined)
    if (prima !== undefined) {
      tornaAFine.current = true
      vai(prima)
    } else setAvviso(T.mancano)
  }

  const daRispondere = risposteMancanti(soloValide(risposte as Record<string, unknown>))
  const domanda = pos >= 0 && pos < N ? DOMANDE[pos]! : null
  const valoreProgresso = pos < 0 ? 0 : pos >= N ? N : pos + 1
  const classeSchermata = direzione === 'avanti' ? 'qz-avanti' : 'qz-indietro'
  const haIniziato = versioneIniziale > 0

  return (
    <div
      className="flex min-h-[calc(100dvh-4.5rem)] flex-col pt-2"
      data-testid="questionario"
      data-posizione={pos}
      data-pronto={pronto}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3">
        <Link
          href={indirizzi.percorso}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {T.tornaPercorso}
        </Link>
        <StatoSalvato stato={salvataggio} onRiprova={() => void salva()} />
      </header>

      <div
        role="progressbar"
        aria-label={T.progresso}
        aria-valuemin={0}
        aria-valuemax={N}
        aria-valuenow={valoreProgresso}
        aria-valuetext={domanda ? T.indicatore(pos + 1, N) : pos >= N ? T.fine.titolo : TESTI_PERCORSO.marchio}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        data-testid="progresso"
      >
        <div
          className="glow-primario h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${valoreProgresso / N})` }}
        />
      </div>

      <div key={`${pos}-${chiaveForm}`} className={cn('flex-1 py-8 sm:py-14', classeSchermata)} data-testid="schermata-questionario">
        {pos === INTRO ? (
          <section className="max-w-xl space-y-6" data-testid="intro-questionario">
            <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{TESTI_PERCORSO.marchio}</p>
            <h1
              id="titolo-passo"
              tabIndex={-1}
              className="font-heading text-[1.9rem] leading-tight font-semibold tracking-tight text-balance outline-none sm:text-5xl sm:leading-tight"
            >
              {INTRO_QUESTIONARIO.titolo}
            </h1>
            <div className="space-y-3 text-[1.05rem] leading-relaxed text-muted-foreground">
              {INTRO_QUESTIONARIO.paragrafi.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{T.durata}</p>
            <button
              type="button"
              onClick={() => avanti()}
              className="glow-primario flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:w-auto sm:min-w-52"
              data-testid="inizia"
            >
              {haIniziato ? T.riprendiBreve : T.inizia}
              <ArrowRight className="size-5" aria-hidden="true" />
            </button>
          </section>
        ) : domanda ? (
          <section className="max-w-xl space-y-6" aria-label={T.domandaDi(pos + 1, N)}>
            <p className="num text-sm font-medium tracking-wide text-muted-foreground uppercase" data-testid="intestazione-domanda">
              <span data-testid="sezione">{SCHERMATE.find((s) => s.numero === domanda.schermata)?.titolo}</span>
              <span aria-hidden="true"> · </span>
              <span data-testid="indicatore">{T.indicatore(pos + 1, N)}</span>
            </p>
            {(() => {
              const d = domanda
              const valore = risposte[d.chiave]
              const errore = formato[d.chiave] ?? (mancanti.has(d.chiave) ? erroreMancante(d) : null)
              const allegato = d.allegato
              const fileDelCampo = allegato ? allegati.filter((a) => a.campo === allegato.campo) : []
              // the files already there stay in sight, with their X, even when the answer no longer asks for them
              const richiesti = Boolean(allegato) && (!allegato?.quando || String(valore ?? '') === allegato.quando)
              const mostraAllegati = allegato && (richiesti || fileDelCampo.length > 0)
              return (
                <BloccoDomanda
                  domanda={d}
                  errore={errore}
                  extra={
                    mostraAllegati && allegato ? (
                      <AllegatiDomanda
                        allegato={allegato}
                        allegati={fileDelCampo}
                        soloTogli={!richiesti}
                        onCambia={(aggiorna) =>
                          setAllegati((prima) => [
                            ...prima.filter((a) => a.campo !== allegato.campo),
                            ...aggiorna(prima.filter((a) => a.campo === allegato.campo)),
                          ])
                        }
                      />
                    ) : null
                  }
                >
                  <CampoDomanda
                    domanda={d}
                    valore={valore}
                    errore={errore}
                    onCambia={(v) => (d.tipo === 'scelta' ? scegli(d, v) : cambia(d.chiave, v))}
                    onErroreFormato={(e) => impostaFormato(d.chiave, e)}
                  />
                  {d.tipo === 'testo' && d.lungo ? (
                    <p className="hidden text-sm text-muted-foreground [@media(pointer:fine)]:block">{T.aCapo}</p>
                  ) : null}
                </BloccoDomanda>
              )
            })()}
          </section>
        ) : (
          <section className="max-w-xl space-y-6" data-testid="recap-questionario" aria-labelledby="titolo-passo">
            <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{T.fine.etichetta}</p>
            <h1
              id="titolo-passo"
              tabIndex={-1}
              className="font-heading text-[1.9rem] leading-tight font-semibold tracking-tight text-balance outline-none sm:text-4xl sm:leading-tight"
            >
              {daRispondere.length > 0 ? T.fine.mancanoTitolo(daRispondere.length) : T.fine.titolo}
            </h1>
            <p className="text-[1.05rem] leading-relaxed text-muted-foreground">
              {daRispondere.length > 0 ? T.fine.mancanoTesto : T.fine.testo}
            </p>
            {daRispondere.length > 0 ? (
              <ol className="space-y-2.5">
                {daRispondere.map((chiave) => {
                  const d = DOMANDE[INDICE.get(chiave) ?? 0]!
                  return (
                    <li key={chiave}>
                      <button
                        type="button"
                        onClick={() => vaiAMancante(chiave)}
                        data-testid={`mancante-${chiave}`}
                        className="flex min-h-14 w-full items-start gap-3 rounded-xl border border-status-critical/40 bg-status-critical/8 px-4 py-3 text-left transition-colors hover:bg-status-critical/14 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
                      >
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
                        <span className="min-w-0 flex-1 text-[0.95rem] leading-snug">
                          <span className="num mr-1.5 text-muted-foreground">{NUMERI.get(chiave)}.</span>
                          {d.testo}
                        </span>
                        <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : null}
            {avviso ? (
              <p role="alert" className="flex items-start gap-2 text-base font-medium text-status-critical">
                <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
                {avviso}
              </p>
            ) : null}
          </section>
        )}
      </div>

      {pos !== INTRO ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border/70 bg-background/92 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="flex max-w-xl items-center gap-3">
            {pos > 0 ? (
              <button
                type="button"
                onClick={() => (pos >= N ? vai(N - 1) : indietro())}
                className="flex h-14 min-w-14 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
                data-testid="indietro"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
                {T.indietro}
              </button>
            ) : null}
            {domanda ? (
              <>
                <button
                  type="button"
                  onClick={() => avanti()}
                  className="glow-primario flex h-14 min-w-32 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:flex-none sm:px-10"
                  data-testid="avanti"
                >
                  {T.ok}
                  <Check className="size-5" aria-hidden="true" />
                </button>
                <span className="hidden text-sm text-muted-foreground [@media(pointer:fine)]:inline">{T.premiInvio}</span>
              </>
            ) : daRispondere.length > 0 ? (
              <button
                type="button"
                onClick={() => vaiAMancante(daRispondere[0]!)}
                className="glow-primario flex h-14 min-w-32 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:flex-none"
                data-testid="vai-prima-mancante"
              >
                {T.fine.rispondi}
                <ArrowRight className="size-5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void invia()}
                aria-disabled={invio ? true : undefined}
                className="glow-primario flex h-14 min-w-32 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:flex-none sm:px-10"
                data-testid="invia-questionario"
              >
                {invio ? (
                  <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Send className="size-5" aria-hidden="true" />
                )}
                {invio ? T.invioInCorso : T.invia}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** «Salvato alle 18:42», «Salvo le risposte», or what went wrong with «Riprova». */
function StatoSalvato({ stato, onRiprova }: { stato: StatoSalvataggio; onRiprova: () => void }) {
  return (
    <div aria-live="polite" className="min-h-11 text-sm" data-testid="stato-salvataggio" data-stato={stato.tipo}>
      {stato.tipo === 'salvo' ? (
        <p className="flex min-h-11 items-center gap-1.5 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {T.salvo}
        </p>
      ) : stato.tipo === 'salvato' ? (
        <p className="num flex min-h-11 items-center gap-1.5 text-status-ok">
          <CircleCheck className="size-4" aria-hidden="true" />
          {T.salvato(stato.ora)}
        </p>
      ) : stato.tipo === 'cambiato' ? (
        <p className="flex min-h-11 items-center gap-1.5 text-muted-foreground">
          <CircleCheck className="size-4" aria-hidden="true" />
          {T.ricaricato}
        </p>
      ) : stato.tipo === 'errore' ? (
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="flex items-center gap-1.5 font-medium text-status-critical">
            <CloudOff className="size-4" aria-hidden="true" />
            {stato.testo}
          </p>
          <button
            type="button"
            onClick={onRiprova}
            className="min-h-11 rounded-lg px-2 font-medium underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {T.riprova}
          </button>
        </div>
      ) : (
        <p className="flex min-h-11 items-center gap-1.5 text-muted-foreground">
          <Check className="size-4" aria-hidden="true" />
          {T.siSalva}
        </p>
      )}
    </div>
  )
}
