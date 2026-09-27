'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { creaProgetto } from '@/app/(app)/progetti/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica } from '@/components/form/foglio-modifica'
import { SceltaMultipla } from '@/components/form/scelta-multipla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { nuovoProgettoSchema, type NuovoProgettoInput } from '@/lib/validation/progetti'

export type OpzioneReparto = { id: string; nome: string }
export type OpzioneModello = { id: string; nome: string; reparto_id: string | null; voci: number }
export type OpzionePersona = { id: string; nome: string }
export type OpzioneCliente = { id: string; etichetta: string }

/** Templates of a department first, then the ones valid for every department. */
function modelliPer(modelli: readonly OpzioneModello[], repartoId: string) {
  return [...modelli.filter((m) => m.reparto_id === repartoId), ...modelli.filter((m) => m.reparto_id === null)]
}

/** The first active template of the department, or none. */
function modelloPredefinito(modelli: readonly OpzioneModello[], repartoId: string) {
  return modelli.find((m) => m.reparto_id === repartoId)?.id ?? ''
}

/**
 * "Nuovo progetto" of one department. The department comes preselected, and so
 * does its first template: a client of Fitness Coaching opens with the whole
 * client path already dated. Only the app admin gets the client field.
 */
export function NuovoProgetto({
  reparti,
  repartoId,
  modelli,
  persone,
  clienti,
  oggi,
}: {
  reparti: readonly OpzioneReparto[]
  repartoId: string
  modelli: readonly OpzioneModello[]
  persone: readonly OpzionePersona[]
  /** null: the client field is not offered (only the app admin links a client). */
  clienti: readonly OpzioneCliente[] | null
  oggi: string
}) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const nomeReparto = reparti.find((r) => r.id === repartoId)?.nome ?? ''
  const iniziali: NuovoProgettoInput = {
    reparto_id: repartoId,
    nome: '',
    descrizione: '',
    modello_id: modelloPredefinito(modelli, repartoId),
    client_id: '',
    data_inizio: oggi,
    data_fine: '',
    membri: [],
  }
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NuovoProgettoInput>({ resolver: zodResolver(nuovoProgettoSchema), defaultValues: iniziali })
  const reparto = useWatch({ control, name: 'reparto_id' })
  const modelloScelto = useWatch({ control, name: 'modello_id' })
  const opzioniModello = modelliPer(modelli, reparto)
  const voci = modelli.find((m) => m.id === modelloScelto)?.voci ?? 0

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await creaProgetto(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success('Progetto creato')
    setAperto(false)
    reset(iniziali)
    router.push(`/progetti/${esito.id}`)
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
      trigger={<Button type="button" variant="outline" className="h-11" aria-label={`Nuovo progetto in ${nomeReparto}`} />}
      contenutoTrigger={
        <>
          <Plus className="size-4" aria-hidden="true" />
          Nuovo progetto
        </>
      }
      titolo="Nuovo progetto"
      descrizione="Chi lo crea ne fa parte e ne è il responsabile. Le date dei task partono dall’inizio del progetto."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`np-nome-${repartoId}`}>Nome</Label>
          <Input
            id={`np-nome-${repartoId}`}
            className="h-11"
            placeholder="Percorso Nome Cognome"
            aria-describedby={errors.nome ? `np-nome-errore-${repartoId}` : undefined}
            {...register('nome')}
          />
          <ErroreCampo id={`np-nome-errore-${repartoId}`} messaggio={errors.nome?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`np-reparto-${repartoId}`}>Reparto</Label>
          <select
            id={`np-reparto-${repartoId}`}
            className={CLASSE_SELECT}
            {...register('reparto_id', {
              onChange: (e: ChangeEvent<HTMLSelectElement>) =>
                setValue('modello_id', modelloPredefinito(modelli, e.target.value)),
            })}
          >
            {reparti.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`np-modello-${repartoId}`}>Modello</Label>
          <select id={`np-modello-${repartoId}`} className={CLASSE_SELECT} {...register('modello_id')}>
            <option value="">Nessun modello</option>
            {opzioniModello.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {modelloScelto
              ? `Apre il progetto con ${voci === 1 ? '1 attività' : `${voci} attività`} già divise in liste e datate.`
              : 'Il progetto parte vuoto: liste e task li aggiungi tu.'}
          </p>
        </div>

        {clienti ? (
          <div className="space-y-1.5">
            <Label htmlFor={`np-cliente-${repartoId}`}>Cliente</Label>
            <select
              id={`np-cliente-${repartoId}`}
              className={CLASSE_SELECT}
              {...register('client_id', {
                onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                  const scelto = clienti.find((c) => c.id === e.target.value)
                  if (scelto && !getValues('nome')?.trim()) setValue('nome', scelto.etichetta)
                },
              })}
            >
              <option value="">Nessun cliente</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etichetta}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Solo tu vedi il collegamento al cliente e ai suoi dati.</p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`np-descrizione-${repartoId}`}>Descrizione</Label>
          <Textarea id={`np-descrizione-${repartoId}`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`np-descrizione-errore-${repartoId}`} messaggio={errors.descrizione?.message} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`np-inizio-${repartoId}`}>Inizio</Label>
            <Input id={`np-inizio-${repartoId}`} type="date" className="num h-11" {...register('data_inizio')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`np-fine-${repartoId}`}>Fine</Label>
            <Input id={`np-fine-${repartoId}`} type="date" className="num h-11" {...register('data_fine')} />
          </div>
        </div>
        <ErroreCampo id={`np-date-errore-${repartoId}`} messaggio={errors.data_inizio?.message ?? errors.data_fine?.message} />

        {persone.length > 0 ? (
          <SceltaMultipla
            legenda="Membri oltre a te"
            opzioni={persone.map((p) => ({ valore: p.id, etichetta: p.nome }))}
            registrazione={register('membri')}
            errore={errors.membri?.message}
            colonne={2}
          />
        ) : null}

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Crea il progetto</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
