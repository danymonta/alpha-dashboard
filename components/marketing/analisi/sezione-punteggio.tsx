'use client'

import { CalendarPlus, Check, CircleCheck, Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { aggiungiRifacimentoAlCalendario } from '@/app/(app)/marketing/analisi/actions'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { Button } from '@/components/ui/button'
import { copiaNegliAppunti } from '@/lib/appunti'
import type { PunteggioLetto } from '@/lib/marketing/analisi/dettaglio'
import type { CriterioValutato, PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'
import { cn } from '@/lib/utils'

const CONNESSIONE = 'Connessione assente. Riprova.'

export const numero = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })

/** «Copia» next to a text of the redo: the clipboard is written from the tap itself (lib/appunti.ts). */
export function Copia({ testo, nome }: { testo: string; nome: string }) {
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

/**
 * «Aggiungi il rifacimento al calendario»: the one action of the top block for the bands that ask to redo the reel
 * (and, for the touch-ups, at the end of «Come rifarlo»). It creates a Reel Topic Not started with the rewritten script,
 * once: after that, «Già nel calendario». The content born from the rewrite is read from the database, so a
 * reload says the same.
 */
export function AggiungiRifacimento({
  analisiId,
  nato,
  onFatto,
  className,
}: {
  analisiId: string
  nato: PunteggioLetto['rifacimento_nel_calendario']
  onFatto: () => void
  className?: string
}) {
  const opzioniToast = useOpzioniToast()
  const [inVolo, setInVolo] = useState(false)
  const [aggiunto, setAggiunto] = useState<{ id: string; nome: string } | null>(null)
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

  if (fatto) {
    return (
      <Link
        href={`/marketing/contenuti/${fatto.id}`}
        className={cn('inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4', className)}
        data-testid="rifacimento-nel-calendario"
      >
        <CircleCheck className="size-4 text-status-ok" aria-hidden="true" />
        Già nel calendario: apri il contenuto
      </Link>
    )
  }
  return (
    <Button
      type="button"
      className={cn('h-11 w-full sm:w-auto', className)}
      focusableWhenDisabled
      disabled={inVolo}
      aria-busy={inVolo}
      onClick={() => void aggiungi()}
      data-testid="aggiungi-rifacimento"
    >
      {inVolo ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="size-4" aria-hidden="true" />}
      Aggiungi il rifacimento al calendario
    </Button>
  )
}

/** The first three things to fix, from the score's own priorities: the «what» (the «how» is in «Come rifarlo»). */
export function ProblemiDaSistemare({ p }: { p: PunteggioContenuto }) {
  const primi = p.problemi_prioritari.slice(0, 3)
  if (primi.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Da sistemare per primo</p>
      <ol className="space-y-1 text-sm" data-testid="punteggio-problemi">
        {primi.map((x) => (
          <li key={x.criterio} className="flex gap-2 break-words">
            <span className="num w-4 shrink-0 text-muted-foreground">{x.ordine}.</span>
            <span className="min-w-0">
              {x.nome}: {x.problema} <span className="num text-muted-foreground">(fino a {numero(x.impatto_punti)} punti)</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * «Come rifarlo» (the first tab): what to change in order of impact, three other hooks and the rewritten script and
 * caption, each with its «Copia», and the score the rewrite should reach. Where the top block does not already offer
 * it (the touch-ups, a good reel), the button to put the rewrite in the calendar closes the tab.
 */
export function ComeRifarlo({
  p,
  analisiId,
  nato,
  conAggiungi,
  onFatto,
}: {
  p: PunteggioContenuto
  analisiId: string
  nato: PunteggioLetto['rifacimento_nel_calendario']
  conAggiungi: boolean
  onFatto: () => void
}) {
  const r = p.rifacimento
  return (
    <div className="space-y-5" data-testid="punteggio-rifacimento">
      {r.istruzioni.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">Cosa cambiare, in ordine di impatto</h4>
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
          <h4 className="text-sm font-medium">Tre hook alternativi</h4>
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
            <h4 className="text-sm font-medium">Script riscritto</h4>
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
            <h4 className="text-sm font-medium">Caption</h4>
            <Copia testo={r.caption_riscritta} nome="la caption riscritta" />
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-line">{r.caption_riscritta}</p>
        </div>
      ) : null}
      <p className="num text-sm text-muted-foreground" data-testid="punteggio-atteso">
        Punteggio atteso dopo il rifacimento: {r.punteggio_atteso} su 100.
      </p>
      {conAggiungi && r.script_riscritto ? <AggiungiRifacimento analisiId={analisiId} nato={nato} onFatto={onFatto} /> : null}
    </div>
  )
}

function Criterio({ c }: { c: CriterioValutato }) {
  const debole = c.voto < 7
  return (
    <li data-testid="punteggio-criterio" data-criterio={c.id}>
      <details open={debole} className="rounded-lg bg-muted/40 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            {debole ? <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-label="Sotto 7" role="img" /> : null}
            <span className="min-w-0 wrap-break-word">{c.nome}</span>
          </span>
          <span className="num shrink-0">{c.voto}/10</span>
        </summary>
        <div className="space-y-1 px-3 pb-3">
          <p className="num text-muted-foreground">
            Peso {c.peso} · {numero(c.punteggio)} punti
          </p>
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
        </div>
      </details>
    </li>
  )
}

/** The criteria, the weakest first, those under 7 already open: what is worth reading is the first thing there. */
export function CriteriDelPunteggio({ p }: { p: PunteggioContenuto }) {
  const ordinati = [...p.criteri].sort((a, b) => a.voto - b.voto)
  return (
    <div className="space-y-2" data-testid="punteggio-criteri">
      <h4 className="text-sm font-medium">I criteri ({p.criteri.length}), dal più basso</h4>
      <ul className="space-y-2">
        {ordinati.map((c) => (
          <Criterio key={c.id} c={c} />
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Hook: «{p.hook.testo}» ({p.hook.parole} parole).
        {p.confronto_benchmark ? ` ${p.confronto_benchmark}` : ''}
      </p>
    </div>
  )
}

/** The penalties with the line that caused each, and what the checks had to say about the score. */
export function PenalitaDelPunteggio({ p }: { p: PunteggioContenuto }) {
  return (
    <>
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
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">Penalità</h4>
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
    </>
  )
}
