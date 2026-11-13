'use client'

import { ImageUp, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  caricaCopertina,
  eliminaLezione,
  eliminaModulo,
  salvaLezione,
  salvaModulo,
  type Esito,
} from '@/app/(app)/settings/onboarding/aula/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { GrigliaAula } from '@/components/percorso/campo-base/aula'
import { PosizioneLocale } from '@/components/percorso/campo-base/navigazione'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CAMPO_TEAM } from '@/lib/i18n/testi/campo-base'
import { ICONE_MODULO, type ModuloAula } from '@/lib/percorso/campo-base'
import { cn } from '@/lib/utils'
import { STATI_MODULO, TIPI_LEZIONE } from '@/lib/validation/aula'

export type RigaLezione = {
  id: string
  modulo_id: string
  titolo: string
  ordine: number
  tipo: (typeof TIPI_LEZIONE)[number]
  corpo: string | null
  youtube_id: string | null
  url: string | null
  obbligatoria: boolean
  pubblicata: boolean
}

export type RigaModulo = {
  id: string
  titolo: string
  descrizione: string | null
  copertina_url: string | null
  icona: string
  ordine: number
  stato: (typeof STATI_MODULO)[number]
  durante_onboarding: boolean
  lezioni: RigaLezione[]
}

const CLASSE_SELECT =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/** How the client would see the Aula with these modules: never a draft, every published module open. */
function comeModuli(moduli: readonly RigaModulo[]): ModuloAula[] {
  return moduli
    .filter((m) => m.stato !== 'bozza')
    .map((m) => {
      const lezioni = m.lezioni.filter((l) => l.pubblicata)
      return {
        id: m.id,
        titolo: m.titolo,
        descrizione: m.descrizione,
        copertinaUrl: m.copertina_url,
        icona: (ICONE_MODULO as readonly string[]).includes(m.icona) ? (m.icona as ModuloAula['icona']) : 'libro',
        stato: m.stato as ModuloAula['stato'],
        duranteOnboarding: m.durante_onboarding,
        aperto: m.stato === 'pubblicato',
        totali: lezioni.length,
        completate: 0,
        lezioni: [],
      }
    })
}

/**
 * Impostazioni › Onboarding › Aula (1.83.0): the modules of the Aula (title, description, cover or
 * icon, status, open during the onboarding) and their lessons (video, text, PDF, link), with the
 * preview drawn by the client's own grid. The admin's session under RLS.
 */
export function EditorAula({ moduli }: { moduli: RigaModulo[] }) {
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua].aulaAdmin
  const [scelto, setScelto] = useState<string | null>(moduli[0]?.id ?? null)
  const [nuovo, setNuovo] = useState(false)
  const modulo = moduli.find((m) => m.id === scelto) ?? null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <section aria-labelledby="titolo-moduli" className="space-y-2 rounded-xl bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="titolo-moduli" className="text-sm font-medium">
              {t.modulo}
            </h2>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-1.5"
              onClick={() => {
                setNuovo(true)
                setScelto(null)
              }}
              data-testid="nuovo-modulo"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t.nuovoModulo}
            </Button>
          </div>
          {moduli.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t.vuoto}</p>
          ) : (
            <ul className="space-y-1">
              {moduli.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setScelto(m.id)
                      setNuovo(false)
                    }}
                    aria-current={m.id === scelto ? 'true' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
                      m.id === scelto ? 'bg-selezione font-medium' : 'hover:bg-accent',
                    )}
                  >
                    <span lang="it" className="min-w-0 break-words">
                      {m.titolo}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.stato === 'bozza' ? t.bozza : CAMPO_TEAM[lingua].stati[m.stato]} · {m.lezioni.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          {nuovo ? (
            <FormModulo key="nuovo" onSalvato={(id) => { setNuovo(false); setScelto(id ?? null) }} ordine={(moduli.at(-1)?.ordine ?? 0) + 10} />
          ) : modulo ? (
            <>
              <FormModulo key={modulo.id} modulo={modulo} onSalvato={() => undefined} ordine={modulo.ordine} />
              <Lezioni modulo={modulo} />
            </>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="titolo-anteprima-aula" className="space-y-3 rounded-xl bg-card p-3">
        <h2 id="titolo-anteprima-aula" className="text-sm font-medium">
          {t.anteprima}
        </h2>
        <div lang="it">
          <PosizioneLocale iniziale="aula">
            <GrigliaAula aula={comeModuli(moduli)} />
          </PosizioneLocale>
        </div>
      </section>
    </div>
  )
}

function useEsito() {
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua].aulaAdmin
  const [inCorso, avvia] = useTransition()
  const [errore, setErrore] = useState<string | null>(null)
  function esegui(azione: () => Promise<Esito>, dopo?: (e: Extract<Esito, { ok: true }>) => void) {
    setErrore(null)
    avvia(async () => {
      try {
        const e = await azione()
        if (!e.ok) {
          setErrore(e.errore)
          return
        }
        toast.success(t.salvato)
        dopo?.(e)
      } catch {
        setErrore(t.errore)
      }
    })
  }
  return { inCorso, errore, esegui, setErrore }
}

function Errore({ testo }: { testo: string | null }) {
  return testo ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  ) : null
}

function FormModulo({ modulo, ordine, onSalvato }: { modulo?: RigaModulo; ordine: number; onSalvato: (id?: string) => void }) {
  const id = useId()
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua].aulaAdmin
  const [v, setV] = useState({
    titolo: modulo?.titolo ?? '',
    descrizione: modulo?.descrizione ?? '',
    copertina_url: modulo?.copertina_url ?? '',
    icona: modulo?.icona ?? 'libro',
    ordine: modulo?.ordine ?? ordine,
    stato: modulo?.stato ?? 'bozza',
    durante_onboarding: modulo?.durante_onboarding ?? false,
  })
  const [conferma, setConferma] = useState(false)
  const { inCorso, errore, esegui, setErrore } = useEsito()

  function salva(e: React.FormEvent) {
    e.preventDefault()
    esegui(() => salvaModulo({ ...v, id: modulo?.id }), (r) => onSalvato(r.id))
  }

  function carica(file: File | undefined) {
    if (!file) return
    const dati = new FormData()
    dati.set('file', file)
    setErrore(null)
    esegui(
      () => caricaCopertina(dati),
      (r) => {
        if (r.url) setV((p) => ({ ...p, copertina_url: r.url! }))
      },
    )
  }

  return (
    <form onSubmit={salva} noValidate className="space-y-4 rounded-xl bg-card p-4" data-testid="form-modulo">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-titolo`}>{t.titoloModulo}</Label>
          <Input id={`${id}-titolo`} className="h-11" value={v.titolo} maxLength={120} onChange={(e) => setV({ ...v, titolo: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-descrizione`}>{t.descrizioneModulo}</Label>
          <Textarea id={`${id}-descrizione`} rows={2} maxLength={500} value={v.descrizione} onChange={(e) => setV({ ...v, descrizione: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-stato`}>{t.stato}</Label>
          <select id={`${id}-stato`} className={CLASSE_SELECT} value={v.stato} onChange={(e) => setV({ ...v, stato: e.target.value as typeof v.stato })}>
            {STATI_MODULO.map((s) => (
              <option key={s} value={s}>
                {t.statiModulo[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-icona`}>{t.icona}</Label>
          <select id={`${id}-icona`} className={CLASSE_SELECT} value={v.icona} onChange={(e) => setV({ ...v, icona: e.target.value })}>
            {ICONE_MODULO.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-ordine`}>{t.ordine}</Label>
          <Input id={`${id}-ordine`} type="number" min={0} className="num h-11" value={v.ordine} onChange={(e) => setV({ ...v, ordine: Number(e.target.value) })} />
        </div>
        <label className="flex min-h-11 items-start gap-3 pt-6 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5"
            checked={v.durante_onboarding}
            onChange={(e) => setV({ ...v, durante_onboarding: e.target.checked })}
          />
          <span>
            {t.duranteOnboarding}
            <span className="block text-xs text-muted-foreground">{t.duranteOnboardingAiuto}</span>
          </span>
        </label>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-copertina`}>{t.copertina}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-accent">
              <ImageUp className="size-4" aria-hidden="true" />
              <span>{t.copertina}</span>
              <input
                id={`${id}-copertina`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => carica(e.target.files?.[0])}
              />
            </label>
            {v.copertina_url ? (
              <Button type="button" variant="ghost" className="h-11" onClick={() => setV({ ...v, copertina_url: '' })}>
                {t.togliCopertina}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t.copertinaAiuto}</p>
        </div>
      </div>
      <Errore testo={errore} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="h-11" disabled={inCorso} data-testid="salva-modulo">
          {t.salvaModulo}
        </Button>
        {modulo ? (
          <Button
            type="button"
            variant={conferma ? 'destructive' : 'ghost'}
            className="h-11 gap-1.5"
            disabled={inCorso}
            onBlur={() => setConferma(false)}
            onClick={() => {
              if (!conferma) return setConferma(true)
              setConferma(false)
              esegui(() => eliminaModulo({ id: modulo.id }))
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {conferma ? t.eliminaModuloDomanda : t.eliminaModulo}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function Lezioni({ modulo }: { modulo: RigaModulo }) {
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua].aulaAdmin
  const [nuova, setNuova] = useState(false)
  return (
    <section aria-labelledby={`lezioni-${modulo.id}`} className="space-y-3 rounded-xl bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`lezioni-${modulo.id}`} className="text-sm font-medium">
          {t.lezioni}
        </h2>
        <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => setNuova(true)} data-testid="nuova-lezione">
          <Plus className="size-4" aria-hidden="true" />
          {t.nuovaLezione}
        </Button>
      </div>
      {modulo.lezioni.length === 0 && !nuova ? <p className="text-sm text-muted-foreground">{t.senzaLezioni}</p> : null}
      <ul className="space-y-2">
        {modulo.lezioni.map((l) => (
          <li key={l.id}>
            <details className="rounded-lg border border-border">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm">
                <span lang="it" className="min-w-0 break-words">
                  {l.titolo}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.tipi[l.tipo]}</span>
              </summary>
              <div className="p-3 pt-0">
                <FormLezione moduloId={modulo.id} lezione={l} ordine={l.ordine} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      {nuova ? (
        <FormLezione moduloId={modulo.id} ordine={(modulo.lezioni.at(-1)?.ordine ?? 0) + 1} onFatto={() => setNuova(false)} />
      ) : null}
    </section>
  )
}

function FormLezione({
  moduloId,
  lezione,
  ordine,
  onFatto,
}: {
  moduloId: string
  lezione?: RigaLezione
  ordine: number
  onFatto?: () => void
}) {
  const id = useId()
  const lingua = useLingua()
  const t = CAMPO_TEAM[lingua].aulaAdmin
  const [v, setV] = useState({
    titolo: lezione?.titolo ?? '',
    tipo: lezione?.tipo ?? ('testo' as RigaLezione['tipo']),
    corpo: lezione?.corpo ?? '',
    youtube: lezione?.youtube_id ?? '',
    url: lezione?.url ?? '',
    ordine: lezione?.ordine ?? ordine,
    obbligatoria: lezione?.obbligatoria ?? false,
    pubblicata: lezione?.pubblicata ?? true,
  })
  const [conferma, setConferma] = useState(false)
  const { inCorso, errore, esegui } = useEsito()

  function salva(e: React.FormEvent) {
    e.preventDefault()
    esegui(() => salvaLezione({ ...v, id: lezione?.id, modulo_id: moduloId }), () => onFatto?.())
  }

  return (
    <form onSubmit={salva} noValidate className="space-y-3" data-testid="form-lezione">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-titolo`}>{t.titoloLezione}</Label>
          <Input id={`${id}-titolo`} className="h-11" maxLength={120} value={v.titolo} onChange={(e) => setV({ ...v, titolo: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-tipo`}>{t.tipo}</Label>
          <select id={`${id}-tipo`} className={CLASSE_SELECT} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as RigaLezione['tipo'] })}>
            {TIPI_LEZIONE.map((x) => (
              <option key={x} value={x}>
                {t.tipi[x]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-ordine`}>{t.ordine}</Label>
          <Input id={`${id}-ordine`} type="number" min={0} className="num h-11" value={v.ordine} onChange={(e) => setV({ ...v, ordine: Number(e.target.value) })} />
        </div>
      </div>
      {v.tipo === 'video' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-youtube`}>{t.youtube}</Label>
          <Input id={`${id}-youtube`} className="h-11" value={v.youtube} onChange={(e) => setV({ ...v, youtube: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t.youtubeAiuto}</p>
        </div>
      ) : null}
      {v.tipo === 'pdf' || v.tipo === 'link' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-url`}>{t.url}</Label>
          <Input id={`${id}-url`} type="url" className="h-11" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-corpo`}>{t.corpo}</Label>
        <Textarea id={`${id}-corpo`} rows={5} value={v.corpo} onChange={(e) => setV({ ...v, corpo: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={v.obbligatoria} onChange={(e) => setV({ ...v, obbligatoria: e.target.checked })} />
          {t.obbligatoria}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={v.pubblicata} onChange={(e) => setV({ ...v, pubblicata: e.target.checked })} />
          {t.pubblicata}
        </label>
      </div>
      <Errore testo={errore} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="h-11" disabled={inCorso} data-testid="salva-lezione">
          {t.salvaLezione}
        </Button>
        {lezione ? (
          <Button
            type="button"
            variant={conferma ? 'destructive' : 'ghost'}
            className="h-11 gap-1.5"
            disabled={inCorso}
            onBlur={() => setConferma(false)}
            onClick={() => {
              if (!conferma) return setConferma(true)
              setConferma(false)
              esegui(() => eliminaLezione({ id: lezione.id }))
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {conferma ? t.eliminaLezioneDomanda : t.eliminaLezione}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
