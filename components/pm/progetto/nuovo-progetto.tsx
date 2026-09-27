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
 * "Nuovo progetto". From a department the department comes preselected, and
 * so does its first template: a client of Fitness Coaching opens with the
 * whole client path already dated. From the page header the department is to
 * be chosen. Only the app admin gets the client field.
 *
 * Triggers: the page's primary button, a 44px "+" next to a department, or a
 * text link in an empty department.
 */
export function NuovoProgetto({
  reparti,
  repartoId = null,
  modelli,
  persone,
  clienti,
  oggi,
  variante = 'primario',
}: {
  reparti: readonly OpzioneReparto[]
  /** null: the department is chosen in the sheet. */
  repartoId?: string | null
  modelli: readonly OpzioneModello[]
  persone: readonly OpzionePersona[]
  /** null: the client field is not offered (only the app admin links a client). */
  clienti: readonly OpzioneCliente[] | null
  oggi: string
  variante?: 'primario' | 'icona' | 'link'
}) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const nomeReparto = reparti.find((r) => r.id === repartoId)?.nome ?? ''
  // ids of the fields: one sheet per trigger, never two open together
  const chiave = repartoId ?? 'scelta'
  const iniziali: NuovoProgettoInput = {
    reparto_id: repartoId ?? '',
    nome: '',
    descrizione: '',
    modello_id: repartoId ? modelloPredefinito(modelli, repartoId) : '',
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
      trigger={
        variante === 'icona' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            aria-label={`Nuovo progetto in ${nomeReparto}`}
          />
        ) : variante === 'link' ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        ) : (
          <Button type="button" className="h-11" />
        )
      }
      contenutoTrigger={
        variante === 'icona' ? (
          <Plus className="size-5" aria-hidden="true" />
        ) : variante === 'link' ? (
          <>
            Crea il primo<span className="sr-only"> progetto in {nomeReparto}</span>
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            Nuovo progetto
          </>
        )
      }
      titolo="Nuovo progetto"
      descrizione="Chi lo crea ne fa parte e ne è il responsabile. Le date dei task partono dall’inizio del progetto."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`np-nome-${chiave}`}>Nome</Label>
          <Input
            id={`np-nome-${chiave}`}
            className="h-11"
            placeholder="Percorso Nome Cognome"
            aria-describedby={errors.nome ? `np-nome-errore-${chiave}` : undefined}
            {...register('nome')}
          />
          <ErroreCampo id={`np-nome-errore-${chiave}`} messaggio={errors.nome?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`np-reparto-${chiave}`}>Reparto</Label>
          <select
            id={`np-reparto-${chiave}`}
            className={CLASSE_SELECT}
            aria-describedby={errors.reparto_id ? `np-reparto-errore-${chiave}` : undefined}
            {...register('reparto_id', {
              onChange: (e: ChangeEvent<HTMLSelectElement>) =>
                setValue('modello_id', modelloPredefinito(modelli, e.target.value)),
            })}
          >
            {repartoId ? null : (
              <option value="" disabled>
                Scegli il reparto
              </option>
            )}
            {reparti.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <ErroreCampo id={`np-reparto-errore-${chiave}`} messaggio={errors.reparto_id?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`np-modello-${chiave}`}>Modello</Label>
          <select id={`np-modello-${chiave}`} className={CLASSE_SELECT} {...register('modello_id')}>
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
            <Label htmlFor={`np-cliente-${chiave}`}>Cliente</Label>
            <select
              id={`np-cliente-${chiave}`}
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
          <Label htmlFor={`np-descrizione-${chiave}`}>Descrizione</Label>
          <Textarea id={`np-descrizione-${chiave}`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`np-descrizione-errore-${chiave}`} messaggio={errors.descrizione?.message} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`np-inizio-${chiave}`}>Inizio</Label>
            <Input id={`np-inizio-${chiave}`} type="date" className="num h-11" {...register('data_inizio')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`np-fine-${chiave}`}>Fine</Label>
            <Input id={`np-fine-${chiave}`} type="date" className="num h-11" {...register('data_fine')} />
          </div>
        </div>
        <ErroreCampo id={`np-date-errore-${chiave}`} messaggio={errors.data_inizio?.message ?? errors.data_fine?.message} />

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
