'use client'

import { CircleCheck, Clock, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { aggiornaDati } from '@/app/(app)/insight/actions'
import { useAdessoMezzoMinuto } from '@/components/insight/orologio'
import { Button } from '@/components/ui/button'
import { formatOra } from '@/lib/date'
import { LINK_CHIAVE_INSTAGRAM } from '@/lib/insight/link'
import { AGGIORNA, fasePasso, rigaFallita, rigaInCorso, rigaPianificatore } from '@/lib/insight/parole'
import {
  esecuzioneInCorso,
  leggiStatoInsight,
  leggiStatoInsightAdmin,
  pianificatoreFermo,
  type StatoInsight,
  type StatoInsightAdmin,
} from '@/lib/insight/stato'
import { createClient } from '@/lib/supabase/client'
import { URL_PASSO_MANCANTE } from '@/lib/validation/insight'

/** The run's state polled while it works (D11). */
const OGNI_STATO_MS = 15_000
/** A new recap looked for while the page is on screen (D11). */
const OGNI_RECAP_MS = 60_000
/** «Dati aggiornati.» stays this long, as the artifact. */
const FATTO_MS = 8000

type Stato = StatoInsight | StatoInsightAdmin

type PropsComuni = {
  /** the server's reading of insight_stato(), with the shape of the role; null when it could not be read */
  stato: Stato | null
  /** the newest generato_il of all the recaps when the page was read: a newer one reloads the page */
  ultimoGeneratoIl: string | null
  /** the server's instant (ISO), for the first render only */
  adesso: string
  children: ReactNode
}

type Props =
  | (PropsComuni & {
      admin: true
      /** insightConfigurato() on the server (D23): the setter never learns it */
      configurato: boolean
      /** urlPasso() did not throw: the scheduler can send the steps (D18) */
      urlValido: boolean
      /** the Instagram token expired or refused by Meta, as Impostazioni › Instagram says it */
      tokenScaduto: boolean
    })
  | (PropsComuni & { admin: false })

type Valore = {
  admin: boolean
  stato: Stato | null
  inCorso: boolean
  avvio: boolean
  fatto: boolean
  erroreAzione: string | null
  configurato: boolean
  urlValido: boolean
  tokenScaduto: boolean
  adessoMs: number
  aggiorna: () => void
}

const Contesto = createContext<Valore | null>(null)

/** A run that was working and is now ready: «Dati aggiornati.». */
function appenaPronta(prima: Stato | null, dopo: Stato | null): boolean {
  return esecuzioneInCorso(prima) && dopo?.esecuzione?.stato === 'pronta'
}

/**
 * The state of the runs of the Insight, for the whole page: «Aggiorna dati»
 * (admin) and the line under the header (both roles), as the artifact's
 * refresh button and status, on the server pipeline of 1.35.0.
 *
 * - While a run is queued or working, insight_stato() is read again every
 *   15 seconds from the browser (D11; CLAUDE.md section 10: reads from the
 *   Supabase client, never from a server action). When it is ready: «Dati
 *   aggiornati.» for 8 seconds and the page read again.
 * - While the page is on screen, every 60 seconds and when it comes back, the
 *   newest recap is looked for: a recap newer than the page's (a run of the
 *   automation, another admin's «Aggiorna dati») reloads it.
 * - The setter sees one line during a run and nothing else (D23, C47): never
 *   a phase, an error, a cost or whether the Insight is configured.
 */
export function AggiornamentoInsight(props: Props) {
  const { admin, stato: statoServer, ultimoGeneratoIl, adesso, children } = props
  const router = useRouter()
  const [stato, setStato] = useState<Stato | null>(statoServer)
  const [letto, setLetto] = useState<Stato | null>(statoServer)
  const [fatto, setFatto] = useState(false)
  // a new reading from the server (the action's redraw, a refresh) is the truth: a render-time reset
  if (letto !== statoServer) {
    setLetto(statoServer)
    if (appenaPronta(stato, statoServer)) setFatto(true)
    setStato(statoServer)
  }
  const [avvio, avvia] = useTransition()
  const [erroreAzione, setErroreAzione] = useState<string | null>(null)
  const inCorso = esecuzioneInCorso(stato)
  const adessoMs = useAdessoMezzoMinuto(Date.parse(adesso))

  const statoRef = useRef(stato)
  useEffect(() => {
    statoRef.current = stato
  })
  const ultimoRecap = useRef(ultimoGeneratoIl)
  useEffect(() => {
    if (ultimoGeneratoIl && (!ultimoRecap.current || Date.parse(ultimoGeneratoIl) > Date.parse(ultimoRecap.current))) {
      ultimoRecap.current = ultimoGeneratoIl
    }
  }, [ultimoGeneratoIl])

  // «Dati aggiornati.» goes after 8 seconds
  useEffect(() => {
    if (!fatto) return
    const t = setTimeout(() => setFatto(false), FATTO_MS)
    return () => clearTimeout(t)
  }, [fatto])

  // the run's state, every 15 seconds while it works
  useEffect(() => {
    if (!inCorso) return
    const supabase = createClient()
    let vivo = true
    async function leggi() {
      const { data, error } = await supabase.rpc('insight_stato')
      if (!vivo || error) return
      const nuovo = admin ? leggiStatoInsightAdmin(data) : leggiStatoInsight(data)
      if (!nuovo) return
      const prima = statoRef.current
      setStato(nuovo)
      if (appenaPronta(prima, nuovo)) {
        setFatto(true)
        router.refresh()
      }
    }
    const intervallo = setInterval(() => void leggi(), OGNI_STATO_MS)
    function alRitorno() {
      if (document.visibilityState === 'visible') void leggi()
    }
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      vivo = false
      clearInterval(intervallo)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [inCorso, admin, router])

  // a newer recap, every 60 seconds and when the page comes back
  useEffect(() => {
    const supabase = createClient()
    let vivo = true
    async function controlla() {
      if (document.visibilityState !== 'visible') return
      const { data, error } = await supabase
        .from('insight_recap')
        .select('giorno, canale, generato_il')
        .order('generato_il', { ascending: false })
        .limit(2)
      if (!vivo || error || !Array.isArray(data) || !data.length) return
      const piuNuovo = (data as { generato_il: string }[])
        .map((r) => r.generato_il)
        .filter((v) => Number.isFinite(Date.parse(v)))
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
      if (!piuNuovo) return
      const visto = ultimoRecap.current
      if (visto && Date.parse(piuNuovo) <= Date.parse(visto)) return
      ultimoRecap.current = piuNuovo
      router.refresh()
    }
    const intervallo = setInterval(() => void controlla(), OGNI_RECAP_MS)
    function alRitorno() {
      if (document.visibilityState === 'visible') void controlla()
    }
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      vivo = false
      clearInterval(intervallo)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [router])

  function aggiorna() {
    if (!admin) return
    setErroreAzione(null)
    setFatto(false)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof aggiornaDati>>
      try {
        esito = await aggiornaDati()
      } catch {
        setErroreAzione(AGGIORNA.connessione)
        return
      }
      if (!esito.ok) {
        setErroreAzione(esito.errore)
        return
      }
      // the action redraws the page with the run queued; read it now too, so the line starts at once
      const supabase = createClient()
      const { data, error } = await supabase.rpc('insight_stato')
      if (error) return
      const nuovo = leggiStatoInsightAdmin(data)
      if (nuovo) setStato(nuovo)
    })
  }

  const valore: Valore = {
    admin,
    stato,
    inCorso,
    avvio,
    fatto,
    erroreAzione,
    configurato: props.admin ? props.configurato : true,
    urlValido: props.admin ? props.urlValido : true,
    tokenScaduto: props.admin ? props.tokenScaduto : false,
    adessoMs,
    aggiorna,
  }

  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

function useAggiornamento(): Valore {
  const valore = useContext(Contesto)
  if (!valore) throw new Error('AggiornamentoInsight manca')
  return valore
}

/** «Aggiorna dati» (admin only): the page's one primary button, full width on a phone. */
export function BottoneAggiornaDati({ className }: { className?: string }) {
  const { admin, avvio, inCorso, configurato, aggiorna } = useAggiornamento()
  if (!admin) return null
  const parola = avvio ? AGGIORNA.avvio : inCorso ? AGGIORNA.inCorso : AGGIORNA.bottone
  return (
    <Button
      type="button"
      onClick={aggiorna}
      disabled={avvio || inCorso || !configurato}
      aria-busy={avvio || inCorso || undefined}
      className={className ?? 'h-11 w-full gap-1.5 px-4 sm:w-auto'}
    >
      {avvio || inCorso ? (
        <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="size-4" aria-hidden="true" />
      )}
      {parola}
    </Button>
  )
}

type Riga = { tono: 'ok' | 'errore' | 'neutro'; testo: string; link?: { href: string; etichetta: string } }

function rigaDi(v: Valore): Riga | null {
  const { admin, stato, inCorso, avvio, fatto, erroreAzione, configurato, urlValido, tokenScaduto, adessoMs } = v
  if (!admin) return inCorso ? { tono: 'neutro', testo: AGGIORNA.setterInCorso } : null
  if (avvio) return null
  if (inCorso && stato?.esecuzione) {
    const e = stato.esecuzione
    const minuti = Math.round((adessoMs - Date.parse(e.creata_il)) / 60_000)
    return { tono: 'neutro', testo: rigaInCorso(Number.isFinite(minuti) ? minuti : 1, fasePasso(e.passo, e.blocchi_fatti, e.blocchi_totali)) }
  }
  if (fatto) return { tono: 'ok', testo: AGGIORNA.fatto }
  if (erroreAzione) return { tono: 'errore', testo: erroreAzione }
  if (!configurato) return { tono: 'errore', testo: AGGIORNA.chiaveMancante }
  if (!urlValido) return { tono: 'errore', testo: URL_PASSO_MANCANTE }
  if (tokenScaduto) {
    return {
      tono: 'errore',
      testo: AGGIORNA.tokenScaduto,
      link: { href: LINK_CHIAVE_INSTAGRAM, etichetta: AGGIORNA.apriImpostazioni },
    }
  }
  if (stato?.esecuzione?.stato === 'fallita') {
    const errore = 'errore' in stato.esecuzione ? stato.esecuzione.errore : null
    return { tono: 'errore', testo: rigaFallita(errore) }
  }
  const tick = 'ultimo_tick_il' in (stato ?? {}) ? (stato as StatoInsightAdmin).ultimo_tick_il : null
  // a tick never seen yet is not a dead scheduler (as the Automazione box says it)
  if (stato && tick && pianificatoreFermo({ attivo: stato.attivo, ultimo_tick_il: tick }, new Date(adessoMs))) {
    return { tono: 'errore', testo: rigaPianificatore(formatOra(tick)) }
  }
  return null
}

const ICONA = { ok: CircleCheck, errore: TriangleAlert, neutro: Clock } as const
const COLORE = { ok: 'text-status-ok', errore: 'text-rosso-testo', neutro: 'text-muted-foreground' } as const

/**
 * The line under the header (role="status", always there so a change is
 * read): the run's progress, «Dati aggiornati.», the reasons «Aggiorna dati»
 * cannot work (admin), the setter's one line during a run. Icon and words,
 * never colour alone.
 */
export function RigaAggiornamento() {
  const v = useAggiornamento()
  const riga = rigaDi(v)
  const Icona = riga ? ICONA[riga.tono] : null
  return (
    <div role="status" aria-live="polite" data-testid="riga-aggiornamento" className="min-w-0 text-sm">
      {riga && Icona ? (
        <p className={`mt-3 flex items-start gap-1.5 ${COLORE[riga.tono]}`}>
          <Icona className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {riga.testo}
            {riga.link ? (
              <>
                {' '}
                <Link href={riga.link.href} className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4">
                  {riga.link.etichetta}
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  )
}
