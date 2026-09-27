'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, Send, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiNota, eliminaNota, modificaNota } from '@/app/(app)/progetti/[id]/note/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { autenticaRealtime, createClient } from '@/lib/supabase/client'
import { MAX_NOTA, modificaNotaSchema, notaSchema, type ModificaNotaInput, type NotaInput } from '@/lib/validation/note'

/** Composer: the text and its day (today unless changed). Cmd/Ctrl+Enter saves. */
export function NuovaNota({ progettoId, oggi }: { progettoId: string; oggi: string }) {
  const id = useId()
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NotaInput>({
    resolver: zodResolver(notaSchema),
    defaultValues: { progetto_id: progettoId, data: oggi, testo: '' },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiNota(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success('Nota aggiunta')
    // back to today: the next note is about today unless chosen otherwise (QA 28/09/2026)
    reset({ progetto_id: progettoId, data: oggi, testo: '' })
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-3 rounded-xl bg-card p-4" aria-label="Nuova nota">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-testo`}>Nuova nota</Label>
        <Textarea
          id={`${id}-testo`}
          rows={3}
          maxLength={MAX_NOTA}
          placeholder="Cosa è successo, cosa è stato deciso, cosa resta da fare"
          aria-describedby={errors.testo ? `${id}-testo-errore` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void invia()
          }}
          {...register('testo')}
        />
        <ErroreCampo id={`${id}-testo-errore`} messaggio={errors.testo?.message} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-data`}>Giorno</Label>
          <Input id={`${id}-data`} type="date" className="num h-11 w-44" {...register('data')} />
        </div>
        <Button type="submit" className="ml-auto h-11" disabled={isSubmitting}>
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Aggiungi nota
        </Button>
      </div>
      <ErroreCampo id={`${id}-data-errore`} messaggio={errors.data?.message} />
      <ErroreModulo testo={errore} />
    </form>
  )
}

export function ModificaNota({ nota }: { nota: { id: string; data: string; testo: string } }) {
  const id = useId()
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaNotaInput>({
    resolver: zodResolver(modificaNotaSchema),
    defaultValues: nota,
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaNota(valori), 'Nota aggiornata')) setAperto(false)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(nota)
        }
      }}
      trigger={
        <Button type="button" variant="ghost" size="icon" aria-label="Modifica la nota" className="size-11 shrink-0 text-muted-foreground" />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo="Modifica la nota"
      descrizione="Cambiando il giorno, la nota si sposta sotto la nuova data."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-testo`}>Testo</Label>
          <Textarea id={`${id}-testo`} rows={6} maxLength={MAX_NOTA} {...register('testo')} />
          <ErroreCampo id={`${id}-testo-errore`} messaggio={errors.testo?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-data`}>Giorno</Label>
          <Input id={`${id}-data`} type="date" className="num h-11" {...register('data')} />
          <ErroreCampo id={`${id}-data-errore`} messaggio={errors.data?.message} />
        </div>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva la nota</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/** Two taps on purpose: the first arms, the second deletes. */
export function EliminaNota({ id }: { id: string }) {
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  if (!pronto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label="Elimina la nota"
        onClick={() => setPronto(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="destructive"
      className="h-11"
      disabled={inCorso}
      onBlur={() => setPronto(false)}
      autoFocus
      onClick={() =>
        avvia(async () => {
          try {
            const esito = await eliminaNota({ id })
            if (esito.ok) toast.success('Nota eliminata')
            else toast.error(esito.errore)
          } catch {
            toast.error('Connessione assente. Riprova.')
          }
          setPronto(false)
        })
      }
    >
      Conferma
    </Button>
  )
}

/**
 * Notes written by the other members appear without reloading. Inserts and
 * edits are filtered on the project; deletes cannot be filtered by Realtime,
 * so any delete triggers a (cheap) refresh.
 */
export function NoteLive({ progettoId }: { progettoId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let attesa: ReturnType<typeof setTimeout> | null = null
    const aggiorna = () => {
      if (attesa) clearTimeout(attesa)
      attesa = setTimeout(() => router.refresh(), 300)
    }
    const filtro = `progetto_id=eq.${progettoId}`
    const canale = supabase
      .channel(`pm-note-${progettoId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pm_note', filter: filtro }, aggiorna)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pm_note', filter: filtro }, aggiorna)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pm_note' }, aggiorna)
    let attivo = true
    void autenticaRealtime(supabase).then(() => {
      if (attivo) canale.subscribe()
    })

    return () => {
      attivo = false
      if (attesa) clearTimeout(attesa)
      void supabase.removeChannel(canale)
    }
  }, [progettoId, router])

  return null
}
