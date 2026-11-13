'use client'

import { CalendarPlus, ClipboardCopy, ExternalLink, NotebookPen, Pencil, PlayCircle, Trash2, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { eliminaCheckup, salvaCheckup } from '@/app/(app)/progetti/[id]/percorso/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { MarkdownCliente } from '@/components/percorso/markdown-cliente'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { CAMPO_TEAM, traduciErroreCampo } from '@/lib/i18n/testi/campo-base'
import {
  SCALETTA_APPUNTI,
  compitiDaTesto,
  resocontoIniziale,
  testoTelegram,
  type CheckupCliente,
} from '@/lib/percorso/campo-base'
import { checkupSchema } from '@/lib/validation/checkup'

type Bozza = {
  id: string | null
  giorno: string
  fathom: string
  argomento: string
  appunti: string
  resoconto: string
  compiti: string
  callId: string | null
}

/**
 * The check-up calls of a client in his project (1.83.0): the history, the most recent first, with
 * the notes of the team; «Aggiungi call» and «Modifica» open the form of Dany's monthly check-up
 * (topic, notes, the recap already started, the tasks), «Copia il resoconto per Telegram». The
 * database decides who writes (the admin and the client's team).
 */
export function CheckupTeam({
  progettoId,
  clientId,
  nome,
  checkup,
  checkpointSenzaResoconto,
}: {
  progettoId: string
  clientId: string
  nome: string
  checkup: readonly CheckupCliente[]
  checkpointSenzaResoconto: readonly { id: string; giorno: string; ora: string }[]
}) {
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua]
  const { formatData } = formato(lingua)
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const [daEliminare, setDaEliminare] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function nuova(callId: string | null = null, giorno?: string) {
    setBozza({
      id: null,
      giorno: giorno ?? oggiRoma(),
      fathom: '',
      argomento: '',
      appunti: SCALETTA_APPUNTI,
      resoconto: resocontoIniziale(nome),
      compiti: '',
      callId,
    })
  }

  function modifica(k: CheckupCliente) {
    setBozza({
      id: k.id,
      giorno: k.giorno,
      fathom: k.fathomUrl ?? '',
      argomento: k.argomento ?? '',
      appunti: k.appunti ?? '',
      resoconto: k.resoconto ?? '',
      compiti: k.compiti.join('\n'),
      callId: k.callId ?? null,
    })
  }

  function elimina(id: string) {
    if (daEliminare !== id) {
      setDaEliminare(id)
      return
    }
    setDaEliminare(null)
    avvia(async () => {
      try {
        const esito = await eliminaCheckup(progettoId, { id })
        if (!esito.ok) toast.error(traduciErroreCampo(esito.errore, lingua))
        else toast.success(t.eliminata)
      } catch {
        toast.error(t.connessione)
      }
    })
  }

  return (
    <section aria-labelledby="titolo-checkup" className="space-y-4 rounded-2xl bg-card p-4" data-testid="checkup-team">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="titolo-checkup" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <NotebookPen className="size-5 text-muted-foreground" aria-hidden="true" />
            {t.call}
          </h2>
          <p className="text-sm text-muted-foreground">{t.callDescrizione}</p>
        </div>
        <Button type="button" className="h-11 gap-2" onClick={() => nuova()} data-testid="aggiungi-checkup">
          <CalendarPlus className="size-4" aria-hidden="true" />
          {t.aggiungi}
        </Button>
      </div>

      {checkpointSenzaResoconto.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-status-warning/40 bg-status-warning/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-status-warning" aria-hidden="true" />
            {t.checkpointSenza}
          </p>
          <ul className="flex flex-wrap gap-2">
            {checkpointSenzaResoconto.map((c) => (
              <li key={c.id}>
                <Button type="button" variant="outline" className="h-11" onClick={() => nuova(c.id, c.giorno)}>
                  {t.aggiungiResoconto(formatData(c.giorno))}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {checkup.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground" data-testid="checkup-team-vuoto">
          {t.callVuote}
        </p>
      ) : (
        <ol className="space-y-3">
          {checkup.map((k) => (
            <li key={k.id} className="space-y-3 rounded-xl border border-border p-4" data-testid="checkup-team-voce">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="num text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {formatData(k.giorno)}
                    {k.coach ? ` · ${t.tenutaDa(k.coach)}` : ''}
                    {k.importato ? ` · ${t.importata}` : ''}
                  </p>
                  <h3 className="font-medium break-words">{k.argomento ?? '–'}</h3>
                </div>
                <div className="flex flex-wrap gap-1">
                  {k.fathomUrl ? (
                    <a
                      href={k.fathomUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-accent"
                    >
                      <PlayCircle className="size-4" aria-hidden="true" />
                      {t.rivedi}
                      <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </a>
                  ) : null}
                  <Button type="button" variant="ghost" className="h-11 gap-1.5" onClick={() => modifica(k)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    {t.modifica}
                  </Button>
                  <Button
                    type="button"
                    variant={daEliminare === k.id ? 'destructive' : 'ghost'}
                    className="h-11 gap-1.5"
                    disabled={inCorso}
                    onClick={() => elimina(k.id)}
                    onBlur={() => setDaEliminare(null)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {daEliminare === k.id ? t.eliminaConferma : t.elimina}
                  </Button>
                </div>
              </div>
              {daEliminare === k.id ? <p className="text-sm text-muted-foreground">{t.eliminaDomanda}</p> : null}
              <div lang="it" className="space-y-3">
                {k.resoconto ? <MarkdownCliente testo={k.resoconto} className="text-sm" /> : null}
                {k.compiti.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t.compiti}</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm">
                      {k.compiti.map((c, i) => (
                        <li key={i} className="break-words">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {k.appunti ? (
                  <details className="rounded-lg bg-muted/40 p-3 text-sm">
                    <summary className="min-h-11 cursor-pointer content-center font-medium">{t.appuntiTeam}</summary>
                    <p className="pt-2 whitespace-pre-wrap break-words">{k.appunti}</p>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {bozza ? (
        <FoglioCheckup
          bozza={bozza}
          progettoId={progettoId}
          clientId={clientId}
          onChiudi={() => setBozza(null)}
        />
      ) : null}
    </section>
  )
}

function FoglioCheckup({
  bozza,
  progettoId,
  clientId,
  onChiudi,
}: {
  bozza: Bozza
  progettoId: string
  clientId: string
  onChiudi: () => void
}) {
  const id = useId()
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua]
  const [v, setV] = useState<Bozza>(bozza)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  const campo = (k: keyof Bozza) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }))

  function input() {
    return {
      client_id: clientId,
      id: v.id,
      giorno: v.giorno,
      fathom_url: v.fathom.trim(),
      argomento: v.argomento.trim(),
      resoconto: v.resoconto,
      appunti: v.appunti.trim() === SCALETTA_APPUNTI.trim() ? '' : v.appunti,
      compiti: compitiDaTesto(v.compiti),
      call_id: v.callId,
    }
  }

  async function copia() {
    try {
      await navigator.clipboard.writeText(testoTelegram({ resoconto: v.resoconto, compiti: compitiDaTesto(v.compiti) }))
      toast.success(t.copiato)
    } catch {
      toast.error(t.connessione)
    }
  }

  function salva(e: React.FormEvent) {
    e.preventDefault()
    setErrore(null)
    const parsed = checkupSchema.safeParse(input())
    if (!parsed.success) {
      setErrore(traduciErroreCampo(parsed.error.issues[0]?.message ?? '', lingua))
      return
    }
    avvia(async () => {
      try {
        const esito = await salvaCheckup(progettoId, parsed.data)
        if (!esito.ok) {
          setErrore(traduciErroreCampo(esito.errore, lingua))
          return
        }
        toast.success(t.salvata)
        onChiudi()
      } catch {
        setErrore(t.connessione)
      }
    })
  }

  return (
    <Sheet open onOpenChange={(aperto) => (!aperto ? onChiudi() : undefined)}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{v.id ? t.foglioModifica : t.foglioNuova}</SheetTitle>
          <SheetDescription>{t.foglioDescrizione}</SheetDescription>
        </SheetHeader>
        <form onSubmit={salva} noValidate className="space-y-4 px-4 pb-6" data-testid="foglio-checkup">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-giorno`}>{t.giorno}</Label>
              <Input id={`${id}-giorno`} type="date" className="num h-11" value={v.giorno} max={oggiRoma()} onChange={campo('giorno')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-fathom`}>{t.fathom}</Label>
              <Input
                id={`${id}-fathom`}
                type="url"
                inputMode="url"
                className="h-11"
                placeholder="https://fathom.video/share/…"
                value={v.fathom}
                onChange={campo('fathom')}
                aria-describedby={`${id}-fathom-aiuto`}
              />
              <p id={`${id}-fathom-aiuto`} className="text-xs text-muted-foreground">
                {t.fathomAiuto}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-argomento`}>{t.argomento}</Label>
            <Input
              id={`${id}-argomento`}
              className="h-11"
              value={v.argomento}
              onChange={campo('argomento')}
              maxLength={200}
              aria-describedby={`${id}-argomento-aiuto`}
            />
            <p id={`${id}-argomento-aiuto`} className="text-xs text-muted-foreground">
              {t.argomentoAiuto}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-appunti`}>{t.appunti}</Label>
            <Textarea
              id={`${id}-appunti`}
              rows={9}
              value={v.appunti}
              onChange={campo('appunti')}
              aria-describedby={`${id}-appunti-aiuto`}
            />
            <p id={`${id}-appunti-aiuto`} className="text-xs text-muted-foreground">
              {t.appuntiAiuto}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-resoconto`}>{t.resoconto}</Label>
            <Textarea
              id={`${id}-resoconto`}
              rows={4}
              value={v.resoconto}
              onChange={campo('resoconto')}
              aria-describedby={`${id}-resoconto-aiuto`}
            />
            <p id={`${id}-resoconto-aiuto`} className="text-xs text-muted-foreground">
              {t.resocontoAiuto}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-compiti`}>{t.compitiCampo}</Label>
            <Textarea
              id={`${id}-compiti`}
              rows={5}
              value={v.compiti}
              onChange={campo('compiti')}
              aria-describedby={`${id}-compiti-aiuto`}
            />
            <p id={`${id}-compiti-aiuto`} className="text-xs text-muted-foreground">
              {t.compitiAiuto}
            </p>
          </div>
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="h-11 flex-1" disabled={inCorso} data-testid="salva-checkup">
              {t.salva}
            </Button>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={copia}>
              <ClipboardCopy className="size-4" aria-hidden="true" />
              {t.copia}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
