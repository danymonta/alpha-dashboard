'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'

import { creaContenuto } from '@/app/(app)/marketing/contenuti/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { TOAST_NEL_PANNELLO, usePannello } from '@/components/marketing/contesto-pannello'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
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
import { contenutoSchema } from '@/lib/validation/contenuto'

type ContenutoForm = z.input<typeof contenutoSchema>
type Contenuto = z.output<typeof contenutoSchema>

function valoriIniziali(postDate: string | null | undefined): ContenutoForm {
  return {
    tipo: 'reel',
    nome: '',
    reel_type: null,
    formato: null,
    stato: 'not_started',
    post_date: postDate ?? null,
    inspiration: '',
    url: '',
    audio: '',
    view_count: '',
  }
}

/**
 * "Nuovo contenuto": the Notion template (Reel Topic or Carousel Topic), the
 * Name and the first properties; the rest is in the content panel, which
 * opens on it after saving (1.33.0), with the list still there behind. A
 * Reel Topic starts with Hook, Line, Line, CTA in its draft (the server
 * writes it). From the calendar the day's "+" opens it with that Post Date:
 * then the calendar owns the sheet (`aperto`, no trigger).
 */
export function NuovoContenuto({
  postDate = null,
  aperto: apertoControllato,
  onApertoChange,
  senzaTrigger = false,
  variante = 'primario',
  da = null,
}: {
  postDate?: string | null
  aperto?: boolean
  onApertoChange?: (aperto: boolean) => void
  /** The calendar opens it from a day's "+": no button of its own. */
  senzaTrigger?: boolean
  variante?: 'primario' | 'outline'
  /** Without a trigger: the element that opened it (the day's "+"), where the panel gives the focus back. */
  da?: HTMLElement | null
}) {
  const router = useRouter()
  const pannello = usePannello()
  const trigger = useRef<HTMLButtonElement>(null)
  /** Created: the sheet closes without taking the focus back, the panel takes it. */
  const creato = useRef(false)
  const [apertoInterno, setApertoInterno] = useState(false)
  const aperto = apertoControllato ?? apertoInterno
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContenutoForm, unknown, Contenuto>({
    resolver: zodResolver(contenutoSchema),
    defaultValues: valoriIniziali(postDate),
  })

  // every opening starts clean, with the day it was opened for
  useEffect(() => {
    if (!aperto) return
    creato.current = false
    reset(valoriIniziali(postDate))
  }, [aperto, postDate, reset])

  function cambiaAperto(v: boolean) {
    if (!v) setErrore(null)
    if (onApertoChange) onApertoChange(v)
    if (apertoControllato === undefined) setApertoInterno(v)
  }

  async function salvaNuovo(valori: Contenuto) {
    setErrore(null)
    let esito: Awaited<ReturnType<typeof creaContenuto>>
    try {
      esito = await creaContenuto(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    // the panel opens next: its toaster, never over the panel's X nor over the bottom bar
    toast.success('Contenuto creato', pannello ? TOAST_NEL_PANNELLO : undefined)
    creato.current = true
    cambiaAperto(false)
    // outside the list (no panel): the content's own page
    if (!pannello) {
      router.push(`/marketing/contenuti/${esito.id}`)
      return
    }
    // the new content in the panel, at once with what the form wrote; the sections come with the GET
    const adesso = new Date().toISOString()
    pannello.apri(esito.id, {
      da: senzaTrigger ? da : trigger.current,
      riga: {
        id: esito.id,
        tipo: valori.tipo,
        nome: valori.nome,
        reel_type: valori.reel_type,
        formato: valori.formato,
        inspiration: valori.inspiration,
        stato: valori.stato,
        post_date: valori.post_date,
        audio: valori.audio,
        url: valori.url,
        view_count: valori.view_count,
        created_at: adesso,
        updated_at: esito.versione,
      },
    })
  }

  return (
    <Sheet open={aperto} onOpenChange={cambiaAperto}>
      {senzaTrigger ? null : (
        <SheetTrigger
          render={<Button ref={trigger} type="button" variant={variante === 'outline' ? 'outline' : 'default'} className="h-11" />}
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuovo contenuto
        </SheetTrigger>
      )}
      <SheetContent
        side="right"
        // created: the content panel takes the focus, this sheet never takes it back
        finalFocus={() => !creato.current}
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Nuovo contenuto</SheetTitle>
          <SheetDescription>Come in Notion: scegli il modello, poi il resto lo scrivi nel contenuto, che si apre qui accanto.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => void handleSubmit(salvaNuovo)(e)} noValidate className="space-y-4 px-4 pb-6">
          <SceltaRapida
            legenda={CAMPO_MODELLO}
            colonne={2}
            registrazione={register('tipo')}
            opzioni={Object.entries(ETICHETTA_MODELLO).map(([valore, etichetta]) => ({ valore, etichetta }))}
            errore={errors.tipo?.message}
          />
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-nome">{CAMPI.nome}</Label>
            <Input
              id="nuovo-nome"
              className="h-11"
              autoComplete="off"
              maxLength={300}
              aria-invalid={errors.nome ? true : undefined}
              aria-describedby={errors.nome ? 'nuovo-nome-errore' : undefined}
              {...register('nome')}
            />
            <ErroreCampo id="nuovo-nome-errore" messaggio={errors.nome?.message} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="nuovo-reel-type">{CAMPI.reel_type}</Label>
              <select
                id="nuovo-reel-type"
                className={CLASSE_SELECT}
                {...register('reel_type', { setValueAs: (v) => v || null })}
              >
                <option value="">Vuoto</option>
                {Object.entries(ETICHETTA_REEL_TYPE).map(([valore, etichetta]) => (
                  <option key={valore} value={valore}>
                    {etichetta}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuovo-format">{CAMPI.formato}</Label>
              <select
                id="nuovo-format"
                className={CLASSE_SELECT}
                {...register('formato', { setValueAs: (v) => v || null })}
              >
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
              <Label htmlFor="nuovo-status">{CAMPI.stato}</Label>
              <select id="nuovo-status" className={CLASSE_SELECT} {...register('stato')}>
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
              <Label htmlFor="nuovo-post-date">{CAMPI.post_date}</Label>
              <Input
                id="nuovo-post-date"
                type="date"
                className="h-11"
                aria-invalid={errors.post_date ? true : undefined}
                aria-describedby={errors.post_date ? 'nuovo-post-date-errore' : undefined}
                {...register('post_date', { setValueAs: (v) => v || null })}
              />
            </div>
          </div>
          <ErroreCampo id="nuovo-post-date-errore" messaggio={errors.post_date?.message} />
          <ErroreModulo testo={errore} />
          <BottoneSalva inCorso={isSubmitting}>Crea il contenuto</BottoneSalva>
        </form>
      </SheetContent>
    </Sheet>
  )
}
