'use client'

import { ChevronDown, Eye, EyeOff, LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { eliminaBlocco, salvaBlocco } from '@/app/(app)/settings/onboarding/contenuti/actions'
import { Elimina } from '@/components/form/elimina'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { ListaBlocchi } from '@/components/percorso/blocchi'
import { TeamCliente } from '@/components/percorso/team-cliente'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { haSegnaposto, leggiBlocco, ordineBenvenuto, type BloccoPercorso } from '@/lib/percorso/blocchi'
import type { PersonaTeam } from '@/lib/percorso/letture'
import { TESTI_PERCORSO } from '@/lib/percorso/testi'
import { TIPI_BLOCCO, bloccoSchema, idYoutube } from '@/lib/validation/percorso'

/** The team of the preview: the three roles with placeholder names (the client sees his people, with photo). */
const TEAM_DI_ESEMPIO: readonly PersonaTeam[] = (['coach', 'revisore', 'responsabile'] as const).map((incarico) => ({
  incarico,
  ruolo: TESTI_PERCORSO.ruoli[incarico],
  nome: `Nome ${incarico === 'coach' ? 'del coach' : incarico === 'revisore' ? 'del revisore' : 'del responsabile'}`,
  fotoUrl: null,
}))

export type RigaBlocco = {
  id: string
  pagina: string
  passo: string | null
  ordine: number
  tipo: string
  titolo: string | null
  corpo: string | null
  youtube_id: string | null
  url: string | null
  obbligatorio: boolean
  pubblicato: boolean
}

export type GruppoContenuti = {
  chiave: string
  pagina: 'passo' | 'dopo_lancio'
  /** In the page's language. */
  titolo: string
  /** As the client reads it (Italian): the preview's heading. */
  titoloCliente: string
  /** The client sees this step in this release. */
  servito: boolean
  blocchi: RigaBlocco[]
}

/** A uuid for the preview of a block not saved yet: only the preview reads it. */
const ID_ANTEPRIMA = '00000000-0000-4000-8000-000000000000'

/** A row of the table as the client's components read it (the preview: never the progress of a video). */
function comeBlocco(riga: Omit<RigaBlocco, 'id' | 'pagina' | 'passo' | 'ordine' | 'pubblicato'> & { id?: string }): BloccoPercorso | null {
  return leggiBlocco({ ...riga, id: riga.id ?? ID_ANTEPRIMA, video: { percentuale: 0, visto: false } })
}

type Bozza = {
  id?: string
  tipo: string
  titolo: string
  corpo: string
  youtube: string
  url: string
  obbligatorio: boolean
  pubblicato: boolean
  ordine: string
}

function bozzaDa(riga: RigaBlocco | null, ordine: number): Bozza {
  return riga
    ? {
        id: riga.id,
        tipo: riga.tipo,
        titolo: riga.titolo ?? '',
        corpo: riga.corpo ?? '',
        youtube: riga.youtube_id ?? '',
        url: riga.url ?? '',
        obbligatorio: riga.obbligatorio,
        pubblicato: riga.pubblicato,
        ordine: String(riga.ordine),
      }
    : { tipo: 'testo', titolo: '', corpo: '', youtube: '', url: '', obbligatorio: false, pubblicato: true, ordine: String(ordine) }
}

/** The form of a block, with the live preview drawn by the client's own components. */
function FoglioBlocco({
  gruppo,
  riga,
  ordineNuovo,
  aperto,
  chiudi,
}: {
  gruppo: GruppoContenuti
  riga: RigaBlocco | null
  ordineNuovo: number
  aperto: boolean
  chiudi: () => void
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua].contenuti
  const [bozza, setBozza] = useState<Bozza>(() => bozzaDa(riga, ordineNuovo))
  const [campi, setCampi] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  const imposta = <K extends keyof Bozza>(k: K, v: Bozza[K]) => setBozza((b) => ({ ...b, [k]: v }))
  const anteprima = comeBlocco({
    tipo: bozza.tipo,
    titolo: bozza.titolo,
    corpo: bozza.corpo,
    youtube_id: bozza.tipo === 'video' ? idYoutube(bozza.youtube) : null,
    url: bozza.url,
    obbligatorio: bozza.obbligatorio,
  })

  function salva() {
    setErrore(null)
    const input = {
      id: bozza.id,
      pagina: gruppo.pagina,
      passo: gruppo.pagina === 'passo' ? gruppo.chiave : null,
      tipo: bozza.tipo,
      ordine: bozza.ordine,
      titolo: bozza.titolo,
      corpo: bozza.corpo,
      youtube: bozza.tipo === 'video' ? bozza.youtube : null,
      url: bozza.tipo === 'pulsante' ? bozza.url : null,
      obbligatorio: bozza.obbligatorio,
      pubblicato: bozza.pubblicato,
    }
    // the same schema as the server action: the fields say what is wrong before the trip
    const parsed = bloccoSchema.safeParse(input)
    if (!parsed.success) {
      const nuovi: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0]
        if (typeof campo === 'string') nuovi[campo] ??= traduciErroreOnboarding(issue.message, lingua)
      }
      setCampi(nuovi)
      return
    }
    setCampi({})
    avvia(async () => {
      try {
        const esito = await salvaBlocco(input)
        if (!esito.ok) {
          setErrore(traduciErroreOnboarding(esito.errore, lingua))
          if (esito.campi) {
            setCampi(Object.fromEntries(Object.entries(esito.campi).map(([k, v]) => [k, traduciErroreOnboarding(v, lingua)])))
          }
          return
        }
        toast.success(t.salvato)
        chiudi()
      } catch {
        setErrore(ONBOARDING[lingua].connessione)
      }
    })
  }

  const errCampo = (k: string) =>
    campi[k] ? (
      <p id={`${id}-${k}-errore`} className="flex items-center gap-1.5 text-sm text-status-critical">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {campi[k]}
      </p>
    ) : null

  return (
    <Sheet open={aperto} onOpenChange={(v) => !v && !inCorso && chiudi()}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{riga ? t.modificaTitolo : t.nuovo}</SheetTitle>
          <SheetDescription>{gruppo.titolo}</SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 px-4 pb-6 md:grid-cols-2">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              salva()
            }}
          >
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-tipo`}>{t.campi.tipo}</Label>
                <select
                  id={`${id}-tipo`}
                  className={CLASSE_SELECT}
                  value={bozza.tipo}
                  onChange={(e) => imposta('tipo', e.target.value)}
                >
                  {TIPI_BLOCCO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {t.tipi[tipo] ?? tipo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-ordine`}>{t.campi.ordine}</Label>
                <Input
                  id={`${id}-ordine`}
                  inputMode="numeric"
                  className="h-11"
                  value={bozza.ordine}
                  aria-invalid={campi.ordine ? true : undefined}
                  onChange={(e) => imposta('ordine', e.target.value)}
                />
                {errCampo('ordine')}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${id}-titolo`}>{t.campi.titolo}</Label>
              <Input
                id={`${id}-titolo`}
                className="h-11"
                maxLength={120}
                value={bozza.titolo}
                aria-invalid={campi.titolo ? true : undefined}
                onChange={(e) => imposta('titolo', e.target.value)}
              />
              {errCampo('titolo')}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${id}-corpo`}>{t.campi.corpo}</Label>
              <Textarea
                id={`${id}-corpo`}
                rows={7}
                maxLength={8000}
                lang="it"
                value={bozza.corpo}
                aria-invalid={campi.corpo ? true : undefined}
                onChange={(e) => imposta('corpo', e.target.value)}
              />
              {errCampo('corpo')}
            </div>

            {bozza.tipo === 'video' ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-youtube`}>{t.campi.youtube}</Label>
                <Input
                  id={`${id}-youtube`}
                  className="h-11"
                  value={bozza.youtube}
                  aria-invalid={campi.youtube ? true : undefined}
                  aria-describedby={`${id}-youtube-aiuto`}
                  onChange={(e) => imposta('youtube', e.target.value)}
                />
                <p id={`${id}-youtube-aiuto`} className="text-xs text-muted-foreground">
                  {t.campi.youtubeAiuto}
                </p>
                {errCampo('youtube')}
                <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                  {t.campi.obbligatorio}
                  <Switch checked={bozza.obbligatorio} onCheckedChange={(v) => imposta('obbligatorio', v === true)} />
                </label>
              </div>
            ) : null}

            {bozza.tipo === 'pulsante' ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-url`}>{t.campi.url}</Label>
                <Input
                  id={`${id}-url`}
                  className="h-11"
                  inputMode="url"
                  placeholder="https://"
                  value={bozza.url}
                  aria-invalid={campi.url ? true : undefined}
                  onChange={(e) => imposta('url', e.target.value)}
                />
                {errCampo('url')}
              </div>
            ) : null}

            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              {t.campi.pubblicato}
              <Switch checked={bozza.pubblicato} onCheckedChange={(v) => imposta('pubblicato', v === true)} />
            </label>

            {errore ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {errore}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="h-11" disabled={inCorso}>
                {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                {t.salva}
              </Button>
              <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiudi}>
                {ONBOARDING[lingua].annulla}
              </Button>
            </div>

            {riga ? (
              <Elimina
                cosa={t.eliminaCosa(riga.titolo ?? t.senzaTitolo)}
                fatto={t.eliminaFatto}
                conseguenze={[t.eliminaConseguenza]}
                onFatto={chiudi}
                azione={async () => {
                  const esito = await eliminaBlocco({ id: riga.id })
                  return esito.ok ? esito : { ok: false, errore: traduciErroreOnboarding(esito.errore, lingua) }
                }}
              />
            ) : null}
          </form>

          <section aria-label={t.anteprima} className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.anteprima}</p>
            {/* the client's area is Italian only: so is its preview */}
            <div lang="it" className="vetro rounded-2xl p-4">
              {anteprima ? (
                <ListaBlocchi blocchi={[anteprima]} modo="anteprima" />
              ) : (
                <p className="text-sm text-muted-foreground">{t.anteprimaVuota}</p>
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The minimal CMS (release B1a): the blocks grouped by step (v3 adds modules to the same
 * groups), each with its kind, title, warnings («[Da scrivere»), the form and the preview.
 */
export function EditorContenuti({ gruppi }: { gruppi: readonly GruppoContenuti[] }) {
  const lingua = useLingua()
  const t = ONBOARDING[lingua].contenuti
  const [aperto, setAperto] = useState<{ gruppo: GruppoContenuti; riga: RigaBlocco | null; chiave: number } | null>(null)

  return (
    <div className="space-y-4">
      {gruppi.map((g) => {
        const pubblicati = g.blocchi
          .filter((b) => b.pubblicato)
          .map((b) => comeBlocco(b))
          .filter((b): b is BloccoPercorso => b !== null)
        return (
          <section
            key={g.chiave}
            aria-labelledby={`gruppo-${g.chiave}`}
            className="space-y-3 rounded-xl bg-card p-4"
            data-testid={`contenuti-${g.chiave}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-0.5">
                <h2 id={`gruppo-${g.chiave}`} className="font-medium">
                  {g.titolo}
                </h2>
                {!g.servito ? <p className="text-xs text-muted-foreground">{t.nonServito}</p> : null}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-1.5"
                onClick={() => setAperto({ gruppo: g, riga: null, chiave: Date.now() })}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t.aggiungi}
              </Button>
            </div>

            {g.blocchi.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.vuoto}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {g.blocchi.map((b) => {
                  const segnaposto = haSegnaposto(b)
                  return (
                    <li key={b.id} className="flex items-center gap-3 px-3 py-2" data-blocco-id={b.id}>
                      <span className="num w-6 shrink-0 text-xs text-muted-foreground">{b.ordine}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" lang="it">
                          {b.titolo ?? t.senzaTitolo}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{t.tipi[b.tipo] ?? b.tipo}</span>
                          {b.tipo === 'video' && b.obbligatorio ? <span>· {t.obbligatorio}</span> : null}
                          {!b.pubblicato ? (
                            <span className="inline-flex items-center gap-1">
                              · <EyeOff className="size-3" aria-hidden="true" /> {t.nonPubblicato}
                            </span>
                          ) : null}
                          {segnaposto ? (
                            <span className="inline-flex items-center gap-1 text-status-warning" data-segnaposto>
                              <TriangleAlert className="size-3" aria-hidden="true" />
                              {t.segnaposto}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0"
                        aria-label={`${t.modifica} ${b.titolo ?? t.senzaTitolo}`}
                        onClick={() => setAperto({ gruppo: g, riga: b, chiave: Date.now() })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            {pubblicati.length > 0 ? (
              <details className="group rounded-lg border border-border">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium">
                  <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t.anteprimaPasso}
                  <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div lang="it" className="vetro m-3 space-y-4 rounded-2xl p-4 sm:p-6">
                  {g.titoloCliente ? <p className="font-heading text-xl font-semibold tracking-tight">{g.titoloCliente}</p> : null}
                  {g.chiave === 'benvenuto' && g.pagina === 'passo' ? (
                    <>
                      <ListaBlocchi blocchi={ordineBenvenuto(pubblicati).testi} modo="anteprima" titoloPasso={g.titoloCliente} />
                      {/* the client's team with examples: the preview never differs from what the client sees */}
                      <TeamCliente team={TEAM_DI_ESEMPIO} />
                      <ListaBlocchi blocchi={ordineBenvenuto(pubblicati).video} modo="anteprima" titoloPasso={g.titoloCliente} />
                    </>
                  ) : (
                    <ListaBlocchi blocchi={pubblicati} modo="anteprima" titoloPasso={g.titoloCliente} />
                  )}
                </div>
              </details>
            ) : null}
          </section>
        )
      })}

      {aperto ? (
        <FoglioBlocco
          key={aperto.chiave}
          gruppo={aperto.gruppo}
          riga={aperto.riga}
          ordineNuovo={(aperto.gruppo.blocchi.at(-1)?.ordine ?? 0) + 1}
          aperto
          chiudi={() => setAperto(null)}
        />
      ) : null}
    </div>
  )
}

