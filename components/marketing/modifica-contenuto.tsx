'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'

import { eliminaContenuto, modificaContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import type { RigaContenuto } from '@/components/marketing/tabella-contenuti'
import { useVersioneContenuto } from '@/components/marketing/versione-contenuto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { formatNumero } from '@/lib/format'
import {
  CAMPI,
  CAMPO_MODELLO,
  ETICHETTA_FORMAT,
  ETICHETTA_GRUPPO,
  ETICHETTA_MODELLO,
  ETICHETTA_REEL_TYPE,
  ETICHETTA_STATUS,
  GRUPPI_STATUS,
  ORDINE_GRUPPI,
} from '@/lib/marketing/etichette'
import { modificaContenutoSchema } from '@/lib/validation/contenuto'

type ModificaForm = z.input<typeof modificaContenutoSchema>
type Modifica = z.output<typeof modificaContenutoSchema>

function valoriDa(c: RigaContenuto, versione: string): ModificaForm {
  return {
    id: c.id,
    versione,
    tipo: c.tipo,
    nome: c.nome,
    reel_type: c.reel_type,
    formato: c.formato,
    stato: c.stato,
    post_date: c.post_date,
    inspiration: c.inspiration ?? '',
    url: c.url ?? '',
    audio: c.audio ?? '',
    // "12.480": the way the number is read; the schema takes the dots back out
    view_count: c.view_count === null ? '' : formatNumero(c.view_count),
  }
}

/**
 * "Modifica" on a content's page: every Notion property plus the template
 * ("Modello"). It saves only over the version the page read (updated_at);
 * the person's own Status taps and section saves move that version on, so
 * they never make this sheet conflict. When somebody else changed the content
 * meanwhile, nothing is written: the page reloads and the sheet shows the
 * saved values. At the bottom "Elimina", for the admin and marketing only.
 */
export function ModificaContenuto({ contenuto, puoEliminare }: { contenuto: RigaContenuto; puoEliminare: boolean }) {
  const router = useRouter()
  const contesto = useVersioneContenuto()
  const versione = contesto?.versione ?? contenuto.updated_at
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  /**
   * The version a save was refused over (changed elsewhere): when the page
   * brings a newer one, the sheet shows the saved values (they go to the form
   * through `values`). Any other render from the server (the person's own
   * Status tap, a section saved a moment ago) never touches what is being
   * typed.
   */
  const [rifiutataSu, setRifiutataSu] = useState<string | null>(null)
  const [ricaricati, setRicaricati] = useState<ModificaForm | undefined>(undefined)
  const [visto, setVisto] = useState(contenuto)
  if (visto !== contenuto) {
    // a new render from the server: adjust while rendering, never in an effect
    setVisto(contenuto)
    if (rifiutataSu !== null && contenuto.updated_at !== rifiutataSu) {
      setRifiutataSu(null)
      setRicaricati(valoriDa(contenuto, contenuto.updated_at))
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaForm, unknown, Modifica>({
    resolver: zodResolver(modificaContenutoSchema),
    defaultValues: valoriDa(contenuto, versione),
    values: ricaricati,
  })

  function cambiaAperto(v: boolean) {
    // every opening starts from what the page shows now
    if (v) reset(valoriDa(contenuto, versione))
    else setErrore(null)
    setAperto(v)
  }

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito: Awaited<ReturnType<typeof modificaContenuto>>
    try {
      // the version of now: a Status tap a moment ago moved it on
      esito = await modificaContenuto({ ...valori, versione })
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      if ('cambiato' in esito && esito.cambiato) {
        // the page reloads; the effect above puts the saved values in the sheet
        setRifiutataSu(versione)
        toast.error(esito.errore)
        router.refresh()
        return
      }
      setErrore(esito.errore)
      return
    }
    contesto?.aggiorna(esito.versione)
    toast.success('Salvato')
    setAperto(false)
    router.refresh()
  })

  return (
    <Sheet open={aperto} onOpenChange={cambiaAperto}>
      <SheetTrigger render={<Button type="button" variant="outline" className="h-11" />}>
        <Pencil className="size-4" aria-hidden="true" />
        Modifica
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Proprietà del contenuto</SheetTitle>
          <SheetDescription>Le stesse di Notion. I testi del modello si scrivono nella pagina.</SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <SceltaRapida
            legenda={CAMPO_MODELLO}
            colonne={2}
            registrazione={register('tipo')}
            opzioni={Object.entries(ETICHETTA_MODELLO).map(([valore, etichetta]) => ({ valore, etichetta }))}
            errore={errors.tipo?.message}
          />
          <div className="space-y-1.5">
            <Label htmlFor="mc-nome">{CAMPI.nome}</Label>
            <Input
              id="mc-nome"
              className="h-11"
              autoComplete="off"
              maxLength={300}
              aria-invalid={errors.nome ? true : undefined}
              aria-describedby={errors.nome ? 'mc-nome-errore' : undefined}
              {...register('nome')}
            />
            <ErroreCampo id="mc-nome-errore" messaggio={errors.nome?.message} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="mc-reel-type">{CAMPI.reel_type}</Label>
              <select id="mc-reel-type" className={CLASSE_SELECT} {...register('reel_type', { setValueAs: (v) => v || null })}>
                <option value="">Vuoto</option>
                {Object.entries(ETICHETTA_REEL_TYPE).map(([valore, etichetta]) => (
                  <option key={valore} value={valore}>
                    {etichetta}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc-format">{CAMPI.formato}</Label>
              <select id="mc-format" className={CLASSE_SELECT} {...register('formato', { setValueAs: (v) => v || null })}>
                <option value="">Vuoto</option>
                {Object.entries(ETICHETTA_FORMAT).map(([valore, etichetta]) => (
                  <option key={valore} value={valore}>
                    {etichetta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="mc-status">{CAMPI.stato}</Label>
              <select id="mc-status" className={CLASSE_SELECT} {...register('stato')}>
                {ORDINE_GRUPPI.map((g) => (
                  <optgroup key={g} label={ETICHETTA_GRUPPO[g]}>
                    {GRUPPI_STATUS[g].map((s) => (
                      <option key={s} value={s}>
                        {ETICHETTA_STATUS[s]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc-post-date">{CAMPI.post_date}</Label>
              <Input
                id="mc-post-date"
                type="date"
                className="h-11"
                aria-invalid={errors.post_date ? true : undefined}
                aria-describedby={errors.post_date ? 'mc-post-date-errore' : undefined}
                {...register('post_date', { setValueAs: (v) => v || null })}
              />
            </div>
          </div>
          <ErroreCampo id="mc-post-date-errore" messaggio={errors.post_date?.message} />
          <div className="space-y-1.5">
            <Label htmlFor="mc-audio">{CAMPI.audio}</Label>
            <Input id="mc-audio" className="h-11" autoComplete="off" maxLength={200} {...register('audio')} />
            <ErroreCampo id="mc-audio-errore" messaggio={errors.audio?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-inspiration">{CAMPI.inspiration}</Label>
            <Input
              id="mc-inspiration"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              className="h-11"
              placeholder="https://"
              aria-invalid={errors.inspiration ? true : undefined}
              aria-describedby={errors.inspiration ? 'mc-inspiration-errore' : undefined}
              {...register('inspiration')}
            />
            <ErroreCampo id="mc-inspiration-errore" messaggio={errors.inspiration?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-url">{CAMPI.url}</Label>
            <Input
              id="mc-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              className="h-11"
              placeholder="https://www.instagram.com/reel/…"
              aria-invalid={errors.url ? true : undefined}
              aria-describedby={errors.url ? 'mc-url-errore' : 'mc-url-aiuto'}
              {...register('url')}
            />
            {errors.url ? (
              <ErroreCampo id="mc-url-errore" messaggio={errors.url.message} />
            ) : (
              <p id="mc-url-aiuto" className="text-xs text-muted-foreground">
                Il link del post pubblicato, copiato dal browser.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-view-count">{CAMPI.view_count}</Label>
            <Input
              id="mc-view-count"
              inputMode="numeric"
              autoComplete="off"
              className="num h-11"
              aria-invalid={errors.view_count ? true : undefined}
              aria-describedby={errors.view_count ? 'mc-view-count-errore' : undefined}
              {...register('view_count')}
            />
            <ErroreCampo id="mc-view-count-errore" messaggio={errors.view_count?.message} />
          </div>
          <ErroreModulo testo={errore} />
          <BottoneSalva inCorso={isSubmitting} />
          {puoEliminare ? (
            <div className="border-t border-border pt-4">
              <Elimina
                etichetta="Elimina il contenuto"
                cosa={`il contenuto «${contenuto.nome}»`}
                fatto="Contenuto eliminato"
                dopo="/marketing/contenuti"
                conseguenze={[
                  'Si perdono anche il messaggio, gli script e i commenti.',
                  'Su Instagram e su Notion non cambia niente.',
                ]}
                azione={() => eliminaContenuto({ id: contenuto.id })}
              />
            </div>
          ) : (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Un contenuto lo eliminano l’admin e il marketing: per toglierlo dal lavoro puoi segnarlo «Canceled».
            </p>
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}
