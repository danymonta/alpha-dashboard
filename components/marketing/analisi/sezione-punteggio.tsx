'use client'

import { CalendarPlus, Check, CircleCheck, Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { aggiungiRifacimentoAlCalendario } from '@/app/(app)/marketing/analisi/actions'
import { BadgePunteggio } from '@/components/marketing/analisi/badge-punteggio'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { Button } from '@/components/ui/button'
import { copiaNegliAppunti } from '@/lib/appunti'
import type { AnalisiLetta, PunteggioLetto } from '@/lib/marketing/analisi/dettaglio'
import { fasciaDaCodice, ETICHETTA_TIPO } from '@/lib/marketing/punteggio/tabelle'
import type { CriterioValutato, PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'

const CONNESSIONE = 'Connessione assente. Riprova.'

const numero = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })

/** «Copia» next to a text of the redo: the clipboard is written from the tap itself (lib/appunti.ts). */
function Copia({ testo, nome }: { testo: string; nome: string }) {
  const [fatto, setFatto] = useState<'riposo' | 'copiato' | 'errore'>('riposo')
  const bottone = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function copia() {
    void copiaNegliAppunti(testo, bottone.current).then((ok) => {
      setFatto(ok ? 'copiato' : 'errore')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setFatto('riposo'), 1500)
    })
  }
  const parola = fatto === 'copiato' ? 'Copiato' : fatto === 'errore' ? 'Copia non riuscita' : 'Copia'
  return (
    <Button
      ref={bottone}
      type="button"
      variant="outline"
      className="h-11 min-w-11 shrink-0 gap-1.5 px-3"
      onClick={copia}
      aria-label={fatto === 'riposo' ? `Copia ${nome}` : `${parola}: ${nome}`}
      data-esito={fatto}
    >
      {fatto === 'copiato' ? <Check className="size-4 text-status-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {parola}
    </Button>
  )
}

function Criterio({ c }: { c: CriterioValutato }) {
  return (
    <li className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm" data-testid="punteggio-criterio" data-criterio={c.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{c.nome}</span>
        <span className="num text-muted-foreground">
          {c.voto}/10 · peso {c.peso} · {numero(c.punteggio)} punti
        </span>
      </div>
      {c.tetto ? <p className="text-muted-foreground">Claude ha dato {c.voto_modello}: {c.tetto}.</p> : null}
      {c.citazione ? (
        <p className="break-words">«{c.citazione}»</p>
      ) : c.citazione_trovata ? null : (
        <p className="text-muted-foreground" data-testid="citazione-non-trovata">
          Citazione non trovata
        </p>
      )}
      {c.motivazione ? <p className="break-words">{c.motivazione}</p> : null}
      {c.correzione ? <p className="break-words text-muted-foreground">Correzione: {c.correzione}</p> : null}
    </li>
  )
}

function Rifacimento({
  p,
  analisiId,
  nato,
  puoScrivere,
  onFatto,
}: {
  p: PunteggioContenuto
  analisiId: string
  nato: PunteggioLetto['rifacimento_nel_calendario']
  puoScrivere: boolean
  onFatto: () => void
}) {
  const opzioniToast = useOpzioniToast()
  const [inVolo, setInVolo] = useState(false)
  const [aggiunto, setAggiunto] = useState<{ id: string; nome: string } | null>(null)
  const r = p.rifacimento
  const fatto = aggiunto ? { id: aggiunto.id } : nato ? { id: nato.contenuto_id } : null

  async function aggiungi() {
    if (inVolo) return
    setInVolo(true)
    try {
      const esito = await aggiungiRifacimentoAlCalendario({ analisi_id: analisiId })
      if (!esito.ok) {
        toast.error(esito.errore, opzioniToast)
        return
      }
      setAggiunto({ id: esito.id, nome: esito.nome })
      toast.success(`«${esito.nome}» è nel calendario, da girare.`, opzioniToast)
      onFatto()
    } catch {
      toast.error(CONNESSIONE, opzioniToast)
    } finally {
      setInVolo(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="punteggio-rifacimento">
      {r.istruzioni.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Cosa cambiare, in ordine di impatto</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {r.istruzioni.map((x, i) => (
              <li key={i} className="break-words">
                {x}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {r.hook_alternativi.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Tre hook alternativi</p>
          <ul className="space-y-2">
            {r.hook_alternativi.map((h, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm" data-testid="punteggio-hook">
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{h.testo}</span>
                  <span className="block text-muted-foreground">
                    {h.categoria}
                    {h.perche_funziona ? `. ${h.perche_funziona}` : ''}
                  </span>
                </span>
                <Copia testo={h.testo} nome={`l’hook: ${h.testo}`} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.script_riscritto ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Script riscritto</p>
            <Copia testo={r.script_riscritto} nome="lo script riscritto" />
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-line" data-testid="punteggio-script">
            {r.script_riscritto}
          </p>
        </div>
      ) : null}
      {r.caption_riscritta ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Caption</p>
            <Copia testo={r.caption_riscritta} nome="la caption riscritta" />
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-line">{r.caption_riscritta}</p>
        </div>
      ) : null}
      <p className="num text-sm text-muted-foreground" data-testid="punteggio-atteso">
        Punteggio atteso dopo il rifacimento: {r.punteggio_atteso} su 100.
      </p>
      {fatto ? (
        <Link href={`/marketing/contenuti/${fatto.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4">
          <CircleCheck className="size-4 text-status-ok" aria-hidden="true" />
          Già nel calendario
        </Link>
      ) : puoScrivere && r.script_riscritto ? (
        <Button
          type="button"
          variant="outline"
          className="h-11"
          focusableWhenDisabled
          disabled={inVolo}
          aria-busy={inVolo}
          onClick={() => void aggiungi()}
          data-testid="aggiungi-rifacimento"
        >
          {inVolo ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="size-4" aria-hidden="true" />}
          Aggiungi al calendario
          <span className="sr-only">: il rifacimento di questo reel</span>
        </Button>
      ) : null}
    </div>
  )
}

/**
 * «Punteggio» at the top of the reel sheet (1.39.0, Dany's guide of 16/10/2026):
 * the total and its band with the action the guide gives for it, what the
 * score was made as, the criteria (vote, weight, passage, reason, correction),
 * the penalties with their line, strengths and priorities, and «Come rifarlo».
 * Every number was computed by the app from Claude's votes; here they are only
 * said. A reel never scored says «Non valutato» and what to do. A carousel has
 * no score: the guide has no table for it.
 */
export function SezionePunteggio({
  punteggio,
  analisi,
  caricato,
  inLavoro,
  puoAnalizzare,
  puoScrivere,
  onFatto,
}: {
  punteggio: PunteggioLetto | null
  /** the latest ready analysis (it may have no score) */
  analisi: AnalisiLetta | null
  caricato: boolean
  inLavoro: boolean
  puoAnalizzare: boolean
  puoScrivere: boolean
  onFatto: () => void
}) {
  if (!caricato && !punteggio) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        Carico il punteggio…
      </p>
    )
  }
  if (!punteggio) {
    const nonRiuscito = analisi?.fonti?.punteggio === 'non_riuscito'
    return (
      <div className="space-y-2" data-testid="punteggio-vuoto">
        <BadgePunteggio totale={null} fascia={null} />
        {inLavoro ? (
          <p className="text-sm text-muted-foreground">Claude sta preparando l’analisi e il punteggio: arrivano insieme.</p>
        ) : nonRiuscito ? (
          <p className="flex items-start gap-2 text-sm text-status-warning" role="status" data-testid="punteggio-non-riuscito">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Il punteggio dell’ultima analisi non è riuscito. L’analisi c’è; per il punteggio premi «Dai il punteggio».
          </p>
        ) : analisi ? (
          <p className="text-sm text-muted-foreground">
            Questo reel è stato analizzato prima del punteggio.
            {puoAnalizzare ? ' Premi «Dai il punteggio»: rifà anche l’analisi.' : ' Il punteggio lo dà Claude quando l’admin o il marketing analizzano il reel.'}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {puoAnalizzare
              ? 'Il punteggio lo dà Claude con la guida di Dany, insieme all’analisi: parte solo da «Analizza».'
              : 'Il punteggio lo dà Claude quando l’admin o il marketing analizzano il reel.'}
          </p>
        )}
      </div>
    )
  }

  const p = punteggio.punteggio
  const fascia = fasciaDaCodice(p.fascia)
  return (
    <div className="space-y-4" data-testid="punteggio-pronto">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="num text-3xl font-semibold" data-testid="punteggio-totale">
            {p.totale}
          </span>
          <span className="num text-sm text-muted-foreground">su 100</span>
        </p>
        <BadgePunteggio totale={p.totale} fascia={p.fascia} senzaNumero className="text-base" />
        {fascia ? <p className="text-sm break-words">{fascia.azione}</p> : null}
        <p className="num text-sm text-muted-foreground">
          Valutato come {ETICHETTA_TIPO[p.tipo]}, {p.tipo_origine === 'dichiarato' ? 'dal Reel Type del calendario' : 'dedotto da Claude'}
          {p.motivo_classificazione ? `: ${p.motivo_classificazione}` : ''}
          {punteggio.finita_il ? ` · fatto il ${new Date(punteggio.finita_il).toLocaleDateString('it-IT')}` : ''}
          {punteggio.eta_ore !== null ? `, a ${Math.round(punteggio.eta_ore / 24)} giorni dalla pubblicazione` : ''}
        </p>
        <p className="num text-sm text-muted-foreground">
          Somma dei criteri {numero(p.totale_grezzo)}
          {p.penalita_totali !== 0 ? `, penalità ${p.penalita_totali}` : ''}
          {p.limiti_applicati.length > 0 ? `. ${p.limiti_applicati.join('. ')}` : ''}.
        </p>
      </div>

      {p.segnalazioni.length > 0 ? (
        <ul className="space-y-1 text-sm" data-testid="punteggio-segnalazioni">
          {p.segnalazioni.map((s, i) => (
            <li key={i} className="flex items-start gap-2 break-words">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      ) : null}

      {p.penalita.length > 0 || p.altre_violazioni_formali.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Penalità</p>
          <ul className="space-y-1.5 text-sm" data-testid="punteggio-penalita">
            {p.penalita.map((x) => (
              <li key={x.flag} className="break-words">
                <span className="num font-medium">{x.valore}</span> {x.descrizione}
                {x.riga ? <span className="text-muted-foreground"> · «{x.riga}»</span> : null}
              </li>
            ))}
            {p.altre_violazioni_formali.map((x, i) => (
              <li key={`f${i}`} className="break-words">
                Conformità formale: {x.descrizione}
                {x.riga ? <span className="text-muted-foreground"> · «{x.riga}»</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.problemi_prioritari.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Da sistemare per primo</p>
          <ol className="space-y-1 text-sm" data-testid="punteggio-problemi">
            {p.problemi_prioritari.map((x) => (
              <li key={x.criterio} className="break-words">
                <span className="num text-muted-foreground">{x.ordine}.</span> {x.nome}: {x.problema}{' '}
                <span className="num text-muted-foreground">(fino a {numero(x.impatto_punti)} punti)</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {p.punti_di_forza.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Punti di forza</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {p.punti_di_forza.map((x, i) => (
              <li key={i} className="break-words">
                {x}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-lg border border-border p-3" data-testid="punteggio-criteri">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Tutti i criteri ({p.criteri.length})</summary>
        <ul className="space-y-2 pt-2">
          {p.criteri.map((c) => (
            <Criterio key={c.id} c={c} />
          ))}
        </ul>
        <p className="pt-2 text-sm text-muted-foreground">
          Hook: «{p.hook.testo}» ({p.hook.parole} parole).
          {p.confronto_benchmark ? ` ${p.confronto_benchmark}` : ''}
        </p>
      </details>

      <details className="rounded-lg border border-border p-3" data-testid="punteggio-come-rifarlo">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Come rifarlo</summary>
        <div className="pt-2">
          <Rifacimento p={p} analisiId={punteggio.analisi_id} nato={punteggio.rifacimento_nel_calendario} puoScrivere={puoScrivere} onFatto={onFatto} />
        </div>
      </details>
    </div>
  )
}
