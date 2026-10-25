'use client'

import { CalendarPlus, Check, CircleCheck, Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { aggiungiRifacimentoAlCalendario } from '@/app/(app)/marketing/pubblicati/azioni-analisi'
import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { Button } from '@/components/ui/button'
import { useLingua } from '@/components/i18n/lingua-provider'
import { copiaNegliAppunti } from '@/lib/appunti'
import type { Lingua } from '@/lib/i18n/lingua'
import { ANALISI_REEL, traduciErroreReel } from '@/lib/i18n/testi/analisi-reel'
import type { PunteggioLetto } from '@/lib/marketing/analisi/dettaglio'
import type { CriterioValutato, PunteggioContenuto } from '@/lib/marketing/punteggio/tipi'
import { cn } from '@/lib/utils'

export const numero = (n: number, lingua: Lingua = 'it') => n.toLocaleString(lingua === 'en' ? 'en-IE' : 'it-IT', { maximumFractionDigits: 1 })

/** «Copia» next to a text of the redo: the clipboard is written from the tap itself (lib/appunti.ts). */
export function Copia({ testo, nome }: { testo: string; nome: string }) {
  const t = ANALISI_REEL[useLingua()].punteggio
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
  const parola = fatto === 'copiato' ? t.copiato : fatto === 'errore' ? t.copiaFallita : t.copia
  return (
    <Button
      ref={bottone}
      type="button"
      variant="outline"
      className="h-11 min-w-11 shrink-0 gap-1.5 px-3"
      onClick={copia}
      aria-label={fatto === 'riposo' ? t.copiaDi(nome) : t.esito(parola, nome)}
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
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].punteggio
  const [inVolo, setInVolo] = useState(false)
  const [aggiunto, setAggiunto] = useState<{ id: string; nome: string } | null>(null)
  const fatto = aggiunto ? { id: aggiunto.id } : nato ? { id: nato.contenuto_id } : null

  async function aggiungi() {
    if (inVolo) return
    setInVolo(true)
    try {
      const esito = await aggiungiRifacimentoAlCalendario({ analisi_id: analisiId })
      if (!esito.ok) {
        toast.error(traduciErroreReel(esito.errore, lingua), opzioniToast)
        return
      }
      setAggiunto({ id: esito.id, nome: esito.nome })
      toast.success(t.nelCalendario(esito.nome), opzioniToast)
      onFatto()
    } catch {
      toast.error(t.connessione, opzioniToast)
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
        {t.giaNel}
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
      {t.aggiungi}
    </Button>
  )
}

/** The first three things to fix, from the score's own priorities: the «what» (the «how» is in «Come rifarlo»). */
export function ProblemiDaSistemare({ p }: { p: PunteggioContenuto }) {
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].punteggio
  const primi = p.problemi_prioritari.slice(0, 3)
  if (primi.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t.perPrimo}</p>
      <ol className="space-y-1 text-sm" data-testid="punteggio-problemi">
        {primi.map((x) => (
          <li key={x.criterio} className="flex gap-2 break-words">
            <span className="num w-4 shrink-0 text-muted-foreground">{x.ordine}.</span>
            <span className="min-w-0">
              {x.nome}: <span lang="it">{x.problema}</span>{' '}
              <span className="num text-muted-foreground">{t.finoA(numero(x.impatto_punti, lingua))}</span>
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
  const t = ANALISI_REEL[useLingua()].punteggio
  return (
    <div className="space-y-5" data-testid="punteggio-rifacimento">
      {r.istruzioni.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">{t.cambiare}</h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm" lang="it">
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
          <h4 className="text-sm font-medium">{t.hook}</h4>
          <ul className="space-y-2" lang="it">
            {r.hook_alternativi.map((h, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm" data-testid="punteggio-hook">
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{h.testo}</span>
                  <span className="block text-muted-foreground">
                    {h.categoria}
                    {h.perche_funziona ? `. ${h.perche_funziona}` : ''}
                  </span>
                </span>
                <Copia testo={h.testo} nome={t.lHook(h.testo)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.script_riscritto ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">{t.script}</h4>
            <Copia testo={r.script_riscritto} nome={t.loScript} />
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-line" data-testid="punteggio-script" lang="it">
            {r.script_riscritto}
          </p>
        </div>
      ) : null}
      {r.caption_riscritta ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">{t.caption}</h4>
            <Copia testo={r.caption_riscritta} nome={t.laCaption} />
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-line" lang="it">
            {r.caption_riscritta}
          </p>
        </div>
      ) : null}
      <p className="num text-sm text-muted-foreground" data-testid="punteggio-atteso">
        {t.atteso(r.punteggio_atteso)}
      </p>
      {conAggiungi && r.script_riscritto ? <AggiungiRifacimento analisiId={analisiId} nato={nato} onFatto={onFatto} /> : null}
    </div>
  )
}

function Criterio({ c }: { c: CriterioValutato }) {
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].punteggio
  const debole = c.voto < 7
  return (
    <li data-testid="punteggio-criterio" data-criterio={c.id}>
      <details open={debole} className="rounded-lg bg-muted/40 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            {debole ? <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-label={t.sotto7} role="img" /> : null}
            <span className="min-w-0 wrap-break-word">{c.nome}</span>
          </span>
          <span className="num shrink-0">{c.voto}/10</span>
        </summary>
        <div className="space-y-1 px-3 pb-3">
          <p className="num text-muted-foreground">
            {t.peso(c.peso, numero(c.punteggio, lingua))}
          </p>
          {c.tetto ? <p className="text-muted-foreground">{t.haDato(c.voto_modello, c.tetto)}</p> : null}
          {c.citazione ? (
            <p className="break-words" lang="it">
              «{c.citazione}»
            </p>
          ) : c.citazione_trovata ? null : (
            <p className="text-muted-foreground" data-testid="citazione-non-trovata">
              {t.nonTrovata}
            </p>
          )}
          {c.motivazione ? (
            <p className="break-words" lang="it">
              {c.motivazione}
            </p>
          ) : null}
          {c.correzione ? (
            <p className="break-words text-muted-foreground">
              {t.correzione} <span lang="it">{c.correzione}</span>
            </p>
          ) : null}
        </div>
      </details>
    </li>
  )
}

/** The criteria, the weakest first, those under 7 already open: what is worth reading is the first thing there. */
export function CriteriDelPunteggio({ p }: { p: PunteggioContenuto }) {
  const ordinati = [...p.criteri].sort((a, b) => a.voto - b.voto)
  const t = ANALISI_REEL[useLingua()].punteggio
  return (
    <div className="space-y-2" data-testid="punteggio-criteri">
      <h4 className="text-sm font-medium">{t.criteri(p.criteri.length)}</h4>
      <ul className="space-y-2">
        {ordinati.map((c) => (
          <Criterio key={c.id} c={c} />
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {t.hookParole(p.hook.testo, p.hook.parole)}
        {p.confronto_benchmark ? ` ${p.confronto_benchmark}` : ''}
      </p>
    </div>
  )
}

/** The penalties with the line that caused each, and what the checks had to say about the score. */
export function PenalitaDelPunteggio({ p }: { p: PunteggioContenuto }) {
  const t = ANALISI_REEL[useLingua()].punteggio
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
          <h4 className="text-sm font-medium">{t.penalita}</h4>
          <ul className="space-y-1.5 text-sm" data-testid="punteggio-penalita">
            {p.penalita.map((x) => (
              <li key={x.flag} className="break-words">
                <span className="num font-medium">{x.valore}</span> {x.descrizione}
                {x.riga ? <span className="text-muted-foreground"> · «{x.riga}»</span> : null}
              </li>
            ))}
            {p.altre_violazioni_formali.map((x, i) => (
              <li key={`f${i}`} className="break-words">
                {t.conformita} {x.descrizione}
                {x.riga ? <span className="text-muted-foreground"> · «{x.riga}»</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
