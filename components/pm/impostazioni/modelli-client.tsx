'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  cambiaAttivoModello,
  eliminaModello,
  eliminaVoce,
  salvaModello,
  salvaVoce,
} from '@/app/(app)/settings/progetti/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { modelloSchema, voceModelloSchema, type ModelloInput, type VoceModelloInput } from '@/lib/validation/progetti'

type Reparto = { id: string; nome: string }
type Modello = { id: string; nome: string; descrizione: string | null; reparto_id: string | null }

/**
 * New template or edit one (name, description, department). A new template
 * opens its own page right away, to add its activities.
 */
export function ModelloForm({ modello, reparti }: { modello?: Modello; reparti: readonly Reparto[] }) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore } = useSalvataggio()
  const iniziali: ModelloInput = {
    id: modello?.id ?? null,
    nome: modello?.nome ?? '',
    descrizione: modello?.descrizione ?? '',
    reparto_id: modello?.reparto_id ?? '',
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModelloInput>({ resolver: zodResolver(modelloSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await salvaModello(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(modello ? 'Modello salvato' : 'Modello creato: aggiungi le sue attività')
    setAperto(false)
    if (!modello) router.push(`/settings/progetti/modelli/${esito.id}`)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(iniziali)
        }
      }}
      trigger={<Button type="button" variant="outline" className="h-11" />}
      contenutoTrigger={
        modello ? (
          <>
            <Pencil className="size-4" aria-hidden="true" />
            Modifica
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            Nuovo modello
          </>
        )
      }
      titolo={modello ? 'Modifica il modello' : 'Nuovo modello'}
      descrizione="Un modello è l’insieme di liste e attività con cui nasce un progetto."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="m-nome">Nome</Label>
          <Input id="m-nome" className="h-11" placeholder="Percorso cliente" {...register('nome')} />
          <ErroreCampo id="m-nome-errore" messaggio={errors.nome?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-reparto">Reparto</Label>
          <select id="m-reparto" className={CLASSE_SELECT} {...register('reparto_id')}>
            <option value="">Tutti i reparti</option>
            {reparti.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Nei nuovi progetti del reparto il primo modello è già scelto.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-descrizione">Descrizione</Label>
          <Textarea id="m-descrizione" rows={3} {...register('descrizione')} />
          <ErroreCampo id="m-descrizione-errore" messaggio={errors.descrizione?.message} />
        </div>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>{modello ? 'Salva il modello' : 'Crea il modello'}</BottoneSalva>
        {modello ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta="Elimina il modello"
              cosa={`il modello ${modello.nome}`}
              fatto={`${modello.nome} eliminato`}
              conseguenze={['I progetti già aperti con questo modello restano come sono.']}
              dopo="/settings/progetti"
              azione={() => eliminaModello({ id: modello.id })}
            />
          </div>
        ) : null}
      </form>
    </FoglioModifica>
  )
}

export function AttivoModello({ id, nome, attivo }: { id: string; nome: string; attivo: boolean }) {
  const [inCorso, avvia] = useTransition()
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Switch
        checked={attivo}
        disabled={inCorso}
        aria-label={`${nome} attivo`}
        onCheckedChange={(valore) =>
          avvia(async () => {
            const esito = await cambiaAttivoModello({ id, attivo: valore })
            if (esito.ok) toast.success(valore ? `${nome} di nuovo disponibile` : `${nome} non più proposto`)
            else toast.error(esito.errore)
          })
        }
      />
      {attivo ? 'Attivo' : 'Disattivato'}
    </label>
  )
}

type Voce = {
  id: string
  tasklist: string
  titolo: string
  descrizione: string | null
  ordine: number
  inizio_giorni: number
  durata_giorni: number
}

/** One activity of a template: its list, its title, when it starts and how long it lasts. */
export function VoceForm({
  modelloId,
  voce,
  liste,
  ordineSuccessivo,
}: {
  modelloId: string
  voce?: Voce
  /** Lists already in the template, offered as suggestions. */
  liste: readonly string[]
  ordineSuccessivo: number
}) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const id = useId()
  const iniziali: VoceModelloInput = {
    id: voce?.id ?? null,
    modello_id: modelloId,
    tasklist: voce?.tasklist ?? liste[0] ?? '',
    titolo: voce?.titolo ?? '',
    descrizione: voce?.descrizione ?? '',
    ordine: voce?.ordine ?? ordineSuccessivo,
    inizio_giorni: voce?.inizio_giorni ?? 0,
    durata_giorni: voce?.durata_giorni ?? 7,
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VoceModelloInput>({ resolver: zodResolver(voceModelloSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaVoce(valori), voce ? 'Attività salvata' : 'Attività aggiunta')) {
      setAperto(false)
      if (!voce) reset({ ...iniziali, ordine: Number(valori.ordine) + 1 })
    }
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(iniziali)
        }
      }}
      trigger={
        voce ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground"
            aria-label={`Modifica ${voce.titolo}`}
          />
        ) : (
          <Button type="button" className="h-11" />
        )
      }
      contenutoTrigger={
        voce ? (
          <Pencil className="size-4" aria-hidden="true" />
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            Nuova attività
          </>
        )
      }
      titolo={voce ? 'Modifica l’attività' : 'Nuova attività'}
      descrizione="Il giorno 0 è l’inizio del progetto: il task nasce con le date già calcolate."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-lista`}>Lista</Label>
          <Input id={`${id}-lista`} className="h-11" list={`${id}-liste`} placeholder="Onboarding" {...register('tasklist')} />
          <datalist id={`${id}-liste`}>
            {liste.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <ErroreCampo id={`${id}-lista-errore`} messaggio={errors.tasklist?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-titolo`}>Titolo</Label>
          <Input id={`${id}-titolo`} className="h-11" placeholder="Call di check" {...register('titolo')} />
          <ErroreCampo id={`${id}-titolo-errore`} messaggio={errors.titolo?.message} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-inizio`}>Dal giorno</Label>
            <Input id={`${id}-inizio`} inputMode="numeric" className="num h-11 text-right" {...register('inizio_giorni')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-durata`}>Giorni</Label>
            <Input id={`${id}-durata`} inputMode="numeric" className="num h-11 text-right" {...register('durata_giorni')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ordine`}>Ordine</Label>
            <Input id={`${id}-ordine`} inputMode="numeric" className="num h-11 text-right" {...register('ordine')} />
          </div>
        </div>
        <ErroreCampo
          id={`${id}-numeri-errore`}
          messaggio={errors.inizio_giorni?.message ?? errors.durata_giorni?.message ?? errors.ordine?.message}
        />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-descrizione`}>Descrizione</Label>
          <Textarea id={`${id}-descrizione`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`${id}-descrizione-errore`} messaggio={errors.descrizione?.message} />
        </div>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>{voce ? 'Salva l’attività' : 'Aggiungi l’attività'}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/** Two taps on purpose: the first arms, the second deletes. Projects already created keep their tasks. */
export function EliminaVoce({ id, titolo }: { id: string; titolo: string }) {
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  if (!pronto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-muted-foreground"
        aria-label={`Elimina ${titolo}`}
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
          const esito = await eliminaVoce({ id })
          if (esito.ok) toast.success('Attività eliminata dal modello')
          else toast.error(esito.errore)
          setPronto(false)
        })
      }
    >
      Conferma
    </Button>
  )
}
