'use client'

import { CircleCheck, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { salvaReportGiornaliero, type EsitoSalvataggio, type RigaReport } from '@/app/(app)/today/actions'
import {
  EVENTO_COMMENTO_GIORNO,
  EVENTO_PROPOSTA,
  EVENTO_PROPOSTA_FINE,
  numeriDi,
  risposteDi,
  type DettaglioEventoCommento,
  type DettaglioEventoProposta,
  type DettaglioEventoPropostaFine,
} from '@/app/(app)/today/proposta-instagram'
import { leggiStatoGiorno } from '@/app/(app)/today/stato-giorno'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Stepper } from '@/components/numeri/stepper'
import { ANCORA_COMMENTO, CommentoReport, DaCompletare, type StatoCommento } from '@/components/setter/commento-report'
import { ricontaPromemoria } from '@/components/shell/esiti-da-registrare'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { formatOra } from '@/lib/date'
import { formato } from '@/lib/format'
import { etichettaGiornoIn } from '@/lib/i18n/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { OGGI, giornoInFrase, gruppiReport, traduciErroreSetting } from '@/lib/i18n/testi/oggi'
import { PROPOSTE } from '@/lib/i18n/testi/proposte'
import { legende } from '@/lib/metriche/legenda-en'
import { commentoMancante, commentoObbligatorio, statoCommento } from '@/lib/setting/commento'
import { cn } from '@/lib/utils'
import {
  MASSIMO_GIORNALIERO,
  REPORT_VUOTO,
  chiaveValoriSalvati,
  type ValoriReport,
} from '@/lib/validation/report'

const RITARDO_NUMERI_MS = 500
const RITARDO_NOTE_MS = 1000

/** Saves without an answer kept in mind: more than this, the oldest go. */
const INCERTE_MAX = 10

/** The day changed elsewhere (a decision of the admin, another device) and is read again. */
export const RILETTURA = OGGI.it.rilettura

type Stato =
  | { tipo: 'nuovo' }
  | { tipo: 'modificato' }
  | { tipo: 'salvataggio' }
  | { tipo: 'salvato'; alle: string }
  | { tipo: 'errore'; messaggio: string }

/** A save sent whose answer never came back: it may have landed all the same. */
type Incerta = {
  /** the screen's values as sent (JSON.stringify), the form's own key */
  chiave: string
  /** the same values as the database stores them (chiaveValoriSalvati) */
  salvata: string | null
  /** whether it was the save that creates the day's report */
  creazione: boolean
}

type Props = {
  data: string
  oggi: string
  /** the setter: whose report and proposals the browser reads again (under RLS, only his) */
  setterId: string
  /** firmaProposte of what the page shows: back to the front, the page is read again if it changed */
  firmaProposte: string
  iniziale: ValoriReport
  /**
   * updated_at of the loaded row (null when there is none): when it was last
   * saved, and the version the next save writes over (salvaReportGiornaliero)
   */
  salvatoAlle: string | null
  /** DM totali of the loaded row, as the database computed it (0 when there is no row) */
  dmTotali: number | null
  /** created_at of the loaded row (null when there is none): a day reported before the questions is never asked */
  creatoIl?: string | null
}

export function ReportForm({
  data,
  oggi,
  setterId,
  firmaProposte,
  iniziale,
  salvatoAlle,
  dmTotali: dmTotaliIniziale,
  creatoIl = null,
}: Props) {
  const lingua = useLingua()
  const t = OGGI[lingua]
  const CONNESSIONE_ASSENTE = t.connessioneAssente
  const GRUPPI = gruppiReport(lingua)
  const avviato = useCallback(
    () => toast.success(t.avviato(giornoInFrase(etichettaGiornoIn(data, oggi, lingua), lingua))),
    [t, data, oggi, lingua],
  )
  const [valori, setValori] = useState<ValoriReport>(iniziale)
  // Only the database adds the DM up: the value of the last saved row
  const [dmTotali, setDmTotali] = useState(dmTotaliIniziale)
  const [stato, setStato] = useState<Stato>(
    salvatoAlle ? { tipo: 'salvato', alle: salvatoAlle } : { tipo: 'nuovo' },
  )

  // Save queue. Next dispatches actions one at a time; every request carries
  // the full snapshot, and the loop keeps going until nothing is left pending,
  // so the last value typed is always the one stored.
  const valoriRef = useRef(iniziale)
  const ultimoSalvato = useRef(salvatoAlle ? JSON.stringify(iniziale) : null)
  // the day as it opened: without a saved row, nothing to save until it changes
  const chiaveIniziale = useRef(JSON.stringify(iniziale))
  const ultimaOra = useRef(salvatoAlle)
  // The version of the report this screen holds (updated_at as loaded or last
  // saved): a save writes only over it. The admin decides the setter's days
  // from Instagram too, from another device (08/10/2026): a report changed
  // meanwhile is never overwritten with what is on this screen, the save is
  // refused and the day reloads.
  const versione = useRef(salvatoAlle)
  // Saves that never got an answer (no connection on the way back, the phone
  // switching app right after a tap): the database may have written them, and
  // this screen's version is then behind. The next save is refused; if the day
  // holds exactly one of these, it was this screen's own save: its version is
  // taken and the save goes on, without "changed elsewhere".
  const incerte = useRef<Incerta[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inVolo = useRef(false)
  const daRisalvare = useRef(false)
  // the running loop: true once everything typed is saved, false when a save failed
  const ciclo = useRef<Promise<boolean>>(Promise.resolve(true))
  // Whether the saved day misses its required comment (from 08/10/2026): the
  // number on "Oggi" counts the saved reports, so when a save changes it the
  // badge counts again at once (no server render of the layout after a save)
  const mancaSalvato = useRef(salvatoAlle ? commentoMancante(iniziale, data) : false)
  // A decision on this day's proposal from Instagram is on its way (the card
  // above): the form takes no change and sends no save until the page reloads
  // it with the decided numbers, so nothing of it lands after the decision.
  const sospesoRef = useRef(false)
  const [sospeso, setSospeso] = useState(false)
  // The page is being read again, and the form stands still (no tap, no save)
  // until it is back: 'cambiato' after a save refused because the report
  // changed elsewhere (the saved day replaces the screen), 'controllo' when the
  // app came back to the foreground and the day or its proposals changed on the
  // server (the saved day replaces the screen only if the report changed).
  // Never without a connection: a refresh that fails falls back to a full
  // browser navigation, and the whole screen would give way to the browser's
  // error page (leggiStatoGiorno answers first).
  const router = useRouter()
  const [rilettura, avviaRilettura] = useTransition()
  const daRileggere = useRef<'cambiato' | 'controllo' | null>(null)
  const ricaricaRef = useRef(false)
  const [ricarica, setRicarica] = useState(false)
  // a check of the foreground in flight: one at a time
  const controlloInCorso = useRef(false)
  // what the page shows of the proposals, for the check of the foreground
  const firmaPagina = useRef(firmaProposte)
  useEffect(() => {
    firmaPagina.current = firmaProposte
  }, [firmaProposte])

  /** The saved day's comment changed (missing or complete): the badge counts again. */
  const segnaSalvato = useCallback(
    (salvati: ValoriReport | null) => {
      const manca = salvati ? commentoMancante(salvati, data) : false
      if (manca === mancaSalvato.current) return
      mancaSalvato.current = manca
      ricontaPromemoria()
    },
    [data],
  )

  /** The day as saved on the server replaces the screen. */
  const mostra = useCallback((nuovi: ValoriReport, alle: string | null, totali: number | null) => {
    segnaSalvato(alle ? nuovi : null)
    valoriRef.current = nuovi
    setValori(nuovi)
    ultimoSalvato.current = alle ? JSON.stringify(nuovi) : null
    chiaveIniziale.current = JSON.stringify(nuovi)
    ultimaOra.current = alle
    versione.current = alle
    incerte.current = []
    setDmTotali(totali)
    setStato(alle ? { tipo: 'salvato', alle } : { tipo: 'nuovo' })
  }, [segnaSalvato])

  /** Reads the page again (called only once the server answered): the form stands still until it is back. */
  const rileggi = useCallback(
    (motivo: 'cambiato' | 'controllo') => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      ricaricaRef.current = true
      setRicarica(true)
      // a refused save outweighs a check
      if (daRileggere.current !== 'cambiato') daRileggere.current = motivo
      avviaRilettura(() => router.refresh())
    },
    [router],
  )

  /**
   * A save refused because the day changed elsewhere: the form stops and the
   * page is read again, once the browser can reach the server. When it cannot
   * (the connection dropped right after the answer), the day the server sent
   * with the refusal replaces the screen and the form is the setter's again;
   * the rest of the page (the proposals) follows when the app is back in front.
   */
  const ricaricaDopoRifiuto = useCallback(
    (attuale: RigaReport | null | undefined) => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      ricaricaRef.current = true
      setRicarica(true)
      toast.warning(t.rilettura.toast)
      void leggiStatoGiorno(setterId, data).then((raggiunto) => {
        if (raggiunto) {
          rileggi('cambiato')
          return
        }
        if (attuale !== undefined) {
          mostra(attuale ? attuale.valori : REPORT_VUOTO, attuale?.salvatoAlle ?? null, attuale ? attuale.dmTotali : 0)
        } else {
          // nothing to show in its place: the next save is refused again, and reads it then
          setStato({ tipo: 'errore', messaggio: CONNESSIONE_ASSENTE })
        }
        ricaricaRef.current = false
        setRicarica(false)
      })
    },
    [setterId, data, rileggi, mostra, t, CONNESSIONE_ASSENTE],
  )

  /** Saves what is on screen now; a call during a save joins it. Never throws. */
  const salvaOra = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (inVolo.current) {
      daRisalvare.current = true
      return ciclo.current
    }

    inVolo.current = true
    const giro = (async (): Promise<boolean> => {
      try {
        for (;;) {
          daRisalvare.current = false
          const istantanea = valoriRef.current
          const chiave = JSON.stringify(istantanea)

          if (chiave === ultimoSalvato.current) {
            if (ultimaOra.current) setStato({ tipo: 'salvato', alle: ultimaOra.current })
            return true
          }

          setStato({ tipo: 'salvataggio' })

          let esito: EsitoSalvataggio
          try {
            esito = await salvaReportGiornaliero({ data, ...istantanea, versione: versione.current })
          } catch {
            // no answer: the database may have written it all the same
            incerte.current = [
              ...incerte.current,
              { chiave, salvata: chiaveValoriSalvati(istantanea), creazione: versione.current === null },
            ].slice(-INCERTE_MAX)
            setStato({ tipo: 'errore', messaggio: CONNESSIONE_ASSENTE })
            toast.error(t.reportNonSalvato(CONNESSIONE_ASSENTE))
            return false
          }

          if (!esito.ok) {
            if (esito.cambiato) {
              // The day is not at this screen's version. Exactly what this
              // screen sent in a save without an answer: that save landed, the
              // answer was lost. Its version is taken and the loop goes on
              // (what is on screen now goes out over it, or nothing is left)
              const attuale = esito.attuale
              const salvata = attuale ? chiaveValoriSalvati(attuale.valori) : null
              const nostra =
                salvata === null ? undefined : incerte.current.findLast((incerta) => incerta.salvata === salvata)
              incerte.current = []
              if (attuale && nostra) {
                ultimoSalvato.current = nostra.chiave
                ultimaOra.current = attuale.salvatoAlle
                versione.current = attuale.salvatoAlle
                setDmTotali(attuale.dmTotali)
                segnaSalvato(attuale.valori)
                if (nostra.creazione) avviato()
                continue
              }
              // changed elsewhere: nothing written, the screen takes the saved day
              ricaricaDopoRifiuto(attuale)
              return false
            }
            const messaggio = traduciErroreSetting(esito.errore, lingua)
            setStato({ tipo: 'errore', messaggio })
            toast.error(t.reportNonSalvato(messaggio))
            return false
          }

          // written over this screen's version: no save without an answer landed meanwhile
          incerte.current = []
          ultimoSalvato.current = chiave
          ultimaOra.current = esito.salvatoAlle
          versione.current = esito.salvatoAlle
          setDmTotali(esito.dmTotali)
          segnaSalvato(istantanea)
          if (esito.creato) avviato()
          if (JSON.stringify(valoriRef.current) === chiave) {
            setStato({ tipo: 'salvato', alle: esito.salvatoAlle })
          }

          if (!daRisalvare.current) return true
        }
      } finally {
        inVolo.current = false
      }
    })()
    ciclo.current = giro
    return giro
  }, [data, ricaricaDopoRifiuto, segnaSalvato, avviato, CONNESSIONE_ASSENTE, t, lingua])

  /**
   * The screen's save (a tap, a blur, leaving the page): never while a
   * decision is on its way, nor while the page is read again.
   */
  const salva = useCallback(
    (): Promise<boolean> => (sospesoRef.current || ricaricaRef.current ? Promise.resolve(false) : salvaOra()),
    [salvaOra],
  )

  const aggiorna = useCallback(
    (modifica: Partial<ValoriReport>, ritardo = RITARDO_NUMERI_MS) => {
      if (sospesoRef.current || ricaricaRef.current) return
      const prossimi = { ...valoriRef.current, ...modifica }
      valoriRef.current = prossimi
      setValori(prossimi)
      setStato({ tipo: 'modificato' })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void salva(), ritardo)
    },
    [salva],
  )

  const inSospeso =
    stato.tipo === 'modificato' || stato.tipo === 'salvataggio' || stato.tipo === 'errore'

  /** Nothing typed is waiting: no change queued, no save in flight, the screen equal to what is saved. */
  const nienteDaSalvare = useCallback(
    () =>
      timer.current === null &&
      !inVolo.current &&
      JSON.stringify(valoriRef.current) === (ultimoSalvato.current ?? chiaveIniziale.current),
    [],
  )

  // The page came back from the server (rileggi). After a refused save, the
  // saved day replaces the screen. After the app came back to the foreground,
  // only if the report changed (the form stood still meanwhile, and the check
  // started only with nothing to save); if only the proposals changed, the
  // cards above are new and the screen stays. A decision on this day's
  // proposal changes the page's key instead: the whole form starts again from
  // the decided day.
  useEffect(() => {
    if (rilettura || !daRileggere.current) return
    const motivo = daRileggere.current
    daRileggere.current = null
    ricaricaRef.current = false
    setRicarica(false)
    if (motivo === 'controllo' && (salvatoAlle === versione.current || sospesoRef.current)) return
    mostra(iniziale, salvatoAlle, dmTotaliIniziale)
  }, [rilettura, iniziale, salvatoAlle, dmTotaliIniziale, mostra])

  // A day with DM or conversations asks for the comment: from 08/10/2026 the
  // three answers, required ("Manca il commento della giornata"); before, the
  // two scales ("Da completare"). A reminder for the setter on his own day,
  // from what is on screen; the save never waits for it
  const daCompletare = statoCommento(valori, data, creatoIl)
  const obbligatorio = commentoObbligatorio(data)

  // Leaving the screen: flush now, and warn if something is still unsaved.
  // Coming back: a decision taken meanwhile on another device (the admin's,
  // 08/10/2026), or a proposal of the night, is on screen before the next
  // tap. The browser asks the server first (leggiStatoGiorno): no answer (no
  // connection), the screen stays as it is; nothing changed, nothing is read
  // again; changed, the page is read again.
  useEffect(() => {
    const puoRileggere = () =>
      document.visibilityState === 'visible' &&
      navigator.onLine !== false &&
      !sospesoRef.current &&
      !ricaricaRef.current &&
      nienteDaSalvare()

    const controlla = async () => {
      if (controlloInCorso.current || !puoRileggere()) return
      controlloInCorso.current = true
      try {
        const sulServer = await leggiStatoGiorno(setterId, data)
        if (!sulServer) return
        if (sulServer.versione === versione.current && sulServer.proposte === firmaPagina.current) return
        // a tap meanwhile goes out as always: over the old version, refused if the day changed
        if (puoRileggere()) rileggi('controllo')
      } finally {
        controlloInCorso.current = false
      }
    }

    const suVisibilita = () => {
      // only what is waiting goes out: switching tab on an untouched day never creates an empty report
      if (document.visibilityState === 'hidden') {
        if (!nienteDaSalvare()) void salva()
      } else if (document.visibilityState === 'visible') void controlla()
    }
    const primaDiUscire = (e: BeforeUnloadEvent) => {
      if (inSospeso) e.preventDefault()
    }
    document.addEventListener('visibilitychange', suVisibilita)
    window.addEventListener('beforeunload', primaDiUscire)
    return () => {
      document.removeEventListener('visibilitychange', suVisibilita)
      window.removeEventListener('beforeunload', primaDiUscire)
    }
  }, [salva, inSospeso, rileggi, nienteDaSalvare, setterId, data])

  // A proposal from Instagram is about to be decided for this day (the card
  // above). Whatever is not saved yet (a change still waiting, a save in
  // flight, a save that failed) goes out now and the card waits for it: it
  // lands before the decision, or the decision does not happen. Then the form
  // stops until the page reloads it (a new key) or the card gives it back
  // (EVENTO_PROPOSTA_FINE: the decision did not happen). Nothing to save,
  // nothing sent: a day never written is not created by a decision.
  useEffect(() => {
    const suProposta = (e: Event) => {
      const dettaglio = (e as CustomEvent<DettaglioEventoProposta>).detail
      if (dettaglio?.data !== data) return
      const daSalvare =
        timer.current !== null ||
        inVolo.current ||
        JSON.stringify(valoriRef.current) !== (ultimoSalvato.current ?? chiaveIniziale.current)
      // a save refused because the day changed elsewhere: the card says so, and decides nothing.
      // While the day is read again after that refusal, the refused values are not sent again
      if (daSalvare) {
        dettaglio.attese.push(
          ricaricaRef.current
            ? Promise.resolve('cambiato' as const)
            : salvaOra().then((ok) => (ok ? true : ricaricaRef.current ? 'cambiato' : false)),
        )
      }
      sospesoRef.current = true
      setSospeso(true)
    }
    const suFine = (e: Event) => {
      const dettaglio = (e as CustomEvent<DettaglioEventoPropostaFine>).detail
      if (dettaglio?.data !== data) return
      sospesoRef.current = false
      setSospeso(false)
      // decided elsewhere, his answers of the step saved into this day: the
      // saved day replaces the screen (the page may keep this form's key, its
      // decision already read when the app came back to the foreground)
      if (dettaglio.rileggi) rileggi('cambiato')
    }
    // the card asks what this day holds now, before it decides: the answers
    // and the numbers on screen, saved or not (they are saved before the decision)
    const suCommento = (e: Event) => {
      const dettaglio = (e as CustomEvent<DettaglioEventoCommento>).detail
      if (dettaglio?.data !== data) return
      dettaglio.attuale = { risposte: risposteDi(valoriRef.current), numeri: numeriDi(valoriRef.current) }
    }
    window.addEventListener(EVENTO_PROPOSTA, suProposta)
    window.addEventListener(EVENTO_PROPOSTA_FINE, suFine)
    window.addEventListener(EVENTO_COMMENTO_GIORNO, suCommento)
    return () => {
      window.removeEventListener(EVENTO_PROPOSTA, suProposta)
      window.removeEventListener(EVENTO_PROPOSTA_FINE, suFine)
      window.removeEventListener(EVENTO_COMMENTO_GIORNO, suCommento)
    }
  }, [data, salvaOra, rileggi])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <div className="space-y-5">
      <StatoSalvataggio
        stato={stato}
        sospeso={sospeso || ricarica}
        motivoSospeso={ricarica ? t.rilettura.barra : PROPOSTE[lingua].sospeso}
        riprova={() => void salva()}
        daCompletare={daCompletare}
        lingua={lingua}
      />

      {/* inert while a decision on this day's proposal is on its way, or while the
          day changed elsewhere is read again: no tap can go after it */}
      <div
        inert={sospeso || ricarica}
        aria-busy={sospeso || ricarica || undefined}
        className={cn('space-y-5', (sospeso || ricarica) && 'opacity-60')}
        data-testid="report-campi"
      >
        {GRUPPI.map((gruppo, i) => (
          <section
            key={gruppo.titolo}
            aria-labelledby={`gruppo-${gruppo.titolo}`}
            data-tour={i === 0 ? 'oggi-contatori' : undefined}
          >
            <h2
              id={`gruppo-${gruppo.titolo}`}
              className="mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {gruppo.titolo}
            </h2>
            <div className="divide-y divide-border rounded-xl bg-card px-3">
              {gruppo.campi.map(([campo, etichetta, aiuto]) => (
                <div key={campo} className="pb-2">
                  <Stepper
                    etichetta={etichetta}
                    valore={valori[campo]}
                    massimo={MASSIMO_GIORNALIERO}
                    onCambia={(n) => aggiorna({ [campo]: n })}
                    onFineModifica={() => void salva()}
                    className="pb-0.5"
                  />
                  <p className="text-xs leading-snug text-muted-foreground">{aiuto}</p>
                </div>
              ))}
            </div>
            {gruppo.campi.some(([campo]) => campo === 'dm_outbound') ? (
              <DmTotali valore={dmTotali} inAggiornamento={inSospeso} lingua={lingua} />
            ) : null}
            {gruppo.nota ? (
              <p className="mt-1.5 px-1 text-xs text-muted-foreground">{gruppo.nota}</p>
            ) : null}
            {/* with the volumes, right under the conversations (Dany, 30/09/2026) */}
            {gruppo.commento ? (
              <div className="mt-5">
                <CommentoReport
                  valori={valori}
                  stato={daCompletare}
                  obbligatorio={obbligatorio}
                  // one tap: saved at once, like the switch
                  onScala={(campo, valore) => aggiorna({ [campo]: valore }, 0)}
                  onTesto={(campo, testo) => aggiorna({ [campo]: testo }, RITARDO_NOTE_MS)}
                  onFineTesto={() => void salva()}
                />
              </div>
            ) : null}
          </section>
        ))}

        <section aria-labelledby="gruppo-contenuto" className="space-y-2">
          <h2
            id="gruppo-contenuto"
            className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {t.contenuto}
          </h2>
          <div className="rounded-xl bg-card px-3">
            <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm">{t.contenutoPubblicato}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{t.contenutoAiuto}</span>
              </span>
              <Switch
                checked={valori.contenuto_pubblicato}
                onCheckedChange={(checked) =>
                  aggiorna({ contenuto_pubblicato: checked }, 0)
                }
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * The sum of the three counters above, read back from the saved row (a
 * generated column). Until the save lands it shows the last saved value, dimmed.
 */
function DmTotali({ valore, inAggiornamento, lingua }: { valore: number | null; inAggiornamento: boolean; lingua: Lingua }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 px-1" data-testid="dm-totali">
      <span className="text-sm">
        {legende(lingua).setting.dm_totali.etichetta}:{' '}
        <span
          className={cn('num font-semibold transition-colors', inAggiornamento && 'text-muted-foreground')}
          data-testid="dm-totali-valore"
        >
          {formato(lingua).formatNumero(valore)}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">{OGGI[lingua].sommaDm}</span>
    </p>
  )
}

function StatoSalvataggio({
  stato,
  sospeso,
  motivoSospeso,
  riprova,
  daCompletare,
  lingua,
}: {
  stato: Stato
  /**
   * a decision on this day's proposal is on its way, or the day changed
   * elsewhere is being read again: the form waits for the page to reload it
   */
  sospeso: boolean
  /** what the bar says meanwhile */
  motivoSospeso: string
  riprova: () => void
  /** The day's own reminder, in view while scrolling: never while an error needs the space */
  daCompletare: StatoCommento | null
  lingua: Lingua
}) {
  const t = OGGI[lingua]
  // while a decision is on its way, only that: the form below takes nothing
  const mostra = sospeso ? null : stato.tipo

  return (
    // Stays in view while scrolling. On mobile it sits under the sticky top
    // bar (size-11 button + py-2.5 + 1px border = 65px); no top bar from md up.
    <div
      aria-live="polite"
      data-tour="oggi-salvato"
      className="sticky top-[65px] z-10 -mx-1 flex min-h-11 items-center justify-between gap-3 bg-background px-1 text-sm md:top-0"
    >
      {sospeso ? (
        <p className="flex items-center gap-2 text-muted-foreground" data-testid="report-sospeso">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {motivoSospeso}
        </p>
      ) : null}

      {mostra === 'nuovo' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <CircleDashed className="size-4 shrink-0" aria-hidden="true" />
          {t.nonCompilato}
        </p>
      ) : null}

      {mostra === 'modificato' || mostra === 'salvataggio' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {t.salvataggio}
        </p>
      ) : null}

      {!sospeso && stato.tipo === 'salvato' ? (
        <p className="flex shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground" data-testid="stato-salvato">
          <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {t.salvatoAlle} <span className="num text-foreground">{formatOra(stato.alle)}</span>
        </p>
      ) : null}

      {!sospeso && stato.tipo === 'errore' ? (
        <>
          <p role="alert" className="flex items-center gap-2 text-status-critical">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {t.nonSalvato(stato.messaggio)}
          </p>
          <Button type="button" variant="outline" className="h-11" onClick={riprova}>
            {t.riprova}
          </Button>
        </>
      ) : null}

      {daCompletare && !sospeso && stato.tipo !== 'errore' ? (
        // a link to the two questions: from the Call group, one tap brings them back
        <DaCompletare
          className="ml-auto"
          testId="da-completare-giorno"
          href={`#${ANCORA_COMMENTO}`}
          stato={daCompletare}
        />
      ) : null}
    </div>
  )
}
