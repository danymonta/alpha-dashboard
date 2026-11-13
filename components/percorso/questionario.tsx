'use client'

import { ArrowLeft, ArrowRight, Check, CircleCheck, CloudOff, LoaderCircle, Send, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { inviaQuestionario, salvaQuestionario } from '@/app/(cliente)/percorso/actions'
import { AllegatiDomanda } from '@/components/percorso/allegati-questionario'
import { BloccoDomanda, CampoDomanda, idCampo } from '@/components/percorso/campi-questionario'
import { VetroLiquido } from '@/components/vetro/vetro-liquido'
import { formatOra } from '@/lib/date'
import type { AllegatoCliente } from '@/lib/percorso/allegati'
import { DOMANDE, SCHERMATE, domandeDi, schermataDi, type Domanda } from '@/lib/percorso/questionario'
import { TESTI_QUESTIONARIO as T, TESTI_PERCORSO } from '@/lib/percorso/testi'
import { risposteMancanti, soloValide, type NumeroSchermata, type Risposte } from '@/lib/validation/questionario'
import { cn } from '@/lib/utils'

/** A save one second after the last change (and at every change of screen). */
const ATTESA_SALVATAGGIO_MS = 1000

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

function schermataValida(v: string | null): NumeroSchermata | null {
  const n = Number(v)
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null
}

const nessunaIscrizione = () => () => undefined

/** The number of every question, across the screens, as in the form. */
const NUMERI = new Map(DOMANDE.map((d, i) => [d.chiave as string, i + 1]))

/**
 * The questionnaire of the onboarding (release B1b): Dany's Google form in 4 screens with the
 * indicator «2 di 4», one primary action per screen («Avanti», then «Invia il questionario»).
 * Saved by itself one second after the last change and at every change of screen, only over
 * the version read («Salvato alle 18:42»); another device that saved meanwhile reloads the
 * answers. The screen is in the address (?schermata=), so «Indietro» of the browser goes to
 * the screen before. Missing answers at the sending: their errors under each field, and the
 * page goes to the first. No animation (motion arrives with B2).
 */
export function Questionario({
  risposteIniziali,
  versioneIniziale,
  schermataIniziale,
  allegatiIniziali,
}: {
  risposteIniziali: Risposte
  versioneIniziale: number
  schermataIniziale: NumeroSchermata
  allegatiIniziali: readonly AllegatoCliente[]
}) {
  const router = useRouter()
  const parametri = useSearchParams()
  const schermata = schermataValida(parametri.get('schermata')) ?? schermataIniziale

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

  const risposteRef = useRef(risposte)
  const versione = useRef(versioneIniziale)
  const schermataRef = useRef(schermata)
  const daSalvare = useRef(false)
  const catena = useRef<Promise<boolean>>(Promise.resolve(true))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titolo = useRef<HTMLHeadingElement | null>(null)
  const daFocalizzare = useRef<string | null>(null)

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
        router.replace('/percorso')
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
      setFormato({})
      setChiaveForm((k) => k + 1)
      toast.info(T.cambiato)
      setSalvataggio({ tipo: 'cambiato' })
      return false
    }
    // «Salvato» only when nothing else waits: a change made during the save is saved next
    if (!daSalvare.current) setSalvataggio({ tipo: 'salvato', ora: formatOra(new Date()) })
    return true
  }, [router])

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

  // the screen in the save too: «riprendi» opens where the client was
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
        // every missing answer given: the line at the bottom goes too
        if (dopo.size === 0) setAvviso((a) => (a === T.mancano ? null : a))
        return dopo
      })
    }
    programma()
  }

  /** A change of screen in the address; the focus goes to its title, the page to its top. */
  function vaiA(n: NumeroSchermata, focus: string | null = null) {
    daFocalizzare.current = focus
    const url = new URL(window.location.href)
    url.searchParams.set('schermata', String(n))
    window.history.pushState(null, '', `${url.pathname}?${url.searchParams.toString()}`)
  }

  const primaVolta = useRef(true)
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false
      return
    }
    const voluto = daFocalizzare.current
    daFocalizzare.current = null
    if (voluto) {
      const campo = document.getElementById(idCampo(voluto))
      const blocco = document.querySelector<HTMLElement>(`[data-domanda="${voluto}"]`)
      blocco?.scrollIntoView({ block: 'start' })
      campo?.focus({ preventScroll: true })
      return
    }
    titolo.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [schermata])

  function mostraMancanti(chiavi: readonly string[]) {
    setMancanti(new Set(chiavi))
    setAvviso(T.mancano)
    const prima = schermataDi(chiavi)
    if (prima && prima !== schermata) vaiA(prima, chiavi[0] ?? null)
    else if (chiavi[0]) {
      const blocco = document.querySelector<HTMLElement>(`[data-domanda="${chiavi[0]}"]`)
      blocco?.scrollIntoView({ block: 'start' })
      document.getElementById(idCampo(chiavi[0]))?.focus({ preventScroll: true })
    }
  }

  async function invia() {
    if (invio) return
    setAvviso(null)
    const locali = risposteMancanti(soloValide(risposteRef.current as Record<string, unknown>))
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
      router.push('/percorso')
    } catch {
      setAvviso(T.nonSalvato)
    } finally {
      setInvio(false)
    }
  }

  const domande = domandeDi(schermata)
  const info = SCHERMATE.find((s) => s.numero === schermata)!
  const totale = SCHERMATE.length
  const mancantiPerSchermata = (n: NumeroSchermata) => domandeDi(n).filter((d) => mancanti.has(d.chiave)).length
  const mancantiQui = mancantiPerSchermata(schermata)

  return (
    <div className="space-y-5 pt-4 sm:space-y-6 sm:pt-8" data-testid="questionario" data-schermata={schermata} data-pronto={pronto}>
      <header className="space-y-3">
        <Link
          href="/percorso"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {T.tornaPercorso}
        </Link>
        <div className="space-y-1.5">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{TESTI_PERCORSO.marchio}</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{T.titolo}</h1>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{T.sotto}</p>
        </div>
      </header>

      {/* the four parts: where the client is, what is done, where an answer is missing */}
      <nav aria-label={T.schermate}>
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {SCHERMATE.map((s) => {
            const attuale = s.numero === schermata
            const conMancanti = mancantiPerSchermata(s.numero) > 0
            return (
              <li key={s.numero}>
                <button
                  type="button"
                  onClick={() => (attuale ? undefined : vaiA(s.numero))}
                  aria-current={attuale ? 'step' : undefined}
                  aria-label={`${s.titolo}, ${T.parte(s.numero, totale)}${conMancanti ? `, ${T.mancano}` : ''}`}
                  className={cn(
                    'group flex min-h-11 w-full flex-col items-start gap-1.5 rounded-lg px-1 pt-1.5 pb-1 text-left',
                    'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-full rounded-full transition-colors motion-reduce:transition-none',
                      attuale ? 'bg-primary glow-primario' : s.numero < schermata ? 'bg-primary/55' : 'bg-muted',
                      conMancanti && 'bg-status-critical',
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex w-full items-center gap-1 text-xs leading-tight',
                      attuale ? 'font-semibold text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    {conMancanti ? <TriangleAlert className="size-3.5 shrink-0 text-status-critical" /> : null}
                    <span className="truncate max-sm:hidden">{s.titolo}</span>
                    <span className="num sm:hidden">{s.numero}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <VetroLiquido
        as="section"
        raggio={20}
        sfocatura={10}
        aria-labelledby="titolo-schermata"
        className="vetro space-y-7 rounded-[20px] p-5 sm:p-8"
        data-testid="schermata-questionario"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="space-y-1">
            <p className="num text-xs font-medium tracking-wide text-muted-foreground uppercase" data-testid="indicatore">
              {T.indicatore(schermata, totale)}
            </p>
            <h2
              id="titolo-schermata"
              ref={titolo}
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight outline-none"
            >
              {info.titolo}
            </h2>
            <p className="text-sm text-muted-foreground">{info.sotto}</p>
          </div>
          <StatoSalvato stato={salvataggio} onRiprova={() => void salva()} />
        </div>

        {mancantiQui > 0 ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-status-critical/40 bg-status-critical/8 p-3 text-sm font-medium text-status-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {T.mancanoQui(mancantiQui)}
          </p>
        ) : null}

        <div key={chiaveForm} className="space-y-8">
          {domande.map((d) => {
            const valore = risposte[d.chiave]
            const errore = formato[d.chiave] ?? (mancanti.has(d.chiave) ? erroreMancante(d) : null)
            const allegato = d.allegato
            const mostraAllegati = allegato && (!allegato.quando || String(valore ?? '') === allegato.quando)
            return (
              <BloccoDomanda
                key={d.chiave}
                domanda={d}
                numero={NUMERI.get(d.chiave) ?? 0}
                errore={errore}
                extra={
                  mostraAllegati && allegato ? (
                    <AllegatiDomanda
                      allegato={allegato}
                      allegati={allegati.filter((a) => a.campo === allegato.campo)}
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
                  onCambia={(v) => cambia(d.chiave, v)}
                  onErroreFormato={(e) => setFormato((prima) => (prima[d.chiave] === e ? prima : { ...prima, [d.chiave]: e }))}
                />
              </BloccoDomanda>
            )
          })}
        </div>

        <div className="space-y-3 border-t border-border/70 pt-5">
          {avviso ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {avviso}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {schermata > 1 ? (
              <button
                type="button"
                onClick={() => vaiA((schermata - 1) as NumeroSchermata)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:justify-start"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
                {T.indietro}
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            {schermata < totale ? (
              <button
                type="button"
                onClick={() => vaiA((schermata + 1) as NumeroSchermata)}
                className="glow-primario flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:min-w-48"
                data-testid="avanti"
              >
                {T.avanti}
                <ArrowRight className="size-5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void invia()}
                aria-disabled={invio ? true : undefined}
                className="glow-primario flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none sm:min-w-64"
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
      </VetroLiquido>
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
