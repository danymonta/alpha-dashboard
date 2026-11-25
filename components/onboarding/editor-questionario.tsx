'use client'

import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  FileUp,
  Info,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  cambiaAttivaDomanda,
  salvaDomanda,
  spostaDomanda,
} from '@/app/(app)/settings/onboarding/questionario/actions'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { BloccoDomanda, CampoDomanda } from '@/components/percorso/campi-questionario'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { lettera } from '@/lib/onboarding/foglio'
import { QUESTIONARIO_ADMIN, traduciErroreDomande } from '@/lib/i18n/testi/questionario-admin'
import { domandaDaRiga, type RigaDomanda } from '@/lib/percorso/questionario'
import { domandaSchema, SEZIONI, TIPI_NUOVI, type TipoNuovo } from '@/lib/validation/domande'
import { cn } from '@/lib/utils'

type Testi = (typeof QUESTIONARIO_ADMIN)['it']

/** The kind of a question in words, as the list says it. */
function tipoInParole(t: Testi, r: RigaDomanda): string {
  if (r.tipo === 'testo' && r.lungo) return t.tipi.testoLungo ?? r.tipo
  return t.tipi[r.tipo] ?? r.tipo
}

type OpzioneBozza = { valore: string | null; etichetta: string; dettaglio: string }

type Bozza = {
  chiave: string | null
  tipo: string
  testo: string
  aiuto: string
  sezione: number
  obbligatoria: boolean
  lungo: boolean
  opzioni: OpzioneBozza[]
  altro: string
  conFile: boolean
  fileEtichetta: string
  fileAiuto: string
}

function opzioniDi(r: RigaDomanda): OpzioneBozza[] {
  if (!Array.isArray(r.opzioni)) return []
  return r.opzioni.flatMap((o) => {
    if (!o || typeof o !== 'object') return []
    const x = o as Record<string, unknown>
    return typeof x.valore === 'string' && typeof x.etichetta === 'string'
      ? [{ valore: x.valore, etichetta: x.etichetta, dettaglio: typeof x.dettaglio === 'string' ? x.dettaglio : '' }]
      : []
  })
}

function bozzaDa(r: RigaDomanda | null, sezione: number, tipo: TipoNuovo): Bozza {
  if (!r) {
    return {
      chiave: null,
      tipo,
      testo: '',
      aiuto: '',
      sezione,
      obbligatoria: true,
      lungo: false,
      opzioni: tipo === 'scelta' || tipo === 'scelte' ? [{ valore: null, etichetta: '', dettaglio: '' }] : [],
      altro: '',
      conFile: tipo === 'file',
      fileEtichetta: '',
      fileAiuto: '',
    }
  }
  const allegato = r.allegato && typeof r.allegato === 'object' ? (r.allegato as Record<string, unknown>) : null
  return {
    chiave: r.chiave,
    tipo: r.tipo,
    testo: r.testo,
    aiuto: r.aiuto ?? '',
    sezione: r.sezione,
    obbligatoria: r.obbligatoria,
    lungo: Boolean(r.lungo),
    opzioni: opzioniDi(r),
    altro: r.altro ?? '',
    conFile: Boolean(allegato),
    fileEtichetta: typeof allegato?.etichetta === 'string' ? allegato.etichetta : '',
    fileAiuto: typeof allegato?.aiuto === 'string' ? allegato.aiuto : '',
  }
}

/** What the action receives, from the form. */
function inputDa(b: Bozza) {
  const conOpzioni = b.tipo === 'scelta' || b.tipo === 'scelte' || b.tipo === 'abitudini'
  return {
    chiave: b.chiave,
    tipo: b.chiave ? null : (b.tipo as TipoNuovo),
    testo: b.testo,
    aiuto: b.aiuto,
    sezione: b.sezione,
    obbligatoria: b.obbligatoria,
    lungo: b.lungo,
    opzioni: conOpzioni ? b.opzioni.map((o) => ({ valore: o.valore, etichetta: o.etichetta, dettaglio: o.dettaglio })) : null,
    altro: b.tipo === 'abitudini' ? b.altro : null,
    file: b.conFile || b.tipo === 'file' ? { etichetta: b.fileEtichetta, aiuto: b.fileAiuto } : null,
  }
}

/** The question as the client's page draws it, from the form (the preview). */
function rigaAnteprima(b: Bozza, numerica: boolean): RigaDomanda {
  return {
    chiave: b.chiave ?? 'anteprima',
    sezione: b.sezione,
    tipo: b.tipo,
    testo: b.testo.trim() || '…',
    aiuto: b.aiuto.trim() || null,
    obbligatoria: b.obbligatoria,
    lungo: b.lungo,
    numerica,
    opzioni: b.opzioni
      .filter((o) => o.etichetta.trim())
      .map((o, i) => ({ valore: o.valore ?? `nuova_${i}`, etichetta: o.etichetta.trim(), ...(o.dettaglio.trim() ? { dettaglio: o.dettaglio.trim() } : {}) })),
    altro: b.altro || null,
    allegato:
      b.conFile || b.tipo === 'file'
        ? { campo: b.chiave ?? 'anteprima', etichetta: b.fileEtichetta.trim() || '…', aiuto: b.fileAiuto }
        : null,
  }
}

function Errore({ id, testo }: { id: string; testo: string | undefined }) {
  if (!testo) return null
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-status-critical">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

/** The form of a question, with what the client sees next to it. */
function FoglioDomanda({
  riga,
  sezioneNuova,
  chiudi,
}: {
  riga: RigaDomanda | null
  sezioneNuova: number
  chiudi: () => void
}) {
  const id = useId()
  const lingua = useLingua()
  const T = QUESTIONARIO_ADMIN[lingua]
  const t = T.foglio
  const [tipoScelto, setTipoScelto] = useState<TipoNuovo | null>(null)
  const [bozza, setBozza] = useState<Bozza>(() => bozzaDa(riga, sezioneNuova, 'testo'))
  const [campi, setCampi] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const [valoreAnteprima, setValoreAnteprima] = useState<unknown>(null)

  const nuova = riga === null
  const numerica = Boolean(riga?.numerica)
  const sistema = Boolean(riga?.sistema)
  const imposta = <K extends keyof Bozza>(k: K, v: Bozza[K]) => setBozza((b) => ({ ...b, [k]: v }))
  const conOpzioni = bozza.tipo === 'scelta' || bozza.tipo === 'scelte' || bozza.tipo === 'abitudini'
  // a question of the form without files keeps none; a new one can ask for them
  const puoChiedereFile = bozza.tipo !== 'file' && (!sistema || Boolean(riga?.allegato))
  const anteprima = domandaDaRiga(rigaAnteprima(bozza, numerica))

  function scegliTipo(tipo: TipoNuovo) {
    setTipoScelto(tipo)
    setBozza((b) => ({ ...bozzaDa(null, b.sezione, tipo), testo: b.testo, aiuto: b.aiuto }))
    setValoreAnteprima(null)
  }

  function cambiaOpzione(i: number, cosa: Partial<OpzioneBozza>) {
    setBozza((b) => ({ ...b, opzioni: b.opzioni.map((o, j) => (j === i ? { ...o, ...cosa } : o)) }))
  }

  function spostaOpzione(i: number, d: -1 | 1) {
    setBozza((b) => {
      const o = [...b.opzioni]
      const j = i + d
      if (j < 0 || j >= o.length) return b
      ;[o[i], o[j]] = [o[j]!, o[i]!]
      return { ...b, opzioni: o }
    })
  }

  function salva() {
    setErrore(null)
    const input = inputDa(bozza)
    const parsed = domandaSchema.safeParse(input)
    if (!parsed.success) {
      const nuovi: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] === 'opzioni' && typeof issue.path[1] === 'number' ? `opzioni.${issue.path[1]}` : issue.path[0]
        if (typeof campo === 'string') nuovi[campo] ??= traduciErroreDomande(issue.message, lingua)
        if (issue.path[0] === 'opzioni') nuovi.opzioni ??= traduciErroreDomande(issue.message, lingua)
      }
      setCampi(nuovi)
      document.getElementById(`${id}-${Object.keys(nuovi)[0]?.split('.')[0] ?? 'testo'}`)?.focus()
      return
    }
    setCampi({})
    avvia(async () => {
      try {
        const esito = await salvaDomanda(input)
        if (!esito.ok) {
          setErrore(traduciErroreDomande(esito.errore, lingua))
          if (esito.campi) {
            setCampi(Object.fromEntries(Object.entries(esito.campi).map(([k, v]) => [k, traduciErroreDomande(v, lingua)])))
          }
          return
        }
        toast.success(nuova ? t.creata : t.salvata)
        chiudi()
      } catch {
        setErrore(T.connessione)
      }
    })
  }

  const descritto = (k: string, aiuto?: boolean) =>
    [aiuto ? `${id}-${k}-aiuto` : null, campi[k] ? `${id}-${k}-errore` : null].filter(Boolean).join(' ') || undefined

  return (
    <Sheet open onOpenChange={(v) => !v && !inCorso && chiudi()}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{nuova ? t.nuova : t.modifica}</SheetTitle>
          <SheetDescription>
            {T.parte(bozza.sezione)} · {T.sezioni[bozza.sezione]}
          </SheetDescription>
        </SheetHeader>

        {nuova && !tipoScelto ? (
          // first the kind: six big cards, each with what the client does and an example
          <fieldset className="space-y-3 px-4 pb-6" data-testid="scegli-tipo">
            <legend className="mb-3 text-base font-medium">{t.tipo}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TIPI_NUOVI.map((tipo) => {
                const [nome, spiegazione] = T.tipiNuovi[tipo] ?? [tipo, '']
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => scegliTipo(tipo)}
                    data-tipo={tipo}
                    className="flex min-h-20 flex-col items-start gap-1 rounded-xl border border-border bg-background/50 p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="font-medium">{nome}</span>
                    <span className="text-sm text-muted-foreground">{spiegazione}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ) : (
          <div className="grid gap-6 px-4 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault()
                salva()
              }}
              data-testid="foglio-domanda"
            >
              {sistema ? (
                <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t.sistema}
                </p>
              ) : null}
              {nuova ? (
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" data-testid="tipo-fisso">
                  <span>
                    {t.tipo} <span className="font-medium text-foreground">{T.tipiNuovi[bozza.tipo]?.[0] ?? bozza.tipo}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setTipoScelto(null)}
                    className="min-h-11 rounded-md px-1 font-medium underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {t.cambiaTipo}
                  </button>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="tipo-fisso">
                  {t.tipoFisso(tipoInParole(T, { ...rigaAnteprima(bozza, numerica), tipo: bozza.tipo }))}
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-testo`}>{t.testo}</Label>
                <Textarea
                  id={`${id}-testo`}
                  lang="it"
                  rows={2}
                  maxLength={500}
                  value={bozza.testo}
                  aria-invalid={campi.testo ? true : undefined}
                  aria-describedby={descritto('testo', true)}
                  onChange={(e) => imposta('testo', e.target.value)}
                />
                <p id={`${id}-testo-aiuto`} className="text-xs text-muted-foreground">
                  {t.testoAiuto}
                </p>
                <Errore id={`${id}-testo-errore`} testo={campi.testo} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-aiuto`}>{t.aiuto}</Label>
                <Textarea
                  id={`${id}-aiuto`}
                  lang="it"
                  rows={2}
                  maxLength={1000}
                  value={bozza.aiuto}
                  aria-invalid={campi.aiuto ? true : undefined}
                  aria-describedby={descritto('aiuto', true)}
                  onChange={(e) => imposta('aiuto', e.target.value)}
                />
                <p id={`${id}-aiuto-aiuto`} className="text-xs text-muted-foreground">
                  {t.aiutoAiuto}
                </p>
                <Errore id={`${id}-aiuto-errore`} testo={campi.aiuto} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-sezione`}>{t.sezione}</Label>
                <select
                  id={`${id}-sezione`}
                  className={CLASSE_SELECT}
                  value={bozza.sezione}
                  onChange={(e) => imposta('sezione', Number(e.target.value))}
                >
                  {SEZIONI.map((s) => (
                    <option key={s} value={s}>
                      {T.parte(s)} · {T.sezioni[s]}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex min-h-11 items-start justify-between gap-3 text-sm">
                <span>
                  <span className="block font-medium">{t.obbligatoria}</span>
                  <span className="block text-xs text-muted-foreground">{t.obbligatoriaAiuto}</span>
                </span>
                <Switch checked={bozza.obbligatoria} onCheckedChange={(v) => imposta('obbligatoria', v === true)} />
              </label>

              {bozza.tipo === 'testo' ? (
                <label className="flex min-h-11 items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium">{t.lungo}</span>
                    <span className="block text-xs text-muted-foreground">{t.lungoAiuto}</span>
                  </span>
                  <Switch checked={bozza.lungo} onCheckedChange={(v) => imposta('lungo', v === true)} />
                </label>
              ) : null}

              {conOpzioni ? (
                <fieldset className="space-y-2" aria-describedby={`${id}-opzioni-aiuto`}>
                  <legend id={`${id}-opzioni`} tabIndex={-1} className="text-sm font-medium outline-none">
                    {t.opzioni}
                  </legend>
                  <p id={`${id}-opzioni-aiuto`} className="text-xs text-muted-foreground">
                    {numerica ? t.opzioniFisse : t.opzioniAiuto}
                  </p>
                  <ol className="space-y-2">
                    {bozza.opzioni.map((o, i) => (
                      <li key={i} className="rounded-lg border border-border p-2" data-opzione={i}>
                        <div className="flex items-center gap-1.5">
                          <Input
                            aria-label={t.opzione(i + 1)}
                            lang="it"
                            className="h-11 flex-1"
                            maxLength={200}
                            value={o.etichetta}
                            aria-invalid={campi[`opzioni.${i}`] ? true : undefined}
                            onChange={(e) => cambiaOpzione(i, { etichetta: e.target.value })}
                          />
                          {numerica ? null : (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 shrink-0"
                                aria-label={t.opzioneSu(i + 1)}
                                disabled={i === 0}
                                onClick={() => spostaOpzione(i, -1)}
                              >
                                <ArrowUp className="size-4" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 shrink-0"
                                aria-label={t.opzioneGiu(i + 1)}
                                disabled={i === bozza.opzioni.length - 1}
                                onClick={() => spostaOpzione(i, 1)}
                              >
                                <ArrowDown className="size-4" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-11 shrink-0"
                                aria-label={t.togliOpzione(i + 1)}
                                onClick={() => setBozza((b) => ({ ...b, opzioni: b.opzioni.filter((_, j) => j !== i) }))}
                              >
                                <X className="size-4" aria-hidden="true" />
                              </Button>
                            </>
                          )}
                        </div>
                        {bozza.tipo !== 'abitudini' ? (
                          <Input
                            aria-label={`${t.nota} · ${t.opzione(i + 1)}`}
                            placeholder={t.nota}
                            lang="it"
                            className="mt-1.5 h-10 text-sm"
                            maxLength={300}
                            value={o.dettaglio}
                            onChange={(e) => cambiaOpzione(i, { dettaglio: e.target.value })}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {numerica ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 gap-1.5"
                      disabled={bozza.opzioni.length >= 30}
                      onClick={() =>
                        setBozza((b) => ({ ...b, opzioni: [...b.opzioni, { valore: null, etichetta: '', dettaglio: '' }] }))
                      }
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t.aggiungiOpzione}
                    </Button>
                  )}
                  <Errore id={`${id}-opzioni-errore`} testo={campi.opzioni} />
                </fieldset>
              ) : null}

              {bozza.tipo === 'abitudini' ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-altro`}>{t.altro}</Label>
                  <Input
                    id={`${id}-altro`}
                    lang="it"
                    className="h-11"
                    maxLength={120}
                    value={bozza.altro}
                    onChange={(e) => imposta('altro', e.target.value)}
                  />
                  <Errore id={`${id}-altro-errore`} testo={campi.altro} />
                </div>
              ) : null}

              {puoChiedereFile ? (
                <label className="flex min-h-11 items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium">{t.file}</span>
                    <span className="block text-xs text-muted-foreground">{t.fileAiuto}</span>
                  </span>
                  <Switch
                    checked={bozza.conFile}
                    disabled={sistema}
                    onCheckedChange={(v) => imposta('conFile', v === true)}
                  />
                </label>
              ) : null}

              {bozza.conFile || bozza.tipo === 'file' ? (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-file`}>{t.fileEtichetta}</Label>
                    <Input
                      id={`${id}-file`}
                      lang="it"
                      className="h-11"
                      maxLength={120}
                      placeholder={t.fileEtichettaEsempio}
                      value={bozza.fileEtichetta}
                      aria-invalid={campi.file ? true : undefined}
                      aria-describedby={campi.file ? `${id}-file-errore` : undefined}
                      onChange={(e) => imposta('fileEtichetta', e.target.value)}
                    />
                    <Errore id={`${id}-file-errore`} testo={campi.file} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-file-aiuto`}>{t.fileSpiegazione}</Label>
                    <Input
                      id={`${id}-file-aiuto`}
                      lang="it"
                      className="h-11"
                      maxLength={300}
                      value={bozza.fileAiuto}
                      onChange={(e) => imposta('fileAiuto', e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {errore ? (
                <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {errore}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="h-11" disabled={inCorso} data-testid="salva-domanda">
                  {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {nuova ? t.crea : t.salva}
                </Button>
                <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiudi}>
                  {t.annulla}
                </Button>
              </div>
            </form>

            <section aria-labelledby={`${id}-anteprima`} className="space-y-2">
              <h3 id={`${id}-anteprima`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t.anteprima}
              </h3>
              <p className="text-xs text-muted-foreground">{t.anteprimaAiuto}</p>
              {/* the client's area is Italian only: so is its preview */}
              <div lang="it" className="vetro rounded-2xl p-4 sm:p-6" data-testid="anteprima-domanda">
                {anteprima ? (
                  <BloccoDomanda
                    domanda={{ ...anteprima, chiave: `anteprima-${anteprima.chiave}` }}
                    errore={null}
                    extra={
                      anteprima.allegato ? (
                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                          <FileUp className="size-4 shrink-0" aria-hidden="true" />
                          <span>
                            <span className="block font-medium text-foreground">{anteprima.allegato.etichetta}</span>
                            {anteprima.allegato.aiuto ? <span className="block">{anteprima.allegato.aiuto}</span> : null}
                          </span>
                        </div>
                      ) : null
                    }
                  >
                    <CampoDomanda
                      key={`${bozza.tipo}-${bozza.lungo}`}
                      domanda={{ ...anteprima, chiave: `anteprima-${anteprima.chiave}` }}
                      valore={valoreAnteprima}
                      errore={null}
                      onCambia={setValoreAnteprima}
                      onErroreFormato={() => undefined}
                    />
                  </BloccoDomanda>
                ) : (
                  <p className="text-sm text-muted-foreground">…</p>
                )}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Impostazioni › Questionario (1.88.0): the questions by part, in the order the client sees them,
 * each with its number, its kind, whether it is required, the files and (for a question added)
 * its column of the sheet; the arrows move it inside its part, «Modifica» opens the form with the
 * preview, «Togli» hides it after a question. The questions taken away wait at the bottom with
 * «Rimetti». Every tap goes to the server and the page comes back with the list as it is.
 */
export function EditorQuestionario({ righe }: { righe: readonly RigaDomanda[] }) {
  const lingua = useLingua()
  const T = QUESTIONARIO_ADMIN[lingua]
  const [aperto, setAperto] = useState<{ riga: RigaDomanda | null; sezione: number; chiave: number } | null>(null)
  const [daTogliere, setDaTogliere] = useState<RigaDomanda | null>(null)
  const [inCorso, avvia] = useTransition()

  const attive = [...righe].filter((r) => r.attiva !== false).sort((a, b) => a.sezione - b.sezione || (a.ordine ?? 0) - (b.ordine ?? 0))
  const tolte = righe.filter((r) => r.attiva === false)
  const numero = new Map(attive.map((r, i) => [r.chiave, i + 1]))

  function sposta(r: RigaDomanda, verso: 'su' | 'giu') {
    avvia(async () => {
      try {
        const esito = await spostaDomanda({ chiave: r.chiave, verso })
        if (!esito.ok) toast.error(traduciErroreDomande(esito.errore, lingua))
      } catch {
        toast.error(T.connessione)
      }
    })
  }

  function cambiaAttiva(r: RigaDomanda, attiva: boolean) {
    avvia(async () => {
      try {
        const esito = await cambiaAttivaDomanda({ chiave: r.chiave, attiva })
        if (!esito.ok) {
          toast.error(traduciErroreDomande(esito.errore, lingua))
          return
        }
        toast.success(attiva ? T.rimessa : T.tolta)
        setDaTogliere(null)
      } catch {
        toast.error(T.connessione)
      }
    })
  }

  return (
    <div className="space-y-6" aria-busy={inCorso || undefined}>
      <section aria-labelledby="come-funziona" className="rounded-xl border border-border bg-card p-4">
        <h2 id="come-funziona" className="flex items-center gap-2 text-sm font-medium">
          <Info className="size-4 text-muted-foreground" aria-hidden="true" />
          {T.come.titolo}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {T.come.voci.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </section>

      {SEZIONI.map((s) => {
        const qui = attive.filter((r) => r.sezione === s)
        return (
          <section key={s} aria-labelledby={`parte-${s}`} className="space-y-2" data-testid={`parte-${s}`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id={`parte-${s}`} className="font-heading text-base font-semibold">
                  {T.parte(s)} · {T.sezioni[s]}
                </h2>
                <p className="text-sm text-muted-foreground">{T.quanteDomande(qui.length)}</p>
              </div>
            </div>
            {qui.length === 0 ? (
              <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">{T.vuota}</p>
            ) : (
              <ol className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
                {qui.map((r, i) => (
                  <li key={r.chiave} className="flex items-start gap-2 px-3 py-3 sm:px-4" data-domanda-admin={r.chiave}>
                    <span className="num w-7 shrink-0 pt-0.5 text-sm text-muted-foreground">{T.numeroDomanda(numero.get(r.chiave) ?? 0)}</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm font-medium break-words" lang="it">
                        {r.testo}
                      </p>
                      {r.aiuto ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground" lang="it">
                          {r.aiuto}
                        </p>
                      ) : null}
                      <p className="flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded-full bg-muted px-2 py-0.5">{tipoInParole(T, r)}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5',
                            r.obbligatoria ? 'bg-primary/12 text-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {r.obbligatoria ? T.obbligatoria : T.facoltativa}
                        </span>
                        {r.allegato && r.tipo !== 'file' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                            <FileUp className="size-3" aria-hidden="true" />
                            {T.conFile}
                          </span>
                        ) : null}
                        {r.sistema ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{T.delModulo}</span>
                        ) : typeof r.colonna === 'number' ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{T.colonna(lettera(r.colonna))}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 sm:flex-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label={T.su(r.testo)}
                        disabled={i === 0 || inCorso}
                        onClick={() => sposta(r, 'su')}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label={T.giu(r.testo)}
                        disabled={i === qui.length - 1 || inCorso}
                        onClick={() => sposta(r, 'giu')}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 gap-1.5"
                        aria-label={T.modificaDi(r.testo)}
                        onClick={() => setAperto({ riga: r, sezione: r.sezione, chiave: Date.now() })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        <span className="max-sm:sr-only">{T.modifica}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 text-muted-foreground"
                        aria-label={T.togliDi(r.testo)}
                        disabled={inCorso}
                        onClick={() => setDaTogliere(r)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-1.5"
              onClick={() => setAperto({ riga: null, sezione: s, chiave: Date.now() })}
              data-testid={`aggiungi-domanda-${s}`}
            >
              <Plus className="size-4" aria-hidden="true" />
              {T.aggiungiQui}
            </Button>
          </section>
        )
      })}

      {tolte.length > 0 ? (
        <section aria-labelledby="domande-tolte" className="space-y-2" data-testid="domande-tolte">
          <div>
            <h2 id="domande-tolte" className="flex items-center gap-2 font-heading text-base font-semibold">
              <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" />
              {T.tolte}
            </h2>
            <p className="text-sm text-muted-foreground">{T.tolteAiuto}</p>
          </div>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
            {tolte.map((r) => (
              <li key={r.chiave} className="flex items-center gap-3 px-4 py-3" data-domanda-tolta={r.chiave}>
                <p className="min-w-0 flex-1 text-sm break-words text-muted-foreground" lang="it">
                  {r.testo}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-1.5"
                  aria-label={T.rimettiDi(r.testo)}
                  disabled={inCorso}
                  onClick={() => cambiaAttiva(r, true)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {T.rimetti}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog open={daTogliere !== null} onOpenChange={(v) => !v && !inCorso && setDaTogliere(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{T.togliTitolo}</DialogTitle>
            <DialogDescription>
              <span className="mb-2 block font-medium text-foreground" lang="it">
                «{daTogliere?.testo}»
              </span>
              {T.togliTesto}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setDaTogliere(null)}>
              {T.foglio.annulla}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={inCorso}
              onClick={() => daTogliere && cambiaAttiva(daTogliere, false)}
              data-testid="conferma-togli"
            >
              {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {T.togliConferma}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aperto ? <FoglioDomanda key={aperto.chiave} riga={aperto.riga} sezioneNuova={aperto.sezione} chiudi={() => setAperto(null)} /> : null}
    </div>
  )
}
