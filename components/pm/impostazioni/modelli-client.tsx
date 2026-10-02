'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
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
import { ETICHETTA_RUOLO, type AppRole } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'
import { modelloSchema, voceModelloSchema, type ModelloInput, type VoceModelloInput } from '@/lib/validation/progetti'

/** Who else does an activity of a client's path, besides the coach. */
const RUOLI_DI_UN_COMPITO: readonly AppRole[] = ['nutrizione']

type Reparto = { id: string; nome: string; progetti_con_cliente?: boolean }
type Modello = {
  id: string
  nome: string
  descrizione: string | null
  reparto_id: string | null
  per_nuovi_clienti?: boolean
}

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
    per_nuovi_clienti: modello?.per_nuovi_clienti ?? false,
  }
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ModelloInput>({ resolver: zodResolver(modelloSchema), defaultValues: iniziali })
  const repartoScelto = useWatch({ control, name: 'reparto_id' })
  // only a department that works on clients holds the template for new clients
  const perClienti = reparti.some((r) => r.id === repartoScelto && r.progetti_con_cliente)

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await salvaModello({ ...valori, per_nuovi_clienti: perClienti && valori.per_nuovi_clienti })
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
        {perClienti ? (
          <Controller
            control={control}
            name="per_nuovi_clienti"
            render={({ field }) => (
              <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Per i nuovi clienti</span>
                  <span className="block text-xs text-muted-foreground">
                    Ogni cliente che paga la prima rata ha un progetto con le attività di questo modello. Un solo modello
                    alla volta: sceglierne un altro toglie la scelta dal primo.
                  </span>
                </span>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} aria-label="Per i nuovi clienti" />
              </label>
            )}
          />
        ) : null}
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>{modello ? 'Salva il modello' : 'Crea il modello'}</BottoneSalva>
        {modello ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta="Elimina il modello"
              cosa={`il modello ${modello.nome}`}
              fatto={`${modello.nome} eliminato`}
              conseguenze={[
                'I progetti già aperti con questo modello restano come sono.',
                ...(modello.per_nuovi_clienti
                  ? ['È il modello dei nuovi clienti: finché non ne scegli un altro, il loro progetto nasce senza task.']
                  : []),
              ]}
              dopo="/settings/progetti"
              azione={() => eliminaModello({ id: modello.id })}
            />
          </div>
        ) : null}
      </form>
    </FoglioModifica>
  )
}

/**
 * The template for new clients stays on (the database refuses to switch it
 * off): switched off, every new client's project would open without tasks.
 */
export function AttivoModello({
  id,
  nome,
  attivo,
  perNuoviClienti = false,
}: {
  id: string
  nome: string
  attivo: boolean
  perNuoviClienti?: boolean
}) {
  const [inCorso, avvia] = useTransition()
  const bloccato = perNuoviClienti && attivo
  return (
    <label
      className={cn(
        'flex min-h-11 items-center gap-2 text-sm text-muted-foreground',
        bloccato ? 'cursor-default' : 'cursor-pointer',
      )}
      title={bloccato ? 'Il modello dei nuovi clienti resta attivo' : undefined}
    >
      <Switch
        checked={attivo}
        disabled={inCorso || bloccato}
        aria-label={bloccato ? `${nome} attivo: è il modello dei nuovi clienti` : `${nome} attivo`}
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
  tasklist: string | null
  titolo: string
  descrizione: string | null
  ordine: number
  inizio_giorni: number | null
  durata_giorni: number | null
  per_ruolo: AppRole | null
}

/**
 * One activity of a template: its list (or none), its title, when it starts
 * and how long it lasts (or no dates: open for the whole project), and in a
 * client's template who does it when it is not the coach.
 */
export function VoceForm({
  modelloId,
  voce,
  liste,
  ordineSuccessivo,
  conDatePredefinite = true,
  perClienti = false,
}: {
  modelloId: string
  voce?: Voce
  /** Lists already in the template, offered as suggestions. */
  liste: readonly string[]
  ordineSuccessivo: number
  /** A new activity starts dated like the others of its template. */
  conDatePredefinite?: boolean
  /** A template of a department that works on clients: "Chi la fa" is asked. */
  perClienti?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const id = useId()
  const datata = voce ? voce.inizio_giorni !== null : conDatePredefinite
  const iniziali: VoceModelloInput = {
    id: voce?.id ?? null,
    modello_id: modelloId,
    tasklist: voce ? (voce.tasklist ?? '') : (liste[0] ?? ''),
    titolo: voce?.titolo ?? '',
    descrizione: voce?.descrizione ?? '',
    ordine: voce?.ordine ?? ordineSuccessivo,
    inizio_giorni: datata ? (voce?.inizio_giorni ?? 0) : '',
    durata_giorni: datata ? (voce?.durata_giorni ?? 7) : '',
    per_ruolo: voce?.per_ruolo ?? '',
  }
  const [conDate, setConDate] = useState(datata)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VoceModelloInput>({ resolver: zodResolver(voceModelloSchema), defaultValues: iniziali })

  function cambiaDate(attive: boolean) {
    setConDate(attive)
    setValue('inizio_giorni', attive ? 0 : '')
    setValue('durata_giorni', attive ? 7 : '')
  }

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaVoce(valori), voce ? 'Attività salvata' : 'Attività aggiunta')) {
      setAperto(false)
      if (!voce) {
        reset({ ...iniziali, ordine: Number(valori.ordine) + 1 })
        setConDate(datata)
      }
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
          setConDate(datata)
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
      descrizione="Con le date, il giorno 0 è l’inizio del progetto e il task nasce già datato. Senza date resta aperto per tutto il progetto."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-lista`}>
            Lista <span className="font-normal text-muted-foreground">(facoltativa)</span>
          </Label>
          <Input
            id={`${id}-lista`}
            className="h-11"
            list={`${id}-liste`}
            placeholder="Nessuna lista"
            {...register('tasklist')}
          />
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
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">Con le date</span>
            <span className="block text-xs text-muted-foreground">
              {conDate ? 'Il task nasce con inizio e scadenza.' : 'Senza date: il task resta aperto per tutto il progetto.'}
            </span>
          </span>
          <Switch checked={conDate} onCheckedChange={cambiaDate} aria-label="Con le date" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {conDate ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-inizio`}>Dal giorno</Label>
                <Input id={`${id}-inizio`} inputMode="numeric" className="num h-11 text-right" {...register('inizio_giorni')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-durata`}>Giorni</Label>
                <Input id={`${id}-durata`} inputMode="numeric" className="num h-11 text-right" {...register('durata_giorni')} />
              </div>
            </>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ordine`}>Ordine</Label>
            <Input id={`${id}-ordine`} inputMode="numeric" className="num h-11 text-right" {...register('ordine')} />
          </div>
        </div>
        <ErroreCampo
          id={`${id}-numeri-errore`}
          messaggio={errors.inizio_giorni?.message ?? errors.durata_giorni?.message ?? errors.ordine?.message}
        />
        {perClienti || voce?.per_ruolo ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ruolo`}>Chi la fa</Label>
            <select id={`${id}-ruolo`} className={CLASSE_SELECT} {...register('per_ruolo')}>
              <option value="">Il coach del cliente</option>
              {RUOLI_DI_UN_COMPITO.map((r) => (
                <option key={r} value={r}>
                  {ETICHETTA_RUOLO[r]}
                </option>
              ))}
              {voce?.per_ruolo && !RUOLI_DI_UN_COMPITO.includes(voce.per_ruolo) ? (
                <option value={voce.per_ruolo}>{ETICHETTA_RUOLO[voce.per_ruolo]}</option>
              ) : null}
            </select>
            <p className="text-xs text-muted-foreground">
              Scelto il coach di un cliente, l’attività va a chi ha questo ruolo nel team; se nessuno ce l’ha, al coach.
            </p>
          </div>
        ) : null}
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
