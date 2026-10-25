'use client'

import { CircleAlert, CircleCheck, CircleHelp, CircleX, Sparkles, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { annullaMotivoProposto, usaMotivoProposto } from '@/app/(app)/calls/actions'
import { rivalidaTutto } from '@/app/actions/rivalida'
import { Button } from '@/components/ui/button'
import { useLingua } from '@/components/i18n/lingua-provider'
import { CALL } from '@/lib/i18n/testi/call'
import { ANALISI_TESTI, ANALISI_TOAST, CATEGORIE_CALL } from '@/lib/i18n/testi/analisi-call'
import { CLOSER } from '@/lib/i18n/testi/closer'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { etichetta } from '@/lib/call/analisi/icp-call'
import { conMinuto, secondiDiMinuto, type AnalisiVista } from '@/lib/call/analisi/vista'
import { formato } from '@/lib/format'
import { formatOra } from '@/lib/date'

/**
 * Claude's analysis of a call on its card (1.37.0, CLAUDE.md section 31), for the admin and the
 * call's closer. The reason proposed for not closing sits apart and is a tap away from the
 * call's reason (never written by itself); the rest folds in a <details>. The suggestions for the
 * setter's DMs and the valuation of how the call was led are not here: they are the setter's and
 * the closer's alone (performance-call.tsx).
 */
type Props = {
  callId: string
  analisi: AnalisiVista | null
  /** The call has a Fathom recording the app can analyse: otherwise there is nothing to ask. */
  analizzabile: boolean
  esito: string | null
  motivoSalvato: string | null
  link: string | null
}

function Elenco({ titolo, voci }: { titolo: string; voci: string[] }) {
  if (voci.length === 0) return null
  return (
    <div>
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</h4>
      <ul lang="it" className="mt-1 list-disc space-y-0.5 pl-5">
        {voci.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    </div>
  )
}

export function AnalisiCall({ callId, analisi, analizzabile, esito, motivoSalvato, link }: Props) {
  const lingua = useLingua()
  // the frame follows the page's language; what Claude wrote stays in Italian (1.53.0)
  const t = CALL[lingua].analisi
  const categorie = CLOSER[lingua].registrate.categorie as Record<string, string>
  const ANALISI = ANALISI_TESTI[lingua]
  const toastT = ANALISI_TOAST[lingua]
  const { PAIN, DESIDERI, GIA_PROVATO, MOMENTI, CATEGORIE_OBIEZIONI } = CATEGORIE_CALL[lingua]
  const [inCorso, avvia] = useTransition()
  const [motivo, setMotivo] = useState<string | null>(motivoSalvato)

  function chiedi() {
    avvia(async () => {
      try {
        const r = await fetch(`/api/call/${callId}/analizza`, { method: 'POST', cache: 'no-store' })
        const corpo = (await r.json().catch(() => ({}))) as { errore?: string }
        if (!r.ok) return void toast.error(corpo.errore ? traduciErrore(corpo.errore, lingua) : toastT.nonPartita)
        toast.success(toastT.partita)
        await rivalidaTutto()
      } catch {
        toast.error(traduciErrore('Connessione assente. Riprova.', lingua))
      }
    })
  }

  function usa() {
    const proposto = analisi?.motivo_proposto
    if (!proposto) return
    avvia(async () => {
      const r = await usaMotivoProposto({ call_id: callId, motivo_mostrato: motivo }).catch(() => null)
      if (!r) return void toast.error(traduciErrore('Connessione assente. Riprova.', lingua))
      if (!r.ok) return void toast.error(traduciErrore(r.errore, lingua))
      setMotivo(proposto)
      toast.success(ANALISI.motivoAggiornato, {
        action: {
          label: toastT.annulla,
          onClick: () => {
            void annullaMotivoProposto({ call_id: callId, motivo_attuale: proposto, precedente: r.precedente }).then((a) => {
              if (a.ok) setMotivo(r.precedente)
              else toast.error(traduciErrore(a.errore, lingua))
            })
          },
        },
      })
    })
  }

  if (!analisi) {
    if (!analizzabile) return null
    return (
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pl-[4.25rem]" data-testid="analisi-assente">
        <p className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          {t.nessuna}
        </p>
        <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiedi}>
          {ANALISI.analizza}
        </Button>
      </div>
    )
  }

  if (analisi.stato === 'in_coda' || analisi.stato === 'in_corso') {
    return (
      <p className="mt-1 flex min-h-11 items-center gap-1.5 pl-[4.25rem] text-sm text-muted-foreground" data-testid="analisi-in-coda" role="status">
        <Sparkles className="size-4 shrink-0" aria-hidden="true" />
        {analisi.stato === 'in_corso' ? t.inCorso : t.inCoda}
      </p>
    )
  }

  if (analisi.stato !== 'pronta') {
    return (
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pl-[4.25rem]" data-testid="analisi-fallita">
        <p role="alert" className="flex items-start gap-1.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          {analisi.errore ? traduciErrore(analisi.errore, lingua) : t.nessuna}
        </p>
        {analizzabile ? (
          <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiedi}>
            {ANALISI.analizzaDiNuovo}
          </Button>
        ) : null}
      </div>
    )
  }

  const lead = analisi.lead
  const quando = analisi.analizzata_il
    ? CALL[lingua].alle(formato(lingua).formatData(analisi.analizzata_il), formatOra(analisi.analizzata_il))
    : ''
  const esitoDiverso = analisi.esito_letto && analisi.esito_letto !== 'non_chiaro' && esito && analisi.esito_letto !== esito
  const propone = (esito === 'follow_up' || esito === 'persa') && analisi.motivo_proposto && analisi.motivo_proposto !== motivo
  const Target = analisi.in_target === 'si' ? CircleCheck : analisi.in_target === 'no' ? CircleX : CircleHelp
  const targetEtichetta = analisi.in_target === 'si' ? t.inTarget : analisi.in_target === 'no' ? t.nonInTarget : t.daVerificare

  return (
    <div className="mt-1 space-y-2 pl-[4.25rem]" data-testid="analisi-call">
      {propone ? (
        <div className="rounded-lg border border-border p-3" data-testid="motivo-proposto">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ANALISI.motivoProposto}</h4>
          <p lang="it" className="mt-1 text-sm break-words">{analisi.motivo_proposto}</p>
          <Button type="button" variant="outline" className="mt-2 h-11" disabled={inCorso} onClick={usa}>
            {ANALISI.usaMotivo}
          </Button>
        </div>
      ) : null}
      {esitoDiverso ? (
        <p className="flex items-start gap-1.5 text-sm text-status-warning" data-testid="esito-diverso">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.esitoDiverso((t.esiti as Record<string, string>)[analisi.esito_letto!] ?? analisi.esito_letto!)}
        </p>
      ) : null}

      <details className="group rounded-lg border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t.titolo}
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            · <Target className="size-3.5" aria-hidden="true" /> {targetEtichetta}
          </span>
        </summary>
        <div className="space-y-3 px-3 pb-3 text-sm">
          {lingua === 'en' ? <p className="text-xs text-muted-foreground">{t.inItaliano}</p> : null}
          {analisi.riassunto ? (
            <p lang="it" className="break-words">
              {analisi.riassunto}
            </p>
          ) : null}

          {lead ? (
            <section className="space-y-2">
              <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.il}</h4>
              {lead.segnali && lead.segnali.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  {lead.segnali.map((s, i) => (
                    <li key={i}>
                      <span lang="it">{s.testo}</span>{' '}
                      <span className="text-muted-foreground">({s.verso === 'in_target' ? t.versoIn : t.versoNo})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {lead.punto_a || lead.punto_b ? (
                <p>
                  <span className="text-muted-foreground">{t.da}</span> <span lang="it">{lead.punto_a}</span>{' '}
                  <span className="text-muted-foreground">{t.a}</span> <span lang="it">{lead.punto_b}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {[...(lead.pain ?? []).map((x) => etichetta(PAIN, x)), ...(lead.desideri ?? []).map((x) => etichetta(DESIDERI, x)), ...(lead.gia_provato ?? []).map((x) => t.giaProvato(etichetta(GIA_PROVATO, x)))].map((c) => (
                  <span key={c} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {c}
                  </span>
                ))}
              </div>
              {lead.frasi && lead.frasi.length > 0 ? (
                <ul lang="it" className="space-y-0.5 text-muted-foreground italic">
                  {lead.frasi.map((f, i) => (
                    <li key={i}>«{f}»</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {analisi.obiezioni && analisi.obiezioni.length > 0 ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.obiezioni}</h4>
              <ul className="mt-1 space-y-2">
                {analisi.obiezioni.map((o, i) => (
                  <li key={i}>
                    <span className="font-medium">{categorie[o.categoria] ?? etichetta(CATEGORIE_OBIEZIONI, o.categoria)}</span>
                    {o.sintesi ? <span lang="it">: {o.sintesi}</span> : null}{' '}
                    {o.gestita ? <span className="text-muted-foreground">({t.gestita[o.gestita]})</span> : null}
                    {o.risposta ? <span className="block text-muted-foreground">{t.funzionato(o.risposta)}</span> : null}
                    {o.minuto && link ? (
                      <a
                        href={conMinuto(link, secondiDiMinuto(o.minuto))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="num inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4"
                      >
                        {t.alMinuto(o.minuto)}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Elenco titolo={t.domande} voci={analisi.domande ?? []} />
          <Elenco titolo={t.convintoDa} voci={analisi.convinto_da ?? []} />
          <Elenco titolo={t.prossimiPassi} voci={(analisi.prossimi_passi ?? []).map((p) => `${p.cosa}${p.quando ? ` (${p.quando})` : ''}`)} />

          {analisi.momenti && analisi.momenti.length > 0 && link ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.daRiascoltare}</h4>
              <ul className="mt-1 flex flex-wrap gap-2">
                {analisi.momenti.map((m, i) => (
                  <li key={i}>
                    <a
                      href={conMinuto(link, secondiDiMinuto(m.minuto))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="num inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs"
                    >
                      {m.minuto} · {etichetta(MOMENTI, m.etichetta)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span>{t.analizzata(quando)}</span>
            {analizzabile ? (
              <Button type="button" variant="ghost" className="h-11" disabled={inCorso} onClick={chiedi}>
                {ANALISI.analizzaDiNuovo}
              </Button>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  )
}
